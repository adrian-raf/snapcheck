import { setTimeout as delay } from 'node:timers/promises';

import { TransactionStatus, isDefinitelyNotDebited, parseResponseCode } from '../core';

/**
 * Reference implementation of the one rule that keeps transfers from being paid twice:
 *
 *   When the outcome of a transfer is uncertain, ask for its status before sending it again.
 *
 * Uncertain means: a 5xx, a timeout, a dropped connection, 202 "in progress", or a 409.
 * Only a status inquiry saying the transfer was *not found* makes a resubmission safe,
 * and a resubmission always reuses the same partnerReferenceNo (with a new X-EXTERNAL-ID),
 * so even a mistaken resend is rejected by the provider as a duplicate.
 *
 * The HTTP details live behind `TransferGateway`, so the decision logic is tested without a
 * network and can be reused with any HTTP client.
 */

export type SubmitResult =
  | { readonly kind: 'response'; readonly responseCode: string }
  /** Timeout, connection reset, DNS failure… The request may or may not have arrived. */
  | { readonly kind: 'no-response'; readonly reason: string };

export type StatusResult =
  | { readonly kind: 'found'; readonly latestTransactionStatus: string }
  | { readonly kind: 'not-found' }
  /** The status inquiry itself failed; try again later. */
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface TransferGateway {
  /**
   * Sends the transfer. Must reuse the same partnerReferenceNo on every call and use a new
   * X-EXTERNAL-ID each time. `submission` starts at 1.
   */
  submit(submission: number): Promise<SubmitResult>;
  /** Asks for the status of that partnerReferenceNo. */
  checkStatus(): Promise<StatusResult>;
}

export interface RecoveryPolicy {
  /** Total sends, including the first. A resend only ever follows a "not found" status. */
  readonly maxSubmissions: number;
  /** Status inquiries before giving up with outcome `unknown`. */
  readonly maxStatusChecks: number;
  readonly pollIntervalMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = {
  maxSubmissions: 2,
  maxStatusChecks: 10,
  pollIntervalMs: 500,
};

interface Counters {
  readonly submissions: number;
  readonly statusChecks: number;
}

export type TransferResolution = Counters &
  (
    | { readonly outcome: 'success'; readonly confirmedBy: 'response' | 'status' }
    | { readonly outcome: 'failed'; readonly reason: string }
    /** Not resolved within the policy. Hand over to a person; never retry automatically. */
    | { readonly outcome: 'unknown'; readonly reason: string }
  );

type ResponseVerdict = 'success' | 'rejected' | 'in-progress' | 'uncertain';
type StatusVerdict = 'success' | 'failed' | 'not-found' | 'unresolved';

export async function transferWithRecovery(
  gateway: TransferGateway,
  policy: RecoveryPolicy = DEFAULT_RECOVERY_POLICY,
): Promise<TransferResolution> {
  const sleep = policy.sleep ?? ((ms: number) => delay(ms));
  let submissions = 0;
  let statusChecks = 0;
  const counters = (): Counters => ({ submissions, statusChecks });

  for (;;) {
    submissions += 1;
    const verdict = classifyResponse(await gateway.submit(submissions));

    if (verdict === 'success')
      return { outcome: 'success', confirmedBy: 'response', ...counters() };
    if (verdict === 'rejected') {
      return { outcome: 'failed', reason: 'Rejected by the provider', ...counters() };
    }

    // In progress or uncertain: only the status can tell what happened.
    let status: StatusVerdict = 'unresolved';
    while (status === 'unresolved' && statusChecks < policy.maxStatusChecks) {
      // An uncertain outcome is checked at once; an in-progress one has just been accepted.
      if (statusChecks > 0 || verdict === 'in-progress') await sleep(policy.pollIntervalMs);
      statusChecks += 1;
      status = classifyStatus(await gateway.checkStatus());
    }

    switch (status) {
      case 'success':
        return { outcome: 'success', confirmedBy: 'status', ...counters() };
      case 'failed':
        return {
          outcome: 'failed',
          reason: 'The provider reports the transfer failed',
          ...counters(),
        };
      case 'unresolved':
        return {
          outcome: 'unknown',
          reason: `Status still not final after ${statusChecks} inquiries`,
          ...counters(),
        };
      case 'not-found':
        if (submissions >= policy.maxSubmissions) {
          return {
            outcome: 'failed',
            reason: `Not processed after ${submissions} submissions`,
            ...counters(),
          };
        }
      // The provider never received it: resending is safe.
    }
  }
}

function classifyResponse(result: SubmitResult): ResponseVerdict {
  if (result.kind === 'no-response') return 'uncertain';

  const { httpStatus } = parseResponseCode(result.responseCode);
  if (httpStatus === 200) return 'success';
  if (httpStatus === 202) return 'in-progress';
  // 409: duplicate partnerReferenceNo (or, at BRI, the same code as Conflict) — it may
  // already have been processed. Every other 4xx means the request was refused as sent.
  if (httpStatus === 409) return 'uncertain';
  if (httpStatus >= 400 && httpStatus < 500) return 'rejected';
  return 'uncertain';
}

function classifyStatus(result: StatusResult): StatusVerdict {
  if (result.kind === 'not-found') return 'not-found';
  if (result.kind === 'unavailable') return 'unresolved';
  if (result.latestTransactionStatus === TransactionStatus.success) return 'success';
  if (result.latestTransactionStatus === TransactionStatus.notFound) return 'not-found';
  if (isDefinitelyNotDebited(result.latestTransactionStatus)) return 'failed';
  return 'unresolved'; // initiated, paying, pending, or a code we do not know
}
