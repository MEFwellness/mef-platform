/**
 * Four-fixes pass (2026-07-27), fix 3: the sleep dial's wrong-values
 * investigation and its actual remedy (a sanity guard), plus the label
 * clipping fix. `isImplausibleSleepWindow` is a pure function (no React,
 * no DOM) so it's exercised directly, not via a source scan — the
 * strongest test this repo's node-only vitest environment can run for
 * this logic. The dial's own rendering (label visibility, handle
 * mapping) is verified live via Playwright, reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isImplausibleSleepWindow,
  durationMinutes,
  parseTimeToMinutes,
} from '../lib/daily-checkin-adaptive/sleepMath';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

describe('isImplausibleSleepWindow — the sleep dial sanity guard (task 3b)', () => {
  it('does not flag a normal night (8h)', () => {
    expect(isImplausibleSleepWindow(8 * 60)).toBe(false);
  });

  it('does not flag a short-but-real night (2h, the plausible lower boundary)', () => {
    expect(isImplausibleSleepWindow(120)).toBe(false);
  });

  it('does not flag a long-but-real night (14h, the plausible upper boundary)', () => {
    expect(isImplausibleSleepWindow(840)).toBe(false);
  });

  it('flags just under the lower boundary (119 minutes)', () => {
    expect(isImplausibleSleepWindow(119)).toBe(true);
  });

  it('flags just over the upper boundary (841 minutes)', () => {
    expect(isImplausibleSleepWindow(841)).toBe(true);
  });

  it('flags the literal reported case: Bedtime 8:35 AM, Wake 12:45 AM -> 16h10m', () => {
    const bedtime = parseTimeToMinutes('08:35')!;
    const wake = parseTimeToMinutes('00:45')!;
    const window = durationMinutes(bedtime, wake);
    expect(window).toBe(970); // 16h10m, confirming the math itself is not the bug -- see SleepArc.tsx's own doc comment
    expect(isImplausibleSleepWindow(window)).toBe(true);
  });

  it('never blocks -- it is a pure predicate, not a validator that throws or rejects', () => {
    expect(() => isImplausibleSleepWindow(9999)).not.toThrow();
    expect(() => isImplausibleSleepWindow(-50)).not.toThrow();
  });

  it('custom thresholds are respected (not hardcoded)', () => {
    expect(isImplausibleSleepWindow(200, 300, 600)).toBe(true);
    expect(isImplausibleSleepWindow(400, 300, 600)).toBe(false);
  });
});

describe('SleepArc.tsx wires the guard into a quiet, non-blocking inline note', () => {
  const arc = source('components/checkin/SleepArc.tsx');

  it('imports and calls isImplausibleSleepWindow, gated on hasValues so it never shows before she has real times', () => {
    expect(arc).toContain('isImplausibleSleepWindow');
    expect(arc).toMatch(/hasValues && isImplausibleSleepWindow\(/);
  });

  it('the note is a plain inline element, not a blocking modal/disabled-Continue mechanism', () => {
    const start = arc.indexOf('isImplausibleSleepWindow(sweepMinutes');
    const block = arc.slice(start - 200, start + 500);
    expect(block).toContain('role="note"');
    expect(block).not.toContain('disabled');
  });
});

describe('label-clipping fix (task 3c): the dial ring is resized with real margin for the quarter labels', () => {
  const arc = source('components/checkin/SleepArc.tsx');

  it('RADIUS is smaller than the old clipping value (92), leaving margin inside the 240-unit viewBox', () => {
    const match = /^const RADIUS = (\d+);/m.exec(arc);
    expect(match).not.toBeNull();
    const radius = Number(match![1]);
    expect(radius).toBeLessThan(92);
    // Quarter-label text sits at RADIUS + 20 (see the render code) --
    // the viewBox half-width is 120, so this asserts a real margin,
    // not just "smaller than before" by an arbitrary amount.
    const labelRadius = radius + 20;
    const marginToEdge = 120 - labelRadius;
    expect(marginToEdge).toBeGreaterThanOrEqual(20);
  });

  it('the quarter-label text offset itself was reduced from the old clipping value (the doc comment may still name +27 as history)', () => {
    expect(arc).toContain('pointOnCircle(angle, RADIUS + 20)');
    expect(arc).not.toContain('const textPoint = pointOnCircle(angle, RADIUS + 27)');
  });
});

describe('no mapping bug found (task 3a) -- documented, not silently assumed', () => {
  it("SleepArc.tsx's own doc comment records the investigation and its conclusion", () => {
    const arc = source('components/checkin/SleepArc.tsx');
    expect(arc).toMatch(/No mapping bug found/);
  });
});
