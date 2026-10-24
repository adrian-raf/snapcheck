import { chmodSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureKeyPair, type KeyPairPaths } from '../../../src/keys/ensure-local-key-pair';

const modeOf = (path: string): number => statSync(path).mode & 0o777;

/**
 * Regression test for the Docker CI failure: folders created with mkdtemp are 0700,
 * so a container running as another user could not read keys mounted from the host.
 * POSIX modes do not exist on Windows.
 */
describe.skipIf(process.platform === 'win32')('ensureKeyPair file modes', () => {
  const pathsIn = (root: string, privateKeyMode: number): KeyPairPaths => ({
    privateKey: join(root, 'keys', 'private.pem'),
    publicKey: join(root, 'keys', 'public.pem'),
    privateKeyMode,
  });

  it('creates a folder others can open, and keeps a partner private key owner-only', () => {
    const paths = pathsIn(mkdtempSync(join(tmpdir(), 'snapcheck-keys-')), 0o600);

    expect(ensureKeyPair(paths)).toBe('generated');
    expect(modeOf(join(paths.privateKey, '..'))).toBe(0o755);
    expect(modeOf(paths.publicKey)).toBe(0o644);
    expect(modeOf(paths.privateKey)).toBe(0o600);
  });

  it('repairs a folder left at 0700 by an earlier version', () => {
    const paths = pathsIn(mkdtempSync(join(tmpdir(), 'snapcheck-keys-')), 0o644);
    ensureKeyPair(paths);
    chmodSync(join(paths.privateKey, '..'), 0o700);
    chmodSync(paths.privateKey, 0o600);

    expect(ensureKeyPair(paths)).toBe('existing');
    expect(modeOf(join(paths.privateKey, '..'))).toBe(0o755);
    expect(modeOf(paths.privateKey)).toBe(0o644);
  });
});
