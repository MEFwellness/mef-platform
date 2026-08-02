/**
 * The Personal Reset Plan's dashboard entry — its own permanent section,
 * never slotted into Active Experiments or the three free-experience
 * branches (this is a monthly-tier plan, not a questionnaire or an
 * experiment). Self-fetching Server Component, same discipline as
 * components/dashboard/ActiveExperimentsSection.tsx: renders nothing at
 * all (not even a heading) when the member has no access, so this zone
 * silently disappears rather than showing an empty state to a free-tier
 * member.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { getMyResetPlanDashboardStateAction } from '@/app/actions/resetPlan';
import { RESET_PLAN_ENTRY_CARD_COPY } from '@/lib/reset-plan/copy';
import { ResetPlanActiveCard } from './ResetPlanActiveCard';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';

const ZONE_LABEL = 'text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40';

export async function PersonalResetPlanCard() {
  const state = await getMyResetPlanDashboardStateAction();

  if (state.kind === 'not_granted') return null;

  return (
    <div>
      <p className={ZONE_LABEL}>Personal Reset Plan</p>
      <div className="mt-4">
        {state.kind === 'before' && (
          <div className={`${CVS_CARD} mef-animate-in p-7`}>
            <p className={`${CVS_DISPLAY_FONT} text-2xl leading-snug text-[#1B3A2D]`}>{RESET_PLAN_ENTRY_CARD_COPY.before.title}</p>
            <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{RESET_PLAN_ENTRY_CARD_COPY.before.body}</p>
            <Link
              href={'/reset-plan' as Route}
              className="mef-focus-ring mt-6 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              {RESET_PLAN_ENTRY_CARD_COPY.before.button}
            </Link>
          </div>
        )}

        {state.kind === 'mid_creation' && (
          <div className={`${CVS_CARD} mef-animate-in p-7`}>
            <p className={`${CVS_DISPLAY_FONT} text-2xl leading-snug text-[#1B3A2D]`}>{RESET_PLAN_ENTRY_CARD_COPY.before.title}</p>
            <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{RESET_PLAN_ENTRY_CARD_COPY.before.body}</p>
            <Link
              href={'/reset-plan' as Route}
              className="mef-focus-ring mt-6 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              {RESET_PLAN_ENTRY_CARD_COPY.midCreation.button}
            </Link>
          </div>
        )}

        {state.kind === 'active' && <ResetPlanActiveCard state={state} />}
      </div>
    </div>
  );
}
