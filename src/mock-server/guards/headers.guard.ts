import { SnapCase, SnapHeader, isValidSnapTimestamp, type SnapHeaderName } from '../../core';
import type { Clock } from '../clock';
import { SnapError } from '../errors';
import { readHeader, type RequestGuard } from './guard';

/** Rejects the request with "Invalid Mandatory Field <header>" for the first missing or blank header. */
export function requireHeaders(names: readonly SnapHeaderName[]): RequestGuard {
  return (request) => {
    const missing = names.find((name) => !readHeader(request, name)?.trim());
    if (missing) {
      throw new SnapError(SnapCase.invalidMandatoryField, missing);
    }
  };
}

export const requireValidTimestamp: RequestGuard = (request) => {
  const timestamp = readHeader(request, SnapHeader.timestamp) ?? '';
  if (!isValidSnapTimestamp(timestamp)) {
    throw new SnapError(SnapCase.invalidFieldFormat, SnapHeader.timestamp);
  }
};

const NO_CHECK: RequestGuard = () => undefined;

/**
 * Rejects an X-TIMESTAMP too far from the server clock, so a captured request
 * cannot be replayed hours later. Must run after `requireValidTimestamp`.
 * A tolerance of 0 disables the check.
 */
export function requireFreshTimestamp(clock: Clock, toleranceSeconds: number): RequestGuard {
  if (toleranceSeconds === 0) {
    return NO_CHECK;
  }
  const toleranceMs = toleranceSeconds * 1000;

  return (request) => {
    const sentAtMs = Date.parse(readHeader(request, SnapHeader.timestamp) ?? '');
    if (Math.abs(clock().getTime() - sentAtMs) > toleranceMs) {
      throw new SnapError(SnapCase.unauthorized, 'Timestamp');
    }
  };
}
