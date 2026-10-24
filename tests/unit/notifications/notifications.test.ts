import { generateKeyPairSync } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import {
  SnapHeader,
  buildNotificationHeaders,
  generatePartnerReferenceNo,
} from '../../../src/core';
import { FAULT_HEADER, FAULTS } from '../../../src/mock-server/faults';
import { judgeNotification } from '../../../src/notification-inbox/inbox';
import { createTestApp, type TestApp } from '../mock-server/support/test-app';

const provider = generateKeyPairSync('rsa', { modulusLength: 2048 });
const impostor = generateKeyPairSync('rsa', { modulusLength: 2048 });

const PATH = '/snap/notify';
const BODY = { originalPartnerReferenceNo: '123', latestTransactionStatus: '00' };
const TIMESTAMP = '2026-10-24T10:00:00+07:00';

/** Header names as Node delivers them: lower-case. */
const lowerCased = (headers: Record<string, string>) =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));

const signedBy = (privateKey: typeof provider.privateKey, body: unknown = BODY) =>
  lowerCased(
    buildNotificationHeaders({
      path: PATH,
      body,
      timestamp: TIMESTAMP,
      externalId: '1',
      providerPrivateKey: privateKey,
    }),
  );

describe('judgeNotification', () => {
  const judge = (headers: Record<string, string>, body: unknown = BODY, path = PATH) =>
    judgeNotification({ path, headers, body }, provider.publicKey);

  it('accepts a notification signed by the provider', () => {
    expect(judge(signedBy(provider.privateKey))).toEqual({ verified: true });
  });

  it.each([
    ['signed by someone else', signedBy(impostor.privateKey), BODY, PATH, 'bad-signature'],
    [
      'with a tampered body',
      signedBy(provider.privateKey),
      { ...BODY, latestTransactionStatus: '06' },
      PATH,
      'bad-signature',
    ],
    ['delivered to another path', signedBy(provider.privateKey), BODY, '/other', 'bad-signature'],
    [
      'without a signature',
      { [SnapHeader.timestamp.toLowerCase()]: TIMESTAMP },
      BODY,
      PATH,
      'missing-signature',
    ],
    [
      'with a malformed timestamp',
      { ...signedBy(provider.privateKey), 'x-timestamp': 'yesterday' },
      BODY,
      PATH,
      'invalid-timestamp',
    ],
  ])('rejects a notification %s', (_case, headers, body, path, reason) => {
    expect(judge(headers, body, path)).toEqual({ verified: false, reason });
  });
});

interface ReceivedNotification {
  readonly request: IncomingMessage;
  readonly body: unknown;
}

describe('settlement notification from the mock', () => {
  let testApp: TestApp | undefined;
  let receiver: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    await testApp?.app.close();
    receiver?.close();
  });

  /** Starts a partner endpoint and a mock that notifies it; resolves on the first notification. */
  async function startMockNotifying(): Promise<{
    app: TestApp;
    received: Promise<ReceivedNotification>;
  }> {
    const received = new Promise<ReceivedNotification>((resolve) => {
      receiver = createServer((request, response) => {
        let raw = '';
        request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
        request.on('end', () => {
          response.end('{}');
          resolve({ request, body: JSON.parse(raw) as unknown });
        });
      });
    });
    await new Promise<void>((resolve) => receiver?.listen(0, '127.0.0.1', resolve));
    const { port } = receiver?.address() as AddressInfo;

    testApp = await createTestApp({
      config: {
        faultTiming: { responseDelayMs: 0, pendingSettleMs: 50 },
        notifications: {
          url: new URL(`http://127.0.0.1:${port}${PATH}`),
          providerPrivateKey: provider.privateKey,
        },
      },
    });
    return { app: testApp, received };
  }

  const submitPendingTransfer = async (app: TestApp, partnerReferenceNo: string) =>
    app.post(
      app.profile.paths.transferIntrabank,
      {
        partnerReferenceNo,
        amount: { value: '10000.00', currency: 'IDR' },
        sourceAccountNo: '8100000001',
        beneficiaryAccountNo: '8100000002',
        transactionDate: '2026-10-24T10:00:00+07:00',
      },
      { [FAULT_HEADER]: FAULTS.pending },
    );

  /** The notifier waits on real timers; this moves the mock clock past the settlement. */
  const settleAfter = (app: TestApp, realMs: number) =>
    setTimeout(() => {
      app.clock.now = new Date(app.clock.now.getTime() + 60_000);
    }, realMs);

  it('is sent once a pending transfer settles, signed with the provider key', async () => {
    const { app, received } = await startMockNotifying();
    const partnerReferenceNo = generatePartnerReferenceNo();
    settleAfter(app, 10);

    await submitPendingTransfer(app, partnerReferenceNo);

    const { request, body } = await received;
    expect(request.url).toBe(PATH);
    expect(body).toMatchObject({
      originalPartnerReferenceNo: partnerReferenceNo,
      latestTransactionStatus: '00',
    });
    expect(
      judgeNotification(
        { path: PATH, headers: request.headers as Record<string, string>, body },
        provider.publicKey,
      ),
    ).toEqual({ verified: true });
  });

  // Regression: in CI a timer fired a millisecond early and the notification said "03 Pending".
  it('waits again, instead of notifying "Pending", when the timer fires before the clock settles', async () => {
    const { app, received } = await startMockNotifying();
    settleAfter(app, 120); // Well after the 50 ms timer has fired at least once.

    await submitPendingTransfer(app, generatePartnerReferenceNo());

    const { body } = await received;
    expect(body).toMatchObject({ latestTransactionStatus: '00' });
  });
});
