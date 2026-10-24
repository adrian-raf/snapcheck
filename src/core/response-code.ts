/**
 * A SNAP response code is 7 digits: HTTP status (3) + service code (2) + case code (2).
 * Example: `4091100` = HTTP 409, service 11 (balance inquiry), case 00 (conflict).
 */
export interface SnapResponseCode {
  readonly httpStatus: number;
  readonly serviceCode: string;
  readonly caseCode: string;
}

const RESPONSE_CODE_PATTERN = /^(\d{3})(\d{2})(\d{2})$/;
const TWO_DIGITS_PATTERN = /^\d{2}$/;

export class InvalidResponseCodeError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a 7-digit SNAP response code`);
    this.name = 'InvalidResponseCodeError';
  }
}

export function parseResponseCode(value: string): SnapResponseCode {
  const match = RESPONSE_CODE_PATTERN.exec(value);
  const [, httpStatus, serviceCode, caseCode] = match ?? [];
  if (httpStatus === undefined || serviceCode === undefined || caseCode === undefined) {
    throw new InvalidResponseCodeError(value);
  }
  return { httpStatus: Number(httpStatus), serviceCode, caseCode };
}

export function formatResponseCode({
  httpStatus,
  serviceCode,
  caseCode,
}: SnapResponseCode): string {
  const isValid =
    Number.isInteger(httpStatus) &&
    httpStatus >= 100 &&
    httpStatus <= 599 &&
    TWO_DIGITS_PATTERN.test(serviceCode) &&
    TWO_DIGITS_PATTERN.test(caseCode);

  if (!isValid) {
    throw new InvalidResponseCodeError(`${httpStatus}${serviceCode}${caseCode}`);
  }
  return `${httpStatus}${serviceCode}${caseCode}`;
}
