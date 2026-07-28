/**
 * Root Score charts — unified onto the exact same chart component and
 * animation Home's Energy Trend chart uses (task: "Make both Root Score
 * charts use the same animated chart treatment as the Energy Trend chart
 * on Home").
 *
 * History, briefly, because this file's assertions changed direction
 * more than once: an earlier task gave the Progress page's Root Score
 * chart its own bespoke `animated` prop + components/useChartRevealOnce.ts
 * (a once-per-page-view mechanism, deliberately different from Home's
 * ScrollDrawIn, because that task explicitly asked for different
 * timing). This task asks for the opposite — animate *exactly* as Home
 * does — and investigation found Home's real mechanism
 * (components/ScrollDrawIn.tsx) genuinely replays its draw-in every time
 * the chart scrolls back into view (verified live via Playwright:
 * scrolling the Home Energy Trend chart away and back re-clips it to
 * nearly zero width and redraws it). So the bespoke mechanism was
 * reverted: components/RootScoreTrendChart.tsx is a plain, unanimated
 * chart again (matching components/EnergyTrendChart.tsx's own lack of
 * internal animation logic), and components/AnimatedRootScoreTrendChart.tsx
 * wraps it in the same ScrollDrawIn Home uses. Both Root Score charts
 * (app/progress/ProgressRootScorePanel.tsx and app/root-score/page.tsx)
 * now render through that one wrapper, matching Home's Energy Trend
 * chart's real component and configuration exactly.
 *
 * components/useChartRevealOnce.ts itself is untouched — it's still a
 * real, separate dependency of app/progress/MetricTrendChart.tsx (the
 * Trends card's per-metric charts, out of scope for this task), so it
 * isn't deleted, just no longer used by the Root Score charts.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source; the
 * real replay/reduced-motion/line-vs-dots-only behavior is verified live
 * via Playwright, reported separately.
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
const ANIMATED_ENERGY_CHART = source('components/dashboard/AnimatedEnergyTrendChart.tsx');
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

  it('the generic MetricTrendChart reuses EnergyTrendChart\'s pure geometry helpers instead of re-deriving them', () => {
    expect(METRIC_TREND_CHART).toContain(
      "import { buildSmoothPath, energyBarWidth } from '@/components/EnergyTrendChart'"
    );
    expect(METRIC_TREND_CHART).not.toMatch(/function buildSmoothPath/);
  });
});

describe('RootScoreTrendChart: same component family as EnergyTrendChart, not a duplicate', () => {
  it('reuses buildSmoothPath AND energyBarWidth from EnergyTrendChart — no local copy of either', () => {
    expect(ROOT_SCORE_CHART).toContain(
      "import { buildSmoothPath, energyBarWidth } from '@/components/EnergyTrendChart'"
    );
    expect(ROOT_SCORE_CHART).not.toMatch(/function buildSmoothPath/);
    expect(ROOT_SCORE_CHART).not.toMatch(/function \w*[Bb]arWidth/);
  });

  it('renders a real connecting line between data points — the same <path d={linePath}> approach as EnergyTrendChart, not dots alone', () => {
    expect(ROOT_SCORE_CHART).toContain('const linePath = buildSmoothPath(');
    expect(ROOT_SCORE_CHART).toMatch(/<path\s+d=\{linePath\}/);
  });

  it('showBars defaults to false and gates real bar rects, same pattern as EnergyTrendChart', () => {
    expect(ROOT_SCORE_CHART).toContain('showBars = false');
    expect(ROOT_SCORE_CHART).toMatch(/showBars\s*&&\s*\n?\s*points\.map/);
    const barsIdx = ROOT_SCORE_CHART.indexOf('showBars &&');
    const areaIdx = ROOT_SCORE_CHART.indexOf('<path d={areaPath}');
    expect(barsIdx).toBeGreaterThan(-1);
    expect(areaIdx).toBeGreaterThan(barsIdx);
  });

  it('bar height is exactly the distance from baseline to the point (real magnitude, not decorative)', () => {
    expect(ROOT_SCORE_CHART).toContain('height={Math.max(baseline - p.y, 0)}');
  });

  it('every dot is a flat forest green — no DOT_FILL status-color map, no red anywhere in this chart', () => {
    expect(ROOT_SCORE_CHART).not.toContain('DOT_FILL');
    expect(ROOT_SCORE_CHART).not.toContain("from '@/lib/wellness/wellness-index'");
    expect(ROOT_SCORE_CHART).not.toContain('#EF4444');
    expect(ROOT_SCORE_CHART).toContain('bg-[#1B3A2D]');
  });

  it('no internal animation logic — plain chart, matching EnergyTrendChart\'s own lack of animation; all animation lives in the external wrapper', () => {
    expect(ROOT_SCORE_CHART).not.toContain("from '@/components/useChartRevealOnce'");
    expect(ROOT_SCORE_CHART).not.toMatch(/animated\??:\s*boolean/);
    expect(ROOT_SCORE_CHART).not.toContain('style={{\n              clipPath');
  });

  it('the real minimum this chart requires to draw a line is imported from a boundary-neutral module, not a bare literal or a local declaration', () => {
    expect(ROOT_SCORE_CHART).toContain(
      "import { MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/lib/scoring/rootScoreTrendConfig'"
    );
    expect(ROOT_SCORE_CHART).toContain('withScores.length < MIN_SCORED_SNAPSHOTS_FOR_TREND');
    expect(ROOT_SCORE_CHART).not.toContain('export const MIN_SCORED_SNAPSHOTS_FOR_TREND');
  });

  it('ProgressRootScorePanel (a Server Component) imports that same constant from the boundary-neutral module — NOT from RootScoreTrendChart.tsx itself, which has \'use client\' and would hand it a client-reference placeholder instead of the real number', () => {
    expect(PANEL).toContain(
      "import { MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/lib/scoring/rootScoreTrendConfig'"
    );
    expect(PANEL).not.toContain(
      "MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/components/RootScoreTrendChart'"
    );
  });

  it('the config module itself has no \'use client\' directive — plain, boundary-neutral data', () => {
    const configSrc = source('lib/scoring/rootScoreTrendConfig.ts');
    expect(configSrc).toContain('export const MIN_SCORED_SNAPSHOTS_FOR_TREND = 2');
    expect(configSrc.trimStart().startsWith("'use client'")).toBe(false);
  });
});

describe('AnimatedRootScoreTrendChart: wraps the plain chart in the exact same ScrollDrawIn Home uses', () => {
  it('matches AnimatedEnergyTrendChart\'s own wrapper shape — ScrollDrawIn around the plain chart, showBars on', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).toContain('<ScrollDrawIn>');
    expect(ANIMATED_ROOT_SCORE_CHART).toMatch(
      /<RootScoreTrendChart snapshots={snapshots} showBars \/>/
    );
    expect(ANIMATED_ROOT_SCORE_CHART).toContain("from '@/components/ScrollDrawIn'");
  });

  it('does not define its own IntersectionObserver — proof it reuses the one shared mechanism instead of writing a second one', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).not.toContain('IntersectionObserver');
  });

  it('same wrapper shape as Home\'s AnimatedEnergyTrendChart — ScrollDrawIn is the only thing both files import for animation', () => {
    expect(ANIMATED_ENERGY_CHART).toContain('<ScrollDrawIn>');
    expect(ANIMATED_ENERGY_CHART).toContain("from '@/components/ScrollDrawIn'");
  });
});

describe('ScrollDrawIn: the one real animation mechanism, unchanged, now used by all three trend charts', () => {
  const SCROLL_DRAW_IN = source('components/ScrollDrawIn.tsx');

  it('replays on every scroll pass by design — resets to closed the moment the chart scrolls out of view', () => {
    expect(SCROLL_DRAW_IN).toContain('REPLAY_THRESHOLD');
    expect(SCROLL_DRAW_IN).toContain('if (!entry.isIntersecting && current) return false;');
  });

  it('respects prefers-reduced-motion — skips straight to fully revealed', () => {
    expect(SCROLL_DRAW_IN).toContain('prefers-reduced-motion: reduce');
  });

  it('a 1.1s ease-out clip-path transition — the one real duration/easing every trend chart on the member platform now shares', () => {
    expect(SCROLL_DRAW_IN).toContain("clip-path 1.1s ease-out");
  });
});

describe('useChartRevealOnce: untouched, still a real (separate) dependency of the Trends card — not deleted, not reused by Root Score anymore', () => {
  it('still exists and still fires once per page view — MetricTrendChart.tsx (Trends segments) still depends on this exact behavior', () => {
    const REVEAL_HOOK = source('components/useChartRevealOnce.ts');
    expect(REVEAL_HOOK).toContain('observer.disconnect()');
    expect(METRIC_TREND_CHART).toContain(
      "import { useChartRevealOnce } from '@/components/useChartRevealOnce'"
    );
  });
});

describe('Progress page wiring: Root Score chart animated via the panel', () => {
  it('ProgressRootScorePanel renders AnimatedRootScoreTrendChart, not the plain chart directly', () => {
    expect(PANEL).toContain('<AnimatedRootScoreTrendChart');
    expect(PANEL).not.toMatch(/<RootScoreTrendChart[\s/]/);
  });
});

describe('Root Score detail page: now animated too, unifying with Progress — the score number is forest green, not score-driven', () => {
  it('renders through AnimatedRootScoreTrendChart, not the plain chart — the same component Progress uses', () => {
    expect(ROOT_SCORE_PAGE).toContain('<AnimatedRootScoreTrendChart snapshots={history} />');
    expect(ROOT_SCORE_PAGE).not.toMatch(/<RootScoreTrendChart[\s/]/);
  });

  it('the big score number is a fixed forest green, not driven by scoreToStatus — no UI element on this page renders an ordinary value in red', () => {
    expect(ROOT_SCORE_PAGE).toContain(
      'className="font-[family-name:var(--font-cormorant-garamond)] text-6xl leading-none text-[#1B3A2D]"'
    );
    expect(ROOT_SCORE_PAGE).not.toContain('scoreToStatus');
  });

  it('the change badge (up/down/steady since last calculation) is untouched — a real directional signal, not an ordinary value, out of this task\'s scope', () => {
    expect(ROOT_SCORE_PAGE).toContain('function ChangeBadge');
    expect(ROOT_SCORE_PAGE).toContain("STATUS_STYLES[status].bg");
  });
});

describe('Scope: the coach client view is untouched', () => {
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
