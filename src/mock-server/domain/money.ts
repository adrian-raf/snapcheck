/**
 * SNAP amounts are strings with exactly two decimals, e.g. `"10000.00"`.
 * They are converted to integer minor units (sen) as `bigint`, so no
 * floating-point rounding ever touches a balance.
 */
export const AMOUNT_VALUE_PATTERN = /^\d{1,16}\.\d{2}$/;

const MINOR_UNITS_PER_RUPIAH = 100n;

export class InvalidAmountError extends RangeError {
  constructor(value: string) {
    super(`"${value}" is not a SNAP amount (expected digits with exactly two decimals)`);
    this.name = 'InvalidAmountError';
  }
}

export function isValidAmountValue(value: string): boolean {
  return AMOUNT_VALUE_PATTERN.test(value);
}

export function toMinorUnits(value: string): bigint {
  if (!isValidAmountValue(value)) {
    throw new InvalidAmountError(value);
  }
  const [whole = '0', fraction = '00'] = value.split('.');
  return BigInt(whole) * MINOR_UNITS_PER_RUPIAH + BigInt(fraction);
}

export function fromMinorUnits(minorUnits: bigint): string {
  if (minorUnits < 0n) {
    throw new RangeError('Negative amounts are not representable as a SNAP amount value');
  }
  const whole = minorUnits / MINOR_UNITS_PER_RUPIAH;
  const fraction = (minorUnits % MINOR_UNITS_PER_RUPIAH).toString().padStart(2, '0');
  return `${whole.toString()}.${fraction}`;
}
