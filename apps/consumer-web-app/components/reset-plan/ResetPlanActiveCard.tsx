'use client';

/**
 * The persistent "Personal Reset Plan" card once a plan is active — the
 * dashboard entry card's third and final state. Shows the plan at a
 * glance, the daily three-explicit-state logger, and (when due) the
 * day-3 check-in / day-7 reflection surfaced right here as their own
 * "From Root" cards, same presentation discipline every other experience
 * uses.
 */

import { useEffect, useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CVS_CARD, CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import { SIGNAL_LABEL } from '@/lib/life-signal-check/constants';
import { READINESS_PATTERN_LABEL } from '@/lib/readiness-pulse/constants';
import { buildResetPlanActionCard, buildResetPlanMissHandlingLine, resetPlanDailyStateLabel } from '@/lib/reset-plan/copy';
import type { ResetPlanDailyState } from '@/lib/reset-plan/constants';
import type { ResetPlanDashboardState } from '@/app/actions/resetPlan';
import { getMyCoachingTonePreferenceAction, logResetPlanDayAction } from '@/app/actions/resetPlan';
import type { CoachingTonePreference } from '@mef/shared-types-contracts';
import { ResetPlanDay3FollowUp, ResetPlanDay7Reflection } from './ResetPlanFollowUpCards';

type ActiveState = Extract<ResetPlanDashboardState, { kind: 'active' }>;

export function ResetPlanActiveCard({ state }: { state: ActiveState }) {
  const { plan, logs } = state;
  const [todayState, setTodayState] = useState<ResetPlanDailyState | null>(state.todayState);
  const [day3Answered, setDay3Answered] = useState(state.day3Answered);
  const [day7Acknowledged, setDay7Acknowledged] = useState(state.day7Acknowledged);
  const [tonePreference, setTonePreference] = useState<CoachingTonePreference>('unclear');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!state.offerDifficultDay) return;
    let cancelled = false;
    (async () => {
      const tone = await getMyCoachingTonePreferenceAction();
      if (!cancelled) setTonePreference(tone);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.offerDifficultDay]);

  if (!plan.focusSignal || !plan.actionTier) return null;

  const card = buildResetPlanActionCard(plan.focusSignal, plan.actionTier);

  function log(newState: ResetPlanDailyState) {
    setError(null);
    startTransition(async () => {
      // The same server action either way — a repeat call for today's
      // local date upserts the existing row (unique (plan_id,
      // local_date)), it never inserts a duplicate.
      const result = await logResetPlanDayAction(plan.id, newState);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTodayState(newState);
      setChanging(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className={`${CVS_CARD} mef-animate-in p-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Your focus</p>
        <p className={`${CVS_DISPLAY_FONT} mt-1 text-2xl leading-snug text-[#1B3A2D]`}>{SIGNAL_LABEL[plan.focusSignal]}</p>
        <p className="mt-1 text-xs text-[#6B7A72]">{READINESS_PATTERN_LABEL[plan.actionTier]} tier</p>

        <div className={`${CVS_GOLD_DIVIDER} my-4`} />

        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{card.action.normal}</p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {todayState !== null && !changing ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[#4F7A63]">
              <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              {resetPlanDailyStateLabel(todayState)}
            </div>
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="mef-focus-ring shrink-0 text-xs font-medium text-[#1B3A2D]/60 underline underline-offset-2 transition hover:text-[#1B3A2D]"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={isPending}
              onClick={() => log('completed_normal')}
              className="mef-focus-ring flex-1 rounded-2xl bg-[#1B3A2D] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
            >
              Normal version
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => log('completed_difficult')}
              className="mef-focus-ring flex-1 rounded-2xl border border-[#1B3A2D]/15 px-4 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] disabled:opacity-50"
            >
              Difficult-day version
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => log('not_today')}
              className="mef-focus-ring flex-1 rounded-2xl border border-[#1B3A2D]/15 px-4 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] disabled:opacity-50"
            >
              Not today
            </button>
          </div>
        )}

        {state.offerDifficultDay && (
          <p className="mt-4 text-sm leading-relaxed text-[#6B7A72]">{buildResetPlanMissHandlingLine(tonePreference, plan.focusSignal)}</p>
        )}
      </div>

      {state.isDay3Eligible && !day3Answered && (
        <ResetPlanDay3FollowUp planId={plan.id} focusSignal={plan.focusSignal} onAnswered={() => setDay3Answered(true)} />
      )}

      {state.isDay7Eligible && !day7Acknowledged && (
        <ResetPlanDay7Reflection planId={plan.id} focusSignal={plan.focusSignal} logs={logs} onAcknowledged={() => setDay7Acknowledged(true)} />
      )}
    </div>
  );
}
