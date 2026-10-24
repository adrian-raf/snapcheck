import {
  REQUIREMENTS,
  REQUIREMENT_IDS,
  type Requirement,
  type RequirementId,
} from '../requirements';

/**
 * Turns individual test results into a compliance verdict per requirement and profile.
 * Pure data in, data out — no Playwright, no I/O — so the rules are unit-testable.
 */

export type TestStatus = 'passed' | 'failed' | 'skipped';
export type Verdict = 'passed' | 'failed' | 'skipped' | 'not-run';

/** One profile run = one Playwright project. */
export interface ProfileRun {
  readonly project: string;
  readonly profileName: string;
  readonly displayName: string;
  readonly target: string;
  readonly unverified: readonly string[];
}

export interface TestOutcome {
  readonly project: string;
  readonly title: string;
  readonly requirementIds: readonly RequirementId[];
  readonly status: TestStatus;
  readonly error?: string;
  readonly skipReason?: string;
}

export interface RequirementResult extends Requirement {
  readonly id: RequirementId;
  readonly verdict: Verdict;
  readonly tests: readonly Omit<TestOutcome, 'project' | 'requirementIds'>[];
}

export interface ProfileReport {
  readonly run: ProfileRun;
  readonly verdict: Verdict;
  readonly counts: Readonly<Record<Verdict, number>>;
  readonly requirements: readonly RequirementResult[];
}

export interface ComplianceReport {
  readonly generatedAt: string;
  readonly profiles: readonly ProfileReport[];
}

export const VERDICTS: readonly Verdict[] = ['passed', 'failed', 'skipped', 'not-run'];

/**
 * A requirement fails if any of its tests failed, passes if at least one test
 * passed and none failed, is skipped if every test was skipped, and is not run
 * when no test for it was selected (e.g. filtered out with `--grep`).
 */
export function verdictOf(statuses: readonly TestStatus[]): Verdict {
  if (statuses.length === 0) return 'not-run';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('passed')) return 'passed';
  return 'skipped';
}

export function buildComplianceReport(
  runs: readonly ProfileRun[],
  outcomes: readonly TestOutcome[],
  generatedAt: Date,
): ComplianceReport {
  return {
    generatedAt: generatedAt.toISOString(),
    profiles: runs.map((run) =>
      buildProfileReport(
        run,
        outcomes.filter((outcome) => outcome.project === run.project),
      ),
    ),
  };
}

function buildProfileReport(run: ProfileRun, outcomes: readonly TestOutcome[]): ProfileReport {
  const requirements = REQUIREMENT_IDS.map((id): RequirementResult => {
    const tests = outcomes
      .filter((outcome) => outcome.requirementIds.includes(id))
      .map(toTestSummary);
    return {
      id,
      ...REQUIREMENTS[id],
      verdict: verdictOf(tests.map((test) => test.status)),
      tests,
    };
  });

  const counts = countVerdicts(requirements.map((requirement) => requirement.verdict));
  return { run, requirements, counts, verdict: overallVerdict(counts) };
}

/** Drops the grouping keys; optional fields are only present when set. */
function toTestSummary(outcome: TestOutcome): RequirementResult['tests'][number] {
  const { title, status, error, skipReason } = outcome;
  return {
    title,
    status,
    ...(error === undefined ? {} : { error }),
    ...(skipReason === undefined ? {} : { skipReason }),
  };
}

function countVerdicts(verdicts: readonly Verdict[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { passed: 0, failed: 0, skipped: 0, 'not-run': 0 };
  for (const verdict of verdicts) counts[verdict] += 1;
  return counts;
}

/** A profile is compliant only if nothing failed and at least one requirement passed. */
function overallVerdict(counts: Readonly<Record<Verdict, number>>): Verdict {
  if (counts.failed > 0) return 'failed';
  if (counts.passed > 0) return 'passed';
  return counts.skipped > 0 ? 'skipped' : 'not-run';
}
