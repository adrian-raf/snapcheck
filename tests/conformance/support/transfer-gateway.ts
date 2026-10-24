import type { APIResponse } from '@playwright/test';

import type {
  StatusResult,
  SubmitResult,
  TransferGateway,
} from '../../../src/client/transfer-with-recovery';
import { TransactionStatus } from '../../../src/core';
import { FAULT_HEADER, type Fault } from '../../../src/mock-server/faults';
import { SnapEnvelopeSchema, TransferStatusResponseSchema } from './response-schemas';
import type { SnapClient } from './snap-client';
import type { ConformanceTarget } from './target';
import { aTransferStatusRequest, type TransferIntrabankBody } from './test-data';

export interface MockFaultScript {
  /** Fault the mock injects into the first submission only; later ones behave normally. */
  readonly firstSubmission?: Fault;
  /** Client-side timeout for submissions. */
  readonly submitTimeoutMs?: number;
}

/**
 * Connects the reference client (src/client) to the mock through `SnapClient`.
 * Every submission reuses the same body — so the same partnerReferenceNo — while
 * `SnapClient` generates a fresh X-EXTERNAL-ID per request.
 */
export class SnapTransferGateway implements TransferGateway {
  constructor(
    private readonly snap: SnapClient,
    private readonly target: ConformanceTarget,
    private readonly accessToken: string,
    private readonly transfer: TransferIntrabankBody,
    private readonly script: MockFaultScript = {},
  ) {}

  async submit(submission: number): Promise<SubmitResult> {
    const fault = submission === 1 ? this.script.firstSubmission : undefined;
    try {
      const response = await this.snap.postTransactional({
        path: this.target.profile.paths.transferIntrabank,
        body: this.transfer,
        accessToken: this.accessToken,
        ...(fault ? { headers: { set: { [FAULT_HEADER]: fault } } } : {}),
        ...(this.script.submitTimeoutMs === undefined
          ? {}
          : { timeoutMs: this.script.submitTimeoutMs }),
      });
      return { kind: 'response', responseCode: await responseCodeOf(response) };
    } catch (error) {
      return { kind: 'no-response', reason: String(error) };
    }
  }

  async checkStatus(): Promise<StatusResult> {
    const partnerReferenceNo = this.transfer.partnerReferenceNo ?? '';
    try {
      const response = await this.snap.postTransactional({
        path: this.target.profile.paths.transferStatus,
        body: aTransferStatusRequest(partnerReferenceNo),
        accessToken: this.accessToken,
      });
      if (response.status() === 404) return { kind: 'not-found' };
      if (!response.ok()) return { kind: 'unavailable', reason: `HTTP ${response.status()}` };

      const { latestTransactionStatus } = TransferStatusResponseSchema.parse(await response.json());
      return latestTransactionStatus === TransactionStatus.notFound
        ? { kind: 'not-found' }
        : { kind: 'found', latestTransactionStatus };
    } catch (error) {
      return { kind: 'unavailable', reason: String(error) };
    }
  }
}

async function responseCodeOf(response: APIResponse): Promise<string> {
  return SnapEnvelopeSchema.parse(await response.json()).responseCode;
}
