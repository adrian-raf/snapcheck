import { hashBody } from '../body';

export interface TokenSigningInput {
  readonly clientKey: string;
  readonly timestamp: string;
}

export interface TransactionalSigningInput {
  readonly method: string;
  /**
   * Relative endpoint URL, e.g. `/v1.0/balance-inquiry`.
   * Whether a query string is part of it is a provider variant (BCA: included and
   * sorted; BRI: excluded), so callers pass exactly the value their provider signs.
   */
  readonly path: string;
  readonly body: unknown;
  readonly timestamp: string;
}

export interface SymmetricSigningInput extends TransactionalSigningInput {
  readonly accessToken: string;
}

const SEPARATOR = ':';

/** Access token (B2B): `clientKey|X-TIMESTAMP`. */
export function buildTokenStringToSign({ clientKey, timestamp }: TokenSigningInput): string {
  return `${clientKey}|${timestamp}`;
}

/**
 * Transactional, symmetric (HMAC-SHA512):
 * `METHOD:path:accessToken:lowercase(hex(sha256(minify(body)))):X-TIMESTAMP`
 */
export function buildSymmetricStringToSign(input: SymmetricSigningInput): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.accessToken,
    hashBody(input.body),
    input.timestamp,
  ].join(SEPARATOR);
}

/**
 * Transactional, asymmetric (SHA256withRSA) — same as symmetric but without the access token:
 * `METHOD:path:lowercase(hex(sha256(minify(body)))):X-TIMESTAMP`
 */
export function buildAsymmetricStringToSign(input: TransactionalSigningInput): string {
  return [input.method.toUpperCase(), input.path, hashBody(input.body), input.timestamp].join(
    SEPARATOR,
  );
}
