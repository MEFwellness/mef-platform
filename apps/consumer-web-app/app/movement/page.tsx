/**
 * Movement Dashboard — The Rooted Reset's Movement Intelligence system.
 *
 * Deliberately does NOT open on a list of exercises. A member sees today's
 * focus, estimated length, recovery status, why the session was chosen,
 * the (placeholder) Movement Score, and weekly-goal progress first — the
 * same "how am I doing / what should I do" framing as Oura/WHOOP, not a
 * workout app's exercise list. Exercises only appear once the member taps
 * into the session itself (app/movement/session/page.tsx).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Clock, PlayCircle, Activity, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getRecentCheckins } from '@/app/actions/checkin';
import {
  getCurrentMovementScore,
  getTodaysMovementSession,
  getWeeklyMovementProgress,
} from '@/app/actions/movement';
import { hasActiveRole } from '@/lib/auth/guards';
import { TodaysFocusLine } from '@/components/focus/TodaysFocusLine';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildMovementEntryContext } from '@/lib/conversation-coach/entryContext';
import { MovementEmptyState } from '@/components/movement/MovementEmptyState';
import { firstNameFrom } from '@/lib/profile/greeting';
import { WhySessionCard } from '@/components/movement/WhySessionCard';
import { MovementStatsGrid } from '@/components/movement/MovementStatsGrid';
import { RECOVERY_STATUS_LABEL, RECOVERY_STATUS_STYLES } from '@/lib/movement/status';
import { CardStack } from '@/components/layout';
import { listActiveSessionTemplates } from '@/lib/movement-sessions/data';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SESSION_CTA_LABEL: Record<string, string> = {
  ready: 'Begin Session',
  in_progress: 'Continue Session',
  completed: 'View Completed Session',
  skipped: 'View Session',
};

export default async function MovementPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, isCoach, recentCheckins, readySessions] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
    getRecentCheckins(12),
    // Root Movement Level 1 (migration 153). Fails closed to an empty
    // list where the templates table does not exist yet, which is what
    // keeps its entry point below from rendering at all.
    listActiveSessionTemplates(supabase),
  ]);
  const readySessionCount = readySessions.length;

  const firstName = firstNameFrom(profile?.display_name);
  const hasEverCheckedIn = recentCheckins.length > 0;

  // All three are independent of each other (none takes the others'
  // result as input) — one Promise.all instead of session waiting on its
  // own round trip before score/weeklyGoal even start.
  const [session, movementScore, weeklyGoal] = hasEverCheckedIn
    ? await Promise.all([getTodaysMovementSession(), getCurrentMovementScore(), getWeeklyMovementProgress()])
    : [null, null, null];

  const recoveryStyles = session ? RECOVERY_STATUS_STYLES[session.recovery_status] : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <TrackSurfaceView surface="movement" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Home" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Movement Intelligence</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Movement
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Intelligently composed for how you&apos;re doing today, not a fixed plan.
          </p>
        </div>

        {/* Screen Layout System (Prompt 2): nav-link cards of one type
            (icon + label + chevron row), sharing the standard card-to-card
            gap via CardStack instead of independently-guessed mt values.

            Root Movement is the only entry here now. The Exercise Library
            and Movement Profile cards that used to sit alongside it were
            removed from the member app entirely: both are internal
            coaching tools and now live on the coach and admin dashboards.
            See lib/auth/staffRouting.ts's STAFF_ONLY_PREFIXES. */}
        <CardStack className="mt-5">
          {/* Root Movement Level 1 (migration 153): six ready-made
              sessions, available to every member with no assessment
              behind them. It sits first in this stack because it is the
              one entry here that a member can act on immediately, and it
              renders regardless of whether she has ever checked in,
              unlike the generated session below.

              Gated on the templates actually existing: before migration
              153 is applied to an environment, listActiveSessionTemplates
              fails closed to an empty list and this entry point does not
              render at all, so the feature ships genuinely dormant rather
              than as a link to an empty screen. */}
          {readySessionCount > 0 && (
          <Link
            href={'/movement/sessions' as Route}
            className={`${CARD} mef-card-lift flex items-center gap-4 p-5 transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
              <PlayCircle className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="flex-1">
              <p className="text-sm font-semibold text-[#1B3A2D]">Root Movement</p>
              <p className="mt-0.5 text-xs text-[#6B7A72]">
                Six ready-made sessions, from ten to twenty minutes
              </p>
            </span>
            <ChevronRight
              className="h-4 w-4 text-[#1B3A2D]/30"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Link>
          )}
        </CardStack>

        <div className="mt-7 space-y-5">
          {!session ? (
            <MovementEmptyState firstName={firstName} />
          ) : (
            <>
              <section className={`${CARD} mef-animate-in relative overflow-hidden p-8 sm:p-10`}>
                <div
                  className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#F5B700]/10"
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full bg-[#1B3A2D]/[0.04]"
                  aria-hidden="true"
                />
                {/* ONE FOCUS (Member Interpretation Layer, 2026-08-17).
                    This line described the SESSION ("Strength & conditioning")
                    under the heading "TODAY'S FOCUS", on a morning when four
                    other screens each named a different focus. It says what it
                    actually is now; TodaysFocusLine below carries the one real
                    focus, read from the Priority Card engine. */}
                <p className="relative text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                  This Session
                </p>
                <h2 className="relative mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
                  {session.focus_summary}
                </h2>

                <div className="relative mt-5 flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${recoveryStyles!.bg} ${recoveryStyles!.text}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${recoveryStyles!.dot}`}
                      aria-hidden="true"
                    />
                    {RECOVERY_STATUS_LABEL[session.recovery_status]}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7A72]">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />~
                    {session.estimated_duration_minutes} min
                  </span>
                </div>

                <Link
                  href={'/movement/session' as Route}
                  className="mef-press relative mt-6 inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
                >
                  <PlayCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  {SESSION_CTA_LABEL[session.status]}
                </Link>
              </section>

              <TodaysFocusLine />

              <WhySessionCard reasons={session.selection_reasons} />

              <MovementStatsGrid movementScore={movementScore} weeklyGoal={weeklyGoal!} />
            </>
          )}
        </div>
      </main>

      <MemberBottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="movement"
        entryContext={buildMovementEntryContext(session)}
      />
    </div>
  );
}
