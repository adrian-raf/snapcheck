import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { DEFAULT_PROFILE, listProfiles } from '../../profiles';
import { UsageError, type CliIo } from '../cli-io';

export const RUN_HELP = `snapcheck run [options]

Runs the conformance suite. Without --target, every shipped profile is tested
against its own mock; with --target, one profile is tested against a real sandbox.

Options:
  --profile <name|file>  Profile to test (mock: one of profiles/; sandbox: name or .yaml file)
  --target <url>         Sandbox origin, e.g. https://sandbox.example.co.id (paths come from the profile)
  --grep <pattern>       Only matching tests, e.g. @IDEM-001 or @standard
  --env-file <path>      Load SNAP_* variables (credentials, accounts) from a file first

Exit code: 0 all passed, 1 a check failed, 2 invalid usage.
Report: compliance-report/index.html`;

export interface RunOptions {
  readonly profile?: string | undefined;
  readonly target?: string | undefined;
  readonly grep?: string | undefined;
}

export interface PlaywrightInvocation {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/**
 * Translates CLI options into a Playwright invocation. Pure: every decision is
 * here, so it is unit-tested without starting anything.
 */
export function buildRunInvocation(
  options: RunOptions,
  shippedProfiles: readonly string[],
): PlaywrightInvocation {
  const grepArgs = options.grep ? ['--grep', options.grep] : [];

  if (options.target === undefined) {
    if (options.profile === undefined) {
      return { args: ['test', ...grepArgs], env: {} };
    }
    if (!shippedProfiles.includes(options.profile)) {
      throw new UsageError(
        isProfileFile(options.profile)
          ? 'A profile file can only be used with --target. To test it against the mock, put it in profiles/.'
          : unknownProfileMessage(options.profile, shippedProfiles),
      );
    }
    return {
      args: ['test', '--project', options.profile, ...grepArgs],
      // Only start the mock this run needs (see playwright.config.ts).
      env: { SNAPCHECK_PROFILES: options.profile },
    };
  }

  const profile = options.profile ?? DEFAULT_PROFILE;
  if (isProfileFile(profile) ? !existsSync(profile) : !shippedProfiles.includes(profile)) {
    throw new UsageError(
      isProfileFile(profile)
        ? `Profile file not found: ${profile}`
        : unknownProfileMessage(profile, shippedProfiles),
    );
  }
  return {
    args: ['test', ...grepArgs],
    env: { SNAP_BASE_URL: toOrigin(options.target), SNAP_PROFILE: profile },
  };
}

export async function runCommand(argv: readonly string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      profile: { type: 'string' },
      target: { type: 'string' },
      grep: { type: 'string' },
      'env-file': { type: 'string' },
    },
    strict: true,
  });

  const envFile = values['env-file'];
  if (envFile !== undefined) {
    if (!existsSync(envFile)) throw new UsageError(`Env file not found: ${envFile}`);
    io.loadEnvFile(envFile);
  }

  // Explicit flags win over SNAP_BASE_URL / SNAP_PROFILE from the environment or env file.
  const invocation = buildRunInvocation(
    {
      profile: values.profile ?? io.env.SNAP_PROFILE,
      target: values.target ?? io.env.SNAP_BASE_URL,
      grep: values.grep,
    },
    listProfiles(),
  );
  return io.runPlaywright(invocation.args, invocation.env);
}

function toOrigin(target: string): string {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new UsageError(
      `--target must be a URL, e.g. https://sandbox.example.co.id (got "${target}")`,
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UsageError(`--target must use http or https (got "${url.protocol}")`);
  }
  if (url.pathname !== '/' || url.search !== '') {
    throw new UsageError(
      `--target must be an origin only (got "${target}"); endpoint paths come from the profile.`,
    );
  }
  return url.origin;
}

function isProfileFile(value: string): boolean {
  return value.includes('/') || value.includes('\\') || /\.ya?ml$/.test(value);
}

function unknownProfileMessage(name: string, shipped: readonly string[]): string {
  return `Unknown profile "${name}". Available: ${shipped.join(', ')}.`;
}
