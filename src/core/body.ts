import { createHash } from 'node:crypto';

/**
 * Minifies a request body the way SNAP expects before hashing it.
 *
 * - An object is serialised with `JSON.stringify` (no whitespace, key order preserved).
 * - A string is treated as raw JSON: parsed and re-serialised, so pretty-printed
 *   and compact versions of the same payload hash to the same value.
 * - No body (`undefined` / `null`) becomes an empty string. Providers differ here
 *   (some hash `""`, some hash `"{}"`), which is why this is documented as a
 *   provider variant rather than a standard rule.
 */
export function minifyBody(body: unknown): string {
  if (body === undefined || body === null) {
    return '';
  }
  if (typeof body === 'string') {
    return body.trim() === '' ? '' : JSON.stringify(JSON.parse(body));
  }
  return JSON.stringify(body);
}

/** `Lowercase(HexEncode(SHA-256(minify(body))))` — the body component of every transactional signature. */
export function hashBody(body: unknown): string {
  return createHash('sha256').update(minifyBody(body), 'utf8').digest('hex').toLowerCase();
}
