import { afterEach, describe, expect, it } from 'vitest';

import { generatePartnerReferenceNo } from '../../../src/core';
import { FAULT_HEADER, FAULTS } from '../../../src/mock-server/faults';
import { createTestApp, type TestApp } from './support/test-app';

let testApp: TestApp | undefined;

afterEach(async () => {
  await testApp?.app.close();
  testApp = undefined;
});

const start = async (options?: Parameters<typeof createTestApp>[0]): Promise<TestApp> => {
  testApp = await createTestApp(options);
  return testApp;
};

const aTransfer = (partnerReferenceNo = generatePartnerReferenceNo()) => ({
  partnerReferenceNo,
  amount: { value: '10000.00', currency: 'IDR' },
  sourceAccountNo: '8100000001',
  beneficiaryAccountNo: '8100000002',
  transactionDate: '2026-10-24T10:00:00+07:00',
});

const statusRequest = (originalPartnerReferenceNo: string, serviceCode = '17') => ({
  originalPartnerReferenceNo,
  serviceCode,
});

async function transferThenStatus(app: TestApp, fault?: string) {
  const transfer = aTransfer();
  const transferResponse = await app.post(
    app.profile.paths.transferIntrabank,
    transfer,
    fault ? { [FAULT_HEADER]: fault } : {},
  );
  const statusResponse = await app.post(
    app.profile.paths.transferStatus,
    statusRequest(transfer.partnerReferenceNo),
  );
  return { transfer, transferResponse, statusResponse };
}

describe('transfer status inquiry', () => {
  it('reports a completed transfer as 00 with the provider reference', async () => {
    const app = await start();
    const { transferResponse, statusResponse } = await transferThenStatus(app);

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.body).toMatchObject({
      responseCode: '2003600',
      latestTransactionStatus: '00',
      transactionStatusDesc: 'Success',
      originalReferenceNo: transferResponse.body.referenceNo,
      amount: { value: '10000.00', currency: 'IDR' },
    });
  });

  it('answers 404XX01 for an unknown transaction when the profile says http-404', async () => {
    const app = await start();
    const response = await app.post(app.profile.paths.transferStatus, statusRequest('unknown'));

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ responseCode: '4043601' });
  });

  it('answers 200 with status 07 for an unknown transaction when the profile says status-07', async () => {
    const app = await start({ profile: { transferStatus: { notFound: 'status-07' } } });
    const response = await app.post(app.profile.paths.transferStatus, statusRequest('unknown'));

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      responseCode: '2003600',
      latestTransactionStatus: '07',
      transactionStatusDesc: 'Not found',
    });
  });

  it('does not find a transfer under another service code', async () => {
    const app = await start();
    const transfer = aTransfer();
    await app.post(app.profile.paths.transferIntrabank, transfer);

    const response = await app.post(
      app.profile.paths.transferStatus,
      statusRequest(transfer.partnerReferenceNo, '18'),
    );
    expect(response.statusCode).toBe(404);
  });

  it('requires originalPartnerReferenceNo and serviceCode', async () => {
    const app = await start();
    const response = await app.post(app.profile.paths.transferStatus, { serviceCode: '17' });

    expect(response.body).toMatchObject({
      responseCode: '4003602',
      responseMessage: 'Invalid Mandatory Field originalPartnerReferenceNo',
    });
  });
});

describe('fault injection', () => {
  it('error-before-commit: answers 500 and moves no money', async () => {
    const app = await start();
    const { transferResponse, statusResponse } = await transferThenStatus(
      app,
      FAULTS.errorBeforeCommit,
    );

    expect(transferResponse.body).toMatchObject({ responseCode: '5001701' });
    expect(statusResponse.statusCode).toBe(404);
  });

  it('error-after-commit: answers 500 although the transfer went through', async () => {
    const app = await start();
    const { transferResponse, statusResponse } = await transferThenStatus(
      app,
      FAULTS.errorAfterCommit,
    );

    expect(transferResponse.body).toMatchObject({ responseCode: '5001701' });
    expect(statusResponse.body).toMatchObject({ latestTransactionStatus: '00' });
  });

  it('timeout-after-commit: answers late, with the transfer already done', async () => {
    const app = await start({
      config: { faultTiming: { responseDelayMs: 50, pendingSettleMs: 0 } },
    });
    const startedAt = performance.now();
    const { transferResponse, statusResponse } = await transferThenStatus(
      app,
      FAULTS.timeoutAfterCommit,
    );

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(50);
    expect(transferResponse.body).toMatchObject({ responseCode: '2001700' });
    expect(statusResponse.body).toMatchObject({ latestTransactionStatus: '00' });
  });

  it('pending: answers 202 and reports 03 until the transfer settles', async () => {
    const app = await start();
    const { transfer, transferResponse, statusResponse } = await transferThenStatus(
      app,
      FAULTS.pending,
    );

    expect(transferResponse.statusCode).toBe(202);
    expect(transferResponse.body).toMatchObject({ responseCode: '2021700' });
    expect(statusResponse.body).toMatchObject({ latestTransactionStatus: '03' });

    app.clock.now = new Date(app.clock.now.getTime() + 1_000);
    const settled = await app.post(
      app.profile.paths.transferStatus,
      statusRequest(transfer.partnerReferenceNo),
    );
    expect(settled.body).toMatchObject({ latestTransactionStatus: '00' });
  });

  it('rejects an unknown fault instead of silently ignoring it', async () => {
    const app = await start();
    const response = await app.post(app.profile.paths.transferIntrabank, aTransfer(), {
      [FAULT_HEADER]: 'explode',
    });

    expect(response.body).toMatchObject({
      responseCode: '4001701',
      responseMessage: `Invalid Field Format ${FAULT_HEADER}`,
    });
  });
});
