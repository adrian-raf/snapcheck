import { test as base } from '@playwright/test';

import { ServiceCode, type SnapCaseName } from '../../../src/core';
import { DEFAULT_PROFILE, loadProfile, responseCodeFor } from '../../../src/profiles';
import { MOCK_ONLY_TAG } from '../requirements';
import { SnapClient } from './snap-client';
import { loadTarget, type ConformanceTarget } from './target';

/** Expected 7-digit response code per service, with the profile's case code overrides applied. */
export interface ResponseCodes {
  accessToken(name: SnapCaseName): string;
  balanceInquiry(name: SnapCaseName): string;
  transferIntrabank(name: SnapCaseName): string;
  transferStatus(name: SnapCaseName): string;
}

/** Set per Playwright project in playwright.config.ts. */
export interface ConformanceOptions {
  /** Profile name (`bri`) or path to a profile file. */
  profileName: string;
}

interface WorkerFixtures extends ConformanceOptions {
  target: ConformanceTarget;
  codes: ResponseCodes;
}

interface TestFixtures {
  snap: SnapClient;
  /** A valid access token, obtained fresh for the test. */
  accessToken: string;
  /** Auto: records the profile (and its unverified fields) on every test in the report. */
  annotateProfile: undefined;
  /** Auto: skips `@mock-only` checks (mock policy, resilience) when the target is a real provider. */
  skipMockOnlyOnRealTarget: undefined;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  profileName: [DEFAULT_PROFILE, { option: true, scope: 'worker' }],

  // Loaded lazily per worker: the key pair only exists after the web server's start-up script ran.
  target: [
    async ({ profileName }, use) => {
      await use(loadTarget(loadProfile(profileName)));
    },
    { scope: 'worker' },
  ],

  codes: [
    async ({ target: { profile } }, use) => {
      await use({
        accessToken: (name) => responseCodeFor(profile, ServiceCode.accessTokenB2B, name),
        balanceInquiry: (name) => responseCodeFor(profile, ServiceCode.balanceInquiry, name),
        transferIntrabank: (name) => responseCodeFor(profile, ServiceCode.transferIntrabank, name),
        transferStatus: (name) => responseCodeFor(profile, ServiceCode.transferStatusInquiry, name),
      });
    },
    { scope: 'worker' },
  ],

  annotateProfile: [
    async ({ target }, use, testInfo) => {
      const { name, unverified } = target.profile;
      const gaps = unverified.length > 0 ? ` (unverified: ${unverified.join(', ')})` : '';
      testInfo.annotations.push({ type: 'profile', description: `${name}${gaps}` });
      await use(undefined);
    },
    { auto: true },
  ],

  skipMockOnlyOnRealTarget: [
    async ({ target }, use, testInfo) => {
      testInfo.skip(
        !target.isMock && testInfo.tags.includes(MOCK_ONLY_TAG),
        'Needs the bundled mock (mock policy or injected faults).',
      );
      await use(undefined);
    },
    { auto: true },
  ],

  snap: async ({ request, target }, use) => {
    await use(new SnapClient(request, target));
  },

  accessToken: async ({ snap }, use) => {
    await use(await snap.obtainAccessToken());
  },
});

export { expect, expectSnapSuccess, expectTransactionNotFound } from './matchers';
