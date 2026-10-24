import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ServiceCode, SnapCase } from '../../core';
import type { AccountRepository } from '../domain/accounts';
import { fromMinorUnits } from '../domain/money';
import { generateReferenceNo } from '../domain/reference-no';
import { SnapError } from '../errors';
import { transactionalPipeline, type PipelineDependencies } from '../pipelines';
import { successEnvelope } from '../responses';
import { AccountNoSchema, PartnerReferenceNoSchema } from './schemas';

const BalanceInquiryRequestSchema = z.object({
  partnerReferenceNo: PartnerReferenceNoSchema.optional(),
  accountNo: AccountNoSchema,
});

type BalanceInquiryRequest = z.infer<typeof BalanceInquiryRequestSchema>;

export interface BalanceInquiryDependencies extends PipelineDependencies {
  readonly accounts: AccountRepository;
}

export function registerBalanceInquiryRoute(
  app: FastifyInstance,
  deps: BalanceInquiryDependencies,
): void {
  app.post<{ Body: BalanceInquiryRequest }>(
    deps.profile.paths.balanceInquiry,
    {
      config: { serviceCode: ServiceCode.balanceInquiry },
      preHandler: transactionalPipeline(deps, BalanceInquiryRequestSchema),
    },
    (request, reply) => {
      const { accountNo, partnerReferenceNo } = request.body;
      const account = deps.accounts.find(accountNo);
      if (!account) {
        throw new SnapError(SnapCase.invalidAccount);
      }

      const balance = { value: fromMinorUnits(account.balance), currency: 'IDR' };
      return reply.send({
        ...successEnvelope(ServiceCode.balanceInquiry),
        referenceNo: generateReferenceNo(),
        ...(partnerReferenceNo && { partnerReferenceNo }),
        accountNo: account.accountNo,
        name: account.name,
        accountInfos: [{ balanceType: 'Cash', amount: balance, availableBalance: balance }],
      });
    },
  );
}
