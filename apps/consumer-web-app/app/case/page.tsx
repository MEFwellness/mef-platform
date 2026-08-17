/**
 * The member's own Case View — her stated reason for joining, framing
 * what's being investigated, what's been ruled out, and how the thing
 * she came for is actually changing. Presentation only: reads from
 * lib/case-view/ (member_goal_selections, member_driver_states,
 * member_pattern_states' correlation findings, daily_checkins,
 * wearable_daily_metrics) and computes nothing — no correlation, no
 * trend, no driver-state logic lives here.
 */

import { redirect } from 'next/navigation';
import { Compass } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyCaseViewAction } from '@/app/actions/caseView';
import { todaysLocalDate } from '@/lib/time/localDate';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { CenterStage } from '@/components/layout';
import { CaseViewBody } from '@/components/case-view/CaseViewBody';
import { fetchTenureCallbackContext } from '@/lib/memory-callback/data';
import { buildTenureCallback } from '@/lib/memory-callback/copy';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';

const SAFETY_STATEMENT =
  "This view is built from your own check-ins. It shows relationships in your data, not medical conclusions or predictions. Nothing here says one thing causes another; it's something to explore with your coach, not a diagnosis.";

/**
 * Screen Layout System (Prompt 2): the "Building your case" state is this
 * page's one genuinely sparse render — a single card, previously hugging
 * the top of the viewport. Same base reasoning as the identical constant
 * in app/root-score/page.tsx and app/root-map/page.tsx, plus this page's
 * own trailing SAFETY_STATEMENT paragraph (~3.5rem with its `mt-6`),
 * which — unlike those two pages — renders after the card regardless of
 * which branch is active, so it needs to be accounted for here too.
 */
const EMPTY_STATE_CHROME_OFFSET_PX = 256;

export default async function CaseViewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // getMyCaseViewAction() resolves its own user/timezone independently —
  // it doesn't need this page's own profile/isCoach reads, so it joins
  // the same Promise.all instead of waiting for them to finish first.
  const [{ data: profile }, isCoach, caseView] = await Promise.all([
    supabase.from('profiles').select('timezone').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
    getMyCaseViewAction(),
  ]);
  const localDate = todaysLocalDate(profile?.timezone ?? 'America/New_York');

  // Root Presence System, requirement 4: a real memory callback (her
  // actual check-in tenure), only worth fetching once there's a real case
  // to attach it to.
  const memoryCallback = caseView
    ? buildTenureCallback(await fetchTenureCallbackContext(supabase, user.id, localDate))
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <TrackSurfaceView surface="your_case" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Your Case</p>
        </div>

        {!caseView ? (
          <CenterStage chromeOffsetPx={EMPTY_STATE_CHROME_OFFSET_PX}>
            <section className="mef-card mef-animate-in p-7">
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                Building your case
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                I don&apos;t have anything to build your case from yet. Complete a check-in and I&apos;ll start filling this in.
              </p>
            </section>
          </CenterStage>
        ) : (
          <div className="mt-3">
            <CaseViewBody caseView={caseView} localDate={localDate} memoryCallback={memoryCallback} />
          </div>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-[#9AA79F]">{SAFETY_STATEMENT}</p>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
