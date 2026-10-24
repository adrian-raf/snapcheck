import { describe, expect, it } from 'vitest';

import {
  transferWithRecovery,
  type StatusResult,
  type SubmitResult,
  type TransferGateway,
} from '../../../src/client/transfer-with-recovery';

/** A gateway that replays scripted answers and records how it was used. */
function scriptedGateway(submits: SubmitResult[], statuses: StatusResult[] = []) {
  const calls = { submissions: [] as number[], statusChecks: 0 };
  const gateway: TransferGateway = {
    submit: (submission) => {
      calls.submissions.push(submission);
      const next = submits.shift();
      if (!next) throw new Error('Unexpected extra submission — this is how money is paid twice');
      return Promise.resolve(next);
    },
    checkStatus: () => {
      calls.statusChecks += 1;
      return Promise.resolve(statuses.shift() ?? { kind: 'unavailable', reason: 'no script left' });
    },
  };
  return { gateway, calls };
}

const response = (responseCode: string): SubmitResult => ({ kind: 'response', responseCode });
const status = (latestTransactionStatus: string): StatusResult => ({
  kind: 'found',
  latestTransactionStatus,
});
const NOT_FOUND: StatusResult = { kind: 'not-found' };
const TIMEOUT: SubmitResult = { kind: 'no-response', reason: 'timeout' };

const policy = {
  maxSubmissions: 2,
  maxStatusChecks: 4,
  pollIntervalMs: 0,
  sleep: () => Promise.resolve(),
};

describe('transferWithRecovery', () => {
  it('trusts a 200 and does not ask for status', async () => {
    const { gateway, calls } = scriptedGateway([response('2001700')]);

    expect(await transferWithRecovery(gateway, policy)).toMatchObject({
      outcome: 'success',
      confirmedBy: 'response',
    });
    expect(calls.statusChecks).toBe(0);
  });

  it.each([
    ['a 500 after the debit', response('5001701')],
    ['a timeout', TIMEOUT],
    ['a 409 duplicate', response('4091701')],
    ['a 504', response('5041700')],
  ])('after %s, confirms success by status and never resends', async (_case, first) => {
    const { gateway, calls } = scriptedGateway([first], [status('00')]);

    expect(await transferWithRecovery(gateway, policy)).toMatchObject({
      outcome: 'success',
      confirmedBy: 'status',
      submissions: 1,
    });
    expect(calls.submissions).toEqual([1]);
  });

  it('resends only after the status says "not found"', async () => {
    const { gateway, calls } = scriptedGateway(
      [response('5001701'), response('2001700')],
      [NOT_FOUND],
    );

    expect(await transferWithRecovery(gateway, policy)).toMatchObject({
      outcome: 'success',
      confirmedBy: 'response',
      submissions: 2,
    });
    expect(calls.submissions).toEqual([1, 2]);
  });

  it('treats status 07 like "not found"', async () => {
    const { gateway } = scriptedGateway([TIMEOUT, response('2001700')], [status('07')]);
    expect(await transferWithRecovery(gateway, policy)).toMatchObject({ submissions: 2 });
  });

  it('polls a 202 until the status is final', async () => {
    const { gateway, calls } = scriptedGateway(
      [response('2021700')],
      [status('03'), status('03'), status('00')],
    );

    expect(await transferWithRecovery(gateway, policy)).toMatchObject({ outcome: 'success' });
    expect(calls.statusChecks).toBe(3);
  });

  it('waits before polling an accepted transfer, but checks an uncertain one at once', async () => {
    const waits: number[] = [];
    const sleep = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };

    await transferWithRecovery(scriptedGateway([response('2021700')], [status('00')]).gateway, {
      ...policy,
      pollIntervalMs: 200,
      sleep,
    });
    await transferWithRecovery(scriptedGateway([TIMEOUT], [status('00')]).gateway, {
      ...policy,
      pollIntervalMs: 200,
      sleep,
    });

    expect(waits).toEqual([200]);
  });

  it.each(['4001702', '4011701', '4031714', '4041711'])(
    'gives up on %s without asking for status: the request was refused as sent',
    async (code) => {
      const { gateway, calls } = scriptedGateway([response(code)]);

      expect(await transferWithRecovery(gateway, policy)).toMatchObject({ outcome: 'failed' });
      expect(calls.statusChecks).toBe(0);
    },
  );

  it.each(['05', '06'])(
    'reports failure when the status is %s, without resending',
    async (code) => {
      const { gateway, calls } = scriptedGateway([response('5001701')], [status(code)]);

      expect(await transferWithRecovery(gateway, policy)).toMatchObject({ outcome: 'failed' });
      expect(calls.submissions).toEqual([1]);
    },
  );

  it('stops resending after maxSubmissions', async () => {
    const { gateway, calls } = scriptedGateway(
      [response('5001701'), response('5001701')],
      [NOT_FOUND, NOT_FOUND],
    );

    expect(await transferWithRecovery(gateway, policy)).toMatchObject({
      outcome: 'failed',
      reason: 'Not processed after 2 submissions',
    });
    expect(calls.submissions).toEqual([1, 2]);
  });

  it('ends as "unknown" — not as a resend — when the status never becomes final', async () => {
    const { gateway, calls } = scriptedGateway([TIMEOUT], [status('03')]);

    expect(await transferWithRecovery(gateway, policy)).toMatchObject({
      outcome: 'unknown',
      statusChecks: 4,
    });
    expect(calls.submissions).toEqual([1]);
  });

  it('keeps asking when the status inquiry itself is unavailable', async () => {
    const { gateway } = scriptedGateway(
      [response('5001701')],
      [{ kind: 'unavailable', reason: 'timeout' }, status('00')],
    );

    expect(await transferWithRecovery(gateway, policy)).toMatchObject({
      outcome: 'success',
      statusChecks: 2,
    });
  });
});
