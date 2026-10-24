import type { FastifyInstance } from 'fastify';

export const HEALTH_PATH = '/health';

interface HealthQuery {
  /** When given, the check fails unless the mock emulates exactly this profile. */
  profile?: string;
}

/**
 * Used by Playwright's `webServer` and by container health checks. Not part of SNAP.
 *
 * `?profile=<name>` protects against reusing a mock that was started for another
 * profile: Playwright treats 409 as "not ready", so a mismatch fails loudly.
 */
export function registerHealthRoute(app: FastifyInstance, profileName: string): void {
  app.get<{ Querystring: HealthQuery }>(HEALTH_PATH, (request, reply) => {
    const expected = request.query.profile;
    if (expected !== undefined && expected !== profileName) {
      return reply.status(409).send({ status: 'profile-mismatch', profile: profileName, expected });
    }
    return reply.send({ status: 'ok', profile: profileName });
  });
}
