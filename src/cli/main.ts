import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { ensureLocalKeyPairs } from '../keys/ensure-local-key-pair';
import { startMockServer } from '../mock-server/server';
import { startInbox } from '../notification-inbox/app';
import type { CliIo } from './cli-io';
import { runCli } from './run-cli';

const require = createRequire(import.meta.url);

/**
 * Runs Playwright's own CLI with the current Node binary. No shell and no `npx`,
 * so it behaves the same on Windows (PowerShell, cmd) and on Linux/macOS.
 */
function runPlaywright(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<number> {
  const playwrightCli = require.resolve('@playwright/test/cli');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, ...args], {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

const io: CliIo = {
  stdout: (text) => {
    process.stdout.write(`${text}\n`);
  },
  stderr: (text) => {
    process.stderr.write(`${text}\n`);
  },
  runPlaywright,
  startMock: async (env) => {
    ensureLocalKeyPairs();
    await startMockServer({ ...process.env, ...env });
  },
  startInbox: async (env) => {
    ensureLocalKeyPairs();
    await startInbox({ ...process.env, ...env });
  },
  loadEnvFile: (path) => {
    process.loadEnvFile(path);
  },
  env: process.env,
};

/**
 * Expected failures (missing key, invalid profile, port in use) are reported as one
 * readable message plus its cause. SNAPCHECK_DEBUG=1 prints the full stack instead.
 */
function reportFatal(error: unknown): void {
  if (process.env.SNAPCHECK_DEBUG || !(error instanceof Error)) {
    console.error(error);
    return;
  }
  const cause = error.cause instanceof Error ? `\n  Caused by: ${error.cause.message}` : '';
  console.error(`Error: ${error.message}${cause}`);
}

try {
  process.exitCode = await runCli(process.argv.slice(2), io);
} catch (error) {
  reportFatal(error);
  process.exitCode = 1;
}
