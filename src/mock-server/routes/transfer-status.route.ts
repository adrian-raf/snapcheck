import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  ServiceCode,
  SnapHeader,
  TRANSACTION_STATUS_DESCRIPTION,
  TransactionStatus,
} from '../../core';
import { caseFor } from '../../profiles';
import type { TransferService } from '../domain/transfer-service';
import { SnapError } from '../errors';
import { readHeader } from '../guards/guard';
import { transactionalPipeline, type PipelineDependencies } from '../pipelines';
import { describeTransfer } from '../presenters/transfer-status';
import { successEnvelope } from '../responses';
import { PartnerReferenceNoSchema, SnapDateTimeSchema } from './schemas';

/** Request fields per BRI, Midtrans and Paydia; only the first two are mandatory everywhere. */
const TransferStatusRequestSchema = z.object({
  originalPartnerReferenceNo: PartnerReferenceNoSchema,
  /** Service code of the original request, e.g. "17" for an intrabank transfer. */
  serviceCode: z.string().regex(/^\d{2}$/),
  originalReferenceNo: z.string().max(64).optional(),
  originalExternalId: z.string().max(36).optional(),
  transactionDate: SnapDateTimeSchema.optional(),
});

type TransferStatusRequest = z.infer<typeof TransferStatusRequestSchema>;

export interface TransferStatusDependencies extends PipelineDependencies {
  readonly transfers: TransferService;
}

/** The only service whose transactions this mock can look up. */
const SUPPORTED_ORIGINAL_SERVICE: string = ServiceCode.transferIntrabank;

export function registerTransferStatusRoute(
  app: FastifyInstance,
  deps: TransferStatusDependencies,
): void {
  const service = ServiceCode.transferStatusInquiry;

  app.post<{ Body: TransferStatusRequest }>(
    deps.profile.paths.transferStatus,
    {
      config: { serviceCode: service },
      preHandler: transactionalPipeline(deps, TransferStatusRequestSchema),
    },
    (request, reply) => {
      const { originalPartnerReferenceNo, serviceCode } = request.body;
      const record =
        serviceCode === SUPPORTED_ORIGINAL_SERVICE
          ? deps.transfers.find(
              readHeader(request, SnapHeader.partnerId) ?? '',
              originalPartnerReferenceNo,
            )
          : undefined;

      if (record) {
        const status = deps.transfers.statusOf(record);
        return reply.send({ ...successEnvelope(service), ...describeTransfer(record, status) });
      }

      // Provider variant: an unknown transaction is an error (BRI, Paydia) or a status (Midtrans).
      if (deps.profile.transferStatus.notFound === 'http-404') {
        throw new SnapError(caseFor(deps.profile, 'transactionNotFound'));
      }
      return reply.send({
        ...successEnvelope(service),
        originalPartnerReferenceNo,
        serviceCode,
        latestTransactionStatus: TransactionStatus.notFound,
        transactionStatusDesc: TRANSACTION_STATUS_DESCRIPTION[TransactionStatus.notFound],
      });
    },
  );
}
