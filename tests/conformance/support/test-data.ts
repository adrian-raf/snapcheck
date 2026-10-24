import {
  ServiceCode,
  formatSnapTimestamp,
  generateNumericId,
  generatePartnerReferenceNo,
} from '../../../src/core';
import { AUTO_PROVISIONED_ACCOUNT } from '../../../src/mock-server/domain/accounts';
import { timestampFormatOf } from '../../../src/profiles';
import type { ConformanceTarget } from './target';

/**
 * Request bodies with sensible defaults. Each call returns fresh identifiers,
 * so tests stay independent even when they run in parallel.
 */

export interface BalanceInquiryBody {
  partnerReferenceNo?: string;
  accountNo?: string;
}

export interface TransferIntrabankBody {
  partnerReferenceNo?: string;
  amount?: { value: string; currency: string };
  beneficiaryAccountNo?: string;
  sourceAccountNo?: string;
  transactionDate?: string;
}

export function aBalanceInquiry(
  target: ConformanceTarget,
  overrides: BalanceInquiryBody = {},
): BalanceInquiryBody {
  return {
    partnerReferenceNo: generatePartnerReferenceNo(),
    accountNo: target.accounts.source,
    ...overrides,
  };
}

export function aTransferIntrabank(
  target: ConformanceTarget,
  overrides: TransferIntrabankBody = {},
): TransferIntrabankBody {
  return {
    partnerReferenceNo: generatePartnerReferenceNo(),
    amount: { value: '10000.00', currency: 'IDR' },
    beneficiaryAccountNo: target.accounts.beneficiary,
    sourceAccountNo: target.accounts.source,
    transactionDate: formatSnapTimestamp(new Date(), timestampFormatOf(target.profile)),
    ...overrides,
  };
}

export function aTransferStatusRequest(originalPartnerReferenceNo: string) {
  return { originalPartnerReferenceNo, serviceCode: ServiceCode.transferIntrabank };
}

/**
 * A fresh 12-digit account starting with 8, which the mock creates on first use with
 * a known opening balance. Lets a test assert exact balances while others run in parallel.
 * Mock only: a real provider has no such accounts.
 */
export function aFreshMockAccount(): string {
  return `8${generateNumericId(11)}`;
}

export const MOCK_OPENING_BALANCE = AUTO_PROVISIONED_ACCOUNT.openingBalance;

/** Returns a copy of `source` without `key` — for "missing mandatory field" cases. */
export function without<T extends object, K extends keyof T & string>(
  source: T,
  key: K,
): Omit<T, K> {
  const entries = Object.entries(source).filter(([name]) => name !== key);
  // Object.fromEntries loses the static shape; the filter above guarantees it matches Omit<T, K>.
  return Object.fromEntries(entries) as Omit<T, K>;
}
