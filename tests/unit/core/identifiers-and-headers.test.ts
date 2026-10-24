import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  SnapHeader,
  buildAccessTokenHeaders,
  buildSymmetricStringToSign,
  buildTokenStringToSign,
  buildTransactionalHeaders,
  extractBearerToken,
  generateNumericId,
  verifyAsymmetric,
  verifySymmetric,
} from '../../../src/core';
import { GOLDEN } from './golden-vectors';

describe('generateNumericId', () => {
  it('returns digits only, of the requested length, without a leading zero', () => {
    const id = generateNumericId(32);
    expect(id).toMatch(/^[1-9]\d{31}$/);
  });

  it('rejects a non-positive length', () => {
    expect(() => generateNumericId(0)).toThrow(RangeError);
  });
});

describe('extractBearerToken', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['Bearer   abc  ', 'abc'],
    ['Bearer ', undefined],
    ['bearer abc', undefined],
    ['Basic abc', undefined],
    [undefined, undefined],
  ])('%j → %j', (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });
});

describe('buildAccessTokenHeaders', () => {
  it('signs clientKey|timestamp so the server can verify it with the public key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const headers = buildAccessTokenHeaders({
      clientKey: 'client-1',
      privateKey,
      timestamp: GOLDEN.timestamp,
    });

    const stringToSign = buildTokenStringToSign({
      clientKey: 'client-1',
      timestamp: GOLDEN.timestamp,
    });
    expect(headers[SnapHeader.clientKey]).toBe('client-1');
    expect(verifyAsymmetric(stringToSign, headers[SnapHeader.signature] ?? '', publicKey)).toBe(
      true,
    );
  });
});

describe('buildTransactionalHeaders', () => {
  const input = {
    method: GOLDEN.method,
    path: GOLDEN.path,
    body: GOLDEN.body,
    accessToken: GOLDEN.accessToken,
    clientSecret: GOLDEN.clientSecret,
    partnerId: 'partner-1',
    channelId: '95221',
    externalId: '12345678901234567890',
    timestamp: GOLDEN.timestamp,
  };

  it('includes every mandatory transactional header', () => {
    const headers = buildTransactionalHeaders(input);
    expect(Object.keys(headers).sort()).toEqual(
      [
        SnapHeader.authorization,
        SnapHeader.channelId,
        SnapHeader.contentType,
        SnapHeader.externalId,
        SnapHeader.partnerId,
        SnapHeader.signature,
        SnapHeader.timestamp,
      ].sort(),
    );
  });

  it('produces the OpenSSL reference signature', () => {
    const headers = buildTransactionalHeaders(input);
    expect(headers[SnapHeader.signature]).toBe(GOLDEN.hmacSha512Base64);
    expect(
      verifySymmetric(
        buildSymmetricStringToSign(input),
        headers[SnapHeader.signature] ?? '',
        GOLDEN.clientSecret,
      ),
    ).toBe(true);
  });
});
