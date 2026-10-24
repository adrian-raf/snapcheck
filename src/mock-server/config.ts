import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';

import { z } from 'zod';

import {
  DEFAULT_MOCK_HOST,
  DEFAULT_MOCK_PORT,
  LOCAL_KEY_PATHS,
  LOCAL_PARTNER,
  LOCAL_PROVIDER_KEY_PATHS,
} from '../config/local-defaults';
import { DEFAULT_PROFILE, loadProfile, type ProviderProfile } from '../profiles';

const EnvSchema = z.object({
  MOCK_HOST: z.string().default(DEFAULT_MOCK_HOST),
  MOCK_PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_MOCK_PORT),
  /** Provider the mock emulates: a profile name (`bri`) or a path to a profile file. */
  MOCK_PROFILE: z.string().min(1).default(DEFAULT_PROFILE),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SNAP_CLIENT_KEY: z.string().min(1).default(LOCAL_PARTNER.clientKey),
  SNAP_CLIENT_SECRET: z.string().min(1).default(LOCAL_PARTNER.clientSecret),
  SNAP_PARTNER_ID: z.string().min(1).default(LOCAL_PARTNER.partnerId),
  SNAP_PUBLIC_KEY_PATH: z.string().min(1).default(LOCAL_KEY_PATHS.publicKey),
  TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** Max allowed difference between X-TIMESTAMP and the server clock. `0` disables the check. */
  TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().min(0).default(300),
  /** How late the `timeout-after-commit` fault answers. */
  MOCK_FAULT_DELAY_MS: z.coerce.number().int().min(0).default(3_000),
  /** How long a transfer made with the `pending` fault stays Pending. */
  MOCK_PENDING_SETTLE_MS: z.coerce.number().int().min(0).default(1_000),
  /** Partner URL that receives a signed notification when a pending transfer settles. */
  MOCK_NOTIFICATION_URL: z.url({ protocol: /^https?$/ }).optional(),
  SNAP_PROVIDER_PRIVATE_KEY_PATH: z.string().min(1).default(LOCAL_PROVIDER_KEY_PATHS.privateKey),
});

export interface MockServerConfig {
  readonly host: string;
  readonly port: number;
  readonly logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  readonly profile: ProviderProfile;
  readonly tokenTtlSeconds: number;
  readonly timestampToleranceSeconds: number;
  readonly faultTiming: {
    readonly responseDelayMs: number;
    readonly pendingSettleMs: number;
  };
  /** Absent when no MOCK_NOTIFICATION_URL is set: then no notifications are sent. */
  readonly notifications?: {
    readonly url: URL;
    readonly providerPrivateKey: KeyObject;
  };
  readonly partner: {
    readonly clientKey: string;
    readonly clientSecret: string;
    readonly partnerId: string;
    readonly publicKey: KeyObject;
  };
}

export class ConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConfigError';
  }
}

/** Reads and validates configuration once at start-up, so misconfiguration fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): MockServerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  const values = parsed.data;

  return {
    host: values.MOCK_HOST,
    port: values.MOCK_PORT,
    logLevel: values.LOG_LEVEL,
    profile: loadProfile(values.MOCK_PROFILE),
    tokenTtlSeconds: values.TOKEN_TTL_SECONDS,
    timestampToleranceSeconds: values.TIMESTAMP_TOLERANCE_SECONDS,
    faultTiming: {
      responseDelayMs: values.MOCK_FAULT_DELAY_MS,
      pendingSettleMs: values.MOCK_PENDING_SETTLE_MS,
    },
    // Only read the provider key when it is needed, so the mock runs without it otherwise.
    ...(values.MOCK_NOTIFICATION_URL === undefined
      ? {}
      : {
          notifications: {
            url: new URL(values.MOCK_NOTIFICATION_URL),
            providerPrivateKey: readKey(values.SNAP_PROVIDER_PRIVATE_KEY_PATH, 'private'),
          },
        }),
    partner: {
      clientKey: values.SNAP_CLIENT_KEY,
      clientSecret: values.SNAP_CLIENT_SECRET,
      partnerId: values.SNAP_PARTNER_ID,
      publicKey: readKey(values.SNAP_PUBLIC_KEY_PATH, 'public'),
    },
  };
}

function readKey(path: string, kind: 'public' | 'private'): KeyObject {
  try {
    const pem = readFileSync(path, 'utf8');
    return kind === 'public' ? createPublicKey(pem) : createPrivateKey(pem);
  } catch (cause) {
    throw new ConfigError(
      `Cannot read the ${kind} key at "${path}". Run "npm run keys:ensure" first.`,
      { cause },
    );
  }
}
