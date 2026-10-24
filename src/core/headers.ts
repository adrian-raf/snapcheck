/**
 * HTTP header names defined by SNAP.
 *
 * Kept in one place so a typo in a header name fails at compile time
 * instead of silently producing a "missing header" test failure.
 */
export const SnapHeader = {
  authorization: 'Authorization',
  channelId: 'CHANNEL-ID',
  clientKey: 'X-CLIENT-KEY',
  contentType: 'Content-Type',
  externalId: 'X-EXTERNAL-ID',
  partnerId: 'X-PARTNER-ID',
  signature: 'X-SIGNATURE',
  timestamp: 'X-TIMESTAMP',
} as const;

export type SnapHeaderName = (typeof SnapHeader)[keyof typeof SnapHeader];

export const JSON_CONTENT_TYPE = 'application/json';

const BEARER_PREFIX = 'Bearer ';

export function toBearer(accessToken: string): string {
  return `${BEARER_PREFIX}${accessToken}`;
}

/** Returns the token from an `Authorization: Bearer <token>` value, or `undefined`. */
export function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  const token = authorization.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : undefined;
}
