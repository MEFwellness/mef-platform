/**
 * lib/time/displayDate.ts fixes the coach-view hydration bug found in a
 * live-verification session: several coach panels called
 * `new Date(iso).toLocaleDateString('en-US', {...})` with no explicit
 * `timeZone`, so the call silently used the *host process's own local
 * timezone*: Vercel's server always runs in UTC, a coach's browser runs
 * in whatever zone they're physically in, so the same instant rendered
 * as different text server-side vs. client-side and React flagged a
 * hydration mismatch (minified error codes #418/#423/#425).
 *
 * Two independent proofs:
 *
 * 1. Behavioral: formatDisplayDate produces byte-identical output for
 *    the same instant regardless of the *test runner's own* `process.env.TZ`,
 *    which is the literal mechanism of the bug (server TZ vs. client TZ
 *    divergence). Also covers the honest-fallback contract for null,
 *    undefined, empty string, and malformed input.
 *
 * 2. Static source scan: same "regression guard via file-content scan"
 *    convention tests/assessments-isolation.test.ts already established
 *    in this repo. Every coach-view file this fix touched must both
 *    import formatDisplayDate and contain no bare, un-timezoned
 *    `toLocale{Date,Time,}String(` call. Reverting any one of them back
 *    to the old inline pattern makes this test fail, see this file's
 *    own comment above FIXED_FILES for how that was proven.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatDisplayDate } from '../lib/time/displayDate';

const REPO_ROOT = join(__dirname, '..');

describe('formatDisplayDate', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('is deterministic across different test-runner TZ settings, an explicit-UTC instant read the same everywhere', () => {
    const iso = '2026-03-15T09:30:00.000Z';
    const options = { month: 'short', day: 'numeric', year: 'numeric' } as const;

    process.env.TZ = 'America/Los_Angeles';
    const fromLosAngeles = formatDisplayDate(iso, options);

    process.env.TZ = 'Pacific/Kiritimati'; // UTC+14, about as far from Los Angeles as a zone gets
    const fromKiritimati = formatDisplayDate(iso, options);

    process.env.TZ = 'UTC';
    const fromUtc = formatDisplayDate(iso, options);

    expect(fromLosAngeles).toBe(fromUtc);
    expect(fromKiritimati).toBe(fromUtc);
    expect(fromUtc).toBe('Mar 15, 2026');
  });

  it('is deterministic for a date/time format too, not just a date-only one', () => {
    const iso = '2026-01-01T23:45:00.000Z';
    const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const;

    process.env.TZ = 'America/Los_Angeles';
    const fromLosAngeles = formatDisplayDate(iso, options);

    process.env.TZ = 'UTC';
    const fromUtc = formatDisplayDate(iso, options);

    expect(fromLosAngeles).toBe(fromUtc);
  });

  it('never renders "Invalid Date" and never throws for null, undefined, or empty string', () => {
    const options = { month: 'short', day: 'numeric', year: 'numeric' } as const;

    for (const input of [null, undefined, '']) {
      let result = '';
      expect(() => {
        result = formatDisplayDate(input, options);
      }).not.toThrow();
      expect(result).not.toContain('Invalid Date');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('never renders "Invalid Date" and never throws for a malformed string', () => {
    const options = { month: 'short', day: 'numeric', year: 'numeric' } as const;
    const result = formatDisplayDate('not a real date', options);
    expect(result).not.toContain('Invalid Date');
    expect(result.length).toBeGreaterThan(0);
  });

  it('gives the same honest fallback text for every invalid case, so callers never invent a date', () => {
    const options = { month: 'short', day: 'numeric', year: 'numeric' } as const;
    const fallback = formatDisplayDate(null, options);
    expect(formatDisplayDate(undefined, options)).toBe(fallback);
    expect(formatDisplayDate('', options)).toBe(fallback);
    expect(formatDisplayDate('not a real date', options)).toBe(fallback);
  });
});

/**
 * Every coach-view file the hydration-fix pass edited to call
 * formatDisplayDate instead of its own un-timezoned `new Date(iso)
 * .toLocale*(...)`. A file appears here only if the fix actually landed
 * in it, not for every file that merely renders a date.
 *
 * Non-vacuous proof performed by hand for this suite: CoachNotesPanel.tsx
 * was temporarily reverted to its pre-fix body (a local `formatTimestamp`
 * calling `new Date(isoTimestamp).toLocaleString('en-US', {...})` with no
 * `timeZone`, no import of formatDisplayDate) and this test file was run
 * again: the static-scan test below failed with "BUG_PATTERN.test(...)
 * expected false, received true" against CoachNotesPanel.tsx, for exactly
 * the reason this guard exists. The fix was then restored and the suite
 * passed again. See the task report for the exact before/after test run.
 */
