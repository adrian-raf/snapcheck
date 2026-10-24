import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ServiceCode, SnapHeader } from '../../core';
import { readHeader } from '../guards/guard';
import { accessTokenPipeline, type PipelineDependencies } from '../pipelines';
import { successEnvelope } from '../responses';

const AccessTokenRequestSchema = z.object({
  grantType: z.literal('client_credentials'),
});

type AccessTokenRequest = z.infer<typeof AccessTokenRequestSchema>;

export function registerAccessTokenRoute(app: FastifyInstance, deps: PipelineDependencies): void {
  app.post<{ Body: AccessTokenRequest }>(
    deps.profile.paths.accessToken,
    {
      config: { serviceCode: ServiceCode.accessTokenB2B },
      preHandler: accessTokenPipeline(deps, AccessTokenRequestSchema),
    },
    (request, reply) => {
      const clientKey = readHeader(request, SnapHeader.clientKey) ?? '';
      const { accessToken, expiresInSeconds } = deps.tokens.issue(clientKey);

      return reply.send({
        ...successEnvelope(ServiceCode.accessTokenB2B),
        accessToken,
        tokenType: deps.profile.accessToken.tokenType,
        expiresIn: String(expiresInSeconds),
      });
    },
  );
}
