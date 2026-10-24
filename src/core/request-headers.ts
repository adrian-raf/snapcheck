import type { KeyLike } from 'node:crypto';

import { JSON_CONTENT_TYPE, SnapHeader, toBearer } from './headers';
import { signAsymmetric } from './signature/asymmetric';
import { buildSymmetricStringToSign, buildTokenStringToSign } from './signature/string-to-sign';
import { signSymmetric } from './signature/symmetric';

export type HeaderMap = Record<string, string>;

export interface AccessTokenHeaderInput {
  readonly clientKey: string;
  readonly privateKey: KeyLike;
  readonly timestamp: string;
}

/** Headers for `POST /v1.0/access-token/b2b`, signed with the partner's RSA private key. */
export function buildAccessTokenHeaders(input: AccessTokenHeaderInput): HeaderMap {
  const signature = signAsymmetric(buildTokenStringToSign(input), input.privateKey);
  return {
    [SnapHeader.contentType]: JSON_CONTENT_TYPE,
    [SnapHeader.clientKey]: input.clientKey,
    [SnapHeader.timestamp]: input.timestamp,
    [SnapHeader.signature]: signature,
  };
}

export interface TransactionalHeaderInput {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly accessToken: string;
  readonly clientSecret: string;
  readonly partnerId: string;
  readonly channelId: string;
  readonly externalId: string;
  readonly timestamp: string;
}

/** Headers for a transactional call, signed with HMAC-SHA512 (symmetric). */
export function buildTransactionalHeaders(input: TransactionalHeaderInput): HeaderMap {
  const signature = signSymmetric(buildSymmetricStringToSign(input), input.clientSecret);
  return {
    [SnapHeader.contentType]: JSON_CONTENT_TYPE,
    [SnapHeader.authorization]: toBearer(input.accessToken),
    [SnapHeader.timestamp]: input.timestamp,
    [SnapHeader.signature]: signature,
    [SnapHeader.partnerId]: input.partnerId,
    [SnapHeader.externalId]: input.externalId,
    [SnapHeader.channelId]: input.channelId,
  };
}
