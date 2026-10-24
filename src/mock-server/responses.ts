import { SnapCase, formatResponseCode, type SnapCaseDefinition } from '../core';

export interface SnapEnvelope {
  readonly responseCode: string;
  readonly responseMessage: string;
}

/** Used when an error happens outside any SNAP route (e.g. malformed request before routing). */
export const GENERIC_SERVICE_CODE = '00';

export function snapEnvelope(
  serviceCode: string,
  snapCase: SnapCaseDefinition,
  detail?: string,
): SnapEnvelope {
  return {
    responseCode: formatResponseCode({
      httpStatus: snapCase.httpStatus,
      serviceCode,
      caseCode: snapCase.caseCode,
    }),
    responseMessage: snapCase.message(detail),
  };
}

export const successEnvelope = (serviceCode: string): SnapEnvelope =>
  snapEnvelope(serviceCode, SnapCase.success);
