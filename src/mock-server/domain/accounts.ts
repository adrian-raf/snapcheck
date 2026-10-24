import { toMinorUnits } from './money';

export interface Account {
  readonly accountNo: string;
  readonly name: string;
  balance: bigint;
}

export interface AccountRepository {
  find(accountNo: string): Account | undefined;
}

export interface AccountSeed {
  readonly accountNo: string;
  readonly name: string;
  /** SNAP amount value, e.g. `"1000000.00"`. */
  readonly balance: string;
}

/** Fictional accounts the mock starts with. Tests reference them through `MOCK_ACCOUNTS`. */
export const SEED_ACCOUNTS: readonly AccountSeed[] = [
  { accountNo: '1234567890', name: 'Rekening Uji Sumber', balance: '100000000.00' },
  { accountNo: '0987654321', name: 'Rekening Uji Tujuan', balance: '0.00' },
];

export const MOCK_ACCOUNTS = {
  source: '1234567890',
  beneficiary: '0987654321',
} as const;

/**
 * Mock policy: any 10–16 digit account number starting with 8 exists on first use,
 * with a fixed opening balance. Tests that assert exact balances create their own
 * accounts this way, so tests running in parallel never share a balance.
 */
export const AUTO_PROVISIONED_ACCOUNT = {
  pattern: /^8\d{9,15}$/,
  openingBalance: '1000000.00',
  name: 'Rekening Uji Otomatis',
} as const;

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts: Map<string, Account>;

  constructor(seed: readonly AccountSeed[]) {
    this.accounts = new Map(seed.map((account) => [account.accountNo, toAccount(account)]));
  }

  find(accountNo: string): Account | undefined {
    const existing = this.accounts.get(accountNo);
    if (existing || !AUTO_PROVISIONED_ACCOUNT.pattern.test(accountNo)) {
      return existing;
    }
    const created = toAccount({
      accountNo,
      name: AUTO_PROVISIONED_ACCOUNT.name,
      balance: AUTO_PROVISIONED_ACCOUNT.openingBalance,
    });
    this.accounts.set(accountNo, created);
    return created;
  }
}

function toAccount({ accountNo, name, balance }: AccountSeed): Account {
  return { accountNo, name, balance: toMinorUnits(balance) };
}
