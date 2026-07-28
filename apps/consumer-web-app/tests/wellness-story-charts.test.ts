/**
 * Follow-up task (2026-07-27): "Your Wellness Story" (the member-facing
 * title of app/progress/page.tsx — already touched once by commit
 * fa5a451, which flipped on `showBars` for this page's Energy Trend
 * chart) gets the full Home treatment on BOTH of its charts — Energy
 * Trend (bars already on, animation added here) and Root Score (neither
 * existed before this task, both built here).
 *
 * Progress restructure (2026-07-28): the standalone, full-width Energy
 * Trend card (and AnimatedEnergyTrendChart, the Home-style wrapper it
 * used) was retired from this page in favor of a single unified Trends
 * card with a segmented control across every metric the check-in and any
 * connected wearable actually capture — Energy is now one segment among
 * several, rendered by the new generic app/progress/MetricTrendChart.tsx
 * rather than the bespoke energy-only chart. That component still reuses
 * EnergyTrendChart's pure geometry helpers (buildSmoothPath,
 * energyBarWidth) instead of re-deriving them, so nothing here got
 * rebuilt twice — the assertions below were updated to match the new,
 * intentional wiring instead of the old one.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source; the
 * real replay/reduced-motion/bar-count-at-90-days behavior is verified
 * live via Playwright, reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { energyBarWidth } from '../components/EnergyTrendChart';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const PROGRESS_PAGE = source('app/progress/page.tsx');
const TRENDS_PANEL = source('app/progress/TrendsPanel.tsx');
const METRIC_TREND_CHART = source('app/progress/MetricTrendChart.tsx');
const PANEL = source('app/progress/ProgressRootScorePanel.tsx');
const ROOT_SCORE_CHART = source('components/RootScoreTrendChart.tsx');
const ANIMATED_ROOT_SCORE_CHART = source('components/AnimatedRootScoreTrendChart.tsx');
const ROOT_SCORE_PAGE = source('app/root-score/page.tsx');
const COACH_CLIENT_PAGE = source('app/coach/clients/[id]/page.tsx');
const SCORING_ACTIONS = source('app/actions/scoring.ts');

describe('Energy Trend on Progress: retired as its own card, now a segment of the unified Trends card', () => {
  it('Progress no longer renders the old standalone AnimatedEnergyTrendChart — it renders the unified TrendsPanel instead', () => {
    expect(PROGRESS_PAGE).toContain('<TrendsPanel');
    expect(PROGRESS_PAGE).not.toContain('AnimatedEnergyTrendChart');
  });

  it('TrendsPanel defines an Energy segment, defaulted to active, reading the same energy_level field the old chart read', () => {
    expect(TRENDS_PANEL).toContain("key: 'energy'");
    expect(TRENDS_PANEL).toContain("checkinPoints(checkins, 'energy_level')");
    expect(TRENDS_PANEL).toContain("useState('energy')");
  });

  it('the new generic MetricTrendChart reuses EnergyTrendChart\'s pure geometry helpers instead of re-deriving them', () => {
    expect(METRIC_TREND_CHART).toContain(
      "import { buildSmoothPath, energyBarWidth } from '@/components/EnergyTrendChart'"
    );
    expect(METRIC_TREND_CHART).not.toMatch(/function buildSmoothPath/);
  });
});

describe('Root Score chart: gains showBars (opt-in, default false) — nothing built twice', () => {
  it('showBars defaults to false, same pattern as EnergyTrendChart', () => {
    expect(ROOT_SCORE_CHART).toContain('showBars = false');
  });

  it('bar rects are gated on showBars, rendered before the area/line so they sit furthest back', () => {
    expect(ROOT_SCORE_CHART).toMatch(/showBars\s*&&\s*\n?\s*points\.map/);
    const barsIdx = ROOT_SCORE_CHART.indexOf('showBars &&');
    const areaIdx = ROOT_SCORE_CHART.indexOf('<path d={areaPath}');
    expect(barsIdx).toBeGreaterThan(-1);
    expect(areaIdx).toBeGreaterThan(barsIdx);
  });

  it('reuses energyBarWidth from EnergyTrendChart instead of re-deriving the width formula', () => {
    expect(ROOT_SCORE_CHART).toContain(
      "import { energyBarWidth } from '@/components/EnergyTrendChart'"
    );
    expect(ROOT_SCORE_CHART).not.toMatch(/function \w*[Bb]arWidth/);
  });

  it('bars use a single fixed on-palette color/opacity — never a per-status color, so the dots alone still encode Root Score status', () => {
    const barsBlockStart = ROOT_SCORE_CHART.indexOf('showBars &&');
    const barsBlockEnd = ROOT_SCORE_CHART.indexOf('<path d={areaPath}', barsBlockStart);
    const barsBlock = ROOT_SCORE_CHART.slice(barsBlockStart, barsBlockEnd);
    expect(barsBlock).toContain('fill="#1B3A2D"');
    expect(barsBlock).toContain('fillOpacity={0.14}');
    expect(barsBlock).not.toContain('DOT_FILL');
  });

  it('bar height is exactly the distance from baseline to the point (real magnitude, not decorative)', () => {
    expect(ROOT_SCORE_CHART).toContain('height={Math.max(baseline - p.y, 0)}');
  });

  it('the DOT_FILL status-color map (encodes Root Score status on the dots) is completely unchanged', () => {
    expect(ROOT_SCORE_CHART).toContain("good: '#16A34A'");
    expect(ROOT_SCORE_CHART).toContain("attention: '#F59E0B'");
    expect(ROOT_SCORE_CHART).toContain("poor: '#EF4444'");
    expect(ROOT_SCORE_CHART).toContain("'no-data': '#EFE9DB'");
  });
});

describe('AnimatedRootScoreTrendChart: reuses the shared ScrollDrawIn, not a second observer', () => {
  it('wraps RootScoreTrendChart (with showBars) in ScrollDrawIn', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).toContain('<ScrollDrawIn>');
    expect(ANIMATED_ROOT_SCORE_CHART).toMatch(
      /<RootScoreTrendChart snapshots={snapshots} showBars \/>/
    );
  });

  it('does not define its own IntersectionObserver/threshold — proof it reuses the shared mechanism instead of writing a second one', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).not.toContain('IntersectionObserver');
    expect(ANIMATED_ROOT_SCORE_CHART).not.toContain('REPLAY_THRESHOLD');
  });

  it('imports ScrollDrawIn from the shared top-level location, not a copy under components/dashboard/', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).toContain("from '@/components/ScrollDrawIn'");
  });
});

describe('Progress page wiring: both charts animated, via the panel and the page itself', () => {
  it('ProgressRootScorePanel renders AnimatedRootScoreTrendChart, not the plain chart', () => {
    expect(PANEL).toContain('<AnimatedRootScoreTrendChart');
    expect(PANEL).not.toMatch(/<RootScoreTrendChart[\s/]/);
  });
});

describe('Scope: root-score detail page and the coach client view are untouched', () => {
  it('app/root-score/ still renders the plain RootScoreTrendChart directly — no bars, no animation added there', () => {
    expect(ROOT_SCORE_PAGE).toContain('<RootScoreTrendChart snapshots={history} />');
    expect(ROOT_SCORE_PAGE).not.toContain('AnimatedRootScoreTrendChart');
    expect(ROOT_SCORE_PAGE).not.toContain('showBars');
  });

  it('the coach client view still renders the plain EnergyTrendChart with showBars only — no animation added there', () => {
    expect(COACH_CLIENT_PAGE).toContain('<EnergyTrendChart checkins={chartCheckins} showBars />');
    expect(COACH_CLIENT_PAGE).not.toContain('AnimatedEnergyTrendChart');
    expect(COACH_CLIENT_PAGE).not.toContain('RootScoreTrendChart');
  });
});

describe('Root Score real density: Progress fetches up to 90 days, well beyond Energy Trend\'s 30', () => {
  it('getMyRootScoreHistory defaults to a 90-day window', () => {
    expect(SCORING_ACTIONS).toMatch(/getMyRootScoreHistory\(days = 90\)/);
  });

  it('Progress calls it with no override, so it gets the full 90-day cap', () => {
    expect(PROGRESS_PAGE).toContain('getMyRootScoreHistory(90)');
  });

  it('the reused energyBarWidth stays correctly clamped at 90 points, the longest real density this page produces', () => {
    const width = energyBarWidth(90);
    expect(width).toBeGreaterThanOrEqual(1.2);
    expect(width).toBeLessThanOrEqual(10);
    // Denser than the 30-point case already verified elsewhere — bars should be at or near the thin-end floor.
    expect(width).toBeLessThan(energyBarWidth(30));
  });
});
