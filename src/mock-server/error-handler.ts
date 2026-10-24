import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import { SnapCase, type SnapCaseDefinition } from '../core';
import { SnapError } from './errors';
import { GENERIC_SERVICE_CODE, snapEnvelope } from './responses';

interface ClassifiedError {
  readonly snapCase: SnapCaseDefinition;
  readonly detail?: string;
}

/** Converts any error into a SNAP response, using the service code of the route that failed. */
export function snapErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const serviceCode = request.routeOptions.config.serviceCode ?? GENERIC_SERVICE_CODE;
  const { snapCase, detail } = classify(error);

  if (snapCase === SnapCase.internalServerError) {
    request.log.error({ err: error }, 'Unhandled error while processing SNAP request');
  }

  return reply.status(snapCase.httpStatus).send(snapEnvelope(serviceCode, snapCase, detail));
}

function classify(error: FastifyError | Error): ClassifiedError {
  if (error instanceof SnapError) {
    return error.detail === undefined
      ? { snapCase: error.snapCase }
      : { snapCase: error.snapCase, detail: error.detail };
  }
  if (isClientError(error)) {
    // Malformed JSON, unsupported content type, oversized body, …
    return { snapCase: SnapCase.badRequest };
  }
  return { snapCase: SnapCase.internalServerError };
}

function isClientError(error: FastifyError | Error): boolean {
  const statusCode = 'statusCode' in error ? error.statusCode : undefined;
  return statusCode !== undefined && statusCode >= 400 && statusCode < 500;
}
