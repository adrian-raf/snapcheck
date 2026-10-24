import { readFileSync } from 'node:fs';
import { createPublicKey, type KeyObject } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  DEFAULT_INBOX_PATH,
  DEFAULT_INBOX_PORT,
  DEFAULT_MOCK_HOST,
  LOCAL_PROVIDER_KEY_PATHS,
} from '../config/local-defaults';
import { NotificationStore, judgeNotification } from './inbox';

/**
 * A stand-in for the partner's notification endpoint. It verifies every notification
 * with the provider's public key, answers like a partner would, and lets tests read
 * back what arrived: GET /inbox/<originalPartnerReferenceNo>.
 */

const EnvSchema = z.object({
  INBOX_HOST: z.string().default(DEFAULT_MOCK_HOST),
  INBOX_PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_INBOX_PORT),
  INBOX_PATH: z.string().startsWith('/').default(DEFAULT_INBOX_PATH),
  SNAP_PROVIDER_PUBLIC_KEY_PATH: z.string().min(1).default(LOCAL_PROVIDER_KEY_PATHS.publicKey),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface InboxConfig {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly providerPublicKey: KeyObject;
  readonly logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
}

export function loadInboxConfig(env: NodeJS.ProcessEnv = process.env): InboxConfig {
  const values = EnvSchema.parse(env);
  let providerPublicKey: KeyObject;
  try {
    providerPublicKey = createPublicKey(readFileSync(values.SNAP_PROVIDER_PUBLIC_KEY_PATH, 'utf8'));
  } catch (cause) {
    throw new Error(
      `Cannot read the provider public key at "${values.SNAP_PROVIDER_PUBLIC_KEY_PATH}". Run "npm run keys:ensure" first.`,
      { cause },
    );
  }
  return {
    host: values.INBOX_HOST,
    port: values.INBOX_PORT,
    path: values.INBOX_PATH,
    providerPublicKey,
    logLevel: values.LOG_LEVEL,
  };
}

/** Partner-side answers. Not part of the provider's response catalogue. */
const ACCEPTED = { responseCode: '2000000', responseMessage: 'Successful' } as const;
const REJECTED = { responseCode: '4010000', responseMessage: 'Unauthorized. Signature' } as const;

export function buildInboxApp(config: InboxConfig): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });
  const store = new NotificationStore();

  app.get('/health', (_request, reply) => reply.send({ status: 'ok' }));

  app.post(config.path, (request, reply) => {
    const verdict = judgeNotification(
      {
        path: config.path,
        headers: request.headers as Record<string, string | undefined>,
        body: request.body,
      },
      config.providerPublicKey,
    );
    store.add({ receivedAt: new Date().toISOString(), verdict, body: request.body });
    return verdict.verified ? reply.send(ACCEPTED) : reply.status(401).send(REJECTED);
  });

  app.get<{ Params: { reference: string } }>('/inbox/:reference', (request, reply) =>
    reply.send({ notifications: store.find(request.params.reference) }),
  );

  return app;
}

export async function startInbox(env: NodeJS.ProcessEnv = process.env): Promise<FastifyInstance> {
  const config = loadInboxConfig(env);
  const app = buildInboxApp(config);
  const shutdown = (): void => {
    void app.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await app.listen({ host: config.host, port: config.port });
  return app;
}
