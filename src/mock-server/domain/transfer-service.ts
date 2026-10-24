import { TransactionStatus, type TransactionStatusCode } from '../../core';
import type { Clock } from '../clock';
import type { AccountRepository } from './accounts';
import { generateReferenceNo } from './reference-no';

export interface TransferCommand {
  readonly partnerId: string;
  readonly partnerReferenceNo: string;
  readonly externalId: string;
  readonly sourceAccountNo: string;
  readonly beneficiaryAccountNo: string;
  readonly amountMinorUnits: bigint;
  /** As sent by the partner; echoed by the status inquiry. */
  readonly transactionDate: string;
  /** When set, the transfer reports "Pending" until this many milliseconds have passed. */
  readonly settleAfterMs?: number;
}

/** What the provider keeps about a transfer it accepted. */
export interface TransferRecord {
  readonly partnerId: string;
  readonly partnerReferenceNo: string;
  readonly referenceNo: string;
  readonly externalId: string;
  readonly sourceAccountNo: string;
  readonly beneficiaryAccountNo: string;
  readonly amountMinorUnits: bigint;
  readonly transactionDate: string;
  readonly settlesAtMs: number;
}

export type TransferOutcome =
  | { readonly status: 'accepted'; readonly record: TransferRecord }
  | { readonly status: 'duplicate' }
  | { readonly status: 'invalid-account' }
  | { readonly status: 'insufficient-funds' };

/**
 * Moves funds between two accounts, exactly once per partner and `partnerReferenceNo`.
 *
 * The duplicate check runs first: a retried request must be rejected as a
 * duplicate even if the balance has changed since the original succeeded.
 * Funds move when the transfer is accepted, also for a pending one, so a
 * pending transfer can never be paid out twice.
 */
export class TransferService {
  private readonly ledger = new Map<string, TransferRecord>();

  constructor(
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  execute(command: TransferCommand): TransferOutcome {
    const key = ledgerKey(command.partnerId, command.partnerReferenceNo);
    if (this.ledger.has(key)) {
      return { status: 'duplicate' };
    }

    const source = this.accounts.find(command.sourceAccountNo);
    const beneficiary = this.accounts.find(command.beneficiaryAccountNo);
    if (!source || !beneficiary) {
      return { status: 'invalid-account' };
    }
    if (source.balance < command.amountMinorUnits) {
      return { status: 'insufficient-funds' };
    }

    source.balance -= command.amountMinorUnits;
    beneficiary.balance += command.amountMinorUnits;

    const record: TransferRecord = {
      partnerId: command.partnerId,
      partnerReferenceNo: command.partnerReferenceNo,
      referenceNo: generateReferenceNo(),
      externalId: command.externalId,
      sourceAccountNo: command.sourceAccountNo,
      beneficiaryAccountNo: command.beneficiaryAccountNo,
      amountMinorUnits: command.amountMinorUnits,
      transactionDate: command.transactionDate,
      settlesAtMs: this.clock().getTime() + (command.settleAfterMs ?? 0),
    };
    this.ledger.set(key, record);
    return { status: 'accepted', record };
  }

  find(partnerId: string, partnerReferenceNo: string): TransferRecord | undefined {
    return this.ledger.get(ledgerKey(partnerId, partnerReferenceNo));
  }

  /** Computed from the clock, so no timer is needed for a transfer to settle. */
  statusOf(record: TransferRecord): TransactionStatusCode {
    return this.clock().getTime() < record.settlesAtMs
      ? TransactionStatus.pending
      : TransactionStatus.success;
  }
}

function ledgerKey(partnerId: string, partnerReferenceNo: string): string {
  return `${partnerId}\u0000${partnerReferenceNo}`;
}
