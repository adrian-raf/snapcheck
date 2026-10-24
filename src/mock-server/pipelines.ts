import type { preHandlerHookHandler } from 'fastify';
import type { z } from 'zod';

import { SnapHeader } from '../core';
import type { ProviderProfile } from '../profiles';
import type { Clock } from './clock';
import type { ExternalIdRegistry } from './domain/external-id-registry';
import type { PartnerRegistry } from './domain/partner-registry';
import type { TokenStore } from './domain/token-store';
import {
  authenticateBearer,
  requirePartnerMatchesToken,
  verifyTokenSignature,
  verifyTransactionalSignature,
} from './guards/auth.guard';
import { validateBody } from './guards/body.guard';
import { toPreHandler, type RequestGuard } from './guards/guard';
import {
  requireFreshTimestamp,
  requireHeaders,
  requireValidTimestamp,
} from './guards/headers.guard';
import { claimExternalId } from './guards/idempotency.guard';

export interface PipelineDependencies {
  readonly profile: ProviderProfile;
  readonly partners: PartnerRegistry;
  readonly tokens: TokenStore;
  readonly externalIds: ExternalIdRegistry;
  readonly clock: Clock;
  readonly timestampToleranceSeconds: number;
}

const ACCESS_TOKEN_HEADERS = [SnapHeader.timestamp, SnapHeader.clientKey, SnapHeader.signature];

/** Authorization is not listed: a missing token is reported as 401 Invalid Token, not 400. */
const TRANSACTIONAL_HEADERS = [
  SnapHeader.timestamp,
  SnapHeader.signature,
  SnapHeader.partnerId,
  SnapHeader.externalId,
  SnapHeader.channelId,
];

const asHooks = (guards: readonly RequestGuard[]): preHandlerHookHandler[] =>
  guards.map(toPreHandler);

/** Order matters: each guard can rely on the ones before it having passed. */
export function accessTokenPipeline(
  deps: PipelineDependencies,
  bodySchema: z.ZodType,
): preHandlerHookHandler[] {
  return asHooks([
    requireHeaders(ACCESS_TOKEN_HEADERS),
    requireValidTimestamp,
    requireFreshTimestamp(deps.clock, deps.timestampToleranceSeconds),
    verifyTokenSignature(deps.partners),
    validateBody(bodySchema),
  ]);
}

/** Shared by every transactional service, so each route only declares its own body schema. */
export function transactionalPipeline(
  deps: PipelineDependencies,
  bodySchema: z.ZodType,
): preHandlerHookHandler[] {
  return asHooks([
    requireHeaders(TRANSACTIONAL_HEADERS),
    requireValidTimestamp,
    requireFreshTimestamp(deps.clock, deps.timestampToleranceSeconds),
    authenticateBearer(deps.tokens, deps.partners),
    requirePartnerMatchesToken,
    verifyTransactionalSignature(deps.profile.signature.queryString),
    validateBody(bodySchema),
    claimExternalId(deps.externalIds, deps.clock),
  ]);
}
