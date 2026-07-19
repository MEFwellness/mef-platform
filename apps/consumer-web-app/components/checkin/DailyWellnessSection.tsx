/**
 * Today's Wellness — Morning Readiness Score (shown the moment its own
 * required morning inputs exist, independent of everything else) and the
 * Daily Wellness Score (shown only once BOTH Morning Readiness and an
 * Evening Reflection exist for today). Never renders a zero or a
 * placeholder number for either — missing data means the relevant score
 * section simply isn't shown yet, replaced by an honest message. See
 * lib/wellness/morningReadiness.ts and lib/wellness/dailyWellnessScore.ts
 * for the eligibility rules this component only ever displays, never
 * re-derives.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Sunrise, Moon } from 'lucide-react';
import type { DailyCheckin, EveningReflection } from '@mef/shared-types-contracts';
import {
  inputsFromCheckin,
  isMorningReadinessEligible,
  calculateMorningReadinessScore,
} from '@/lib/wellness/morningReadiness';
import {
  isDailyWellnessScoreEligible,
  calculateDailyWellnessScore,
  DAILY_WELLNESS_SCORE_LOCKED_MESSAGE,
} from '@/lib/wellness/dailyWellnessScore';
import { STATUS_STYLES } from '@/lib/wellness/status';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function DailyWellnessSection({
  checkin,
  eveningReflection,
}: {
  checkin: DailyCheckin | null;
  eveningReflection: EveningReflection | null;
}) {
  const morningInputs = inputsFromCheckin(checkin);
  const morningEligible = isMorningReadinessEligible(morningInputs);
  const morning = morningEligible ? calculateMorningReadinessScore(morningInputs) : null;

  const dailyEligible = isDailyWellnessScoreEligible(checkin, eveningReflection);
  const daily = dailyEligible ? calculateDailyWellnessScore(checkin, eveningReflection!) : null;

  if (!morningEligible && !dailyEligible) return null;

  return (
    <div className={`${CARD} p-6`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40">
        Today&apos;s Wellness
      </p>

      {morning && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#1B3A2D]">
            <Sunrise className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-medium">Morning Readiness</p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLES[morning.status].bg} ${STATUS_STYLES[morning.status].text}`}
          >
            {morning.score}
          </span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#1B3A2D]">
          <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-medium">Daily Wellness Score</p>
        </div>
        {daily ? (
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLES[daily.status].bg} ${STATUS_STYLES[daily.status].text}`}
          >
            {daily.score}
          </span>
        ) : (
          <Link
            href={'/checkin/evening' as Route}
            className="text-xs font-medium text-[#1B3A2D] underline underline-offset-2"
          >
            Reflect now
          </Link>
        )}
      </div>
      {!daily && (
        <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
          {DAILY_WELLNESS_SCORE_LOCKED_MESSAGE}
        </p>
      )}
    </div>
  );
}
