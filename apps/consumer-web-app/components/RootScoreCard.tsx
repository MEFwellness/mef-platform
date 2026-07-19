/**
 * The Root Score living-score object — the dashboard's central heartbeat.
 * Deliberately not a circular progress ring (Oura/Apple/WHOOP already own
 * that shape): a calm number inside a softly breathing glow, sized and
 * paced to read as "a living measurement," not a loading indicator or a
 * gimmick. The glow's color is the same good/attention/poor vocabulary
 * every other score in this app already uses (lib/wellness/status.ts) —
 * a member never has to learn a second color language for this one card.
 *
 * Renders one of two states, never a fabricated number in between: a real
 * score (root_score !== null) or a premium "building your baseline" state
 * that explains what's needed, exactly like every other honest empty
 * state in this app (see FirstCheckInWelcome, WellnessIndexCard).
 */

import Link from 'next/link';
import { ChevronRight, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { scoreToStatus } from '@/lib/wellness/wellness-index';
import { STATUS_STYLES } from '@/lib/wellness/status';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const CONFIDENCE_LABEL: Record<RootScoreSnapshot['root_confidence_level'], string> = {
  building: 'Building your baseline',
  low: 'Low confidence',
  moderate: 'Moderate confidence',
  high: 'High confidence',
};

function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) return null;
  const status = change > 0 ? 'good' : change < 0 ? 'poor' : 'attention';
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${STATUS_STYLES[status].bg} ${STATUS_STYLES[status].text}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {change === 0
        ? 'Steady'
        : `${Math.abs(change)} pt${Math.abs(change) === 1 ? '' : 's'} ${change > 0 ? 'up' : 'down'}`}
    </span>
  );
}

export function RootScoreCard({ snapshot }: { snapshot: RootScoreSnapshot | null }) {
  if (!snapshot || snapshot.root_score === null) {
    return (
      <Link
        href="/root-score"
        className={`${CARD} mef-animate-in block p-7 transition hover:bg-[#FAFAF8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A2D]`}
      >
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Root Score</p>
        </div>
        <h2 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
          Building your Root Score
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          {snapshot?.explanation_summary ||
            'Complete a few check-ins and MEF Wellness will begin calculating your Root Score from real patterns — never a guess.'}
        </p>
        <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#1B3A2D]">
          See what strengthens your score
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </div>
      </Link>
    );
  }

  const status = scoreToStatus(snapshot.root_score);

  return (
    <Link
      href="/root-score"
      className={`${CARD} mef-animate-in group block p-7 transition hover:bg-[#FAFAF8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A2D]`}
      aria-label={`Root Score: ${snapshot.root_score} out of 100. ${CONFIDENCE_LABEL[snapshot.root_confidence_level]}. ${snapshot.explanation_summary} Tap for details.`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Root Score</p>
        </div>
        <ChangeBadge change={snapshot.root_score_change} />
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div
          className="relative flex h-24 w-24 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          <div
            className={`mef-root-score-breathe absolute inset-0 rounded-full ${STATUS_STYLES[status].bg}`}
            style={{ filter: 'blur(7px)' }}
          />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white ring-1 ring-[#1B3A2D]/8">
            <span
              className={`font-[family-name:var(--font-cormorant-garamond)] text-[2.5rem] leading-none ${STATUS_STYLES[status].text}`}
            >
              {snapshot.root_score}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            {CONFIDENCE_LABEL[snapshot.root_confidence_level]}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]">
            {snapshot.explanation_summary}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1 text-sm font-medium text-[#1B3A2D] opacity-70 transition group-hover:opacity-100">
        See your full Root Score
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </div>
    </Link>
  );
}
