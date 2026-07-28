/**
 * The member's own Case View — her stated reason for joining, framing
 * what's being investigated, what's been ruled out, and how the thing
 * she came for is actually changing. Presentation only: reads from
 * lib/case-view/ (member_goal_selections, member_driver_states,
 * member_pattern_states' correlation findings, daily_checkins,
 * wearable_daily_metrics) and computes nothing — no correlation, no
 * trend, no driver-state logic lives here.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Compass } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyCaseViewAction } from '@/app/actions/caseView';
import { todaysLocalDate } from '@/lib/time/localDate';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { CaseViewBody } from '@/components/case-view/CaseViewBody';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SAFETY_STATEMENT =
  "This view is built from your own check-ins — it shows relationships in your data, not medical conclusions or predictions. Nothing here says one thing causes another; it's something to explore with your coach, not a diagnosis.";

export default async function CaseViewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, isCoach] = await Promise.all([
    supabase.from('profiles').select('timezone').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);
  const localDate = todaysLocalDate(profile?.timezone ?? 'America/New_York');

  const caseView = await getMyCaseViewAction();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Dashboard
        </Link>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Your Case</p>
        </div>

        {!caseView ? (
          <section className={`${CARD} mef-animate-in mt-3 p-7`}>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
              Building your case
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
              Complete a check-in and this page will start filling in.
            </p>
          </section>
        ) : (
          <div className="mt-3">
            <CaseViewBody caseView={caseView} localDate={localDate} />
          </div>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-[#9AA79F]">{SAFETY_STATEMENT}</p>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
