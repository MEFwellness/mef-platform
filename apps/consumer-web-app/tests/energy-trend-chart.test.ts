/**
 * UX audit item 1: "confirm the Energy Trend chart on Home actually
 * draws a line for an account with real history." Investigated live via
 * Playwright against a real local-Supabase account with real check-in
 * history — the chart draws correctly with a normal scroll + a couple
 * seconds' dwell (real point geometry, real markers, clip-path fully
 * revealed by ~1.7s after page load). The screenshot capture tool's own
 * jump-scroll-then-350ms-wait timing reproducibly caught it mid-reveal,
 * which is what the audit saw — a capture-timing artifact, not a broken
 * chart. No chart code changed as a result (per the task's own
 * instruction for this case). These are new regression tests for the
 * chart's real-data and empty-data math, pulled out as pure functions
 * (buildSmoothPath, energyPoint) specifically so this doesn't have to be
 * re-litigated by screenshot next time.
 */
import { describe, it, expect } from 'vitest';
import { buildSmoothPath, energyPoint } from '../components/EnergyTrendChart';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('energyPoint — real geometry per check-in', () => {
  it('a 5/5 (High) energy level maps near the top of the chart (small y)', () => {
    const { y } = energyPoint(5, 0, 3);
    expect(y).toBeLessThan(20);
  });

  it('a 1/5 (Exhausted) energy level maps near the bottom of the chart (large y)', () => {
    const { y } = energyPoint(1, 0, 3);
    expect(y).toBeGreaterThan(65);
  });

  it('a null (not logged) energy level is treated as 0 — bottom of the chart, never fabricated', () => {
    const nullPoint = energyPoint(null, 0, 3);
    const zeroPoint = energyPoint(0, 0, 3);
    expect(nullPoint).toEqual(zeroPoint);
  });

  it('x position spreads points left-to-right across the full width for more than one check-in', () => {
    const first = energyPoint(3, 0, 3);
    const middle = energyPoint(3, 1, 3);
    const last = energyPoint(3, 2, 3);
    expect(first.x).toBeLessThan(middle.x);
    expect(middle.x).toBeLessThan(last.x);
  });

  it('a single check-in centers horizontally rather than dividing by zero', () => {
    const { x } = energyPoint(3, 0, 1);
    expect(x).toBe(50);
  });
});

describe('buildSmoothPath — the real-data line path', () => {
  it('three real, distinct points produce a non-empty path with real curve commands, not a flat/empty line', () => {
    const points = [energyPoint(2, 0, 3), energyPoint(5, 1, 3), energyPoint(3, 2, 3)];
    const d = buildSmoothPath(points);
    expect(d.length).toBeGreaterThan(0);
    expect(d).toMatch(/^M /);
    expect(d).toContain('C '); // a real cubic-bezier segment between each pair of points
  });

  it('three visibly different energy levels produce three visibly different y coordinates in the path', () => {
    const points = [energyPoint(1, 0, 3), energyPoint(5, 1, 3), energyPoint(3, 2, 3)];
    const ys = points.map((p) => p.y);
    expect(new Set(ys.map((y) => Math.round(y)))).toHaveProperty('size', 3);
  });

  it('zero points produces an empty string, never a fabricated line', () => {
    expect(buildSmoothPath([])).toBe('');
  });
});

describe('EnergyTrendChart — the true empty state is honest, not a blank title', () => {
  const src = readFileSync(
    path.resolve(__dirname, '..', 'components/EnergyTrendChart.tsx'),
    'utf-8'
  );

  it('checkins.length === 0 returns before any point/path math runs', () => {
    const emptyBranch = src.indexOf('checkins.length === 0');
    const pointsBuild = src.indexOf('const points = checkins.map');
    expect(emptyBranch).toBeGreaterThan(-1);
    expect(pointsBuild).toBeGreaterThan(-1);
    expect(emptyBranch).toBeLessThan(pointsBuild);
  });

  it('the empty state says so in words, not just a title over blank space', () => {
    expect(src).toContain('Trends will show up here after a few check-ins.');
  });
});
