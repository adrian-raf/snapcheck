import { join } from 'node:path';

import { defineConfig, type PlaywrightTestProject } from '@playwright/test';

import {
  DEFAULT_INBOX_PATH,
  DEFAULT_INBOX_PORT,
  DEFAULT_MOCK_HOST,
  DEFAULT_MOCK_PORT,
} from './src/config/local-defaults';
import { DEFAULT_PROFILE, listProfiles } from './src/profiles';
import type { ConformanceOptions } from './tests/conformance/support/fixtures';

/**
 * Two modes:
 * - Default: one Playwright project per profile in `profiles/`, each against its own
 *   mock server emulating that profile. `npx playwright test --project bri` runs one.
 * - SNAP_BASE_URL set: a single `sandbox` project against that origin, expecting the
 *   behaviour of SNAP_PROFILE. See README → "Running against a sandbox".
 *
 * SNAPCHECK_PROFILES (comma-separated) limits which mock projects exist, so that
 * `snapcheck run --profile bri` starts only the BRI mock. Ports stay the same either way.
 */
const externalBaseUrl = process.env.SNAP_BASE_URL;
const isCI = Boolean(process.env.CI);
const selectedProfiles = process.env.SNAPCHECK_PROFILES?.split(',').map((name) => name.trim());

type ConformanceProject = PlaywrightTestProject<ConformanceOptions>;

/** One inbox receives the settlement notifications of every mock. */
const inboxBaseUrl = `http://${DEFAULT_MOCK_HOST}:${DEFAULT_INBOX_PORT}`;

interface MockTarget {
  readonly profileName: string;
  readonly baseURL: string;
  readonly port: number;
}

const mockTargets: MockTarget[] = listProfiles(join(import.meta.dirname, 'profiles'))
  .map((profileName, index) => {
    const port = DEFAULT_MOCK_PORT + index;
    return { profileName, port, baseURL: `http://${DEFAULT_MOCK_HOST}:${port}` };
  })
  .filter(({ profileName }) => !selectedProfiles || selectedProfiles.includes(profileName));

const sandboxProject: ConformanceProject = {
  name: 'sandbox',
  use: {
    baseURL: externalBaseUrl,
    profileName: process.env.SNAP_PROFILE ?? DEFAULT_PROFILE,
  },
};

const mockProjects: ConformanceProject[] = mockTargets.map(({ profileName, baseURL }) => ({
  name: profileName,
  use: { baseURL, profileName },
}));

export default defineConfig<ConformanceOptions>({
  testDir: './tests/conformance/specs',
  fullyParallel: true,
  forbidOnly: isCI,
  // Conformance checks are deterministic: a retry would only hide a real violation.
  retries: 0,
  reporter: [
    isCI ? ['github'] : ['list'],
    ['html', { open: 'never' }],
    ['./src/reporting/compliance-reporter.ts', { outputFolder: 'compliance-report' }],
  ],
  projects: externalBaseUrl ? [sandboxProject] : mockProjects,
  ...(externalBaseUrl
    ? {}
    : {
        webServer: [
          {
            name: 'inbox',
            command: 'npm run inbox:start',
            url: `${inboxBaseUrl}/health`,
            reuseExistingServer: !isCI,
            timeout: 30_000,
            env: { LOG_LEVEL: 'warn', INBOX_PORT: String(DEFAULT_INBOX_PORT) },
          },
          ...mockTargets.map(({ profileName, port, baseURL }) => ({
            name: `mock:${profileName}`,
            command: 'npm run mock:start',
            url: `${baseURL}/health?profile=${profileName}`,
            reuseExistingServer: !isCI,
            timeout: 30_000,
            env: {
              LOG_LEVEL: 'warn',
              MOCK_PORT: String(port),
              MOCK_PROFILE: profileName,
              MOCK_NOTIFICATION_URL: `${inboxBaseUrl}${DEFAULT_INBOX_PATH}`,
            },
          })),
        ],
      }),
});
