/**
 * C3 — the coach question bank fits on a phone.
 *
 * Measured live at 390px on 2026-08-28, before this fix: the page's
 * `scrollWidth` was 518 against a 390 viewport, 270 elements crossed the
 * right edge, and the widest was the row's action group at x=518.
 *
 * The cause was not the textarea and not the question key, which both
 * measured 302 and 312 and fitted. It was `shrink-0` on a group that also
 * carried `flex-wrap`. A flex item that may not shrink is never narrow
 * enough for its own wrapping to fire, so five buttons stayed on one
 * 474px line and dragged the page sideways with them. The two classes
 * together are the bug, and this file refuses to let them come back —
 * anywhere, not only on this screen.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { QuestionRow } from '@/components/coach-questions/QuestionRow';

const APP_ROOT = path.resolve(__dirname, '..');

const QUESTION = {
  questionKey: 'checkin_probe.days_of_irregular_schedule',
  driverId: 'SLP-2',
  prompt: 'How many days this week did your schedule shift?',
  responseType: 'count' as const,
  options: [0, 1, 2, 3],
  storage: 'daily_checkins_column',
  dailyCheckinsColumn: 'irregular_days',
  wearableMetricCode: null,
  requires: [],
  excludes: [],
  priority: 0,
  active: true,
  askedCount: 12,
  answeredCount: 9,
  updatedAt: '2026-08-20T12:00:00.000Z',
};

function classNamesIn(html: string): string[] {
  return [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]!);
}

describe('the question row, as it really renders', () => {
  const html = renderToStaticMarkup(
    <QuestionRow
      question={QUESTION as never}
      drivers={[{ id: 'SLP-2', label: 'Sleep continuity' } as never]}
      onChanged={() => {}}
      onReplaced={() => {}}
    />
  );

  it('renders the long question key that used to set the floor', () => {
    expect(html).toContain('checkin_probe.days_of_irregular_schedule');
  });

  it('the column holding it may shrink below its content', () => {
    expect(classNamesIn(html).some((c) => c.includes('min-w-0') && c.includes('flex-1'))).toBe(true);
  });

  it('the key itself may break rather than push', () => {
    expect(classNamesIn(html).some((c) => c.includes('font-mono') && c.includes('break-all'))).toBe(
      true
    );
  });

  it('no element in the row may refuse to shrink while asking to wrap', () => {
    const offenders = classNamesIn(html).filter(
      (c) => c.includes('shrink-0') && c.includes('flex-wrap')
    );
    expect(offenders).toEqual([]);
  });
});

describe('the same pattern cannot come back anywhere else', () => {
  function tsxFilesUnder(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) tsxFilesUnder(full, out);
      else if (entry.name.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  const files = [
    ...tsxFilesUnder(path.join(APP_ROOT, 'app')),
    ...tsxFilesUnder(path.join(APP_ROOT, 'components')),
  ];

  it('reads a real, non-trivial number of components', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('no className in the app combines shrink-0 with flex-wrap', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const value = match[1] ?? match[2] ?? '';
        // Only a bare `shrink-0` counts. `md:shrink-0` is a decision about
        // a width where the row genuinely fits, which is not this bug.
        if (/(^|\s)shrink-0(\s|$)/.test(value) && /(^|\s)flex-wrap(\s|$)/.test(value)) {
          offenders.push(`${path.relative(APP_ROOT, file)}: ${value.slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
