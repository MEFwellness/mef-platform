'use client';

/**
 * 2026-07-27 follow-up task ("Your Wellness Story" gets the Home
 * treatment): the Progress page's Root Score chart gets the exact same
 * scroll-triggered draw-in as Home's Energy Trend chart, via the shared
 * components/ScrollDrawIn.tsx (see that file for the full behavior and
 * the zero-width-never-intersects trap it avoids) — not a second
 * implementation. app/root-score/'s own call site keeps rendering the
 * plain RootScoreTrendChart directly (no animation, no bars); this
 * wrapper is only used from app/progress/ProgressRootScorePanel.tsx.
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
