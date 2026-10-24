import {
  SnapCase,
  SnapHeader,
  buildSymmetricStringToSign,
  buildTokenStringToSign,
  canonicalEndpointUrl,
  extractBearerToken,
  verifyAsymmetric,
  verifySymmetric,
  type QueryStringMode,
} from '../../core';
import type { PartnerRegistry } from '../domain/partner-registry';
import type { TokenStore } from '../domain/token-store';
import { SnapError } from '../errors';
import { readHeader, type RequestGuard } from './guard';

/**
 * Every signature failure returns the same reason on purpose: telling a caller
 * *why* it failed (unknown client vs. wrong key) helps an attacker enumerate clients.
 */
const SIGNATURE_FAILURE_REASON = 'Signature';

/** Access token: verifies `SHA256withRSA(clientKey|X-TIMESTAMP)` with the partner's public key. */
export function verifyTokenSignature(partners: PartnerRegistry): RequestGuard {
  return (request) => {
    const clientKey = readHeader(request, SnapHeader.clientKey) ?? '';
    const timestamp = readHeader(request, SnapHeader.timestamp) ?? '';
    const signature = readHeader(request, SnapHeader.signature) ?? '';

    const partner = partners.findByClientKey(clientKey);
    const stringToSign = buildTokenStringToSign({ clientKey, timestamp });

    if (!partner || !verifyAsymmetric(stringToSign, signature, partner.publicKey)) {
      throw new SnapError(SnapCase.unauthorized, SIGNATURE_FAILURE_REASON);
    }
  };
}

/** Resolves the partner behind `Authorization: Bearer <token>` and attaches it to the request. */
export function authenticateBearer(tokens: TokenStore, partners: PartnerRegistry): RequestGuard {
  return (request) => {
    const accessToken = extractBearerToken(readHeader(request, SnapHeader.authorization));
    const clientKey = accessToken ? tokens.resolveClientKey(accessToken) : undefined;
    const partner = clientKey ? partners.findByClientKey(clientKey) : undefined;

    if (!partner) {
      throw new SnapError(SnapCase.invalidToken);
    }
    request.partner = partner;
  };
}

/**
 * Rejects a request whose X-PARTNER-ID is not the partner the token was issued to,
 * so one partner's token cannot act on behalf of another. Must run after `authenticateBearer`.
 */
export const requirePartnerMatchesToken: RequestGuard = (request) => {
  if (readHeader(request, SnapHeader.partnerId) !== request.partner?.partnerId) {
    throw new SnapError(SnapCase.unauthorized, 'Partner');
  }
};

/**
 * Transactional: verifies `HMAC_SHA512(clientSecret, METHOD:endpointUrl:token:bodyHash:timestamp)`.
 * `queryStringMode` decides whether the query string is part of `endpointUrl` (provider variant).
 * Must run after `authenticateBearer`, which provides the partner and its secret.
 */
export function verifyTransactionalSignature(queryStringMode: QueryStringMode): RequestGuard {
  return (request) => {
    const { partner } = request;
    const accessToken = extractBearerToken(readHeader(request, SnapHeader.authorization));
    if (!partner || !accessToken) {
      throw new SnapError(SnapCase.invalidToken);
    }

    const stringToSign = buildSymmetricStringToSign({
      method: request.method,
      path: canonicalEndpointUrl(request.url, queryStringMode),
      accessToken,
      body: request.body,
      timestamp: readHeader(request, SnapHeader.timestamp) ?? '',
    });
    const signature = readHeader(request, SnapHeader.signature) ?? '';

    if (!verifySymmetric(stringToSign, signature, partner.clientSecret)) {
      throw new SnapError(SnapCase.unauthorized, SIGNATURE_FAILURE_REASON);
    }
  };
}
