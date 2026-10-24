import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

import { LOCAL_KEY_PATHS, LOCAL_PROVIDER_KEY_PATHS } from '../config/local-defaults';

export type KeyPairStatus = 'existing' | 'generated' | 'generated-concurrently';

export interface KeyPairPaths {
  readonly privateKey: string;
  readonly publicKey: string;
}

/**
 * Creates the throwaway RSA key pairs for local testing, if missing:
 * the partner pair (token signatures) and the provider pair (notification signatures).
 * `.keys/` is git-ignored.
 */
export function ensureLocalKeyPairs(): Record<'partner' | 'provider', KeyPairStatus> {
  return {
    partner: ensureKeyPair(LOCAL_KEY_PATHS),
    provider: ensureKeyPair(LOCAL_PROVIDER_KEY_PATHS),
  };
}

/**
 * Creates one key pair in the folder of `paths.privateKey` (both files must share it).
 *
 * Safe to run concurrently (Playwright starts several mocks at once): keys are written
 * to a private temporary folder and moved into place with one atomic rename, so a
 * reader never sees a half-written or mismatched pair.
 */
export function ensureKeyPair(paths: KeyPairPaths): KeyPairStatus {
  if (hasCompleteKeyPair(paths)) {
    return 'existing';
  }

  const keysDir = dirname(paths.privateKey);
  mkdirSync(dirname(keysDir), { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  let stagingDir: string;
  try {
    stagingDir = mkdtempSync(`${keysDir}.tmp-`);
  } catch (error) {
    throw cannotCreate(keysDir, error);
  }
  writeFileSync(join(stagingDir, basename(paths.privateKey)), privateKey, { mode: 0o600 });
  writeFileSync(join(stagingDir, basename(paths.publicKey)), publicKey);

  try {
    renameSync(stagingDir, keysDir);
    return 'generated';
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    // The rename fails when another process got there first (the error code differs
    // per OS: EEXIST, ENOTEMPTY, EPERM on Windows). Only that case is safe to ignore.
    if (!hasCompleteKeyPair(paths)) throw cannotCreate(keysDir, error);
    return 'generated-concurrently';
  }
}

function hasCompleteKeyPair(paths: KeyPairPaths): boolean {
  return existsSync(paths.privateKey) && existsSync(paths.publicKey);
}

function cannotCreate(keysDir: string, cause: unknown): Error {
  return new Error(
    `Could not create the key pair in ${keysDir}/. If .keys is a mounted volume (Docker), ` +
      `create the keys on the host first with "npm run keys:ensure".`,
    { cause },
  );
}
