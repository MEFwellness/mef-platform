/**
 * The real, single-source-of-truth minimum number of scored Root Score
 * calculations app/progress/ProgressRootScorePanel.tsx requires before it
 * shows the Root Score trend chart at all (below it, a progress-to-unlock
 * state renders instead) — you cannot plot a meaningful trend line
 * through fewer than 2 points.
 *
 * Historical note: this used to also be components/RootScoreTrendChart.tsx's
 * own internal line-drawing gate. That component was deleted in the
 * trend-chart range-selector task (2026-07-28) — both Root Score charts
 * now render through components/AnimatedRootScoreTrendChart.tsx ->
 * components/TrendChartCard.tsx / components/TrendChart.tsx, which has its
 * own honest per-range empty/single-point handling (0 real points in the
 * selected window -> a "no data yet" message; exactly 1 -> a single dot,
 * no line) instead of a single all-or-nothing minimum. This constant now
 * exists purely for ProgressRootScorePanel.tsx's own page-level "do we
 * even have enough history to show the chart card yet" decision, decoupled
 * from any specific chart's internals.
 *
 * Deliberately NOT declared inside a 'use client' chart component: Next's
 * React Server Components bundler resolves a client module's exports as
 * opaque client-reference placeholders when read from server-rendered
 * code — fine when the value is passed straight through as JSX (it
 * resolves once it reaches the client), but arithmetic or comparisons
 * against it on the server silently produce NaN/false.
 * ProgressRootScorePanel.tsx (a Server Component) needs real arithmetic
 * with this number, so it lives here instead — a plain module with no
 * client/server boundary.
 */
export const MIN_SCORED_SNAPSHOTS_FOR_TREND = 2;
