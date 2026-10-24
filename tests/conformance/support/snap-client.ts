import type { KeyObject } from 'node:crypto';

import type { APIRequestContext, APIResponse } from '@playwright/test';

import {
  buildAccessTokenHeaders,
  buildTransactionalHeaders,
  canonicalEndpointUrl,
  formatSnapTimestamp,
  generateExternalId,
  type HeaderMap,
  type QueryStringMode,
} from '../../../src/core';
import { timestampFormatOf } from '../../../src/profiles';
import { AccessTokenResponseSchema } from './response-schemas';
import type { ConformanceTarget } from './target';

/** Changes applied to correctly signed headers, to build negative test cases. */
export interface HeaderOverrides {
  readonly omit?: readonly string[];
  readonly set?: HeaderMap;
}

interface CommonCall {
  readonly headers?: HeaderOverrides;
  /** Sign the request as if it were sent at this moment (defaults to now). */
  readonly sentAt?: Date;
}

export interface AccessTokenCall extends CommonCall {
  readonly body?: unknown;
  /** Sign with this key instead of the partner's own key. */
  readonly signingKey?: KeyObject;
}

export interface TransactionalCall extends CommonCall {
  /** Relative URL to call, optionally with a query string. */
  readonly path: string;
  readonly body: unknown;
  readonly accessToken: string;
  readonly externalId?: string;
  /** Give up waiting for the response after this many milliseconds (a client-side timeout). */
  readonly timeoutMs?: number;
  /** What goes on the wire. Defaults to `body`; set it to send something other than what was signed. */
  readonly sentBody?: unknown;
  /** Sign with values other than the real ones, to prove the server checks each of them. */
  readonly signWith?: {
    readonly clientSecret?: string;
    readonly path?: string;
    readonly queryStringMode?: QueryStringMode;
  };
}

const ACCESS_TOKEN_BODY = { grantType: 'client_credentials' } as const;

/**
 * A SNAP client for tests: it signs every request the way the target's profile
 * says, and exposes explicit, named ways to break exactly one thing at a time.
 */
export class SnapClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly target: ConformanceTarget,
  ) {}

  requestAccessToken(call: AccessTokenCall = {}): Promise<APIResponse> {
    const { partner, profile } = this.target;
    const headers = buildAccessTokenHeaders({
      clientKey: partner.clientKey,
      privateKey: call.signingKey ?? partner.privateKey,
      timestamp: this.timestamp(call.sentAt),
    });

    return this.request.post(profile.paths.accessToken, {
      headers: applyOverrides(headers, call.headers),
      data: call.body ?? ACCESS_TOKEN_BODY,
    });
  }

  /** Happy-path helper for tests whose subject is not the token endpoint itself. */
  async obtainAccessToken(): Promise<string> {
    const response = await this.requestAccessToken();
    if (!response.ok()) {
      throw new Error(
        `Could not obtain an access token: HTTP ${response.status()} ${await response.text()}`,
      );
    }
    return AccessTokenResponseSchema.parse(await response.json()).accessToken;
  }

  postTransactional(call: TransactionalCall): Promise<APIResponse> {
    const { partner, profile } = this.target;
    const endpointUrl = canonicalEndpointUrl(
      call.signWith?.path ?? call.path,
      call.signWith?.queryStringMode ?? profile.signature.queryString,
    );

    const headers = buildTransactionalHeaders({
      method: 'POST',
      path: endpointUrl,
      body: call.body,
      accessToken: call.accessToken,
      clientSecret: call.signWith?.clientSecret ?? partner.clientSecret,
      partnerId: partner.partnerId,
      channelId: partner.channelId,
      externalId: call.externalId ?? generateExternalId(),
      timestamp: this.timestamp(call.sentAt),
    });

    return this.request.post(call.path, {
      headers: applyOverrides(headers, call.headers),
      data: call.sentBody ?? call.body,
      ...(call.timeoutMs === undefined ? {} : { timeout: call.timeoutMs }),
    });
  }

  private timestamp(sentAt: Date = new Date()): string {
    return formatSnapTimestamp(sentAt, timestampFormatOf(this.target.profile));
  }
}

function applyOverrides(headers: HeaderMap, overrides: HeaderOverrides = {}): HeaderMap {
  const omitted = new Set(overrides.omit?.map((name) => name.toLowerCase()));
  const kept = Object.entries(headers).filter(([name]) => !omitted.has(name.toLowerCase()));
  return { ...Object.fromEntries(kept), ...overrides.set };
}
