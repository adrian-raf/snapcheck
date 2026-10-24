import { generateKeyPairSync } from 'node:crypto';

import { SnapHeader } from '../../../src/core';
import { requirement } from '../requirements';
import { expect, expectSnapSuccess, test } from '../support/fixtures';
import { AccessTokenResponseSchema, SnapEnvelopeSchema } from '../support/response-schemas';

const foreignKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });

test.describe('Access token (B2B)', () => {
  test(
    'issues an access token with the documented tokenType',
    requirement('TOK-001'),
    async ({ snap, target, codes }) => {
      const response = await snap.requestAccessToken();

      const body = await expectSnapSuccess(
        response,
        codes.accessToken('success'),
        AccessTokenResponseSchema,
      );
      expect(body.tokenType).toBe(target.profile.accessToken.tokenType);
      expect(Number(body.expiresIn)).toBeGreaterThan(0);
    },
  );

  test(
    'rejects a request signed with another private key',
    requirement('TOK-002'),
    async ({ snap, codes }) => {
      const response = await snap.requestAccessToken({ signingKey: foreignKeyPair.privateKey });

      await expect(response).toHaveSnapResponseCode(codes.accessToken('unauthorized'));
    },
  );

  test(
    'gives the same answer for an unknown client and a wrong key',
    requirement('TOK-003'),
    async ({ snap, codes }) => {
      const unknownClient = await snap.requestAccessToken({
        headers: { set: { [SnapHeader.clientKey]: 'unknown-client-key' } },
      });
      const wrongKey = await snap.requestAccessToken({ signingKey: foreignKeyPair.privateKey });

      await expect(unknownClient).toHaveSnapResponseCode(codes.accessToken('unauthorized'));
      const unknownClientMessage = SnapEnvelopeSchema.parse(await unknownClient.json());
      const wrongKeyMessage = SnapEnvelopeSchema.parse(await wrongKey.json());
      expect(unknownClientMessage.responseMessage).toBe(wrongKeyMessage.responseMessage);
    },
  );

  for (const header of [SnapHeader.timestamp, SnapHeader.clientKey, SnapHeader.signature]) {
    test(`requires the ${header} header`, requirement('TOK-004'), async ({ snap, codes }) => {
      const response = await snap.requestAccessToken({ headers: { omit: [header] } });

      await expect(response).toHaveSnapResponseCode(codes.accessToken('invalidMandatoryField'));
      const { responseMessage } = SnapEnvelopeSchema.parse(await response.json());
      expect(responseMessage).toContain(header);
    });
  }

  for (const timestamp of ['2026-10-22T10:00:00', '2026-10-22 10:00:00+07:00', '1761102000']) {
    test(`rejects X-TIMESTAMP "${timestamp}"`, requirement('TOK-005'), async ({ snap, codes }) => {
      const response = await snap.requestAccessToken({
        headers: { set: { [SnapHeader.timestamp]: timestamp } },
      });

      await expect(response).toHaveSnapResponseCode(codes.accessToken('invalidFieldFormat'));
    });
  }

  test('requires grantType', requirement('TOK-006'), async ({ snap, codes }) => {
    const response = await snap.requestAccessToken({ body: {} });

    await expect(response).toHaveSnapResponseCode(codes.accessToken('invalidMandatoryField'));
  });

  test('rejects an unsupported grantType', requirement('TOK-006'), async ({ snap, codes }) => {
    const response = await snap.requestAccessToken({ body: { grantType: 'password' } });

    await expect(response).toHaveSnapResponseCode(codes.accessToken('invalidFieldFormat'));
  });
});
