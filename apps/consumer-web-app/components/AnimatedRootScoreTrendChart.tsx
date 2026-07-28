'use client';

/**
 * "Your Wellness Story" rework: this used to wrap the plain
 * RootScoreTrendChart in components/ScrollDrawIn.tsx. That mechanism
 * replays its wipe every time the chart scrolls back into view — correct
 * for Home's Energy Trend chart, but this task explicitly requires the
 * Root Score trend chart to animate once per page view, not on every
 * scroll pass, and to sequence the dots fading in only after the line
 * finishes drawing. Neither is possible from outside an opaque
 * ScrollDrawIn wrapper, so the animation now lives directly inside
 * RootScoreTrendChart itself (via its own `animated` prop and
 * components/useChartRevealOnce.ts) — this wrapper just opts in.
 * app/root-score/'s own call site does not pass `animated` and is
 * completely unaffected; this wrapper is only used from
 * app/progress/ProgressRootScorePanel.tsx.
 */

import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { RootScoreTrendChart } from '@/components/RootScoreTrendChart';

export function AnimatedRootScoreTrendChart({ snapshots }: { snapshots: RootScoreSnapshot[] }) {
  return <RootScoreTrendChart snapshots={snapshots} showBars animated />;
}
