import {
  transferWithRecovery,
  type RecoveryPolicy,
} from '../../../src/client/transfer-with-recovery';
import { fromMinorUnits, toMinorUnits } from '../../../src/mock-server/domain/money';
import { FAULTS } from '../../../src/mock-server/faults';
import { requirement } from '../requirements';
import { expect, test } from '../support/fixtures';
import { BalanceInquiryResponseSchema } from '../support/response-schemas';
import type { SnapClient } from '../support/snap-client';
import type { ConformanceTarget } from '../support/target';
import {
  MOCK_OPENING_BALANCE,
  aBalanceInquiry,
  aFreshMockAccount,
  aTransferIntrabank,
} from '../support/test-data';
import { SnapTransferGateway, type MockFaultScript } from '../support/transfer-gateway';

/**
 * The reference client against faults injected by the mock. Each test uses its own
 * fresh accounts, so the balances prove the money moved exactly once.
 */

const AMOUNT = '10000.00';
const POLICY: RecoveryPolicy = { maxSubmissions: 2, maxStatusChecks: 20, pollIntervalMs: 200 };

const debitedOnce = fromMinorUnits(toMinorUnits(MOCK_OPENING_BALANCE) - toMinorUnits(AMOUNT));
const creditedOnce = fromMinorUnits(toMinorUnits(MOCK_OPENING_BALANCE) + toMinorUnits(AMOUNT));

async function balanceOf(
  snap: SnapClient,
  target: ConformanceTarget,
  accessToken: string,
  accountNo: string,
): Promise<string> {
  const response = await snap.postTransactional({
    path: target.profile.paths.balanceInquiry,
    body: aBalanceInquiry(target, { accountNo }),
    accessToken,
  });
  const { accountInfos } = BalanceInquiryResponseSchema.parse(await response.json());
  return accountInfos[0]?.availableBalance.value ?? 'missing';
}

/** Runs one transfer through the reference client and returns what happened. */
async function runScenario(
  snap: SnapClient,
  target: ConformanceTarget,
  accessToken: string,
  script: MockFaultScript,
) {
  const source = aFreshMockAccount();
  const beneficiary = aFreshMockAccount();
  const transfer = aTransferIntrabank(target, {
    sourceAccountNo: source,
    beneficiaryAccountNo: beneficiary,
    amount: { value: AMOUNT, currency: 'IDR' },
  });

  const gateway = new SnapTransferGateway(snap, target, accessToken, transfer, script);
  const resolution = await transferWithRecovery(gateway, POLICY);

  return {
    resolution,
    sourceBalance: await balanceOf(snap, target, accessToken, source),
    beneficiaryBalance: await balanceOf(snap, target, accessToken, beneficiary),
  };
}

test.describe('Resilience of the reference client', () => {
  // Each test asserts the money first (debited exactly once), then how the client got there.

  test(
    'a 500 after the debit is resolved by status, without a second transfer',
    requirement('RES-001'),
    async ({ snap, target, accessToken }) => {
      const result = await runScenario(snap, target, accessToken, {
        firstSubmission: FAULTS.errorAfterCommit,
      });

      expect(result.sourceBalance).toBe(debitedOnce);
      expect(result.beneficiaryBalance).toBe(creditedOnce);
      expect(result.resolution).toMatchObject({
        outcome: 'success',
        confirmedBy: 'status',
        submissions: 1,
      });
    },
  );

  test(
    'a 500 before the debit is confirmed "not found" and resent once',
    requirement('RES-002'),
    async ({ snap, target, accessToken }) => {
      const result = await runScenario(snap, target, accessToken, {
        firstSubmission: FAULTS.errorBeforeCommit,
      });

      expect(result.sourceBalance).toBe(debitedOnce);
      expect(result.resolution).toMatchObject({
        outcome: 'success',
        confirmedBy: 'response',
        submissions: 2,
      });
    },
  );

  test(
    'a client-side timeout is resolved by status, without a second transfer',
    requirement('RES-003'),
    async ({ snap, target, accessToken }) => {
      const result = await runScenario(snap, target, accessToken, {
        firstSubmission: FAULTS.timeoutAfterCommit,
        submitTimeoutMs: 500,
      });

      expect(result.sourceBalance).toBe(debitedOnce);
      expect(result.resolution).toMatchObject({
        outcome: 'success',
        confirmedBy: 'status',
        submissions: 1,
      });
    },
  );

  test(
    '202 Request In Progress is polled until final',
    requirement('RES-004'),
    async ({ snap, target, accessToken }) => {
      const result = await runScenario(snap, target, accessToken, {
        firstSubmission: FAULTS.pending,
      });

      expect(result.sourceBalance).toBe(debitedOnce);
      expect(result.resolution).toMatchObject({
        outcome: 'success',
        confirmedBy: 'status',
        submissions: 1,
      });
      // The mock keeps it Pending for 1 s and the client polls every 200 ms.
      expect(result.resolution.statusChecks).toBeGreaterThan(1);
    },
  );
});
