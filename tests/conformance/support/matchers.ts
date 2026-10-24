import { expect as baseExpect, type APIResponse } from '@playwright/test';
import type { z } from 'zod';

import { TransactionStatus, parseResponseCode } from '../../../src/core';
import type { ProviderProfile } from '../../../src/profiles';
import { SnapEnvelopeSchema, TransferStatusResponseSchema } from './response-schemas';

const MATCHER_NAME = 'toHaveSnapResponseCode';

export const expect = baseExpect.extend({
  /**
   * Asserts both the HTTP status and the SNAP `responseCode`, e.g. `4091100`.
   * Checking only one of them hides real bugs: SNAP requires them to agree.
   */
  async toHaveSnapResponseCode(response: APIResponse, expectedCode: string) {
    const expectedStatus = parseResponseCode(expectedCode).httpStatus;
    const body = await readBody(response);
    const envelope = SnapEnvelopeSchema.safeParse(body);
    const actualCode = envelope.success ? envelope.data.responseCode : undefined;
    const pass = response.status() === expectedStatus && actualCode === expectedCode;

    const message = (): string =>
      [
        this.utils.matcherHint(MATCHER_NAME, undefined, undefined, { isNot: this.isNot }),
        '',
        `Expected: HTTP ${expectedStatus} with responseCode ${this.utils.printExpected(expectedCode)}`,
        `Received: HTTP ${response.status()} with responseCode ${this.utils.printReceived(actualCode)}`,
        `Body:     ${JSON.stringify(body)}`,
      ].join('\n');

    return { pass, message, name: MATCHER_NAME, expected: expectedCode, actual: actualCode };
  },
});

/**
 * Asserts a successful SNAP response and returns its body, validated against `schema`.
 * Keeps happy-path tests to one line of assertion plus typed field checks.
 */
export async function expectSnapSuccess<Schema extends z.ZodType>(
  response: APIResponse,
  expectedCode: string,
  schema: Schema,
): Promise<z.infer<Schema>> {
  await expect(response).toHaveSnapResponseCode(expectedCode);
  const parsed = schema.safeParse(await response.json());
  expect(parsed.error?.issues ?? [], 'response body should match its contract').toEqual([]);
  return parsed.data as z.infer<Schema>;
}

/**
 * Asserts that a status inquiry reported "transaction not found" the way the profile documents:
 * `http-404` → the given 404XX01 code; `status-07` → success code with latestTransactionStatus "07".
 * The provider variant is decided here, once, so tests stay free of branches.
 */
export async function expectTransactionNotFound(
  response: APIResponse,
  notFound: ProviderProfile['transferStatus']['notFound'],
  codes: { readonly notFound: string; readonly success: string },
): Promise<void> {
  if (notFound === 'http-404') {
    await expect(response).toHaveSnapResponseCode(codes.notFound);
    return;
  }
  const status = await expectSnapSuccess(response, codes.success, TransferStatusResponseSchema);
  expect(status.latestTransactionStatus).toBe(TransactionStatus.notFound);
}

async function readBody(response: APIResponse): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
