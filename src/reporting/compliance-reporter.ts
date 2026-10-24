import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type {
  FullConfig,
  FullProject,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

import { loadProfile } from '../profiles';
import { requirementIdFromTag, type RequirementId } from '../requirements';
import {
  buildComplianceReport,
  type ProfileRun,
  type TestOutcome,
  type TestStatus,
} from './compliance';
import { renderHtml } from './render-html';
import { renderMarkdown } from './render-markdown';

export interface ComplianceReporterOptions {
  /** Where index.html, report.json and summary.md are written. */
  outputFolder?: string;
}

const DEFAULT_OUTPUT_FOLDER = 'compliance-report';
const MAX_ERROR_LENGTH = 1_500;
// eslint-disable-next-line no-control-regex -- matching terminal colour codes is the point.
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/**
 * Playwright reporter that writes a compliance report per requirement and profile.
 * Collection and rendering live in pure modules (compliance.ts, render-*.ts);
 * this class only adapts Playwright's objects and writes files.
 */
export default class ComplianceReporter implements Reporter {
  private readonly outputFolder: string;
  private runs: ProfileRun[] = [];
  /** Keyed by test id, so the last attempt of a retried test wins. */
  private readonly outcomes = new Map<string, TestOutcome>();

  constructor(options: ComplianceReporterOptions = {}) {
    this.outputFolder = resolve(options.outputFolder ?? DEFAULT_OUTPUT_FOLDER);
  }

  onBegin(config: FullConfig): void {
    this.runs = config.projects.map(toProfileRun);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? '';
    const requirementIds = test.tags
      .map(requirementIdFromTag)
      .filter((id): id is RequirementId => id !== undefined);
    if (requirementIds.length === 0) return;

    const status = toStatus(test);
    const error = status === 'failed' ? errorText(result) : undefined;
    const skipReason =
      status === 'skipped'
        ? test.annotations.find((annotation) => annotation.type === 'skip')?.description
        : undefined;

    this.outcomes.set(test.id, {
      project,
      title: test.title,
      requirementIds,
      status,
      ...(error === undefined ? {} : { error }),
      ...(skipReason === undefined ? {} : { skipReason }),
    });
  }

  onEnd(): void {
    const report = buildComplianceReport(this.runs, [...this.outcomes.values()], new Date());
    const markdown = renderMarkdown(report);

    mkdirSync(this.outputFolder, { recursive: true });
    writeFileSync(join(this.outputFolder, 'index.html'), renderHtml(report));
    writeFileSync(join(this.outputFolder, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(this.outputFolder, 'summary.md'), markdown);

    const stepSummary = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummary) appendFileSync(stepSummary, `${markdown}\n`);

    console.info(`\nCompliance report: ${join(this.outputFolder, 'index.html')}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}

function toProfileRun(project: FullProject): ProfileRun {
  const { profileName = project.name, baseURL = '' } = project.use as {
    profileName?: string;
    baseURL?: string;
  };
  try {
    const profile = loadProfile(profileName);
    return {
      project: project.name,
      profileName: profile.name,
      displayName: profile.displayName,
      target: baseURL,
      unverified: profile.unverified,
    };
  } catch {
    // The suite itself reports an unreadable profile; the report still lists the run.
    return {
      project: project.name,
      profileName,
      displayName: profileName,
      target: baseURL,
      unverified: [],
    };
  }
}

/**
 * `test.outcome()` is the final verdict across retries. A flaky test counts as
 * failed: a conformance rule that only holds sometimes is not met.
 */
function toStatus(test: TestCase): TestStatus {
  switch (test.outcome()) {
    case 'expected':
      return 'passed';
    case 'skipped':
      return 'skipped';
    case 'unexpected':
    case 'flaky':
      return 'failed';
  }
}

function errorText(result: TestResult): string {
  const message = result.errors
    .map((error) => error.message ?? error.value ?? '')
    .join('\n\n')
    .replace(ANSI_PATTERN, '')
    .trim();
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message;
}
