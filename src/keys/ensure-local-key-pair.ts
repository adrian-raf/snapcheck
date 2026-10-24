import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

import { LOCAL_KEY_PATHS, LOCAL_PROVIDER_KEY_PATHS } from '../config/local-defaults';

export type KeyPairStatus = 'existing' | 'generated' | 'generated-concurrently';

export interface KeyPairPaths {
  readonly privateKey: string;
  readonly publicKey: string;
  /**
   * File mode of the private key. The partner key stays owner-only. The provider key
   * is read by the mock, which in Docker runs as another user than the one who
   * created the file, so it must be readable by others. Both are throwaway test keys.
   */
  readonly privateKeyMode: number;
}

/** Folders must be traversable by the container user; their files stay read-only. */
const DIRECTORY_MODE = 0o755;
const PUBLIC_KEY_MODE = 0o644;

const PARTNER_KEYS: KeyPairPaths = { ...LOCAL_KEY_PATHS, privateKeyMode: 0o600 };
const PROVIDER_KEYS: KeyPairPaths = { ...LOCAL_PROVIDER_KEY_PATHS, privateKeyMode: 0o644 };

/**
 * Creates the throwaway RSA key pairs for local testing, if missing:
 * the partner pair (token signatures) and the provider pair (notification signatures).
 * `.keys/` is git-ignored.
 */
export function ensureLocalKeyPairs(): Record<'partner' | 'provider', KeyPairStatus> {
  return {
    partner: ensureKeyPair(PARTNER_KEYS),
    provider: ensureKeyPair(PROVIDER_KEYS),
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
  const keysDir = dirname(paths.privateKey);

  if (hasCompleteKeyPair(paths)) {
    applyModes(paths); // Repairs folders created by earlier versions with mode 0700.
    return 'existing';
  }

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
  writeFileSync(join(stagingDir, basename(paths.privateKey)), privateKey);
  writeFileSync(join(stagingDir, basename(paths.publicKey)), publicKey);

  try {
    renameSync(stagingDir, keysDir);
    applyModes(paths);
    return 'generated';
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    // The rename fails when another process got there first (the error code differs
    // per OS: EEXIST, ENOTEMPTY, EPERM on Windows). Only that case is safe to ignore.
    if (!hasCompleteKeyPair(paths)) throw cannotCreate(keysDir, error);
    return 'generated-concurrently';
  }
}

/**
 * Sets the intended modes. Ignored where it cannot apply: a read-only volume, a file
 * owned by another user, or Windows (which has no POSIX modes).
 */
function applyModes(paths: KeyPairPaths): void {
  // Only the pair's own folder: `.keys/provider`'s parent `.keys` is the partner pair's folder.
  const changes: readonly [string, number][] = [
    [dirname(paths.privateKey), DIRECTORY_MODE],
    [paths.privateKey, paths.privateKeyMode],
    [paths.publicKey, PUBLIC_KEY_MODE],
  ];
  for (const [path, mode] of changes) {
    try {
      chmodSync(path, mode);
    } catch {
      // Best effort; see above.
    }
  }
}

function hasCompleteKeyPair(paths: KeyPairPaths): boolean {
  return existsSync(paths.privateKey) && existsSync(paths.publicKey);
}

function cannotCreate(keysDir: string, cause: unknown): Error {
  // existsSync is false for a file in a folder this user cannot open, so a folder
  // that exists but looks empty almost always means "not readable", not "missing".
  const hint = existsSync(keysDir)
    ? `${keysDir}/ exists but its keys are not readable by this user. On the host, run ` +
      `"npm run keys:ensure" again: it makes the folders readable for the container.`
    : `If .keys is a mounted volume (Docker), create the keys on the host first with ` +
      `"npm run keys:ensure".`;
  return new Error(`Could not create the key pair in ${keysDir}/. ${hint}`, { cause });
}
