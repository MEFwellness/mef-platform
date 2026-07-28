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
 * "Your Wellness Story" rework (2026-07-28, same day): two further
 * changes to this same chart. (1) Dot color used to be driven by
 * `scoreToStatus`/DOT_FILL (good/attention/poor -> green/amber/red) —
 * removed; an ordinary day's Root Score dipping into "attention" or
 * "poor" territory isn't a genuine concern, and red implied an alarm
 * that wasn't real. Every dot is now a flat forest green `#1B3A2D`,
 * matching the Energy Trend segment on the same page. (2) The
 * scroll-triggered draw-in moved from an outer ScrollDrawIn wrapper
 * (components/AnimatedRootScoreTrendChart.tsx) to living directly inside
 * RootScoreTrendChart itself via a new `animated` prop and
 * components/useChartRevealOnce.ts — needed because this task requires
 * the animation to fire once per page view (not replay on every scroll
 * pass, which is what ScrollDrawIn deliberately does for Home) and to
 * sequence the dots fading in only after the line finishes, neither of
 * which is possible from outside an opaque wrapper.
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

  it('bars use a single fixed on-palette color/opacity, same as the dots — no per-status color anywhere in this chart', () => {
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

  it('"Your Wellness Story" rework: the DOT_FILL status-color map is gone — every dot is a flat forest green, not driven by score value', () => {
    expect(ROOT_SCORE_CHART).not.toContain('DOT_FILL');
    expect(ROOT_SCORE_CHART).not.toContain("from '@/lib/wellness/wellness-index'");
    expect(ROOT_SCORE_CHART).not.toContain('#EF4444'); // red — no longer used for ordinary data points
    expect(ROOT_SCORE_CHART).toContain('bg-[#1B3A2D]'); // the dot marker's own flat fill
  });

  it('the real minimum this chart requires to draw a line is a named constant imported from a boundary-neutral module, not a bare literal or a local declaration', () => {
    expect(ROOT_SCORE_CHART).toContain(
      "import { MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/lib/scoring/rootScoreTrendConfig'"
    );
    expect(ROOT_SCORE_CHART).toContain('withScores.length < MIN_SCORED_SNAPSHOTS_FOR_TREND');
    expect(ROOT_SCORE_CHART).not.toContain('export const MIN_SCORED_SNAPSHOTS_FOR_TREND');
  });

  it('ProgressRootScorePanel (a Server Component) imports the same constant from that boundary-neutral module — NOT from RootScoreTrendChart.tsx itself, which has \'use client\' and would hand it a client-reference placeholder instead of the real number', () => {
    expect(PANEL).toContain(
      "import { MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/lib/scoring/rootScoreTrendConfig'"
    );
    expect(PANEL).not.toContain("MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/components/RootScoreTrendChart'");
  });

  it('the config module itself has no \'use client\' directive and no React import — it is plain, boundary-neutral data', () => {
    const configSrc = source('lib/scoring/rootScoreTrendConfig.ts');
    expect(configSrc).toContain('export const MIN_SCORED_SNAPSHOTS_FOR_TREND = 2');
    expect(configSrc.trimStart().startsWith("'use client'")).toBe(false);
  });
});

describe('AnimatedRootScoreTrendChart: "Your Wellness Story" rework — animation now lives inside RootScoreTrendChart itself', () => {
  it('opts into the chart\'s own `animated` prop instead of wrapping it in ScrollDrawIn', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).toContain(
      '<RootScoreTrendChart snapshots={snapshots} showBars animated />'
    );
    expect(ANIMATED_ROOT_SCORE_CHART).not.toContain('<ScrollDrawIn>');
    expect(ANIMATED_ROOT_SCORE_CHART).not.toContain("from '@/components/ScrollDrawIn'");
  });

  it('does not define its own IntersectionObserver — proof it reuses RootScoreTrendChart\'s internal hook instead of writing a second mechanism', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).not.toContain('IntersectionObserver');
  });
});

describe('useChartRevealOnce: a deliberately different mechanism from ScrollDrawIn, not a copy of it', () => {
  const REVEAL_HOOK = source('components/useChartRevealOnce.ts');
  const SCROLL_DRAW_IN = source('components/ScrollDrawIn.tsx');

  it('fires once per page view — disconnects its observer on first reveal rather than resetting on scroll-out', () => {
    expect(REVEAL_HOOK).toContain('observer.disconnect()');
    expect(REVEAL_HOOK).not.toContain('isIntersecting && current');
  });

  it('respects prefers-reduced-motion, same as ScrollDrawIn', () => {
    expect(REVEAL_HOOK).toContain("prefers-reduced-motion: reduce");
  });

  it('ScrollDrawIn itself is untouched — Home\'s replay-on-every-scroll behavior is still intact', () => {
    expect(SCROLL_DRAW_IN).toContain('REPLAY_THRESHOLD');
    expect(SCROLL_DRAW_IN).toContain('if (!entry.isIntersecting && current) return false;');
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
