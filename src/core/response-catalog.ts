import { formatResponseCode } from './response-code';
import type { ServiceCodeValue } from './service-codes';

/**
 * A SNAP "case": the HTTP status + case code pair, independent of the service.
 * The same case (e.g. conflict) yields `4091100` for balance inquiry and
 * `4091700` for intrabank transfer.
 */
export interface SnapCaseDefinition {
  readonly httpStatus: number;
  readonly caseCode: string;
  /** Builds the `responseMessage`; `detail` is a field name or a reason when the case has one. */
  readonly message: (detail?: string) => string;
}

const fixed = (text: string) => (): string => text;

const withDetail =
  (prefix: string, separator = ' ') =>
  (detail?: string): string =>
    detail ? `${prefix}${separator}${detail}` : prefix;

/**
 * The subset of the SNAP response catalogue used by this project.
 * HTTP status, case codes and messages cross-checked on 2026-10-24 against the
 * published tables of BRI, DOKU and Durianpay — see docs/SPEC-VERIFICATION.md.
 */
export const SnapCase = {
  success: { httpStatus: 200, caseCode: '00', message: fixed('Successful') },
  /** Accepted but not final yet; the outcome must be read with a status inquiry (BRI, DOKU, Durianpay). */
  requestInProgress: { httpStatus: 202, caseCode: '00', message: fixed('Request In Progress') },
  badRequest: { httpStatus: 400, caseCode: '00', message: fixed('Bad Request') },
  invalidFieldFormat: {
    httpStatus: 400,
    caseCode: '01',
    message: withDetail('Invalid Field Format'),
  },
  invalidMandatoryField: {
    httpStatus: 400,
    caseCode: '02',
    message: withDetail('Invalid Mandatory Field'),
  },
  unauthorized: { httpStatus: 401, caseCode: '00', message: withDetail('Unauthorized.') },
  invalidToken: { httpStatus: 401, caseCode: '01', message: fixed('Invalid Token (B2B)') },
  insufficientFunds: { httpStatus: 403, caseCode: '14', message: fixed('Insufficient Funds') },
  invalidAccount: {
    httpStatus: 404,
    caseCode: '11',
    // Published wording; "[info]" is a placeholder in the standard text itself.
    message: fixed('Invalid Card/Account/Customer [info]/Virtual Account'),
  },
  /** Status inquiry for an unknown transaction (BRI, Paydia, Durianpay). Midtrans answers 200 + status 07 instead. */
  transactionNotFound: { httpStatus: 404, caseCode: '01', message: fixed('Transaction Not Found') },
  conflict: { httpStatus: 409, caseCode: '00', message: fixed('Conflict') },
  /** Most providers use case 01. BRI documents case 00 instead: a provider variant. */
  duplicatePartnerReferenceNo: {
    httpStatus: 409,
    caseCode: '01',
    message: fixed('Duplicate partnerReferenceNo'),
  },
  generalError: { httpStatus: 500, caseCode: '00', message: fixed('General Error') },
  /** "Unknown internal server failure" — what the mock returns for an unexpected exception. */
  internalServerError: { httpStatus: 500, caseCode: '01', message: fixed('Internal Server Error') },
} as const satisfies Record<string, SnapCaseDefinition>;

export type SnapCaseName = keyof typeof SnapCase;

/** Full 7-digit response code for a case within a service, e.g. `responseCodeOf('11', SnapCase.conflict)` → `4091100`. */
export function responseCodeOf(
  serviceCode: ServiceCodeValue,
  snapCase: SnapCaseDefinition,
): string {
  return formatResponseCode({
    httpStatus: snapCase.httpStatus,
    serviceCode,
    caseCode: snapCase.caseCode,
  });
}
