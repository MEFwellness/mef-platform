/**
 * Root Score / Momentum / Resilience section of the Progress area — a
 * condensed version of app/root-score/'s own hero + Momentum/Resilience
 * panels, reading the same 90-day history the detail page's trend chart
 * uses. Links out to the full detail experience rather than duplicating
 * the domain breakdown, factors, or "how it works" copy here.
 */

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { RootScoreTrendChart } from '@/components/RootScoreTrendChart';

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

export function ProgressRootScorePanel({ history }: { history: RootScoreSnapshot[] }) {
  const latest = history.length > 0 ? history[history.length - 1]! : null;

  return (
    <section className={`${CARD} mt-5 p-6`}>
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
          <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">
            {latest.root_score}
            <span className="text-base font-normal text-[#6B7A72]"> / 100</span>
          </p>
          <RootScoreTrendChart snapshots={history} />

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
          Complete a check-in to start building your Root Score — it summarizes your recovery,
          stress, nutrition, movement, and consistency into one longer-term wellness picture.
        </p>
      )}
    </section>
  );
}
