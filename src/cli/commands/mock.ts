import { parseArgs } from 'node:util';

import { DEFAULT_MOCK_HOST, DEFAULT_MOCK_PORT } from '../../config/local-defaults';
import { DEFAULT_PROFILE, listProfiles } from '../../profiles';
import { ExitCode, UsageError, type CliIo } from '../cli-io';

export const MOCK_HELP = `snapcheck mock [options]

Starts a mock SNAP server that emulates one provider profile.
Each option falls back to its environment variable, then to the default.

Options:
  --profile <name|file>  Profile to emulate   (MOCK_PROFILE, default: ${DEFAULT_PROFILE})
  --port <number>        Port to listen on    (MOCK_PORT, default: ${DEFAULT_MOCK_PORT})
  --host <address>       Address to bind      (MOCK_HOST, default: ${DEFAULT_MOCK_HOST}; 0.0.0.0 in a container)`;

export async function mockCommand(argv: readonly string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      profile: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
    },
    strict: true,
  });

  const profile = values.profile ?? io.env.MOCK_PROFILE ?? DEFAULT_PROFILE;
  const port = values.port ?? io.env.MOCK_PORT ?? String(DEFAULT_MOCK_PORT);
  const host = values.host ?? io.env.MOCK_HOST ?? DEFAULT_MOCK_HOST;

  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new UsageError(`--port must be a number between 1 and 65535 (got "${port}")`);
  }
  const isFile = /[/\\]|\.ya?ml$/.test(profile);
  if (!isFile && !listProfiles().includes(profile)) {
    throw new UsageError(`Unknown profile "${profile}". Available: ${listProfiles().join(', ')}.`);
  }

  await io.startMock({ MOCK_PROFILE: profile, MOCK_PORT: port, MOCK_HOST: host });
  return ExitCode.ok;
}
