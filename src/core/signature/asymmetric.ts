import { createSign, createVerify, type KeyLike } from 'node:crypto';

const ALGORITHM = 'RSA-SHA256';

/** `Base64(SHA256withRSA(privateKey, stringToSign))` */
export function signAsymmetric(stringToSign: string, privateKey: KeyLike): string {
  return createSign(ALGORITHM).update(stringToSign, 'utf8').sign(privateKey, 'base64');
}

/**
 * Returns `false` (never throws) for a wrong, truncated or non-base64 signature,
 * so callers can map every failure to the same "Unauthorized" response.
 */
export function verifyAsymmetric(
  stringToSign: string,
  signature: string,
  publicKey: KeyLike,
): boolean {
  try {
    return createVerify(ALGORITHM)
      .update(stringToSign, 'utf8')
      .verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}
