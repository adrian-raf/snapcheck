import { describe, expect, it } from 'vitest';

import { TransactionStatus } from '../../../src/core';
import {
  AUTO_PROVISIONED_ACCOUNT,
  InMemoryAccountRepository,
} from '../../../src/mock-server/domain/accounts';
import { InMemoryExternalIdRegistry } from '../../../src/mock-server/domain/external-id-registry';
import {
  InvalidAmountError,
  fromMinorUnits,
  toMinorUnits,
} from '../../../src/mock-server/domain/money';
import { InMemoryTokenStore } from '../../../src/mock-server/domain/token-store';
import { TransferService } from '../../../src/mock-server/domain/transfer-service';

describe('money', () => {
  it.each([
    ['0.01', 1n],
    ['10000.00', 1_000_000n],
    ['9999999999999999.99', 999_999_999_999_999_999n],
  ])('%s ↔ %s minor units', (value, minorUnits) => {
    expect(toMinorUnits(value)).toBe(minorUnits);
    expect(fromMinorUnits(minorUnits)).toBe(value);
  });

  it.each(['10000', '10000.0', '10000.000', '-1.00', '1e3.00', '1,000.00', ''])(
    'rejects "%s"',
    (value) => {
      expect(() => toMinorUnits(value)).toThrow(InvalidAmountError);
    },
  );
});

describe('InMemoryExternalIdRegistry', () => {
  const partner = 'partner-1';
  const lastSecondOfDayWib = new Date('2026-10-22T23:59:59+07:00');
  const firstSecondOfNextDayWib = new Date('2026-10-23T00:00:00+07:00');

  it('rejects the same ID from the same partner on the same WIB day', () => {
    const registry = new InMemoryExternalIdRegistry();
    expect(registry.claim(partner, 'id-1', new Date('2026-10-22T00:00:00+07:00'))).toBe(true);
    expect(registry.claim(partner, 'id-1', lastSecondOfDayWib)).toBe(false);
  });

  it('accepts the same ID again once the WIB day has changed', () => {
    const registry = new InMemoryExternalIdRegistry();
    expect(registry.claim(partner, 'id-1', lastSecondOfDayWib)).toBe(true);
    expect(registry.claim(partner, 'id-1', firstSecondOfNextDayWib)).toBe(true);
  });

  it('scopes IDs per partner', () => {
    const registry = new InMemoryExternalIdRegistry();
    expect(registry.claim('partner-a', 'id-1', lastSecondOfDayWib)).toBe(true);
    expect(registry.claim('partner-b', 'id-1', lastSecondOfDayWib)).toBe(true);
  });
});

describe('InMemoryTokenStore', () => {
  it('resolves a token until its TTL elapses', () => {
    let now = new Date('2026-10-22T10:00:00Z');
    const store = new InMemoryTokenStore(900, () => now);
    const { accessToken } = store.issue('client-1');

    now = new Date('2026-10-22T10:14:59Z');
    expect(store.resolveClientKey(accessToken)).toBe('client-1');

    now = new Date('2026-10-22T10:15:00Z');
    expect(store.resolveClientKey(accessToken)).toBeUndefined();
  });

  it('does not resolve an unknown token', () => {
    const store = new InMemoryTokenStore(900, () => new Date());
    expect(store.resolveClientKey('unknown')).toBeUndefined();
  });
});

describe('InMemoryAccountRepository', () => {
  it('creates an account starting with 8 on first use, with the opening balance', () => {
    const accounts = new InMemoryAccountRepository([]);
    const created = accounts.find('8100000001');

    expect(created?.balance).toBe(toMinorUnits(AUTO_PROVISIONED_ACCOUNT.openingBalance));
    expect(accounts.find('8100000001')).toBe(created);
  });

  it.each(['9999999999', '81234', '8'.padEnd(17, '0')])('does not create "%s"', (accountNo) => {
    expect(new InMemoryAccountRepository([]).find(accountNo)).toBeUndefined();
  });
});

describe('TransferService', () => {
  const createService = (now = new Date('2026-10-24T10:00:00Z')) => {
    const clock = { now };
    const accounts = new InMemoryAccountRepository([
      { accountNo: '111', name: 'Source', balance: '100.00' },
      { accountNo: '222', name: 'Beneficiary', balance: '0.00' },
    ]);
    return { accounts, clock, service: new TransferService(accounts, () => clock.now) };
  };

  const command = {
    partnerId: 'partner-1',
    partnerReferenceNo: 'ref-1',
    externalId: '123',
    sourceAccountNo: '111',
    beneficiaryAccountNo: '222',
    amountMinorUnits: 2_500n,
    transactionDate: '2026-10-24T17:00:00+07:00',
  };

  it('moves funds and records the transfer', () => {
    const { accounts, service } = createService();
    const outcome = service.execute(command);

    expect(outcome.status).toBe('accepted');
    expect(accounts.find('111')?.balance).toBe(7_500n);
    expect(accounts.find('222')?.balance).toBe(2_500n);
    expect(service.find('partner-1', 'ref-1')).toMatchObject({ amountMinorUnits: 2_500n });
  });

  it('rejects a repeated partnerReferenceNo without moving funds twice', () => {
    const { accounts, service } = createService();
    service.execute(command);

    expect(service.execute(command)).toEqual({ status: 'duplicate' });
    expect(accounts.find('111')?.balance).toBe(7_500n);
  });

  it('reports a duplicate before re-checking the balance', () => {
    const { service } = createService();
    service.execute({ ...command, amountMinorUnits: 10_000n });

    expect(service.execute({ ...command, amountMinorUnits: 10_000n })).toEqual({
      status: 'duplicate',
    });
  });

  it('rejects an amount larger than the balance', () => {
    const { service } = createService();
    expect(service.execute({ ...command, amountMinorUnits: 10_001n })).toEqual({
      status: 'insufficient-funds',
    });
  });

  it('rejects an unknown account', () => {
    const { service } = createService();
    expect(service.execute({ ...command, beneficiaryAccountNo: '999' })).toEqual({
      status: 'invalid-account',
    });
  });

  it('scopes transfers per partner', () => {
    const { service } = createService();
    service.execute(command);
    expect(service.find('partner-2', 'ref-1')).toBeUndefined();
  });

  it('reports a settled transfer as Success', () => {
    const { service } = createService();
    const outcome = service.execute(command);
    if (outcome.status !== 'accepted') throw new Error('expected the transfer to be accepted');

    expect(service.statusOf(outcome.record)).toBe(TransactionStatus.success);
  });

  it('reports a pending transfer as Pending until it settles, with funds already moved', () => {
    const { accounts, clock, service } = createService();
    const outcome = service.execute({ ...command, settleAfterMs: 1_000 });
    if (outcome.status !== 'accepted') throw new Error('expected the transfer to be accepted');

    expect(service.statusOf(outcome.record)).toBe(TransactionStatus.pending);
    expect(accounts.find('111')?.balance).toBe(7_500n);

    clock.now = new Date(clock.now.getTime() + 1_000);
    expect(service.statusOf(outcome.record)).toBe(TransactionStatus.success);
  });
});
