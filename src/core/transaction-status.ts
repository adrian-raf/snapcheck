/**
 * `latestTransactionStatus` values returned by a transfer status inquiry.
 * Codes and wording from Midtrans' list; BRI and Paydia document the subset 00/01/03/06.
 * Code 04 is not documented by any source checked, so it is not listed.
 */
export const TransactionStatus = {
  success: '00',
  initiated: '01',
  paying: '02',
  pending: '03',
  rejected: '05',
  failed: '06',
  notFound: '07',
} as const;

export type TransactionStatusCode = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const TRANSACTION_STATUS_DESCRIPTION: Readonly<Record<TransactionStatusCode, string>> = {
  '00': 'Success',
  '01': 'Initiated',
  '02': 'Paying',
  '03': 'Pending',
  '05': 'Rejected',
  '06': 'Failed',
  '07': 'Not found',
};

const IN_FLIGHT: readonly string[] = [
  TransactionStatus.initiated,
  TransactionStatus.paying,
  TransactionStatus.pending,
];
const DEFINITELY_NOT_DEBITED: readonly string[] = [
  TransactionStatus.rejected,
  TransactionStatus.failed,
];

/** The transaction is still being processed: ask again later, never resend it. */
export const isInFlight = (status: string): boolean => IN_FLIGHT.includes(status);

/** The provider states the transfer did not and will not move money. */
export const isDefinitelyNotDebited = (status: string): boolean =>
  DEFINITELY_NOT_DEBITED.includes(status);
