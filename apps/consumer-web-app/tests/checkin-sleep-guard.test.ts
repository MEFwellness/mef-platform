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

describe('the quarter labels are neither clipped by the viewBox nor covered by a handle', () => {
  const arc = source('components/checkin/SleepArc.tsx');

  /** The three numbers the geometry actually depends on, read from the component rather than restated here. */
  function geometry() {
    const radius = /^const RADIUS = (\d+);/m.exec(arc);
    const offset = /^const QUARTER_LABEL_OFFSET = (\d+);/m.exec(arc);
    const handle = /\br=\{(\d+)\}/.exec(arc);
    expect(radius).not.toBeNull();
    expect(offset).not.toBeNull();
    expect(handle).not.toBeNull();
    return {
      radius: Number(radius![1]),
      offset: Number(offset![1]),
      handleRadius: Number(handle![1]),
    };
  }

  it('label text sits inside the 240-unit viewBox with real margin (task 3c: it used to be clipped on all four sides)', () => {
    const { radius, offset } = geometry();
    expect(radius).toBeLessThan(92);
    const marginToEdge = 120 - (radius + offset);
    expect(marginToEdge).toBeGreaterThanOrEqual(20);
  });

  it('label text clears the outer edge of a dragged handle', () => {
    // A handle rides the ring at RADIUS with its own radius, so it reaches
    // RADIUS + handleRadius. The label baseline sits at RADIUS + offset and
    // its glyphs run a few units either side of that. With +20 and a
    // 13-unit handle there were seven units between them, which is nothing
    // once a handle sits a few degrees off a quarter: the default 6:30 AM
    // wake handle covered the "6 AM" label completely.
    const { offset, handleRadius } = geometry();
    expect(offset - handleRadius).toBeGreaterThanOrEqual(14);
  });

  it('every derived offset is expressed in terms of the constant, so the two can never drift apart', () => {
    expect(arc).toContain('pointOnCircle(angle, RADIUS + QUARTER_LABEL_OFFSET)');
    expect(arc).not.toContain('const textPoint = pointOnCircle(angle, RADIUS + 27)');
  });
});

describe('no mapping bug found (task 3a) -- documented, not silently assumed', () => {
  it("SleepArc.tsx's own doc comment records the investigation and its conclusion", () => {
    const arc = source('components/checkin/SleepArc.tsx');
    expect(arc).toMatch(/No mapping bug found/);
  });
});
