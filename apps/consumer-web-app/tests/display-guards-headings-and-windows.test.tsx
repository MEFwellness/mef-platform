/**
 * The last two display guards of the trust cleanup (2026-08-17).
 *
 *  1. No section heading renders on a member screen with nothing under it.
 *  2. A windowed stat label states the data actually behind the number,
 *     never the size of the window it was pulled from.
 *
 * Neither guard changes a score, a severity or an interpretation. Both
 * change only what a member can be shown.
 *
 * Guard 1 is tested three ways, because a rule about absence is easy to
 * assert and hard to actually hold:
 *  - the primitive's own behaviour, rendered for real through
 *    react-dom/server rather than reasoned about;
 *  - the components that adopted it, also rendered for real with empty
 *    data, asserting the heading text is not in the HTML;
 *  - a sweep of every member-facing screen for the shape that produces
 *    the bug, which fails the build on a new one. The sweep has no
 *    exceptions list on purpose: an allowlist rots, and a guard on a list
 *    that happens never to be empty costs nothing.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WhenNotEmpty, isNotEmpty } from '../components/layout/WhenNotEmpty';
import { ProteinLedgerHistory } from '../components/protein-ledger/ProteinLedgerHistory';
import { DoctorSummaryCards } from '../components/assessments/four-doctors-results/DoctorSummaryCards';
import { recordedDaysLabel } from '../lib/progress/statWindow';

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Guard 1a — the primitive itself
// ---------------------------------------------------------------------------

describe('isNotEmpty', () => {
  it('is false for the three ways a list can be absent', () => {
    expect(isNotEmpty([])).toBe(false);
    expect(isNotEmpty(null)).toBe(false);
    expect(isNotEmpty(undefined)).toBe(false);
  });

  it('is true only for a list with something in it', () => {
    expect(isNotEmpty(['a'])).toBe(true);
    expect(isNotEmpty([0])).toBe(true);
  });
});

describe('WhenNotEmpty', () => {
  const heading = 'WHY THIS SESSION WAS SELECTED';

  function render(items: string[] | null) {
    return renderToStaticMarkup(
      <WhenNotEmpty items={items}>
        {(rows) => (
          <section>
            <p>{heading}</p>
            <ul>
              {rows.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        )}
      </WhenNotEmpty>
    );
  }

  it('renders nothing at all for an empty list, not an empty shell', () => {
    expect(render([])).toBe('');
  });

  it('renders nothing for a null list', () => {
    expect(render(null)).toBe('');
  });

  it('renders the heading and the body together once there is something to say', () => {
    const html = render(['Your sleep was short']);
    expect(html).toContain(heading);
    expect(html).toContain('Your sleep was short');
  });
});

// ---------------------------------------------------------------------------
// Guard 1b — the components that adopted it, rendered for real
// ---------------------------------------------------------------------------

describe('the components the guard was applied to', () => {
  // WhySessionCard used to be checked here as the third example, and it is
  // gone: it explained the generated placeholder movement session, which
  // was retired along with the invented catalog behind it. The rule it
  // demonstrated is unchanged and is still proved by the primitive above
  // and by the two components below.

  it('ProteinLedgerHistory renders nothing rather than "Last 7 days" over an empty box', () => {
    expect(renderToStaticMarkup(<ProteinLedgerHistory days={[]} targetGrams={110} />)).toBe('');
  });

  it('DoctorSummaryCards renders nothing rather than a heading over no cards', () => {
    // `copy` is only ever read inside DoctorCard, which never renders here.
    expect(
      renderToStaticMarkup(<DoctorSummaryCards categories={[]} copy={{} as never} />)
    ).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Guard 1c — the standing sweep
// ---------------------------------------------------------------------------

/**
 * Coach and admin surfaces are out of scope for this guard: it is about
 * what a member is shown. These are the staff component directories that
 * do not live under app/coach or app/admin.
 */
const STAFF_PATHS = /\/(coach|admin|coach-questions|movement-profile)\//;
const SKIP_PATHS = /\/(node_modules|\.next|tests|scripts)\//;

function memberFacingTsxFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (SKIP_PATHS.test(p + '/') || STAFF_PATHS.test(p + '/')) continue;
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx')) out.push(p);
    }
  };
  walk(path.join(ROOT, 'app'));
  walk(path.join(ROOT, 'components'));
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when line `i` sits inside a <WhenNotEmpty> render prop. */
function insideWhenNotEmpty(lines: string[], i: number): boolean {
  let depth = 0;
  for (let k = 0; k < i; k++) {
    depth += (lines[k]!.match(/<WhenNotEmpty[\s>]/g) ?? []).length;
    depth -= (lines[k]!.match(/<\/WhenNotEmpty>/g) ?? []).length;
  }
  return depth > 0;
}

/**
 * The bug's shape: a heading rendered unconditionally, with `x.map(...)`
 * as its immediate next content. Pairing is deliberately tight (the map
 * must follow the heading's own closing tag within a few lines, allowing
 * one wrapper element) because a heading and a list ten lines apart are
 * usually unrelated, and a sweep that cries wolf gets switched off.
 */
