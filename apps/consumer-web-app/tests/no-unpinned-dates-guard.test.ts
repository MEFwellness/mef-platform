/**
 * The bug class closes here, app wide, not screen by screen.
 *
 * B3 fixed the coach side. Build 5's part 2 fixed the member side. Both
 * fixed the same mistake: a date read without saying which timezone reads
 * it. The runtime then decides, and the runtime is UTC on Vercel and the
 * reader's own zone in a browser, so one stored instant becomes two
 * different strings in the two render passes (React #418/#423/#425) and
 * the one the reader keeps is often the wrong day.
 *
 * This walks the whole of app/ and components/ and fails if a new one
 * appears. It is the same shape as tests/no-em-dash-guard.test.ts and
 * tests/root-popup-chain-guards.test.ts: a rule the source itself has to
 * keep passing, rather than a screen somebody remembered to check.
 *
 * TWO RULES.
 *
 * 1. EVERY `toLocale*` CALL NAMES ITS ZONE. Either the call carries a
 *    `timeZone` option, or its receiver is one of the two constructions
 *    that are provably zone-independent:
 *      - `new Date(year, month - 1, day)` from a `YYYY-MM-DD` split, or
 *        `parseLocalDate(...)` / `new Date(\`${d}T00:00:00\`)`, which build
 *        LOCAL midnight and are then formatted in that same LOCAL zone, so
 *        the calendar day survives every zone;
 *      - a plain number's `toLocaleString`, which carries no date at all.
 *
 * 2. NO CLIENT COMPONENT DECIDES A CALENDAR DAY WHILE RENDERING. A file
 *    marked `'use client'` may not contain `new Date().toISOString().slice`
 *    or `getTimezoneOffset()`. Both were real: `MemberProgramsList` split
 *    her sessions on UTC's day, and two edit forms wrote the runtime's own
 *    offset into a `datetime-local` value. The member's day comes from the
 *    server, through lib/time/memberToday.ts, as a prop.
 *
 * If a genuinely new safe form appears, widen the recognised set here and
 * say why. Do not add a bare exception.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app', 'components'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(root));

/**
 * Strips line and block comments, so a header explaining the bug is never
 * mistaken for the bug. Deliberately simple: it is only used to decide
 * whether a line is code, and this codebase has no regex or string
 * literals containing `//` next to a toLocale call.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('*') ? '' : line.replace(/\/\/.*$/, '')))
    .join('\n');
}

/** From the opening paren of a call, the text up to its matching close paren. */
function callArgs(source: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openParen, i + 1);
    }
  }
  return source.slice(openParen);
}

/** A construction whose calendar day cannot change with the runtime's zone. */
const ZONE_INDEPENDENT_RECEIVER = [
  // Local midnight from a YYYY-MM-DD split, formatted in that same local zone.
  /new Date\(\s*year!?\s*,\s*month!?\s*-\s*1\s*,\s*day!?\s*\)\s*\.?$/,
  /parseLocalDate\([^)]*\)\s*\.?$/,
  /new Date\(`\$\{[A-Za-z_$][\w$]*\}T00:00:00`\)\s*\.?$/,
  // A number, not a date.
  /Math\.round\([^)]*\)\s*\.?$/,
];

type Finding = { file: string; snippet: string };

describe('rule 1 — every toLocale* call in app/ and components/ names its timezone', () => {
  it('has no unpinned call', () => {
    const findings: Finding[] = [];

    for (const file of FILES) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const pattern = /\.toLocale(?:Date|Time)?String\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const openParen = source.indexOf('(', match.index);
        const args = callArgs(source, openParen);
        if (args.includes('timeZone')) continue;

        const before = source.slice(Math.max(0, match.index - 160), match.index + 1);
        if (ZONE_INDEPENDENT_RECEIVER.some((re) => re.test(before.replace(/\s+$/, '')))) continue;

        findings.push({
          file,
          snippet: source.slice(Math.max(0, match.index - 60), match.index + args.length).trim(),
        });
      }
    }

    expect(
      findings.map((f) => `${f.file}\n    ${f.snippet.replace(/\s+/g, ' ')}`),
      'each of these formats a date without saying which timezone reads it: pass a timeZone, or route it through lib/time/displayDate.ts'
    ).toEqual([]);
  });

  it('really is looking at the files it thinks it is', () => {
    // A guard that walks an empty tree passes vacuously. These are the two
    // real numbers this rule depends on.
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES.filter((f) => /\.toLocale/.test(readFileSync(f, 'utf8'))).length).toBeGreaterThan(
      15
    );
  });
});

describe('rule 2 — no client component decides a calendar day while rendering', () => {
  const clientFiles = FILES.filter((file) => {
    const head = readFileSync(file, 'utf8').slice(0, 200);
    return /^\s*['"]use client['"]/.test(head);
  });

  it('finds the client components to check', () => {
    expect(clientFiles.length).toBeGreaterThan(100);
  });

  it('none of them computes today from the runtime', () => {
    const offenders = clientFiles.filter((file) => {
      const source = stripComments(readFileSync(file, 'utf8'));
      return (
        /new Date\(\)\s*\.toISOString\(\)\s*\.slice/.test(source) ||
        /getTimezoneOffset\(\)/.test(source)
      );
    });
    expect(
      offenders,
      'a client component renders twice and the two passes are in different zones: take the day as a prop from the server (lib/time/memberToday.ts), or convert with lib/time/localDate.ts'
    ).toEqual([]);
  });
});
