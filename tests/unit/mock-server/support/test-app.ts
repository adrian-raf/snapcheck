import { generateKeyPairSync } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import {
  buildAccessTokenHeaders,
  buildTransactionalHeaders,
  formatSnapTimestamp,
  generateExternalId,
  type HeaderMap,
} from '../../../../src/core';
import { buildApp } from '../../../../src/mock-server/app';
import type { MockServerConfig } from '../../../../src/mock-server/config';
import { loadProfile, type ProviderProfile } from '../../../../src/profiles';

/**
 * An in-process mock (Fastify `inject`, no network) with a controllable clock and
 * a correctly signing client. For route-level tests that need precise control.
 */
export interface TestApp {
  readonly app: FastifyInstance;
  readonly profile: ProviderProfile;
  readonly clock: { now: Date };
  post(path: string, body: unknown, extraHeaders?: HeaderMap): Promise<TestResponse>;
}

export interface TestResponse {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export interface TestAppOptions {
  readonly profile?: Partial<ProviderProfile>;
  readonly config?: Partial<MockServerConfig>;
}

const partnerKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PARTNER = {
  clientKey: 'unit-client',
  clientSecret: 'unit-secret',
  partnerId: 'unit-client',
  publicKey: partnerKeys.publicKey,
};

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const profile = { ...loadProfile('default'), ...options.profile };
  const clock = { now: new Date('2026-10-24T03:00:00Z') };
  const app = buildApp({
    clock: () => clock.now,
    config: {
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      profile,
      tokenTtlSeconds: 900,
      timestampToleranceSeconds: 300,
      faultTiming: { responseDelayMs: 0, pendingSettleMs: 1_000 },
      partner: PARTNER,
      ...options.config,
    },
  });

  const timestamp = (): string => formatSnapTimestamp(clock.now);

  const tokenResponse = await app.inject({
    method: 'POST',
    url: profile.paths.accessToken,
    headers: buildAccessTokenHeaders({
      clientKey: PARTNER.clientKey,
      privateKey: partnerKeys.privateKey,
      timestamp: timestamp(),
    }),
    payload: { grantType: 'client_credentials' },
  });
  const { accessToken } = tokenResponse.json<{ accessToken: string }>();

  return {
    app,
    profile,
    clock,
    async post(path, body, extraHeaders = {}) {
      const headers = buildTransactionalHeaders({
        method: 'POST',
        path,
        body,
        accessToken,
        clientSecret: PARTNER.clientSecret,
        partnerId: PARTNER.partnerId,
        channelId: '95221',
        externalId: generateExternalId(),
        timestamp: timestamp(),
      });
      const response = await app.inject({
        method: 'POST',
        url: path,
        headers: { ...headers, ...extraHeaders },
        payload: JSON.stringify(body),
      });
      return { statusCode: response.statusCode, body: response.json<Record<string, unknown>>() };
    },
  };
}
