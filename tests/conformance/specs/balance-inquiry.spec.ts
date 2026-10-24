import { requirement } from '../requirements';
import { expect, expectSnapSuccess, test } from '../support/fixtures';
import { BalanceInquiryResponseSchema } from '../support/response-schemas';
import { aBalanceInquiry } from '../support/test-data';

test.describe('Balance inquiry', () => {
  test(
    'returns the balance of a known account',
    requirement('BAL-001'),
    async ({ snap, target, codes, accessToken }) => {
      const request = aBalanceInquiry(target);

      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: request,
        accessToken,
      });

      const body = await expectSnapSuccess(
        response,
        codes.balanceInquiry('success'),
        BalanceInquiryResponseSchema,
      );
      expect(body.accountNo).toBe(request.accountNo);
      expect(body.partnerReferenceNo).toBe(request.partnerReferenceNo);
    },
  );

  test(
    'rejects an unknown account',
    requirement('BAL-002'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: aBalanceInquiry(target, { accountNo: target.accounts.unknown }),
        accessToken,
      });

      await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('invalidAccount'));
    },
  );
});
