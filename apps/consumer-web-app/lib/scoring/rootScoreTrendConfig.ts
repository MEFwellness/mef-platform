/**
 * The real, single-source-of-truth minimum number of scored Root Score
 * calculations components/RootScoreTrendChart.tsx needs to draw a line —
 * you cannot plot a line through fewer than 2 points. Confirmed as the
 * only gate this chart uses anywhere in the app by reading
 * app/root-score/page.tsx's own call site, which renders the same chart
 * directly with no additional wrapper condition.
 *
 * Deliberately NOT declared inside RootScoreTrendChart.tsx itself: that
 * file has `'use client'`, and Next's React Server Components bundler
 * resolves a client module's exports as opaque client-reference
 * placeholders when read from server-rendered code — fine when the value
 * is passed straight through as JSX (it resolves once it reaches the
 * client), but arithmetic or comparisons against it on the server
 * silently produce NaN/false. app/progress/ProgressRootScorePanel.tsx (a
 * Server Component) needs to do real arithmetic with this number for its
 * progress-to-unlock state, so the constant lives here instead — a plain
 * module with no client/server boundary — and both
 * RootScoreTrendChart.tsx and ProgressRootScorePanel.tsx import the same
 * value from here rather than either one re-declaring it.
 */
export const MIN_SCORED_SNAPSHOTS_FOR_TREND = 2;
