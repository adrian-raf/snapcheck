import type { KeyLike } from 'node:crypto';

import { JSON_CONTENT_TYPE, SnapHeader } from './headers';
import type { HeaderMap } from './request-headers';
import { signAsymmetric, verifyAsymmetric } from './signature/asymmetric';
import { buildAsymmetricStringToSign } from './signature/string-to-sign';

/**
 * Notifications sent by a provider to a partner's URL, signed asymmetrically:
 * `SHA256withRSA(providerPrivateKey, POST:path:lowercase(hex(sha256(minify(body)))):X-TIMESTAMP)`.
 *
 * Formula as documented by PayerMax and DOKU's asymmetric page. Providers disagree on
 * whether notifications are signed this way at all (DOKU's overview says symmetric), so
 * treat it as one variant. `path` is the path of the partner's notification URL.
 */

export interface NotificationSigningInput {
  readonly path: string;
  readonly body: unknown;
  readonly timestamp: string;
}

export interface NotificationHeaderInput extends NotificationSigningInput {
  readonly providerPrivateKey: KeyLike;
  readonly externalId: string;
}

const METHOD = 'POST';

export function buildNotificationHeaders(input: NotificationHeaderInput): HeaderMap {
  const stringToSign = buildAsymmetricStringToSign({ method: METHOD, ...input });
  return {
    [SnapHeader.contentType]: JSON_CONTENT_TYPE,
    [SnapHeader.timestamp]: input.timestamp,
    [SnapHeader.externalId]: input.externalId,
    [SnapHeader.signature]: signAsymmetric(stringToSign, input.providerPrivateKey),
  };
}

export interface NotificationVerificationInput extends NotificationSigningInput {
  readonly signature: string;
  readonly providerPublicKey: KeyLike;
}

/** What a partner must check before trusting a notification. Never throws. */
export function verifyNotification(input: NotificationVerificationInput): boolean {
  const stringToSign = buildAsymmetricStringToSign({ method: METHOD, ...input });
  return verifyAsymmetric(stringToSign, input.signature, input.providerPublicKey);
}
