import {
  ServiceCode,
  TRANSACTION_STATUS_DESCRIPTION,
  type TransactionStatusCode,
} from '../../core';
import { fromMinorUnits } from '../domain/money';
import type { TransferRecord } from '../domain/transfer-service';

/**
 * SNAP fields describing a transfer and its latest status. Shared by the status
 * inquiry response and the settlement notification, so both always agree.
 * Field names follow BRI, Midtrans and Paydia's transfer status responses.
 */
export function describeTransfer(
  record: TransferRecord,
  status: TransactionStatusCode,
): Record<string, unknown> {
  return {
    originalReferenceNo: record.referenceNo,
    originalPartnerReferenceNo: record.partnerReferenceNo,
    originalExternalId: record.externalId,
    serviceCode: ServiceCode.transferIntrabank,
    transactionDate: record.transactionDate,
    amount: { value: fromMinorUnits(record.amountMinorUnits), currency: 'IDR' },
    beneficiaryAccountNo: record.beneficiaryAccountNo,
    sourceAccountNo: record.sourceAccountNo,
    latestTransactionStatus: status,
    transactionStatusDesc: TRANSACTION_STATUS_DESCRIPTION[status],
  };
}