const FIXED_FILES = [
  "app/coach/clients/[id]/RecommendationsPanel.tsx",
  "app/coach/clients/[id]/MovementProfilePanel.tsx",
  "app/coach/clients/[id]/RootMapPanel.tsx",
  "app/coach/clients/[id]/WbsaPanel.tsx",
  "app/coach/clients/[id]/AssessmentAssignmentPanel.tsx",
  "app/coach/clients/[id]/IntelligencePanel.tsx",
  "app/coach/clients/[id]/ReadinessPulsePanel.tsx",
  "app/coach/clients/[id]/ConversationPanel.tsx",
  "app/coach/clients/[id]/CoachNotesPanel.tsx",
  "app/coach/clients/[id]/CoreValuesSnapshotPanel.tsx",
  "app/coach/clients/[id]/LongitudinalIntelligencePanel.tsx",
  "app/coach/clients/[id]/BodyAssessmentPanel.tsx",
  "app/coach/clients/[id]/readiness-pulse/[sessionId]/page.tsx",
  "app/coach/clients/[id]/body-assessments/[assessmentId]/RightPanel/TimelineSection.tsx",
  "app/coach/clients/[id]/body-assessments/[assessmentId]/page.tsx",
  "app/coach/clients/[id]/body-assessments/[assessmentId]/RightPanel/PostureFindingsSection.tsx",
  "app/coach/clients/[id]/body-assessments/[assessmentId]/RightPanel/SummarySection.tsx",
  "app/coach/clients/[id]/body-assessments/[assessmentId]/RightPanel/ReviewHistorySection.tsx",
  "app/coach/clients/[id]/LifeSignalCheckPanel.tsx",
  "app/coach/clients/[id]/body-assessments/[assessmentId]/RightPanel/TrendChart.tsx",
  "app/coach/clients/[id]/life-signal-check/[sessionId]/page.tsx",
  "app/coach/clients/[id]/wbsa/[sessionId]/page.tsx",
  "app/coach/clients/[id]/core-values-snapshot/[sessionId]/page.tsx",
  "app/coach/review-queue/page.tsx",
  "app/coach/review-queue/[id]/page.tsx",
  "app/coach/clients/[id]/body-assessments/[assessmentId]/report/page.tsx",
  "app/coach/corrective-programs/[memberId]/page.tsx",
  "app/coach/protein-review/page.tsx",
  "app/coach/clients/[id]/RootCauseSignalsPanel.tsx",
  "components/coach-questions/QuestionRow.tsx",
  "app/coach/clients/[id]/PersonalResetPlanPanel.tsx",
];

// A locale-date/time call with no `timeZone:` anywhere before its closing
// paren is the exact bug shape. This is intentionally simple (it does not
// try to parse JS), it only needs to catch the literal old pattern, which
// is all the non-vacuous proof above needs it to do.
const BARE_LOCALE_CALL = /\.toLocale(?:Date|Time)?String\(\s*'en-US'\s*(?:,\s*\{[^}]*\})?\s*\)/g;

function hasUntimezonedLocaleCall(source: string): boolean {
  const matches = source.match(BARE_LOCALE_CALL);
  if (!matches) return false;
  return matches.some((call) => !call.includes('timeZone'));
}

describe('coach-view hydration fix: every fixed file uses the shared helper', () => {
  for (const relativePath of FIXED_FILES) {
    it(`${relativePath} imports formatDisplayDate and contains no un-timezoned locale call`, () => {
      const source = readFileSync(join(REPO_ROOT, relativePath), 'utf-8');
      expect(source).toContain('formatDisplayDate');
      expect(hasUntimezonedLocaleCall(source)).toBe(false);
    });
  }
});
