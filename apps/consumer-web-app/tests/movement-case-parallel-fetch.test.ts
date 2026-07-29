/**
 * Guard test for the /movement and /case serial-await fixes (2026-07-29
 * follow-up). Both page components are real Next.js Server Components
 * (top-level `cookies()`/`redirect()`) — they can't be rendered or
 * imported directly in this vitest suite (same constraint documented in
 * tests/setup/test-clients.ts for 'use server' action files), so this is
 * a source-scan guard: it asserts the specific serial-await pattern that
 * was measured as a real bug is gone, and that the independent reads it
 * replaced are joined into one Promise.all instead.
 *
 * Non-vacuous by construction: run this against the pre-fix version of
 * either file (git stash) and it fails, because the serial pattern it
 * checks for absence of is exactly what was there.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');

describe('/movement — session/score/weeklyGoal no longer awaited one at a time', () => {
  const source = readFileSync(path.join(APP_ROOT, 'app/movement/page.tsx'), 'utf-8');

  it('getTodaysMovementSession is not awaited on its own before the score/weeklyGoal Promise.all', () => {
    expect(source).not.toMatch(
      /await getTodaysMovementSession\(\)\s*:\s*null;\s*\n\s*const \[movementScore, weeklyGoal\]/
    );
  });

  it('all three independent reads are joined in one Promise.all', () => {
    expect(source).toMatch(
      /Promise\.all\(\[getTodaysMovementSession\(\),\s*getCurrentMovementScore\(\),\s*getWeeklyMovementProgress\(\)\]\)/
    );
  });
});

describe('/case — getMyCaseViewAction no longer awaited after the profile/isCoach batch', () => {
  const source = readFileSync(path.join(APP_ROOT, 'app/case/page.tsx'), 'utf-8');

  it('getMyCaseViewAction is not a separate trailing await', () => {
    expect(source).not.toMatch(/const localDate = todaysLocalDate\([^)]*\);\s*\n\s*const caseView = await getMyCaseViewAction\(\);/);
  });

  it('getMyCaseViewAction is joined into the page\'s Promise.all batch', () => {
    const match = source.match(/await Promise\.all\(\[([\s\S]*?)\]\);/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain('getMyCaseViewAction()');
  });
});
