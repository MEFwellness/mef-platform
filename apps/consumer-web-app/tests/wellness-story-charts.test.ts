/**
 * Trend-chart range-selector task (2026-07-28): all three member-platform
 * trend charts (Home's Energy Trend, Progress's Root Score, the Root
 * Score detail page's Root Score Trend) were unified onto one real shared
 * component pair — components/TrendChart.tsx (the pure chart: value axis,
 * gap-aware line, per-point date labels) and components/TrendChartCard.tsx
 * (owns the 1-week/2-week/1-month range state, slices the already-fetched
 * real data, wraps the chart in the existing components/ScrollDrawIn.tsx
 * animation). Both Root Score charts and Home's Energy Trend chart now
 * render through this same pair, configured only by each metric's real
 * range (energy: 1-5; Root Score: 0-100).
 *
 * This supersedes the prior state this file chronicled: a separate
 * components/RootScoreTrendChart.tsx (deleted — its only two consumers,
 * ProgressRootScorePanel and the Root Score detail page, both now render
 * AnimatedRootScoreTrendChart -> TrendChartCard instead) and Home's
 * Energy Trend chart rendering components/EnergyTrendChart.tsx directly
 * (also replaced, for Home specifically — EnergyTrendChart.tsx itself is
 * completely untouched, since it's still the coach client view's own
 * chart and app/progress/MetricTrendChart.tsx's source of the shared
 * buildSmoothPath/energyBarWidth geometry helpers).
 *
 * No component-rendering harness exists in this repo (plain 'node' vitest
 * environment) — most of this file is a static scan of the fixed source,
 * same discipline as the other chart tests in this suite. Where possible
 * (components/TrendChart.tsx's exported pure functions), this file runs
 * real unit tests instead of a string scan, since that math is now
 * genuinely testable in isolation.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { energyBarWidth } from '../components/EnergyTrendChart';
import {
  computeRangeWindow,
  sliceToWindow,
  groupContiguousRuns,
  selectDateLabelIndices,
  parseLocalDate,
  toLocalDateString,
} from '../components/TrendChart';
import { TREND_RANGE_DAYS, TREND_RANGE_LABELS } from '../components/TrendRangeSelector';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const PROGRESS_PAGE = source('app/progress/page.tsx');
const TRENDS_PANEL = source('app/progress/TrendsPanel.tsx');
const METRIC_TREND_CHART = source('app/progress/MetricTrendChart.tsx');
const PANEL = source('app/progress/ProgressRootScorePanel.tsx');
const ANIMATED_ROOT_SCORE_CHART = source('components/AnimatedRootScoreTrendChart.tsx');
const ANIMATED_ENERGY_CHART = source('components/dashboard/AnimatedEnergyTrendChart.tsx');
const TREND_CHART = source('components/TrendChart.tsx');
const TREND_CHART_CARD = source('components/TrendChartCard.tsx');
const ROOT_SCORE_PAGE = source('app/root-score/page.tsx');
// Split 2026-08-17: the panels moved to ./detail, unchanged.
const COACH_CLIENT_PAGE = source('app/coach/clients/[id]/detail/page.tsx');
const SCORING_ACTIONS = source('app/actions/scoring.ts');

describe('Energy Trend on Progress: retired as its own card, still a segment of the unified Trends card — untouched by this task', () => {
  it('Progress no longer renders the old standalone AnimatedEnergyTrendChart card — it renders the unified TrendsPanel instead', () => {
    expect(PROGRESS_PAGE).toContain('<TrendsPanel');
    expect(PROGRESS_PAGE).not.toContain('AnimatedEnergyTrendChart');
  });

  it('TrendsPanel still defines an Energy segment, reading the same energy_level field', () => {
    expect(TRENDS_PANEL).toContain("key: 'energy'");
    expect(TRENDS_PANEL).toContain("checkinPoints(checkins, 'energy_level')");
  });

  it('the generic MetricTrendChart still reuses EnergyTrendChart\'s pure geometry helpers instead of re-deriving them — out of this task\'s scope, confirmed unchanged', () => {
    expect(METRIC_TREND_CHART).toContain(
      "import { buildSmoothPath, energyBarWidth } from '@/components/EnergyTrendChart'"
    );
    expect(METRIC_TREND_CHART).not.toMatch(/function buildSmoothPath/);
  });
});

describe('components/RootScoreTrendChart.tsx is deleted — fully superseded, no remaining consumer', () => {
  it('the file no longer exists on disk', () => {
    const filePath = path.resolve(__dirname, '..', 'components/RootScoreTrendChart.tsx');
    expect(existsSync(filePath)).toBe(false);
  });

  it('nothing in the app imports it any longer', () => {
    for (const src of [PANEL, ANIMATED_ROOT_SCORE_CHART, ROOT_SCORE_PAGE, COACH_CLIENT_PAGE]) {
      expect(src).not.toContain("from '@/components/RootScoreTrendChart'");
    }
  });
});

describe('components/TrendChart.tsx — the one shared chart behind all three trend charts', () => {
  it('reuses buildSmoothPath and energyBarWidth from EnergyTrendChart rather than re-deriving them', () => {
    expect(TREND_CHART).toContain(
      "import { buildSmoothPath, energyBarWidth } from '@/components/EnergyTrendChart'"
    );
    expect(TREND_CHART).not.toMatch(/function buildSmoothPath/);
  });

  it('every dot is a flat forest green — no status/DOT_FILL color grading, no red or gold anywhere', () => {
    expect(TREND_CHART).not.toContain('DOT_FILL');
    expect(TREND_CHART).not.toContain('#EF4444');
    expect(TREND_CHART).not.toContain('#F59E0B');
    expect(TREND_CHART).not.toContain('#C4A050');
    expect(TREND_CHART).toContain("bg-[#1B3A2D]");
  });

  it('renders a real connecting line per contiguous run of points, not dots alone', () => {
    expect(TREND_CHART).toContain('buildSmoothPath(runPoints)');
    expect(TREND_CHART).toMatch(/<path\s+d=\{linePath\}/);
  });

  it('a gap wider than one real day breaks the line into a new run instead of smoothing over the missing days', () => {
    expect(groupContiguousRuns([0, 1, 2])).toEqual([[0, 1, 2]]);
    expect(groupContiguousRuns([0, 5, 6])).toEqual([[0], [1, 2]]);
    expect(groupContiguousRuns([0, 3, 7])).toEqual([[0], [1], [2]]);
  });

  it('a run of exactly one point never gets a line/area path (guarded in the render, not just left to buildSmoothPath)', () => {
    expect(TREND_CHART).toContain('if (runPoints.length < 2) return null');
  });

  it('renders a real value axis (gridlines + labels) anchored to the caller-provided ticks, not the data\'s own min/max', () => {
    expect(TREND_CHART).toContain('axisTicks.map');
    expect(TREND_CHART).toContain('formatValue(tick)');
  });

  it('zero real points in the window shows an honest message, never a fabricated line', () => {
    expect(TREND_CHART).toContain('points.length === 0');
    expect(TREND_CHART).toContain('{emptyRangeMessage}');
  });

  it('bars are computed from the window\'s total day count, not the sparse point count — so bar width stays sensible regardless of how few real check-ins exist in a wide window', () => {
    expect(TREND_CHART).toContain('energyBarWidth(totalDays)');
  });
});

describe('TrendChart pure date/window math — real unit coverage, not a string scan', () => {
  it('parseLocalDate/toLocalDateString round-trip without a timezone-shift bug', () => {
    expect(toLocalDateString(parseLocalDate('2026-07-28'))).toBe('2026-07-28');
    expect(toLocalDateString(parseLocalDate('2026-01-01'))).toBe('2026-01-01');
  });

  it('computeRangeWindow anchors to the given "today", not the data', () => {
    const { start, end, totalDays } = computeRangeWindow('2026-07-28', 7);
    expect(toLocalDateString(end)).toBe('2026-07-28');
    expect(toLocalDateString(start)).toBe('2026-07-22');
    expect(totalDays).toBe(7);
  });

  it('sliceToWindow keeps only real points inside [start, end] — never fabricates a point for a day with no data', () => {
    const points = [
      { local_date: '2026-07-10', id: 'a' },
      { local_date: '2026-07-22', id: 'b' },
      { local_date: '2026-07-28', id: 'c' },
    ];
    const { start, end } = computeRangeWindow('2026-07-28', 7);
    const sliced = sliceToWindow(points, start, end);
    expect(sliced.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('an empty window slices to an empty array, not an error', () => {
    const { start, end } = computeRangeWindow('2026-07-28', 7);
    expect(sliceToWindow([], start, end)).toEqual([]);
  });

  it('selectDateLabelIndices shows every label when the real measured gap between points already clears minGapPercent', () => {
    const xs = [10, 25, 40, 55, 70]; // 15%-apart points, minGap 12 -> all clear it
    expect(selectDateLabelIndices(xs, 12)).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('selectDateLabelIndices thins a dense, evenly-spaced range down to fit minGapPercent, always keeping the first and last', () => {
    const xs = Array.from({ length: 30 }, (_, i) => 5 + (i / 29) * 90); // 30 points evenly across the plot width
    const indices = selectDateLabelIndices(xs, 16);
    expect(indices.has(0)).toBe(true);
    expect(indices.has(29)).toBe(true);
    const sorted = [...indices].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length - 1; i++) {
      expect(xs[sorted[i]!]! - xs[sorted[i - 1]!]!).toBeGreaterThanOrEqual(16);
    }
  });

  it('regression: real check-ins clustered at the end of a wide window (dense recently, sparse before) no longer prints two visually-adjacent labels back to back', () => {
    // Exactly the shape that overlapped in the live Playwright/DOM
    // measurement check before this fix: a burst of daily check-ins in
    // the last week, sitting inside a 30-day window that also has a few
    // older, far-apart points — the last two points land only ~4% apart
    // in x, well under any real label's pixel width.
    const xs = [5, 14, 24, 29, 34, 36, 38, 40, 44, 46];
    const minGapPercent = 16;
    const indices = [...selectDateLabelIndices(xs, minGapPercent)].sort((a, b) => a - b);
    for (let i = 1; i < indices.length; i++) {
      const gap = xs[indices[i]!]! - xs[indices[i - 1]!]!;
      expect(gap).toBeGreaterThanOrEqual(minGapPercent);
    }
    expect(indices[indices.length - 1]).toBe(xs.length - 1); // the last real point is always labeled
  });

  it('minGapPercent is derived from a real measured container width, not a per-range guess — a wider chart allows more labels, a narrower one thins harder', () => {
    expect(TREND_CHART).toContain('new ResizeObserver(measure)');
    expect(TREND_CHART).toContain('node.clientWidth');
    expect(TREND_CHART).toContain('(DATE_LABEL_PITCH_PX / containerWidthPx) * 100');
  });

  it('regression: every date label uses the same center anchor (-translate-x-1/2) — a live measurement caught a mixed left/center/right anchoring scheme silently requiring a bigger gap than minGapPercent accounted for at the very first point', () => {
    expect(TREND_CHART).not.toContain('-translate-x-full');
    expect(TREND_CHART).toMatch(/className="absolute -translate-x-1\/2 whitespace-nowrap/);
  });

  it('the first/last label is clamped inward (via edgeMarginPercent) rather than switched to a different anchor, so it never renders partly off the chart card', () => {
    expect(TREND_CHART).toContain('Math.min(Math.max(p.x, edgeMarginPercent), 100 - edgeMarginPercent)');
  });
});

describe('components/TrendChartCard.tsx — owns range state, slices real data, never re-fetches', () => {
  it('defaults to the 1-week range', () => {
    expect(TREND_CHART_CARD).toContain("useState<TrendRange>('1w')");
  });

  it('computes the window from the real todayLocalDate prop, then slices the full points array the caller already fetched', () => {
    expect(TREND_CHART_CARD).toContain('computeRangeWindow(todayLocalDate, TREND_RANGE_DAYS[range])');
    expect(TREND_CHART_CARD).toContain('sliceToWindow(points, start, end)');
  });

  it('renders the shared range selector and re-animates via ScrollDrawIn\'s resetKey when the range changes', () => {
    expect(TREND_CHART_CARD).toContain('<TrendRangeSelector value={range} onChange={setRange} />');
    expect(TREND_CHART_CARD).toContain('<ScrollDrawIn resetKey={range}>');
  });

  it('offers exactly the three specified ranges, defaulting to 1 week', () => {
    expect(TREND_RANGE_DAYS).toEqual({ '1w': 7, '2w': 14, '1m': 30 });
    expect(TREND_RANGE_LABELS['1w']).toBe('1 Week');
    expect(TREND_RANGE_LABELS['2w']).toBe('2 Weeks');
    expect(TREND_RANGE_LABELS['1m']).toBe('1 Month');
  });
});

describe('components/TrendRangeSelector.tsx — locked selected-state colors', () => {
  const SELECTOR = source('components/TrendRangeSelector.tsx');

  it('selected pill uses forest green fill with cream text, per the locked design system', () => {
    expect(SELECTOR).toContain('bg-[#1B3A2D] text-[#F5F0E4]');
  });

  it('no gold anywhere in this control', () => {
    expect(SELECTOR).not.toContain('#C4A050');
  });
});

describe('AnimatedRootScoreTrendChart: configured for Root Score\'s real 0-100 range via the shared TrendChartCard', () => {
  it('renders TrendChartCard, not the deleted RootScoreTrendChart', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).toContain('<TrendChartCard');
    expect(ANIMATED_ROOT_SCORE_CHART).toContain("import { TrendChartCard } from '@/components/TrendChartCard'");
  });

  it('anchors the axis to the real, fixed 0-100 Root Score range — never derived from the data\'s own min/max', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).toContain('const ROOT_SCORE_MIN = 0');
    expect(ANIMATED_ROOT_SCORE_CHART).toContain('const ROOT_SCORE_MAX = 100');
  });

  it('builds points only from snapshots with a real (non-null) root_score — never fabricates a value', () => {
    expect(ANIMATED_ROOT_SCORE_CHART).toContain('s.root_score !== null');
  });
});

describe('AnimatedEnergyTrendChart: configured for energy\'s real 1-5 range via the same shared TrendChartCard', () => {
  it('anchors the axis to the real, fixed 1-5 energy range (the check-in form\'s own scale)', () => {
    expect(ANIMATED_ENERGY_CHART).toContain('const ENERGY_MIN = 1');
    expect(ANIMATED_ENERGY_CHART).toContain('const ENERGY_MAX = 5');
  });

  it('builds points only from checkins with a real (non-null) energy_level', () => {
    expect(ANIMATED_ENERGY_CHART).toContain('c.energy_level !== null');
  });
});

describe('useChartRevealOnce: untouched, still a real (separate) dependency of the Trends card — out of this task\'s scope', () => {
  it('still exists and still fires once per page view — MetricTrendChart.tsx (Trends segments) still depends on this exact behavior', () => {
    const REVEAL_HOOK = source('components/useChartRevealOnce.ts');
    expect(REVEAL_HOOK).toContain('observer.disconnect()');
    expect(METRIC_TREND_CHART).toContain(
      "import { useChartRevealOnce } from '@/components/useChartRevealOnce'"
    );
  });
});

describe('Progress page wiring: Root Score chart animated via the panel, real todayLocalDate threaded through', () => {
  it('ProgressRootScorePanel renders AnimatedRootScoreTrendChart with a real todayLocalDate, not the plain chart directly', () => {
    expect(PANEL).toContain('<AnimatedRootScoreTrendChart snapshots={history} todayLocalDate={todayLocalDate} />');
  });

  it('the page resolves a real, timezone-aware local date (same pattern Home and the Root Score detail page already use) and passes it down', () => {
    expect(PROGRESS_PAGE).toContain("resolveLocalDate } from '@/app/actions/checkin'");
    expect(PROGRESS_PAGE).toContain('<ProgressRootScorePanel history={rootScoreHistory} todayLocalDate={localDate} />');
  });
});

describe('Root Score detail page: renders through AnimatedRootScoreTrendChart with a real todayLocalDate — score number stays forest green, not score-driven', () => {
  it('renders through AnimatedRootScoreTrendChart, the same component Progress uses', () => {
    expect(ROOT_SCORE_PAGE).toContain('<AnimatedRootScoreTrendChart snapshots={history} todayLocalDate={localDate} />');
  });

  it('the big score number is a fixed forest green, not driven by scoreToStatus', () => {
    expect(ROOT_SCORE_PAGE).toContain(
      'className="font-[family-name:var(--font-cormorant-garamond)] text-6xl leading-none text-[#1B3A2D]"'
    );
    expect(ROOT_SCORE_PAGE).not.toContain('scoreToStatus');
  });

  it('the change badge (up/down/steady since last calculation) is untouched — a real directional signal, out of this task\'s scope', () => {
    expect(ROOT_SCORE_PAGE).toContain('function ChangeBadge');
    expect(ROOT_SCORE_PAGE).toContain('STATUS_STYLES[status].bg');
  });
});

describe('Scope: the coach client view is completely untouched', () => {
  it('still renders the plain EnergyTrendChart with showBars only — no TrendChartCard, no animation, no Root Score chart', () => {
    expect(COACH_CLIENT_PAGE).toContain('<EnergyTrendChart checkins={chartCheckins} showBars />');
    expect(COACH_CLIENT_PAGE).not.toContain('AnimatedEnergyTrendChart');
    expect(COACH_CLIENT_PAGE).not.toContain('TrendChartCard');
    expect(COACH_CLIENT_PAGE).not.toContain('AnimatedRootScoreTrendChart');
  });
});

describe('Real densities the range selector must handle: Home now fetches 30 days (up from 12), Root Score already fetched 90', () => {
  it('Home fetches up to 30 days of check-ins — enough to cover the widest 1-month range this control offers', () => {
    const dashboardPage = source('app/dashboard/page.tsx');
    expect(dashboardPage).toContain('getRecentCheckins(30)');
  });

  it('getMyRootScoreHistory still defaults to a 90-day window — well beyond the 30-day cap the range selector ever slices to', () => {
    expect(SCORING_ACTIONS).toMatch(/getMyRootScoreHistory\(days = 90\)/);
  });

  it('the reused energyBarWidth stays correctly clamped across every real window size this control uses (7/14/30) plus the 90-day fetch cap', () => {
    for (const count of [7, 14, 30, 90]) {
      const width = energyBarWidth(count);
      expect(width).toBeGreaterThanOrEqual(1.2);
      expect(width).toBeLessThanOrEqual(10);
    }
  });
});
