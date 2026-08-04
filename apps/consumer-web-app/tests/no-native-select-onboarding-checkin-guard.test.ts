/**
 * FIX 4 guard (2026-08-03): question 13's Yes/No question used to render
 * as a native <select>, which on a phone opens the OS picker over the
 * question text. Every boolean question in onboarding now renders as
 * tappable EnumOptionTile cards instead (app/onboarding/OnboardingForm.tsx).
 * This guard fails if a native <select> is ever reintroduced anywhere in
 * the onboarding questionnaire or the check-in flows — the two surfaces
 * this fix's audit covered. Source-scan, same convention as
 * tests/checkin-chrome-screen-one-only.test.ts, since SSR component tests
 * don't work in this repo.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app/onboarding', 'app/checkin', 'components/checkin'];

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

function findNativeSelects(): { file: string; line: number }[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs)) walk(abs, files);
  }
  const violations: { file: string; line: number }[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((lineText, i) => {
      const trimmed = lineText.trim();
      // Skip comment lines — this guard cares about real JSX, not a
      // sentence like "this used to be a native <select>" describing why
      // it no longer is one.
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      if (/<select[\s>]/.test(lineText)) {
        violations.push({ file: path.relative(ROOT, file), line: i + 1 });
      }
    });
  }
  return violations;
}

describe('no native <select> in onboarding or check-in', () => {
  it('the detection pattern actually matches a native select tag (non-vacuous)', () => {
    expect(/<select[\s>]/.test('<select ref={setRef} onChange={onChange}>')).toBe(true);
    expect(/<select[\s>]/.test('<EnumOptionTile label="Yes" />')).toBe(false);
  });

  it('finds zero native <select> elements in app/onboarding, app/checkin, or components/checkin', () => {
    const violations = findNativeSelects();
    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}:${v.line}`).join('\n');
      throw new Error(`Found ${violations.length} native <select>(s):\n${report}`);
    }
    expect(violations).toHaveLength(0);
  });

  it('the boolean answer_type branch renders EnumOptionTile radio cards, not a select', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/onboarding/OnboardingForm.tsx'), 'utf8');
    const start = src.indexOf("question.answer_type === 'boolean'");
    const end = src.indexOf("if (question.answer_type === 'numeric')");
    expect(start).toBeGreaterThan(-1);
    const booleanBranch = start < end || end === -1 ? src.slice(start, start + 900) : src.slice(start);
    expect(booleanBranch).toContain('role="radiogroup"');
    expect(booleanBranch).toContain('<EnumOptionTile');
    expect(booleanBranch).toContain('label="Yes"');
    expect(booleanBranch).toContain('label="No"');
  });
});
