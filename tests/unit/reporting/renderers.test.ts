import { describe, expect, it } from 'vitest';

import { buildComplianceReport, type ProfileRun } from '../../../src/reporting/compliance';
import { escape, renderHtml } from '../../../src/reporting/render-html';
import { renderMarkdown } from '../../../src/reporting/render-markdown';

const run: ProfileRun = {
  project: 'bri',
  profileName: 'bri',
  displayName: 'BRI (BRIAPI)',
  target: 'http://127.0.0.1:4011',
  unverified: ['timestamp.timezone'],
};

const HOSTILE = '<img src=x onerror="alert(1)"> | pipe';

const report = buildComplianceReport(
  [run],
  [
    { project: 'bri', title: 'token ok', requirementIds: ['TOK-001'], status: 'passed' },
    {
      project: 'bri',
      title: 'header check',
      requirementIds: ['HDR-001'],
      status: 'failed',
      error: `Expected 4001102\n${HOSTILE}`,
    },
  ],
  new Date('2026-10-24T05:00:00.000Z'),
);

describe('escape', () => {
  it('escapes every HTML-significant character', () => {
    expect(escape(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('renderHtml', () => {
  const html = renderHtml(report);

  it('never lets an error message from the system under test inject markup', () => {
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('is self-contained (no external scripts, styles or images)', () => {
    expect(html).not.toMatch(/<script|<link|src="http/);
  });

  it('shows the profile, its verdict, its unverified values and the business risk of a failure', () => {
    expect(html).toContain('BRI (BRIAPI)');
    expect(html).toContain('pill-failed');
    expect(html).toContain('timestamp.timezone');
    expect(html).toContain('Requests without traceability or idempotency data would be processed.');
  });
});

describe('renderMarkdown', () => {
  const markdown = renderMarkdown(report);

  it('summarises each profile in one table row', () => {
    expect(markdown).toMatch(/\| BRI \(BRIAPI\) \| ❌ fail \| 1 \| 1 \| 0 \| \d+ \|/);
  });

  it('lists failures on one line each, without breaking the table syntax', () => {
    expect(markdown).toContain('- **bri** `HDR-001` header check: Expected 4001102');
    expect(markdown).not.toContain(HOSTILE);
  });
});
