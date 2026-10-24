import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildAsymmetricStringToSign,
  buildSymmetricStringToSign,
  buildTokenStringToSign,
  signAsymmetric,
  signSymmetric,
  verifyAsymmetric,
  verifySymmetric,
} from '../../../src/core';
import { GOLDEN } from './golden-vectors';

const symmetricInput = {
  method: 'post',
  path: GOLDEN.path,
  accessToken: GOLDEN.accessToken,
  body: GOLDEN.body,
  timestamp: GOLDEN.timestamp,
};

describe('string to sign', () => {
  it('joins client key and timestamp with a pipe for the access token', () => {
    expect(buildTokenStringToSign({ clientKey: 'client-1', timestamp: GOLDEN.timestamp })).toBe(
      'client-1|2026-10-22T10:00:00+07:00',
    );
  });

  it('builds the symmetric form with an upper-cased method', () => {
    expect(buildSymmetricStringToSign(symmetricInput)).toBe(GOLDEN.stringToSign);
  });

  it('builds the asymmetric transactional form without the access token', () => {
    expect(buildAsymmetricStringToSign(symmetricInput)).toBe(
      `POST:${GOLDEN.path}:${GOLDEN.bodySha256}:${GOLDEN.timestamp}`,
    );
  });
});

describe('symmetric signature (HMAC-SHA512)', () => {
  it('matches the OpenSSL reference value', () => {
    expect(signSymmetric(GOLDEN.stringToSign, GOLDEN.clientSecret)).toBe(GOLDEN.hmacSha512Base64);
  });

  it('accepts the correct signature', () => {
    expect(verifySymmetric(GOLDEN.stringToSign, GOLDEN.hmacSha512Base64, GOLDEN.clientSecret)).toBe(
      true,
    );
  });

  it.each([
    ['a different secret', GOLDEN.stringToSign, GOLDEN.hmacSha512Base64, 'other-secret'],
    ['a tampered payload', `${GOLDEN.stringToSign}x`, GOLDEN.hmacSha512Base64, GOLDEN.clientSecret],
    ['a truncated signature', GOLDEN.stringToSign, 'ArU5MM', GOLDEN.clientSecret],
    ['an empty signature', GOLDEN.stringToSign, '', GOLDEN.clientSecret],
  ])('rejects %s', (_case, stringToSign, signature, secret) => {
    expect(verifySymmetric(stringToSign, signature, secret)).toBe(false);
  });
});

describe('asymmetric signature (SHA256withRSA)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const stringToSign = buildTokenStringToSign({
    clientKey: 'client-1',
    timestamp: GOLDEN.timestamp,
  });

  it('verifies a signature made with the matching private key', () => {
    const signature = signAsymmetric(stringToSign, privateKey);
    expect(verifyAsymmetric(stringToSign, signature, publicKey)).toBe(true);
  });

  it('rejects a signature made with another private key', () => {
    const signature = signAsymmetric(stringToSign, otherKeyPair.privateKey);
    expect(verifyAsymmetric(stringToSign, signature, publicKey)).toBe(false);
  });

  it('rejects a signature over a different string', () => {
    const signature = signAsymmetric(stringToSign, privateKey);
    expect(verifyAsymmetric(`${stringToSign}0`, signature, publicKey)).toBe(false);
  });

  it('returns false instead of throwing for garbage input', () => {
    expect(verifyAsymmetric(stringToSign, '%%%not-base64%%%', publicKey)).toBe(false);
  });
});
