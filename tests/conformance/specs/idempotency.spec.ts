import { generateExternalId } from '../../../src/core';
import { requirement } from '../requirements';
import { expect, test } from '../support/fixtures';
import { aBalanceInquiry, aTransferIntrabank } from '../support/test-data';

test.describe('Idempotency', () => {
  test(
    'rejects the same X-EXTERNAL-ID twice on the same day',
    requirement('IDEM-001'),
    async ({ snap, target, codes, accessToken }) => {
      const externalId = generateExternalId();
      const send = () =>
        snap.postTransactional({
          path: target.profile.paths.balanceInquiry,
          body: aBalanceInquiry(target),
          accessToken,
          externalId,
        });

      await test.step('first use is accepted', async () => {
        await expect(await send()).toHaveSnapResponseCode(codes.balanceInquiry('success'));
      });

      await test.step('second use on the same day is a conflict', async () => {
        await expect(await send()).toHaveSnapResponseCode(codes.balanceInquiry('conflict'));
      });
    },
  );

  test(
    'rejects a repeated partnerReferenceNo even with a new X-EXTERNAL-ID',
    requirement('IDEM-002'),
    async ({ snap, target, codes, accessToken }) => {
      const transfer = aTransferIntrabank(target);
      // A fresh X-EXTERNAL-ID is generated for every call, so only partnerReferenceNo repeats.
      const send = () =>
        snap.postTransactional({
          path: target.profile.paths.transferIntrabank,
          body: transfer,
          accessToken,
        });

      await test.step('original transfer succeeds', async () => {
        await expect(await send()).toHaveSnapResponseCode(codes.transferIntrabank('success'));
      });

      await test.step('retry with the same partnerReferenceNo is reported as a duplicate', async () => {
        await expect(await send()).toHaveSnapResponseCode(
          codes.transferIntrabank('duplicatePartnerReferenceNo'),
        );
      });
    },
  );

  test(
    'an invalid request does not consume its X-EXTERNAL-ID',
    requirement('IDEM-003'),
    async ({ snap, target, codes, accessToken }) => {
      const externalId = generateExternalId();

      await test.step('request with a malformed account number is rejected', async () => {
        const response = await snap.postTransactional({
          path: target.profile.paths.balanceInquiry,
          body: aBalanceInquiry(target, { accountNo: 'not-a-number' }),
          accessToken,
          externalId,
        });
        await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('invalidFieldFormat'));
      });

      await test.step('corrected request with the same X-EXTERNAL-ID is accepted', async () => {
        const response = await snap.postTransactional({
          path: target.profile.paths.balanceInquiry,
          body: aBalanceInquiry(target),
          accessToken,
          externalId,
        });
        await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('success'));
      });
    },
  );
});
