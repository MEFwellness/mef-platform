/**
 * Root Score / Momentum / Resilience section of the Progress area — a
 * condensed version of app/root-score/'s own hero + Momentum/Resilience
 * panels, reading the same 90-day history the detail page's trend chart
 * uses. Links out to the full detail experience rather than duplicating
 * the domain breakdown, factors, or "how it works" copy here.
 *
 * "Your Wellness Story" rework: the insufficient-data state used to say
 * "A trend needs a few more calculations before it can appear here" with
 * no way forward — a dead end sitting right next to a real score, which
 * read as broken. Replaced with a progress-to-unlock state: how many
 * real calculations exist, how many are needed, a fill bar, and a link
 * to today's check-in. The "how many are needed" number is
 * MIN_SCORED_SNAPSHOTS_FOR_TREND, imported from
 * lib/scoring/rootScoreTrendConfig.ts (the same constant
 * components/RootScoreTrendChart.tsx itself uses to decide whether it
 * can draw a line — you cannot plot one through fewer than 2 points,
 * confirmed as the only gate that chart uses anywhere in the app by
 * reading app/root-score/page.tsx's own call site, which renders it with
 * no additional wrapper condition). Importing it here rather than
 * hand-copying the number means this empty state can never silently
 * drift out of sync with what the chart itself actually requires. It is
 * NOT imported directly from RootScoreTrendChart.tsx itself: that file
 * has `'use client'`, and a Server Component (this one) reading a plain
 * constant re-exported from a client module gets an opaque
 * client-reference placeholder instead of the real number — arithmetic
 * on it silently produces NaN. Found this the hard way (a live "NaN more
 * check-ins" render) before moving the constant to its own
 * boundary-neutral module.
 */

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { AnimatedRootScoreTrendChart } from '@/components/AnimatedRootScoreTrendChart';
import { MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/lib/scoring/rootScoreTrendConfig';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const MOMENTUM_LABEL: Record<RootScoreSnapshot['momentum_state'], string> = {
  improving: 'Improving',
  declining: 'Declining',
  stable: 'Steady',
  insufficient_data: 'Building',
};

const RESILIENCE_LABEL: Record<RootScoreSnapshot['resilience_state'], string> = {
  building_baseline: 'Building baseline',
  stable: 'Stable',
  recovering: 'Recovering',
  strained: 'Strained',
};

/** Whether enough real (non-null) Root Score calculations exist to draw a trend line, rather than just showing the current number. Exported standalone so the minimum-data floor has real unit coverage. */
export function hasEnoughSnapshotsForTrend(history: RootScoreSnapshot[]): boolean {
  return countScoredSnapshots(history) >= MIN_SCORED_SNAPSHOTS_FOR_TREND;
}

export function countScoredSnapshots(history: RootScoreSnapshot[]): number {
  return history.filter((s) => s.root_score !== null).length;
}

function TrendUnlockProgress({ history }: { history: RootScoreSnapshot[] }) {
  const scoredCount = countScoredSnapshots(history);
  const needed = Math.max(MIN_SCORED_SNAPSHOTS_FOR_TREND - scoredCount, 0);
  const fillPct = Math.min((scoredCount / MIN_SCORED_SNAPSHOTS_FOR_TREND) * 100, 100);

  return (
    <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-4">
      <div className="flex items-center justify-between text-sm font-medium text-[#1B3A2D]">
        <span>
          {scoredCount} of {MIN_SCORED_SNAPSHOTS_FOR_TREND} check-ins
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/10">
        <div
          className="h-full rounded-full bg-[#1B3A2D] transition-[width] duration-500 ease-out"
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]/70">
        {needed} more check-in{needed === 1 ? '' : 's'} and your Root Score trend appears here.
      </p>
      <Link
        href="/checkin"
        className="mt-2 inline-block text-sm font-medium text-[#1B3A2D] hover:underline"
      >
        Go to today&apos;s check-in
      </Link>
    </div>
  );
}

export function ProgressRootScorePanel({
  history,
  todayLocalDate,
}: {
  history: RootScoreSnapshot[];
  todayLocalDate: string;
}) {
  const latest = history.length > 0 ? history[history.length - 1]! : null;

  return (
    <section className={`${CARD} mt-5 p-7`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Root Score</p>
        </div>
        <Link
          href="/root-score"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#1B3A2D] hover:underline"
        >
          Full detail
          <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      {latest && latest.root_score !== null ? (
        <>
          <p className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-5xl leading-none text-[#1B3A2D]">
            {latest.root_score}
            <span className="text-lg font-[family-name:var(--font-dm-sans)] font-normal text-[#6B7A72]">
              {' '}
              / 100
            </span>
          </p>

          {hasEnoughSnapshotsForTrend(history) ? (
            <AnimatedRootScoreTrendChart snapshots={history} todayLocalDate={todayLocalDate} />
          ) : (
            <TrendUnlockProgress history={history} />
          )}

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Momentum
              </p>
              <p className="mt-1 text-sm font-medium text-[#1B3A2D]">
                {latest.momentum_score !== null
                  ? `${latest.momentum_score} · ${MOMENTUM_LABEL[latest.momentum_state]}`
                  : 'Building'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Resilience
              </p>
              <p className="mt-1 text-sm font-medium text-[#1B3A2D]">
                {latest.resilience_score !== null
                  ? `${latest.resilience_score} · ${RESILIENCE_LABEL[latest.resilience_state]}`
                  : RESILIENCE_LABEL.building_baseline}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
          Complete a check-in to start building your Root Score: it summarizes your recovery,
          stress, nutrition, movement, and consistency into one longer-term wellness picture.
        </p>
      )}
    </section>
  );
}
