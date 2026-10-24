import { setTimeout as delay } from 'node:timers/promises';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ServiceCode, SnapHeader, type SnapCaseName } from '../../core';
import { caseFor } from '../../profiles';
import { toMinorUnits } from '../domain/money';
import type { TransferOutcome, TransferService } from '../domain/transfer-service';
import { SnapError } from '../errors';
import { FAULTS, readFault } from '../faults';
import { readHeader } from '../guards/guard';
import type { SettlementNotifier } from '../notifications/settlement-notifier';
import { transactionalPipeline, type PipelineDependencies } from '../pipelines';
import { snapEnvelope } from '../responses';
import {
  AccountNoSchema,
  AmountSchema,
  PartnerReferenceNoSchema,
  SnapDateTimeSchema,
  SourceAccountNoSchema,
} from './schemas';

const TransferIntrabankRequestSchema = z.object({
  partnerReferenceNo: PartnerReferenceNoSchema,
  amount: AmountSchema,
  beneficiaryAccountNo: AccountNoSchema,
  sourceAccountNo: SourceAccountNoSchema,
  transactionDate: SnapDateTimeSchema,
});

type TransferIntrabankRequest = z.infer<typeof TransferIntrabankRequestSchema>;

export interface FaultTiming {
  /** How late `timeout-after-commit` answers. */
  readonly responseDelayMs: number;
  /** How long a `pending` transfer stays Pending. */
  readonly pendingSettleMs: number;
}

export interface TransferIntrabankDependencies extends PipelineDependencies {
  readonly transfers: TransferService;
  readonly faultTiming: FaultTiming;
  readonly settlementNotifier: SettlementNotifier;
}

/** Names, not definitions: the profile may override a case code (e.g. BRI's duplicate → 00). */
const FAILURE_CASES: Record<Exclude<TransferOutcome['status'], 'accepted'>, SnapCaseName> = {
  duplicate: 'duplicatePartnerReferenceNo',
  'invalid-account': 'invalidAccount',
  'insufficient-funds': 'insufficientFunds',
};

export function registerTransferIntrabankRoute(
  app: FastifyInstance,
  deps: TransferIntrabankDependencies,
): void {
  const service = ServiceCode.transferIntrabank;
  const fail = (name: SnapCaseName): SnapError => new SnapError(caseFor(deps.profile, name));

  app.post<{ Body: TransferIntrabankRequest }>(
    deps.profile.paths.transferIntrabank,
    {
      config: { serviceCode: service },
      preHandler: transactionalPipeline(deps, TransferIntrabankRequestSchema),
    },
    async (request, reply) => {
      const body = request.body;
      const fault = readFault(request);

      if (fault === FAULTS.errorBeforeCommit) throw fail('internalServerError');

      const isPending = fault === FAULTS.pending;
      const outcome = deps.transfers.execute({
        partnerId: readHeader(request, SnapHeader.partnerId) ?? '',
        partnerReferenceNo: body.partnerReferenceNo,
        externalId: readHeader(request, SnapHeader.externalId) ?? '',
        sourceAccountNo: body.sourceAccountNo,
        beneficiaryAccountNo: body.beneficiaryAccountNo,
        amountMinorUnits: toMinorUnits(body.amount.value),
        transactionDate: body.transactionDate,
        ...(isPending ? { settleAfterMs: deps.faultTiming.pendingSettleMs } : {}),
      });
      if (outcome.status !== 'accepted') throw fail(FAILURE_CASES[outcome.status]);

      // From here on the money has moved: every fault below is "lost or late answer".
      if (fault === FAULTS.errorAfterCommit) throw fail('internalServerError');
      if (fault === FAULTS.timeoutAfterCommit) await delay(deps.faultTiming.responseDelayMs);
      if (isPending) deps.settlementNotifier.scheduleFor(outcome.record);

      const envelope = snapEnvelope(
        service,
        caseFor(deps.profile, isPending ? 'requestInProgress' : 'success'),
      );
      return reply.status(isPending ? 202 : 200).send({
        ...envelope,
        referenceNo: outcome.record.referenceNo,
        partnerReferenceNo: body.partnerReferenceNo,
        amount: body.amount,
        beneficiaryAccountNo: body.beneficiaryAccountNo,
        sourceAccountNo: body.sourceAccountNo,
        transactionDate: body.transactionDate,
      });
    },
  );
}
