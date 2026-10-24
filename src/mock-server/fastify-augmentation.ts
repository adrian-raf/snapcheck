import type { ServiceCodeValue } from '../core';
import type { Partner } from './domain/partner-registry';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** SNAP service code of the route; used to build the response code of any error. */
    serviceCode?: ServiceCodeValue;
  }

  interface FastifyRequest {
    /** Partner resolved from the bearer token. Set by the bearer-token guard. */
    partner: Partner | null;
  }
}

export {};
