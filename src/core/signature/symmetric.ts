import { createHmac, timingSafeEqual } from 'node:crypto';

/** `Base64(HMAC_SHA512(clientSecret, stringToSign))` */
export function signSymmetric(stringToSign: string, clientSecret: string): string {
  return createHmac('sha512', clientSecret).update(stringToSign, 'utf8').digest('base64');
}

/**
 * Verifies an HMAC-SHA512 signature in constant time.
 * A comparison that short-circuits on the first different byte would leak
 * how much of a forged signature is correct.
 */
export function verifySymmetric(
  stringToSign: string,
  signature: string,
  clientSecret: string,
): boolean {
  const expected = Buffer.from(signSymmetric(stringToSign, clientSecret), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
