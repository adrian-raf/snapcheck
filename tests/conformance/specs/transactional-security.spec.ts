import { SnapHeader, type QueryStringMode } from '../../../src/core';
import { requirement } from '../requirements';
import { expect, expectSnapSuccess, test } from '../support/fixtures';
import { BalanceInquiryResponseSchema, SnapEnvelopeSchema } from '../support/response-schemas';
import { aBalanceInquiry } from '../support/test-data';

/** Balance inquiry is used as the carrier: it has no side effects, so these checks are repeatable. */

const OPPOSITE_MODE: Record<QueryStringMode, QueryStringMode> = {
  exclude: 'include-sorted',
  'include-sorted': 'exclude',
};

test.describe('Transactional signature', () => {
  test(
    'accepts a correctly signed request',
    requirement('SIG-001'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: aBalanceInquiry(target),
        accessToken,
      });

      await expectSnapSuccess(
        response,
        codes.balanceInquiry('success'),
        BalanceInquiryResponseSchema,
      );
    },
  );

  test(
    'rejects a body changed after signing',
    requirement('SIG-002'),
    async ({ snap, target, codes, accessToken }) => {
      const signedBody = aBalanceInquiry(target);

      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: signedBody,
        sentBody: { ...signedBody, accountNo: target.accounts.beneficiary },
        accessToken,
      });

      await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('unauthorized'));
    },
  );

  test(
    'ignores JSON whitespace because the minified body is signed',
    requirement('SIG-003'),
    async ({ snap, target, codes, accessToken }) => {
      const body = aBalanceInquiry(target);

      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body,
        sentBody: JSON.stringify(body, null, 2),
        accessToken,
      });

      await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('success'));
    },
  );

  test(
    'rejects a signature made with another client secret',
    requirement('SIG-004'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: aBalanceInquiry(target),
        accessToken,
        signWith: { clientSecret: 'not-the-real-secret' },
      });

      await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('unauthorized'));
    },
  );

  test(
    'rejects a signature computed for another endpoint',
    requirement('SIG-005'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: aBalanceInquiry(target),
        accessToken,
        signWith: { path: target.profile.paths.transferIntrabank },
      });

      await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('unauthorized'));
    },
  );

  test(
    'treats the query string as the profile documents',
    requirement('SIG-006'),
    async ({ snap, target, codes, accessToken }) => {
      // Deliberately unsorted, so "included and sorted" differs from "as sent".
      const pathWithQuery = `${target.profile.paths.balanceInquiry}?b=2&a=1`;
      const documentedMode = target.profile.signature.queryString;

      await test.step(`signed with query string "${documentedMode}" is accepted`, async () => {
        const response = await snap.postTransactional({
          path: pathWithQuery,
          body: aBalanceInquiry(target),
          accessToken,
        });
        await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('success'));
      });

      await test.step(`signed with query string "${OPPOSITE_MODE[documentedMode]}" is rejected`, async () => {
        const response = await snap.postTransactional({
          path: pathWithQuery,
          body: aBalanceInquiry(target),
          accessToken,
          signWith: { queryStringMode: OPPOSITE_MODE[documentedMode] },
        });
        await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('unauthorized'));
      });
    },
  );
});

test.describe('Bearer token and partner', () => {
  test(
    'a bearer token is required',
    requirement('AUTH-001'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: aBalanceInquiry(target),
        accessToken,
        headers: { omit: [SnapHeader.authorization] },
      });

      await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('invalidToken'));
    },
  );

  test(
    'the token must have been issued by the server',
    requirement('AUTH-002'),
    async ({ snap, target, codes }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: aBalanceInquiry(target),
        accessToken: 'forged-token-that-was-never-issued',
      });

      await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('invalidToken'));
    },
  );

  test(
    "X-PARTNER-ID must be the token's partner",
    requirement('AUTH-003'),
    async ({ snap, target, codes, accessToken }) => {
      const response = await snap.postTransactional({
        path: target.profile.paths.balanceInquiry,
        body: aBalanceInquiry(target),
        accessToken,
        headers: { set: { [SnapHeader.partnerId]: 'another-partner' } },
      });

      await expect(response).toHaveSnapResponseCode(codes.balanceInquiry('unauthorized'));
      const { responseMessage } = SnapEnvelopeSchema.parse(await response.json());
      expect(responseMessage).toContain('Partner');
    },
  );
});

test.describe('Mandatory transactional headers', () => {
  const mandatoryHeaders = [
    SnapHeader.timestamp,
    SnapHeader.signature,
    SnapHeader.partnerId,
    SnapHeader.externalId,
    SnapHeader.channelId,
  ];

  for (const header of mandatoryHeaders) {
    test(
      `rejects a request without ${header}`,
      requirement('HDR-001'),
      async ({ snap, target, codes, accessToken }) => {
        const response = await snap.postTransactional({
          path: target.profile.paths.balanceInquiry,
          body: aBalanceInquiry(target),
          accessToken,
          headers: { omit: [header] },
        });

        await expect(response).toHaveSnapResponseCode(
          codes.balanceInquiry('invalidMandatoryField'),
        );
        const { responseMessage } = SnapEnvelopeSchema.parse(await response.json());
        expect(responseMessage).toContain(header);
      },
    );
  }
});
