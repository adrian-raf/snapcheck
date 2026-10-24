import { z } from 'zod';

import { TransactionStatus } from '../../../src/core';
import { FAULT_HEADER, FAULTS } from '../../../src/mock-server/faults';
import { requirement } from '../requirements';
import { expect, test } from '../support/fixtures';
import { aFreshMockAccount, aTransferIntrabank } from '../support/test-data';

const InboxSchema = z.object({
  notifications: z.array(
    z.object({
      verdict: z.object({ verified: z.boolean(), reason: z.string().optional() }),
      body: z.object({ latestTransactionStatus: z.string(), originalReferenceNo: z.string() }),
    }),
  ),
});

test.describe('Settlement notifications', () => {
  test(
    'a settled pending transfer is notified with a valid provider signature',
    requirement('NTF-001'),
    async ({ snap, target, codes, accessToken, request }) => {
      const transfer = aTransferIntrabank(target, {
        sourceAccountNo: aFreshMockAccount(),
        beneficiaryAccountNo: aFreshMockAccount(),
      });

      const response = await snap.postTransactional({
        path: target.profile.paths.transferIntrabank,
        body: transfer,
        accessToken,
        headers: { set: { [FAULT_HEADER]: FAULTS.pending } },
      });
      await expect(response).toHaveSnapResponseCode(codes.transferIntrabank('requestInProgress'));

      const inboxUrl = `${target.inboxUrl}/inbox/${transfer.partnerReferenceNo ?? ''}`;
      const readInbox = async () =>
        InboxSchema.parse(await (await request.get(inboxUrl)).json()).notifications;

      // The mock keeps the transfer pending for about a second, then notifies.
      await expect.poll(async () => (await readInbox()).length, { timeout: 10_000 }).toBe(1);

      const [notification] = await readInbox();
      expect(notification?.verdict).toEqual({ verified: true });
      expect(notification?.body.latestTransactionStatus).toBe(TransactionStatus.success);
    },
  );
});
