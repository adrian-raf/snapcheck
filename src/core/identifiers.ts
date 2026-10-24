import { randomInt } from 'node:crypto';

const DEFAULT_LENGTH = 20;

/**
 * Random numeric string. Numeric IDs are accepted by every provider we know of,
 * while UUIDs are rejected by some — so numeric is the safe default.
 */
export function generateNumericId(length: number = DEFAULT_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`length must be a positive integer, received ${length}`);
  }
  const firstDigit = String(randomInt(1, 10)); // avoid a leading zero being stripped by systems that coerce to number
  const rest = Array.from({ length: length - 1 }, () => String(randomInt(0, 10))).join('');
  return firstDigit + rest;
}

export const generateExternalId = (): string => generateNumericId();
export const generatePartnerReferenceNo = (): string => generateNumericId();
