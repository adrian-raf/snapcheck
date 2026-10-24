import { requirement } from '../requirements';
import { expect, expectSnapSuccess, test } from '../support/fixtures';
import { SnapEnvelopeSchema, TransferIntrabankResponseSchema } from '../support/response-schemas';
import { aTransferIntrabank, without } from '../support/test-data';

test.describe('Transfer intrabank', () => {
  test(
    'completes a transfer and echoes its identifiers',
    requirement('TRF-001'),
    async ({ snap, target, codes, accessToken }) => {
      const request = aTransferIntrabank(target);

      const response = await snap.postTransactional({
        path: target.profile.paths.transferIntrabank,
        body: request,
        accessToken,
      });

      const body = await expectSnapSuccess(
        response,
        codes.transferIntrabank('success'),
        TransferIntrabankResponseSchema,
      );
      expect(body.partnerReferenceNo).toBe(request.partnerReferenceNo);
      expect(body.amount).toEqual(request.amount);
      expect(body.referenceNo).not.toBe(request.partnerReferenceNo);
    },
  );

  for (const value of ['10000', '10000.5', '10000.000', '1,000.00']) {
    test(
      `rejects amount.value "${value}"`,
      requirement('TRF-002'),
      async ({ snap, target, codes, accessToken }) => {
        const response = await snap.postTransactional({
          path: target.profile.paths.transferIntrabank,
          body: aTransferIntrabank(target, { amount: { value, currency: 'IDR' } }),
          accessToken,
        });

        await expect(response).toHaveSnapResponseCode(
          codes.transferIntrabank('invalidFieldFormat'),
        );
        const { responseMessage } = SnapEnvelopeSchema.parse(await response.json());
        expect(responseMessage).toContain('amount.value');
      },
    );
  }

  test(
    'rejects a transfer larger than the balance',
    requirement('TRF-003'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.transferIntrabank,
        body: aTransferIntrabank(target, { amount: { value: '999999999999.00', currency: 'IDR' } }),
        accessToken,
      });

      await expect(response).toHaveSnapResponseCode(codes.transferIntrabank('insufficientFunds'));
    },
  );

  test(
    'reports a missing field as mandatory',
    requirement('TRF-004'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.transferIntrabank,
        body: without(aTransferIntrabank(target), 'amount'),
        accessToken,
      });

      await expect(response).toHaveSnapResponseCode(
        codes.transferIntrabank('invalidMandatoryField'),
      );
    },
  );

  test(
    'reports a malformed field as invalid format',
    requirement('TRF-004'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.transferIntrabank,
        body: aTransferIntrabank(target, { sourceAccountNo: 'ABC-123' }),
        accessToken,
      });

      await expect(response).toHaveSnapResponseCode(codes.transferIntrabank('invalidFieldFormat'));
    },
  );
});
