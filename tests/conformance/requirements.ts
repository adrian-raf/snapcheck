import type { TestDetails } from '@playwright/test';

import { MOCK_ONLY_BASES, REQUIREMENTS, type RequirementId } from '../../src/requirements';

/** The catalogue lives in src/requirements so the reporter and CLI can use it too. */
export { REQUIREMENTS, type RequirementId } from '../../src/requirements';

/** Added to every test whose basis needs the bundled mock; such tests skip against a sandbox. */
export const MOCK_ONLY_TAG = '@mock-only';

/**
 * Tags and annotates a test with its requirement, so reports can be filtered
 * (`npx playwright test --grep @IDEM-001`) and traced back to the catalogue.
 */
export function requirement(id: RequirementId): TestDetails {
  const { title, basis, source } = REQUIREMENTS[id];
  return {
    tag: [`@${id}`, `@${basis}`, ...(MOCK_ONLY_BASES.includes(basis) ? [MOCK_ONLY_TAG] : [])],
    annotation: [
      { type: 'requirement', description: `${id} — ${title}` },
      { type: 'source', description: source },
    ],
  };
}
