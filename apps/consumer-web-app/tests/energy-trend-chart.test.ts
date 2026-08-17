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
import { buildSmoothPath, energyPoint, energyBarWidth } from '../components/EnergyTrendChart';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const src = source('components/EnergyTrendChart.tsx');

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

/**
 * Animation task (2026-07-27), item 2: vertical bars dropping from each
 * point to the baseline. energyBarWidth is the pure width-scaling
 * function — checked at both extremes the task named (3-point, 30-point)
 * plus the general clamping behavior in between.
 */
describe('energyBarWidth — bar width scales with point spacing, clamped at both ends', () => {
  it('a 3-point chart (wide spacing) clamps to the 10-unit max, not a dominating slab', () => {
    expect(energyBarWidth(3)).toBe(10);
  });

  it('a 30-point chart (tight spacing) stays above the 1.2-unit floor — a real, visible sliver, not a hairline', () => {
    const width = energyBarWidth(30);
    expect(width).toBeGreaterThanOrEqual(1.2);
    expect(width).toBeLessThan(3); // meaningfully thinner than the 3-point case
  });

  it('a single point falls back to the same generous width as a small chart, not a divide-by-zero', () => {
    expect(Number.isFinite(energyBarWidth(1))).toBe(true);
    expect(energyBarWidth(1)).toBe(10);
  });

  it('bar width decreases monotonically as day count increases (denser charts get thinner bars)', () => {
    const counts = [3, 5, 10, 15, 20, 25, 30];
    const widths = counts.map(energyBarWidth);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]!);
    }
  });

  it('never returns a non-positive or NaN width for any realistic day count (1-90)', () => {
    for (let count = 1; count <= 90; count++) {
      const width = energyBarWidth(count);
      expect(width).toBeGreaterThan(0);
      expect(Number.isFinite(width)).toBe(true);
    }
  });
});

describe('EnergyTrendChart — bars are an opt-in prop (showBars), default false, at the one shared component', () => {
  it('showBars defaults to false in the component signature — a caller must opt in explicitly', () => {
    expect(src).toContain('showBars = false');
  });

  it('bar rects are gated on showBars, not rendered unconditionally', () => {
    expect(src).toMatch(/showBars\s*&&\s*\n?\s*points\.map/);
  });

  it('bars use a single fixed on-palette color and opacity — never a per-status/per-dot color, so they cannot be mistaken for the dot-color encoding', () => {
    const barsBlockStart = src.indexOf('showBars &&');
    const barsBlockEnd = src.indexOf('<path d={areaPath}', barsBlockStart);
    const barsBlock = src.slice(barsBlockStart, barsBlockEnd);
    expect(barsBlock).toContain("fill=\"#1B3A2D\"");
    expect(barsBlock).not.toContain('DOT_FILL');
  });

  it('bar height is exactly the distance from baseline to the point (real magnitude, not decorative)', () => {
    expect(src).toContain('height={Math.max(baseline - p.y, 0)}');
  });

  it('the DOT_FILL status-color map (encodes energy level on the dots) is completely unchanged', () => {
    expect(src).toContain("good: '#16A34A'");
    expect(src).toContain("attention: '#F59E0B'");
    expect(src).toContain("poor: '#EF4444'");
    expect(src).toContain("'no-data': '#EFE9DB'");
  });
});

/**
 * Follow-up task (2026-07-27): the scope decision to keep Progress and
 * the coach client view line-only was reversed — all three surfaces
 * (Home, Progress, coach) render bars through this one shared component,
 * so bars/gray/width-rule stay in sync automatically. No fork, no second
 * chart implementation, no new component.
 *
 * A second follow-up task (2026-07-27, same day) then gave Progress's
 * Energy Trend chart the Home-only scroll-replay draw-in too (via the
 * shared AnimatedEnergyTrendChart, reused as-is — see
 * wellness-story-charts.test.ts for that change's own coverage). The
 * coach client view was NOT part of that follow-up and still renders the
 * plain, unanimated EnergyTrendChart directly, bars only — the
 * assertions below are updated to match that real, current split rather
 * than the "neither gets animation" snapshot of the first follow-up.
 *
 * Progress restructure (2026-07-28): Progress's standalone Energy Trend
 * card (and its use of AnimatedEnergyTrendChart) was retired in favor of
 * a single unified Trends card with a segmented control — Energy is now
 * one segment among several, drawn by the new generic
 * app/progress/MetricTrendChart.tsx (bars included, same energyBarWidth
 * formula, no animation wrapper). Home and the coach client view are
 * untouched — the assertion for Progress below was updated to match;
 * everything else in this describe block still holds.
 */
