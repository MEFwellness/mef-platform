/**
 * FIX 1 guard (2026-08-03): the home greeting, and every other place a
 * member's or coach's name is used, must never fall back to the
 * placeholder word "there" (`?? 'there'`/`?? "there"`) — the exact bug
 * this fix closes ("Good afternoon, there"). lib/profile/greeting.ts's
 * firstNameFrom/greetingHeadline are the one correct pattern now; this
 * guard fails on any future regression back to the old
 * `displayName?.split(' ')[0] ?? 'there'` shape anywhere in the app.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { firstNameFrom, greetingHeadline } from '../lib/profile/greeting';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib'];
const PLACEHOLDER_PATTERN = /\?\?\s*['"]there['"]/;

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function findViolations(): { file: string; line: number }[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs)) walk(abs, files);
  }
  const violations: { file: string; line: number }[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((lineText, i) => {
      if (PLACEHOLDER_PATTERN.test(lineText)) {
        violations.push({ file: path.relative(ROOT, file), line: i + 1 });
      }
    });
  }
  return violations;
}

describe('no "there" placeholder fallback for a member/coach name', () => {
  it('the detection pattern actually matches the historical bug shape (non-vacuous)', () => {
    expect(
      PLACEHOLDER_PATTERN.test("const firstName = profile?.display_name?.split(' ')[0] ?? 'there';")
    ).toBe(true);
    expect(PLACEHOLDER_PATTERN.test('const firstName = firstNameFrom(profile?.display_name);')).toBe(
      false
    );
  });

  it('finds zero remaining `?? \'there\'` fallbacks anywhere in app/components/lib', () => {
    const violations = findViolations();
    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}:${v.line}`).join('\n');
      throw new Error(`Found ${violations.length} "there" placeholder fallback(s):\n${report}`);
    }
    expect(violations).toHaveLength(0);
  });
});

describe('greetingHeadline', () => {
  it('uses the real name, exactly as typed (no capitalization rewriting), when one is on file', () => {
    expect(greetingHeadline('Good afternoon', 'sarah')).toBe('Good afternoon, sarah');
    expect(greetingHeadline('Good afternoon', 'MEF')).toBe('Good afternoon, MEF');
  });

  it('falls back to the greeting alone, with a period and no comma, when no name is on file', () => {
    expect(greetingHeadline('Good afternoon', null)).toBe('Good afternoon.');
  });

  it('never contains the word "there" in the no-name fallback, for any time of day', () => {
    expect(greetingHeadline('Good morning', null).toLowerCase()).not.toContain('there');
    expect(greetingHeadline('Good afternoon', null).toLowerCase()).not.toContain('there');
    expect(greetingHeadline('Good evening', null).toLowerCase()).not.toContain('there');
  });
});

describe('firstNameFrom', () => {
  it('returns the first token of a real display name, unchanged case', () => {
    expect(firstNameFrom('Sarah Connor')).toBe('Sarah');
    expect(firstNameFrom('sarah connor')).toBe('sarah');
  });

  it('returns null for missing/empty/whitespace-only names, never a placeholder', () => {
    expect(firstNameFrom(null)).toBeNull();
    expect(firstNameFrom(undefined)).toBeNull();
    expect(firstNameFrom('')).toBeNull();
    expect(firstNameFrom('   ')).toBeNull();
  });
});
