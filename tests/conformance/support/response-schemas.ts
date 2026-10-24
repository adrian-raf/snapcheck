import { z } from 'zod';

/**
 * Response contracts, written from the client's point of view.
 * They are deliberately independent of the mock server's code: if both shared
 * one schema, a wrong schema would make the mock and the tests agree on a bug.
 */

const ResponseCodeSchema = z.string().regex(/^\d{7}$/);

export const SnapEnvelopeSchema = z.object({
  responseCode: ResponseCodeSchema,
  responseMessage: z.string().min(1),
});

const AmountSchema = z.object({
  value: z.string().regex(/^\d+\.\d{2}$/),
  currency: z.string().length(3),
});

export const AccessTokenResponseSchema = SnapEnvelopeSchema.extend({
  accessToken: z.string().min(1),
  // Providers disagree on the exact value ("Bearer", "bearer", "BearerToken"), so only presence is checked.
  tokenType: z.string().min(1),
  expiresIn: z.string().regex(/^\d+$/),
});

export const BalanceInquiryResponseSchema = SnapEnvelopeSchema.extend({
  referenceNo: z.string().min(1),
  partnerReferenceNo: z.string().optional(),
  accountNo: z.string().min(1),
  name: z.string(),
  accountInfos: z
    .array(
      z.object({
        balanceType: z.string(),
        amount: AmountSchema,
        availableBalance: AmountSchema,
      }),
    )
    .min(1),
});

export const TransferIntrabankResponseSchema = SnapEnvelopeSchema.extend({
  referenceNo: z.string().min(1),
  partnerReferenceNo: z.string().min(1),
  amount: AmountSchema,
  beneficiaryAccountNo: z.string().min(1),
  sourceAccountNo: z.string().min(1),
  transactionDate: z.string().min(1),
});

export const TransferStatusResponseSchema = SnapEnvelopeSchema.extend({
  originalPartnerReferenceNo: z.string().min(1),
  serviceCode: z.string().regex(/^\d{2}$/),
  latestTransactionStatus: z.string().regex(/^\d{2}$/),
  transactionStatusDesc: z.string().optional(),
  originalReferenceNo: z.string().optional(),
  amount: AmountSchema.optional(),
});
