import type { FastifyRequest } from 'fastify';

import { SnapCase } from '../core';
import { SnapError } from './errors';
import { readHeader } from './guards/guard';

/**
 * Fault injection for the transfer endpoint. Not part of SNAP: it lets a partner
 * rehearse what its own client does when the provider misbehaves, which is the
 * situation where money is most often moved twice.
 *
 * The header is not covered by the signature, and only this mock understands it.
 */
export const FAULT_HEADER = 'X-SNAPCHECK-FAULT';

export const FAULTS = {
  /** Responds 500 without moving money. Safe to retry. */
  errorBeforeCommit: 'error-before-commit',
  /** Moves the money, then responds 500. Retrying blindly would pay twice. */
  errorAfterCommit: 'error-after-commit',
  /** Moves the money, then answers too late for a client with a short timeout. */
  timeoutAfterCommit: 'timeout-after-commit',
  /** Moves the money, responds 202 "Request In Progress"; status is Pending until it settles. */
  pending: 'pending',
} as const;

export type Fault = (typeof FAULTS)[keyof typeof FAULTS];

const FAULT_VALUES: readonly string[] = Object.values(FAULTS);

const isFault = (value: string): value is Fault => FAULT_VALUES.includes(value);

/** Returns the requested fault, `undefined` when none, or rejects an unknown value. */
export function readFault(request: FastifyRequest): Fault | undefined {
  const value = readHeader(request, FAULT_HEADER);
  if (value === undefined) return undefined;
  if (!isFault(value)) {
    throw new SnapError(SnapCase.invalidFieldFormat, FAULT_HEADER);
  }
  return value;
}
