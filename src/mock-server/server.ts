import type { FastifyInstance } from 'fastify';

import { buildApp } from './app';
import { loadConfig } from './config';

/**
 * Starts the mock with configuration from `env` and stops it cleanly on SIGINT/SIGTERM.
 * Shared by `npm run mock:start` and `snapcheck mock`.
 */
export async function startMockServer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<FastifyInstance> {
  const config = loadConfig(env);
  const app = buildApp({ config });

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'Shutting down mock SNAP server');
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      },
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await app.listen({ host: config.host, port: config.port });
  app.log.info({ profile: config.profile.name }, 'Mock SNAP server emulating provider profile');
  return app;
}
