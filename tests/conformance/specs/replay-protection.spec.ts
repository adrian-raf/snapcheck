import { requirement } from '../requirements';
import { expect, test } from '../support/fixtures';
import { SnapEnvelopeSchema } from '../support/response-schemas';

const MINUTE_MS = 60_000;
const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * MINUTE_MS);

test.describe('Replay protection', () => {
  test(
    'only accepts an X-TIMESTAMP close to server time',
    requirement('TS-001'),
    async ({ snap, codes }) => {
      await test.step('signed 1 minute ago is accepted', async () => {
        const response = await snap.requestAccessToken({ sentAt: minutesAgo(1) });
        await expect(response).toHaveSnapResponseCode(codes.accessToken('success'));
      });

      await test.step('correctly signed 10 minutes ago is rejected', async () => {
        const response = await snap.requestAccessToken({ sentAt: minutesAgo(10) });
        await expect(response).toHaveSnapResponseCode(codes.accessToken('unauthorized'));
        // The signature is valid, so the reason proves which rule rejected it.
        const { responseMessage } = SnapEnvelopeSchema.parse(await response.json());
        expect(responseMessage).toContain('Timestamp');
      });
    },
  );
});
