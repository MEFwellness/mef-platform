'use client';

/**
 * Same wrapper pattern as components/dashboard/AnimatedEnergyTrendChart.tsx
 * (Home's Energy Trend chart): components/ScrollDrawIn.tsx around the
 * plain chart, `showBars` on. Used by both Root Score charts on the
 * member platform — app/progress/ProgressRootScorePanel.tsx and
 * app/root-score/page.tsx — so all three trend charts (Home's Energy
 * Trend, Progress's Root Score, and the Root Score detail page's Root
 * Score Trend) now share the exact same chart component family and
 * animation mechanism, not three different configurations.
 *
 * A prior task gave this its own bespoke animation (a custom `animated`
 * prop on RootScoreTrendChart + components/useChartRevealOnce.ts, firing
 * once per page view instead of replaying like Home). That was reverted
 * here: this task explicitly asks both Root Score charts to animate
 * *exactly* as Home's chart does, and Home's chart genuinely replays its
 * draw-in every time it scrolls back into view (verified live) — "once
 * per page view" was this app's prior deviation from Home, not something
 * Home itself does.
 */

import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { RootScoreTrendChart } from '@/components/RootScoreTrendChart';
import { ScrollDrawIn } from '@/components/ScrollDrawIn';

export function AnimatedRootScoreTrendChart({ snapshots }: { snapshots: RootScoreSnapshot[] }) {
  return (
    <ScrollDrawIn>
      <RootScoreTrendChart snapshots={snapshots} showBars />
    </ScrollDrawIn>
  );
}
