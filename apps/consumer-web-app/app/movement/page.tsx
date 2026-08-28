/**
 * The Movement screen.
 *
 * WHAT CHANGED, AND WHY IT HAD TO. This screen used to open on a session
 * this app generated for the member on the spot, out of a hardcoded file
 * of sixteen invented exercises with no video and no coaching behind them
 * (lib/movement/exercises/catalog.ts, now deleted). It was written as an
 * architecture demonstration, it was never meant to be served to anybody,
 * and it was being served to everybody. Tapping into it reached a session
 * of exercise names and nothing else.
 *
 * It now opens on the six Root Movement sessions, which are real rows
 * (migration 153) holding real exercises with real video, and on one
 * suggestion drawn from them. The suggestion is made by the same function
 * the Priority Card already uses, so the two can never disagree about
 * which session a member is being pointed at. See
 * lib/movement-sessions/suggestion.ts.
 *
 * The screen claims nothing about her. It says which session is there and
 * how long it takes, which is all this product actually knows.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Clock, PlayCircle, Activity, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { TodaysFocusLine } from '@/components/focus/TodaysFocusLine';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildMovementEntryContext } from '@/lib/conversation-coach/entryContext';
import { firstNameFrom } from '@/lib/profile/greeting';
import { MovementStatsGrid } from '@/components/movement/MovementStatsGrid';
import { CardStack } from '@/components/layout';
import {
  countRecentMovementSessionCompletions,
  getSuggestedMovementSession,
} from '@/lib/movement-sessions/suggestion';
import { formatTargetDuration } from '@/lib/movement-sessions/duration';
import { DEFAULT_WEEKLY_SESSION_TARGET } from '@/lib/movement/score';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { getMyCurrentProgramEntryAction } from '@/app/actions/coach-programs';
import { AssignedProgramsCard } from '@/components/AssignedProgramsCard';
import { getCachedUser } from '@/lib/supabase/currentUser';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function MovementPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  // None of these takes another's result as input, so they go together
  // rather than one waiting on the round trip before it.
  const [{ data: profile }, isCoach, suggestion, completedThisWeek, currentProgram] =
    await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      hasActiveRole(supabase, user.id, 'coach'),
      // Fails closed to null before migration 153 reaches an environment, in
      // which case this screen carries no suggestion rather than a dead link.
      getSuggestedMovementSession(supabase, user.id),
      countRecentMovementSessionCompletions(supabase, user.id),
      // The program her coach built her, if she is on one. It sits ABOVE
      // the Root sessions: something a coach chose for her outranks
      // something this app suggested, and a member with a program must be
      // able to reach it from more than one obvious place.
      getMyCurrentProgramEntryAction(),
    ]);

  const firstName = firstNameFrom(profile?.display_name);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <TrackSurfaceView surface="movement" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Home" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Movement</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Movement
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            {currentProgram
              ? 'Your coach\u2019s program, and six sessions of our own.'
              : `${firstName ? `${firstName}, s` : 'S'}ix sessions, ready when you are.`}
          </p>
        </div>

        <div className="mt-7 space-y-5">
          {/* The same hero card Home leads with, from the same entry, so
              the two screens cannot show her a different program or point
              at a different session. The label that used to sit above it
              is gone: the card says "Your program" in its own eyebrow now,
              and a heading repeating that was one voice too many. */}
          {currentProgram && (
            <AssignedProgramsCard
              program={currentProgram.program}
              nextWorkout={currentProgram.nextWorkout}
              isNew={currentProgram.isNew}
            />
          )}

          {suggestion && (
            <section className={`${CARD} mef-animate-in relative overflow-hidden p-8 sm:p-10`}>
              <div
                className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#C4A050]/25 blur-3xl"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full bg-[#1B3A2D]/[0.06] blur-3xl"
                aria-hidden="true"
              />
              {/* No claim about her, and no claim about what this session
                  will do. It is the one she has gone longest without, and
                  the honest thing to say is that it is available. */}
              <p className="relative text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                There if you want it
              </p>
              <h2 className="relative mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
                {suggestion.summary.template.name}
              </h2>
              <p className="relative mt-3 text-[15px] leading-relaxed text-[#4F645A]">
                {suggestion.summary.template.description}
              </p>

              <div className="relative mt-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7A72]">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  {formatTargetDuration(
                    suggestion.summary.template.target_duration_min_minutes,
                    suggestion.summary.template.target_duration_max_minutes
                  )}
                </span>
                {suggestion.summary.exerciseCount > 0 && (
                  <span className="text-xs font-medium text-[#6B7A72]">
                    {suggestion.summary.exerciseCount} exercises
                  </span>
                )}
              </div>

              <Link
                href={`/movement/sessions/${suggestion.sessionKey}` as Route}
                className="mef-press relative mt-6 inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
              >
                <PlayCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Open this session
              </Link>
            </section>
          )}

          {/* The whole set, one tap away, whether or not a suggestion could
              be made. Gated on a suggestion existing for the same reason it
              always was: before migration 153 reaches an environment there
              are no sessions to list, and a link to an empty screen is worse
              than no link. */}
          {suggestion && (
            <CardStack>
              <Link
                href={'/movement/sessions' as Route}
                className={`${CARD} mef-card-lift flex items-center gap-4 p-5 transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
                  <PlayCircle className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="flex-1">
                  <p className="text-sm font-semibold text-[#1B3A2D]">All Root Movement sessions</p>
                  <p className="mt-0.5 text-xs text-[#6B7A72]">
                    Six sessions, from ten to twenty minutes
                  </p>
                </span>
                <ChevronRight
                  className="h-4 w-4 text-[#1B3A2D]/30"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            </CardStack>
          )}

          {!suggestion && (
            <section className={`${CARD} p-6`}>
              <p className="text-sm leading-relaxed text-[#6B7A72]">
                No sessions are available yet. They will appear here once they are published.
              </p>
            </section>
          )}

          <TodaysFocusLine />

          <MovementStatsGrid
            movementScore={null}
            weeklyGoal={{
              targetSessionsPerWeek: DEFAULT_WEEKLY_SESSION_TARGET,
              completedThisWeek,
              weekStartLocalDate: '',
            }}
          />
        </div>
      </main>

      <MemberBottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="movement"
        entryContext={buildMovementEntryContext(
          suggestion ? suggestion.summary.template.name : null
        )}
      />
    </div>
  );
}
