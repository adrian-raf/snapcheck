import type { ComplianceReport, ProfileReport, RequirementResult, Verdict } from './compliance';

/**
 * Self-contained HTML compliance report (no external assets), readable by people
 * who will never open the Playwright report: what was checked, per provider, and
 * what breaks for the business when a rule fails.
 *
 * Every dynamic value goes through `escape()`; error messages come from the
 * system under test and must never be able to inject markup.
 */

const VERDICT_TEXT: Readonly<Record<Verdict, string>> = {
  passed: 'Pass',
  failed: 'Fail',
  skipped: 'Skipped',
  'not-run': 'Not run',
};

const BASIS_TEXT: Readonly<Record<RequirementResult['basis'], string>> = {
  standard: 'Standard',
  'provider-variant': 'Provider variant',
  'mock-policy': 'Mock policy',
  resilience: 'Resilience',
};

export function renderHtml(report: ComplianceReport): string {
  const { profiles } = report;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SNAP Conformance Report</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">snapcheck</p>
    <h1>SNAP conformance report</h1>
    <p class="muted">Generated ${escape(formatDate(report.generatedAt))} · ${profiles.length} profile${profiles.length === 1 ? '' : 's'}</p>
  </header>
  <section class="cards" aria-label="Summary per profile">
    ${profiles.map(profileCard).join('\n')}
  </section>
  ${legend()}
  <section aria-label="Requirement matrix">
    <h2>Requirements</h2>
    ${matrix(profiles)}
  </section>
  ${failures(profiles)}
</main>
</body>
</html>
`;
}

function profileCard({ run, verdict, counts }: ProfileReport): string {
  const unverified =
    run.unverified.length > 0
      ? `<p class="note">Unverified profile values: ${run.unverified.map((field) => `<code>${escape(field)}</code>`).join(', ')}</p>`
      : '';
  return `<article class="card">
      <div class="card-head">
        <h2>${escape(run.displayName)}</h2>
        ${pill(verdict)}
      </div>
      <p class="muted mono">${escape(run.profileName)} · ${escape(run.target)}</p>
      <dl class="counts">
        <div><dt>Passed</dt><dd>${counts.passed}</dd></div>
        <div><dt>Failed</dt><dd>${counts.failed}</dd></div>
        <div><dt>Skipped</dt><dd>${counts.skipped}</dd></div>
        <div><dt>Not run</dt><dd>${counts['not-run']}</dd></div>
      </dl>
      ${unverified}
    </article>`;
}

function matrix(profiles: readonly ProfileReport[]): string {
  const [first] = profiles;
  if (!first) return '<p class="muted">No profiles were run.</p>';

  const headCells = profiles.map((p) => `<th scope="col">${escape(p.run.profileName)}</th>`);
  const rows = first.requirements.map((requirement, index) => {
    const cells = profiles.map(
      (p) => `<td>${pill(p.requirements[index]?.verdict ?? 'not-run')}</td>`,
    );
    return `<tr>
        <th scope="row">
          <span class="mono id">${escape(requirement.id)}</span>
          <span class="title">${escape(requirement.title)}</span>
          <span class="basis basis-${requirement.basis}">${BASIS_TEXT[requirement.basis]}</span>
          <span class="risk">${escape(requirement.risk)}</span>
        </th>
        ${cells.join('')}
      </tr>`;
  });

  return `<div class="table-wrap"><table>
      <thead><tr><th scope="col">Requirement</th>${headCells.join('')}</tr></thead>
      <tbody>${rows.join('\n')}</tbody>
    </table></div>`;
}

function failures(profiles: readonly ProfileReport[]): string {
  const items = profiles.flatMap(({ run, requirements }) =>
    requirements
      .filter((requirement) => requirement.verdict === 'failed')
      .map((requirement) => {
        const failedTests = requirement.tests.filter((test) => test.status === 'failed');
        return `<details open>
          <summary><span class="mono">${escape(run.profileName)}</span> · <span class="mono">${escape(requirement.id)}</span> ${escape(requirement.title)}</summary>
          <p><strong>Business risk:</strong> ${escape(requirement.risk)}</p>
          <p class="muted"><strong>Source:</strong> ${escape(requirement.source)}</p>
          ${failedTests
            .map(
              (test) =>
                `<p class="test-title">${escape(test.title)}</p><pre>${escape(test.error ?? 'No error message')}</pre>`,
            )
            .join('')}
        </details>`;
      }),
  );

  if (items.length === 0) return '';
  return `<section aria-label="Failures"><h2>Failures</h2>${items.join('\n')}</section>`;
}

function legend(): string {
  return `<p class="legend muted">
    <strong>Standard</strong>: every provider checked documents it the same way.
    <strong>Provider variant</strong>: expected value comes from the profile.
    <strong>Mock policy</strong>: a rule of the bundled mock.
    <strong>Resilience</strong>: the reference client recovering from faults the mock injects.
    The last two are skipped against real providers.
  </p>`;
}

function pill(verdict: Verdict): string {
  return `<span class="pill pill-${verdict}">${VERDICT_TEXT[verdict]}</span>`;
}

function formatDate(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const STYLES = `
:root {
  --bg: #f7f7f5; --surface: #ffffff; --text: #1c1c1a; --muted: #67675f; --border: #e3e3dd;
  --pass: #1f7a4d; --pass-bg: #e3f3ea; --fail: #b42318; --fail-bg: #fdeceb;
  --skip: #8a6d00; --skip-bg: #fbf3d6; --none: #67675f; --none-bg: #efefeb;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141413; --surface: #1d1d1b; --text: #ecece8; --muted: #a3a39b; --border: #33332f;
    --pass: #6fd3a0; --pass-bg: #173326; --fail: #ff8a80; --fail-bg: #3b1715;
    --skip: #e6c65c; --skip-bg: #352c0c; --none: #a3a39b; --none-bg: #2a2a27;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 40px 16px 64px; }
h1 { font-size: 28px; margin: 4px 0 6px; letter-spacing: -0.01em; }
h2 { font-size: 18px; margin: 32px 0 12px; }
.eyebrow { margin: 0; font: 600 12px var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.muted { color: var(--muted); }
.mono, code { font-family: var(--mono); font-size: 13px; }
.cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: 24px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.card h2 { margin: 0; font-size: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.card p { margin: 4px 0 0; }
.counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 14px 0 0; }
.counts dt { font-size: 12px; color: var(--muted); }
.counts dd { margin: 0; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.note { font-size: 13px; color: var(--skip); margin-top: 10px !important; }
.legend { font-size: 13px; margin-top: 20px; }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
thead th { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; position: sticky; top: 0; background: var(--surface); }
tbody tr:last-child > * { border-bottom: none; }
td { text-align: center; white-space: nowrap; }
tbody th { font-weight: 400; min-width: 280px; }
.id { font-weight: 600; margin-right: 6px; }
.title { font-weight: 500; }
.risk { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; }
.basis { display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--border); color: var(--muted); margin-left: 6px; }
.pill { display: inline-block; min-width: 64px; text-align: center; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.pill-passed { color: var(--pass); background: var(--pass-bg); }
.pill-failed { color: var(--fail); background: var(--fail-bg); }
.pill-skipped { color: var(--skip); background: var(--skip-bg); }
.pill-not-run { color: var(--none); background: var(--none-bg); }
details { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--fail); border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; }
summary { cursor: pointer; font-weight: 600; }
.test-title { font-weight: 600; margin-bottom: 4px; }
@media (max-width: 600px) {
  tbody th { min-width: 200px; }
  th, td { padding: 10px 8px; }
  .counts dd { font-size: 18px; }
}
pre { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px; overflow-x: auto; white-space: pre-wrap; font: 12px/1.5 var(--mono); }
`;
