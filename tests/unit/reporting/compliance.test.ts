import { describe, expect, it } from 'vitest';

import { REQUIREMENT_IDS } from '../../../src/requirements';
import {
  buildComplianceReport,
  verdictOf,
  type ProfileRun,
  type TestOutcome,
} from '../../../src/reporting/compliance';

describe('verdictOf', () => {
  it.each([
    [[], 'not-run'],
    [['passed'], 'passed'],
    [['passed', 'skipped'], 'passed'],
    [['skipped', 'skipped'], 'skipped'],
    [['passed', 'failed'], 'failed'],
    [['skipped', 'failed'], 'failed'],
  ] as const)('%j → %s', (statuses, expected) => {
    expect(verdictOf(statuses)).toBe(expected);
  });
});

describe('buildComplianceReport', () => {
  const run = (project: string): ProfileRun => ({
    project,
    profileName: project,
    displayName: project.toUpperCase(),
    target: `http://mock/${project}`,
    unverified: [],
  });

  const outcome = (overrides: Partial<TestOutcome>): TestOutcome => ({
    project: 'bri',
    title: 'a test',
    requirementIds: ['TOK-001'],
    status: 'passed',
    ...overrides,
  });

  const report = buildComplianceReport(
    [run('bri'), run('bca')],
    [
      outcome({ title: 'token ok' }),
      outcome({ title: 'header A', requirementIds: ['HDR-001'] }),
      outcome({ title: 'header B', requirementIds: ['HDR-001'], status: 'failed', error: 'boom' }),
      outcome({ title: 'policy', requirementIds: ['TS-001'], status: 'skipped' }),
      outcome({ project: 'bca', title: 'token ok' }),
    ],
    new Date('2026-10-24T00:00:00Z'),
  );
  const [bri, bca] = report.profiles;
  const verdictFor = (id: string) => bri?.requirements.find((r) => r.id === id)?.verdict;

  it('lists every catalogued requirement for every profile', () => {
    expect(bri?.requirements.map((r) => r.id)).toEqual(REQUIREMENT_IDS);
    expect(bca?.requirements).toHaveLength(REQUIREMENT_IDS.length);
  });

  it('fails a requirement when any one of its tests failed', () => {
    expect(verdictFor('HDR-001')).toBe('failed');
  });

  it('keeps passed, skipped and not-run requirements apart', () => {
    expect(verdictFor('TOK-001')).toBe('passed');
    expect(verdictFor('TS-001')).toBe('skipped');
    expect(verdictFor('IDEM-001')).toBe('not-run');
  });

  it('counts verdicts and marks the profile failed', () => {
    expect(bri?.counts).toEqual({
      passed: 1,
      failed: 1,
      skipped: 1,
      'not-run': REQUIREMENT_IDS.length - 3,
    });
    expect(bri?.verdict).toBe('failed');
  });

  it('keeps results of one profile out of another', () => {
    expect(bca?.verdict).toBe('passed');
    expect(bca?.counts.failed).toBe(0);
  });

  it('keeps the failing test and its error for the report', () => {
    const tests = bri?.requirements.find((r) => r.id === 'HDR-001')?.tests;
    expect(tests).toEqual([
      { title: 'header A', status: 'passed' },
      { title: 'header B', status: 'failed', error: 'boom' },
    ]);
  });
});
