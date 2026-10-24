import type { FastifyRequest, preHandlerHookHandler } from 'fastify';

/**
 * A guard checks one rule and throws a `SnapError` when it is broken.
 * Guards are plain synchronous functions: easy to read, test and reorder.
 */
export type RequestGuard = (request: FastifyRequest) => void;

/** Adapts a guard to a Fastify `preHandler` hook. */
export function toPreHandler(guard: RequestGuard): preHandlerHookHandler {
  return (request, _reply, done) => {
    try {
      guard(request);
      done();
    } catch (error) {
      done(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/** Reads a header case-insensitively; repeated headers resolve to their first value. */
export function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
