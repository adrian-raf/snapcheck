import { describe, expect, it } from 'vitest';

import {
  InvalidResponseCodeError,
  ServiceCode,
  SnapCase,
  formatResponseCode,
  parseResponseCode,
  responseCodeOf,
} from '../../../src/core';

describe('parseResponseCode', () => {
  it('splits a code into HTTP status, service code and case code', () => {
    expect(parseResponseCode('4091100')).toEqual({
      httpStatus: 409,
      serviceCode: '11',
      caseCode: '00',
    });
  });

  it.each(['', '409110', '40911000', '409A100', ' 4091100'])('rejects "%s"', (value) => {
    expect(() => parseResponseCode(value)).toThrow(InvalidResponseCodeError);
  });
});

describe('formatResponseCode', () => {
  it('round-trips with parseResponseCode', () => {
    expect(formatResponseCode(parseResponseCode('2007300'))).toBe('2007300');
  });

  it.each([
    { httpStatus: 99, serviceCode: '11', caseCode: '00' },
    { httpStatus: 200, serviceCode: '1', caseCode: '00' },
    { httpStatus: 200, serviceCode: '11', caseCode: '000' },
  ])('rejects invalid parts %j', (parts) => {
    expect(() => formatResponseCode(parts)).toThrow(InvalidResponseCodeError);
  });
});

describe('responseCodeOf', () => {
  it.each([
    [ServiceCode.accessTokenB2B, SnapCase.success, '2007300'],
    [ServiceCode.balanceInquiry, SnapCase.conflict, '4091100'],
    [ServiceCode.transferIntrabank, SnapCase.duplicatePartnerReferenceNo, '4091701'],
    [ServiceCode.transferIntrabank, SnapCase.insufficientFunds, '4031714'],
  ])('service %s + case → %s', (service, snapCase, expected) => {
    expect(responseCodeOf(service, snapCase)).toBe(expected);
  });
});

/**
 * Pins the catalogue to the published provider tables (docs/SPEC-VERIFICATION.md),
 * so an accidental edit to a status, case code or message fails a test.
 */
describe('SnapCase matches the published SNAP response tables', () => {
  it.each([
    ['success', SnapCase.success, 200, '00', 'Successful'],
    ['badRequest', SnapCase.badRequest, 400, '00', 'Bad Request'],
    ['invalidFieldFormat', SnapCase.invalidFieldFormat, 400, '01', 'Invalid Field Format'],
    ['invalidMandatoryField', SnapCase.invalidMandatoryField, 400, '02', 'Invalid Mandatory Field'],
    ['unauthorized', SnapCase.unauthorized, 401, '00', 'Unauthorized.'],
    ['invalidToken', SnapCase.invalidToken, 401, '01', 'Invalid Token (B2B)'],
    ['insufficientFunds', SnapCase.insufficientFunds, 403, '14', 'Insufficient Funds'],
    [
      'invalidAccount',
      SnapCase.invalidAccount,
      404,
      '11',
      'Invalid Card/Account/Customer [info]/Virtual Account',
    ],
    ['conflict', SnapCase.conflict, 409, '00', 'Conflict'],
    [
      'duplicatePartnerReferenceNo',
      SnapCase.duplicatePartnerReferenceNo,
      409,
      '01',
      'Duplicate partnerReferenceNo',
    ],
    ['generalError', SnapCase.generalError, 500, '00', 'General Error'],
    ['internalServerError', SnapCase.internalServerError, 500, '01', 'Internal Server Error'],
  ])('%s → HTTP %i, case %s, "%s"', (_name, snapCase, httpStatus, caseCode, message) => {
    expect(snapCase.httpStatus).toBe(httpStatus);
    expect(snapCase.caseCode).toBe(caseCode);
    expect(snapCase.message()).toBe(message);
  });
});

describe('SnapCase messages', () => {
  it('appends the field name for field-level cases', () => {
    expect(SnapCase.invalidMandatoryField.message('X-TIMESTAMP')).toBe(
      'Invalid Mandatory Field X-TIMESTAMP',
    );
  });

  it('falls back to the bare message when no detail is given', () => {
    expect(SnapCase.unauthorized.message()).toBe('Unauthorized.');
  });
});