function unguardedHeadings(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const hits: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/uppercase tracking-wider/.test(lines[i]!)) continue;
    if (insideWhenNotEmpty(lines, i)) continue;

    let close = i;
    while (close < lines.length && close < i + 6 && !/<\/(p|h[1-4]|span|div)>|\/>/.test(lines[close]!)) {
      close++;
    }

    let subject: string | null = null;
    for (const line of lines.slice(close + 1, close + 5)) {
      const trimmed = line.trim();
      const m = trimmed.match(/^\{\s*([A-Za-z_$][A-Za-z0-9_$.?[\]]*)\.map\(/);
      if (m) {
        subject = m[1]!.replace(/\?$/, '');
        break;
      }
      if (!/^<[a-zA-Z]/.test(trimmed) && trimmed !== '') break;
    }
    if (!subject) continue;

    // A SCREAMING_CASE module constant is fixed content and cannot empty.
    if (/[A-Z]{2,}_|^[A-Z0-9_]+$/.test(subject)) continue;
    const base = subject.split('.').pop()!.replace(/[?[\]]/g, '');
    if (/^[A-Z0-9_]+$/.test(base) || /^\d/.test(base)) continue;

    const near = lines.slice(Math.max(0, i - 45), close + 5).join('\n');
    const above = lines.slice(0, i).join('\n');
    const e = escapeRe(base);

    // Every shape that counts as a real guard.
    if (new RegExp(`${e}[^\\n]{0,60}length\\s*[>!=&?]`).test(near)) continue;
    if (new RegExp(`isNotEmpty\\(\\s*(${escapeRe(subject)}|${e})`).test(src)) continue;
    const derived = [
      ...src.matchAll(new RegExp(`const\\s+([A-Za-z0-9_$]+)\\s*=[^\\n;]*\\b${e}\\b[^\\n;]*\\.length`, 'g')),
    ].map((m) => m[1]!);
    if (derived.some((name) => new RegExp(`\\b${name}\\b\\s*&&`).test(near))) continue;
    if (new RegExp(`(${e}|history|items)[^\\n]{0,40}length\\s*===?\\s*0[\\s\\S]{0,400}return`).test(above)) {
      continue;
    }

    hits.push(`${file.replace(ROOT + '/', '')}:${i + 1} renders a heading straight above ${subject}.map()`);
  }
  return hits;
}

describe('no member-facing heading sits above a body that can be empty', () => {
  it('finds none anywhere under app/ or components/', () => {
    const hits = memberFacingTsxFiles().flatMap(unguardedHeadings);
    expect(hits, hits.join('\n')).toEqual([]);
  });

  /** The sweep is worthless if it cannot see the bug, so prove it can. */
  it('the sweep actually detects the shape it is looking for', () => {
    const fixture = path.join(ROOT, 'tests', '__heading-guard-fixture.tsx');
    fs.writeFileSync(
      fixture,
      [
        'export function Bad({ reasons }: { reasons: string[] }) {',
        '  return (',
        '    <section>',
        '      <p className="text-sm uppercase tracking-wider">Why this was selected</p>',
        '      {reasons.map((r) => (',
        '        <li key={r}>{r}</li>',
        '      ))}',
        '    </section>',
        '  );',
        '}',
        '',
      ].join('\n')
    );
    try {
      expect(unguardedHeadings(fixture)).toHaveLength(1);
    } finally {
      fs.unlinkSync(fixture);
    }
  });
});

// ---------------------------------------------------------------------------
// Guard 2 — a stat label states its real data window
// ---------------------------------------------------------------------------

describe('recordedDaysLabel', () => {
  /** The audit's case: 3 recorded days rendered as "the last 30 recorded days". */
  it('states the real count, never the size of the window it was capped at', () => {
    expect(recordedDaysLabel(3)).toBe('from 3 recorded days');
    expect(recordedDaysLabel(30)).toBe('from 30 recorded days');
  });

  it('says day, not days, for one', () => {
    expect(recordedDaysLabel(1)).toBe('from 1 recorded day');
  });

  it('never contains a hardcoded window size', () => {
    for (const n of [0, 1, 2, 3, 7, 29, 30, 31]) {
      const label = recordedDaysLabel(n);
      expect(label).toContain(String(n));
      if (n !== 30) expect(label).not.toContain('30');
      if (n !== 7) expect(label).not.toContain('7');
    }
  });
});

describe('the Progress energy stat', () => {
  it('no longer hardcodes a 30-day window in its caption', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/progress/ConsistencyPanel.tsx'), 'utf8');
    const renderable = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(renderable).not.toContain('in the last 30 recorded days');
    expect(renderable).toContain('recordedDaysLabel(recordedDays)');
  });

  it('is handed the average’s own denominator by the page, not a constant', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/progress/page.tsx'), 'utf8');
    expect(page).toContain('recordedDays={recentCheckins.length}');
    // The same array the average divides by, so the caption and the number
    // can never describe different data.
    expect(page).toContain('/ recentCheckins.length');
  });

  it('shows the not-enough-data line rather than an average over zero days', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/progress/ConsistencyPanel.tsx'), 'utf8');
    expect(src).toContain('recordedDays > 0');
    expect(src).toContain('Not enough recorded days yet');
  });
});

// ---------------------------------------------------------------------------
// Copy rule
// ---------------------------------------------------------------------------

describe('the copy rule', () => {
  const TOUCHED = [
    'lib/progress/statWindow.ts',
    'app/progress/ConsistencyPanel.tsx',
    'components/layout/WhenNotEmpty.tsx',
  ];

  for (const file of TOUCHED) {
    it(`uses no em dash in any string ${file} can render`, () => {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const strings = src.match(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g) ?? [];
      for (const literal of strings) {
        expect(literal, `${file} has an em dash in ${literal}`).not.toContain('—');
      }
    });
  }
});
