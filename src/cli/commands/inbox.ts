import { parseArgs } from 'node:util';

import {
  DEFAULT_INBOX_PATH,
  DEFAULT_INBOX_PORT,
  DEFAULT_MOCK_HOST,
} from '../../config/local-defaults';
import { ExitCode, UsageError, type CliIo } from '../cli-io';

export const INBOX_HELP = `snapcheck inbox [options]

Starts a notification inbox: a stand-in for your notification endpoint that verifies
every notification with the provider public key (.keys/provider/public.pem).
Read what arrived with GET /inbox/<originalPartnerReferenceNo>.
Point a mock at it with MOCK_NOTIFICATION_URL=http://<host>:<port><path>.

Options (each falls back to its environment variable, then to the default):
  --port <number>   (INBOX_PORT, default: ${DEFAULT_INBOX_PORT})
  --host <address>  (INBOX_HOST, default: ${DEFAULT_MOCK_HOST})
  --path <path>     (INBOX_PATH, default: ${DEFAULT_INBOX_PATH})`;

export async function inboxCommand(argv: readonly string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      path: { type: 'string' },
    },
    strict: true,
  });

  const port = values.port ?? io.env.INBOX_PORT ?? String(DEFAULT_INBOX_PORT);
  const host = values.host ?? io.env.INBOX_HOST ?? DEFAULT_MOCK_HOST;
  const path = values.path ?? io.env.INBOX_PATH ?? DEFAULT_INBOX_PATH;

  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new UsageError(`--port must be a number between 1 and 65535 (got "${port}")`);
  }
  if (!path.startsWith('/')) {
    throw new UsageError(`--path must start with "/" (got "${path}")`);
  }

  await io.startInbox({ INBOX_PORT: port, INBOX_HOST: host, INBOX_PATH: path });
  return ExitCode.ok;
}
