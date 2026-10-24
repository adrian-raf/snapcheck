import type { ComplianceReport, ProfileReport, Verdict } from './compliance';

const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
  passed: '✅ pass',
  failed: '❌ fail',
  skipped: '⏭️ skip',
  'not-run': '➖ not run',
};

/** Compact Markdown, sized for a GitHub Actions job summary or a pull-request comment. */
export function renderMarkdown(report: ComplianceReport): string {
  const { profiles } = report;
  return [
    '## SNAP conformance',
    '',
    summaryTable(profiles),
    '',
    '<details><summary>Requirement matrix</summary>',
    '',
    matrixTable(profiles),
    '',
    '</details>',
    '',
    failureList(profiles),
  ].join('\n');
}

function summaryTable(profiles: readonly ProfileReport[]): string {
  const rows = profiles.map(
    ({ run, verdict, counts }) =>
      `| ${run.displayName} | ${VERDICT_LABEL[verdict]} | ${counts.passed} | ${counts.failed} | ${counts.skipped} | ${counts['not-run']} |`,
  );
  return [
    '| Profile | Result | Passed | Failed | Skipped | Not run |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n');
}

function matrixTable(profiles: readonly ProfileReport[]): string {
  const [first] = profiles;
  if (!first) return '_No profiles were run._';

  const header = `| Requirement | ${profiles.map((p) => p.run.profileName).join(' | ')} |`;
  const divider = `| --- | ${profiles.map(() => ':---:').join(' | ')} |`;
  const rows = first.requirements.map((requirement, index) => {
    const cells = profiles.map((p) => VERDICT_LABEL[p.requirements[index]?.verdict ?? 'not-run']);
    return `| \`${requirement.id}\` ${escapeCell(requirement.title)} | ${cells.join(' | ')} |`;
  });
  return [header, divider, ...rows].join('\n');
}

function failureList(profiles: readonly ProfileReport[]): string {
  const lines = profiles.flatMap(({ run, requirements }) =>
    requirements
      .filter((requirement) => requirement.verdict === 'failed')
      .flatMap((requirement) =>
        requirement.tests
          .filter((test) => test.status === 'failed')
          .map(
            (test) =>
              `- **${run.profileName}** \`${requirement.id}\` ${escapeCell(test.title)}: ${escapeCell(firstLine(test.error))}`,
          ),
      ),
  );
  return lines.length > 0 ? ['### Failures', '', ...lines].join('\n') : '';
}

function firstLine(text = ''): string {
  return text.split('\n').find((line) => line.trim() !== '') ?? '';
}

function escapeCell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
