import { readFileSync } from 'node:fs';
import { createPrivateKey, type KeyObject } from 'node:crypto';

import {
  DEFAULT_INBOX_PORT,
  DEFAULT_MOCK_HOST,
  LOCAL_KEY_PATHS,
  LOCAL_PARTNER,
} from '../../../src/config/local-defaults';
import { MOCK_ACCOUNTS } from '../../../src/mock-server/domain/accounts';
import type { ProviderProfile } from '../../../src/profiles';

/**
 * Everything that differs between the local mock and a real provider sandbox.
 * Specs never read environment variables directly; they ask for this object.
 */
export interface ConformanceTarget {
  /** `true` when running against the bundled mock (no SNAP_BASE_URL set). */
  readonly isMock: boolean;
  /** Provider behaviour the suite expects: paths, timestamp format, case code overrides, … */
  readonly profile: ProviderProfile;
  readonly partner: {
    readonly clientKey: string;
    readonly clientSecret: string;
    readonly partnerId: string;
    readonly channelId: string;
    readonly privateKey: KeyObject;
  };
  /** Where the mock's settlement notifications can be read back (mock only). */
  readonly inboxUrl: string;
  readonly accounts: {
    readonly source: string;
    readonly beneficiary: string;
    /** An account number the provider is known NOT to have. */
    readonly unknown: string;
  };
}

export function loadTarget(
  profile: ProviderProfile,
  env: NodeJS.ProcessEnv = process.env,
): ConformanceTarget {
  return {
    isMock: !env.SNAP_BASE_URL,
    profile,
    inboxUrl: env.SNAP_INBOX_URL ?? `http://${DEFAULT_MOCK_HOST}:${DEFAULT_INBOX_PORT}`,
    partner: {
      clientKey: env.SNAP_CLIENT_KEY ?? LOCAL_PARTNER.clientKey,
      clientSecret: env.SNAP_CLIENT_SECRET ?? LOCAL_PARTNER.clientSecret,
      partnerId: env.SNAP_PARTNER_ID ?? LOCAL_PARTNER.partnerId,
      channelId: env.SNAP_CHANNEL_ID ?? LOCAL_PARTNER.channelId,
      privateKey: readPrivateKey(env.SNAP_PRIVATE_KEY_PATH ?? LOCAL_KEY_PATHS.privateKey),
    },
    accounts: {
      source: env.SNAP_TEST_SOURCE_ACCOUNT ?? MOCK_ACCOUNTS.source,
      beneficiary: env.SNAP_TEST_BENEFICIARY_ACCOUNT ?? MOCK_ACCOUNTS.beneficiary,
      unknown: env.SNAP_TEST_UNKNOWN_ACCOUNT ?? '9999999999',
    },
  };
}

function readPrivateKey(path: string): KeyObject {
  try {
    return createPrivateKey(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw new Error(
      `Cannot read the partner private key at "${path}". For the mock, run "npm run keys:ensure".`,
      { cause },
    );
  }
}
