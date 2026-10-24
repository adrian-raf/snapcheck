import { TransactionStatus, generatePartnerReferenceNo } from '../../../src/core';
import { requirement } from '../requirements';
import { expect, expectSnapSuccess, expectTransactionNotFound, test } from '../support/fixtures';
import {
  TransferIntrabankResponseSchema,
  TransferStatusResponseSchema,
} from '../support/response-schemas';
import { aTransferIntrabank, aTransferStatusRequest } from '../support/test-data';

test.describe('Transfer status inquiry', () => {
  test(
    'reports a completed transfer as success, with its provider reference',
    requirement('STS-001'),
    async ({ snap, target, codes, accessToken }) => {
      const transfer = aTransferIntrabank(target);
      const transferResponse = await snap.postTransactional({
        path: target.profile.paths.transferIntrabank,
        body: transfer,
        accessToken,
      });
      const { referenceNo } = await expectSnapSuccess(
        transferResponse,
        codes.transferIntrabank('success'),
        TransferIntrabankResponseSchema,
      );

      const statusResponse = await snap.postTransactional({
        path: target.profile.paths.transferStatus,
        body: aTransferStatusRequest(transfer.partnerReferenceNo ?? ''),
        accessToken,
      });

      const status = await expectSnapSuccess(
        statusResponse,
        codes.transferStatus('success'),
        TransferStatusResponseSchema,
      );
      expect(status.latestTransactionStatus).toBe(TransactionStatus.success);
      expect(status.originalPartnerReferenceNo).toBe(transfer.partnerReferenceNo);
      expect(status.originalReferenceNo).toBe(referenceNo);
    },
  );

  test(
    'reports an unknown transaction as the profile documents',
    requirement('STS-002'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.transferStatus,
        body: aTransferStatusRequest(generatePartnerReferenceNo()),
        accessToken,
      });

      await expectTransactionNotFound(response, target.profile.transferStatus.notFound, {
        notFound: codes.transferStatus('transactionNotFound'),
        success: codes.transferStatus('success'),
      });
    },
  );
});