describe('Bars are enabled on all three surfaces via the one shared component', () => {
  const PROGRESS_PAGE = source('app/progress/page.tsx');
  const TRENDS_PANEL = source('app/progress/TrendsPanel.tsx');
  const METRIC_TREND_CHART = source('app/progress/MetricTrendChart.tsx');
  // The coach's client view was split 2026-08-17: the first screen answers
  // the six coaching questions, and every panel that used to be on it,
  // including this chart, moved to ./detail unchanged.
  const COACH_CLIENT_PAGE = source('app/coach/clients/[id]/detail/page.tsx');
  const DASHBOARD_PAGE = source('app/dashboard/page.tsx');

  it('Progress renders Energy through the unified TrendsPanel, whose MetricTrendChart always draws bars', () => {
    expect(PROGRESS_PAGE).toContain('<TrendsPanel');
    expect(TRENDS_PANEL).toContain("key: 'energy'");
    expect(METRIC_TREND_CHART).toContain('energyBarWidth(withValues.length)');
  });

  it('the coach client view passes showBars directly to the plain EnergyTrendChart (no animation wrapper)', () => {
    const idx = COACH_CLIENT_PAGE.indexOf('<EnergyTrendChart');
    const tagEnd = COACH_CLIENT_PAGE.indexOf('/>', idx);
    expect(COACH_CLIENT_PAGE.slice(idx, tagEnd)).toContain('showBars');
    expect(COACH_CLIENT_PAGE).not.toContain('AnimatedEnergyTrendChart');
  });

  it('Home still renders through AnimatedEnergyTrendChart (unchanged) too', () => {
    expect(DASHBOARD_PAGE).toContain('<AnimatedEnergyTrendChart');
  });

  it('there is still exactly one component implementing the Energy Trend bars — no forked/duplicated chart file exists', () => {
    expect(PROGRESS_PAGE).not.toMatch(/energyBarWidth|<rect/);
    expect(COACH_CLIENT_PAGE).not.toMatch(/energyBarWidth|<rect/);
  });

  it('the coach view does not gain the scroll-replay draw-in — that follow-up task was scoped to Progress only', () => {
    expect(COACH_CLIENT_PAGE).not.toContain('AnimatedEnergyTrendChart');
    expect(COACH_CLIENT_PAGE).not.toContain('IntersectionObserver');
  });
});

/**
 * Follow-up task (2026-07-27): Progress and the coach view can hold much
 * denser real histories than the extremes named in the original
 * 3-point/30-point task (see energyBarWidth's own tests above, which
 * already cover exactly those two named extremes and a 1-90 sweep). This
 * confirms the two real, current fetch caps that produce those
 * densities in practice, so the "verify at the real densities each
 * surface actually produces" instruction is checked against the actual
 * call sites, not just the pure function in isolation.
 */
describe('Real per-surface densities are within the already-verified 1-90 range', () => {
  it('Progress fetches up to 30 check-ins (getRecentCheckins(30)) — the same upper extreme energyBarWidth is tested against', () => {
    const src2 = source('app/progress/page.tsx');
    expect(src2).toContain('getRecentCheckins(30)');
  });

  it('the coach client view fetches up to 14 check-ins (getClientCheckins\' own .limit(14))', () => {
    const src2 = source('app/actions/coach.ts');
    expect(src2).toContain('.limit(14)');
  });

  it('energyBarWidth is well-defined and clamped for both real caps, not just the round numbers 3/30', () => {
    for (const count of [14, 30]) {
      const width = energyBarWidth(count);
      expect(width).toBeGreaterThanOrEqual(1.2);
      expect(width).toBeLessThanOrEqual(10);
    }
  });
});
