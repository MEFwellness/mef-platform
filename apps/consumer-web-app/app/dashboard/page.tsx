/**
 * apps/consumer-web-app/app/dashboard/page.tsx
 *
 * Home dashboard redesign — visual and structural redesign only. Every
 * section that existed before still exists, reads the exact same data,
 * and says the exact same things; what changed is how it's grouped and
 * presented. Previously: a plain header, a greeting, then 12+ visually
 * identical white rounded cards stacked straight down the page with no
 * rhythm. Now:
 *
 *   - A full-bleed photographic hero (components/dashboard/HomeHero.tsx)
 *     replaces the plain header + white Root Score card at the top.
 *   - Every remaining section is grouped into labeled zones, in this
 *     order: Quick Actions, Today, Your Path, What Root Is Noticing,
 *     Trends, Coming Up.
 *   - No two consecutive sections use the same visual treatment — the
 *     page rotates between full-bleed color panels, plain list rows,
 *     horizontal carousels, image-backed cards, and white cards (now the
 *     minority, not the default).
 *   - Each zone fades/rises into place as it scrolls into view
 *     (components/dashboard/RevealOnScroll.tsx), staggered slightly zone
 *     to zone. Respects prefers-reduced-motion throughout.
 *
 * Nothing about data fetching, the two Promise.all batches, or any
 * server action call changed — only the JSX below them.
 */

import { Suspense } from 'react';
import { Moon, Activity, Bone, Calendar, Smile, Utensils, Footprints, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { redirect } from 'next/navigation';
import { getTodaysCheckin, getRecentCheckins, resolveLocalDate } from '@/app/actions/checkin';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { calculateWellnessIndex, inputsFromCheckin } from '@/lib/wellness/wellness-index';
import { getMyRootScore } from '@/app/actions/scoring';
import { buildDashboardEntryContext } from '@/lib/conversation-coach/entryContext';
import { buildTimeContext } from '@/lib/feed/timeContext';
import { getMyWearableConnections } from '@/app/actions/wearables';
import { getMyCoachingDecision } from '@/app/actions/coaching-brain';
import { getMyMorningBrief } from '@/app/actions/coaching-engine';
import { ConnectWearableCard } from '@/components/wearables/ConnectWearableCard';
import { WearableWelcomeModal } from '@/components/wearables/WearableWelcomeModal';
import { WearableStatsRow } from '@/app/today/WearableStatsRow';
import { MorningBriefCard } from '@/components/MorningBriefCard';
import { FirstCheckInWelcome } from '@/components/FirstCheckInWelcome';
import { FirstCheckinTransition } from '@/components/FirstCheckinTransition';
import { ComprehensiveAssessmentCard } from '@/components/ComprehensiveAssessmentCard';
import { MovementAssessmentCard } from '@/components/MovementAssessmentCard';
import { AssignedProgramsCard } from '@/components/AssignedProgramsCard';
import { getMyAssignedWorkoutsAction } from '@/app/actions/coach-programs';
import { getMyBaselineAssessment } from '@/app/actions/onboarding';
import { getMyAssessmentsAction } from '@/app/actions/body-assessment';
import { getTodaysHydrationTotal } from '@/app/actions/events';
import { getTodaysEveningReflection } from '@/app/actions/eveningReflection';
import { HydrationTracker } from '@/components/checkin/HydrationTracker';
import { DailyWellnessSection } from '@/components/checkin/DailyWellnessSection';
import { getMyQuestionnaireCatalog } from '@/app/actions/questionnaireCatalog';
import { QuestionnairesHomeCard } from '@/components/questionnaires/QuestionnairesHomeCard';
import { WhatWereNoticingCard } from '@/components/dashboard/WhatWereNoticingCard';
import { RootMapCard } from '@/components/RootMapCard';
import { RecommendationsCard } from '@/components/dashboard/RecommendationsCard';
import { CoachingMessageCard } from '@/components/dashboard/CoachingMessageCard';
import { HomeHero } from '@/components/dashboard/HomeHero';
import { QuickActionsGrid } from '@/components/dashboard/QuickActionsGrid';
import { RevealOnScroll } from '@/components/dashboard/RevealOnScroll';
import { AnimatedEnergyTrendChart } from '@/components/dashboard/AnimatedEnergyTrendChart';
import {
  stressStatus,
  painStatus,
  sleepQualityStatus,
  sleepDurationStatus,
  moodStatus,
  digestionStatus,
  movementStatus,
  STATUS_STYLES,
} from '@/lib/wellness/status';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const TRACKER_CARD = `${CARD} flex min-h-[172px] flex-col p-5`;
const ZONE_LABEL = 'text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40';

/** Suspense fallback for each "What Root Is Noticing" carousel tile, shaped like the real tile so the row doesn't jump once its own fetch resolves. */
function NoticingTileSkeleton() {
  return (
    <div className="aspect-[3/4] w-[172px] shrink-0 animate-pulse rounded-[24px] bg-[#1B3A2D]/10" />
  );
}

function formatCompletedStatus(completedAt: string): string {
  const days = Math.floor((Date.now() - new Date(completedAt).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Completed today';
  if (days === 1) return 'Completed yesterday';
  return `Completed ${days} days ago`;
}

function stressLabel(level: number | null): string {
  if (level === null) return 'Not logged yet';
  if (level <= 2) return 'Low';
  if (level === 3) return 'Moderate';
  return 'High';
}

function painLabel(level: number | null): string {
  if (level === null) return 'Not logged yet';
  if (level === 0) return 'None';
  if (level === 1) return 'Mild';
  if (level <= 3) return 'Moderate';
  return 'Severe';
}

function moodLabel(level: number | null): string {
  if (level === null) return 'Not logged yet';
  if (level <= 2) return 'Low';
  if (level === 3) return 'Neutral';
  return 'Good';
}

function digestionLabel(level: number | null): string {
  if (level === null) return 'Not logged yet';
  if (level <= 2) return 'Poor';
  if (level === 3) return 'Fair';
  return 'Good';
}

function movementLabel(level: 'none' | 'light' | 'moderate' | 'full_session' | null): string {
  if (level === null) return 'Not logged yet';
  if (level === 'none') return 'None';
  if (level === 'light') return 'Light';
  if (level === 'moderate') return 'Moderate';
  return 'Full session';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { firstCheckin?: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  // These seven are independent reads (each action call resolves its own
  // user internally and touches none of the others' data), so batching
  // them removes serial network round trips that were previously paid one
  // after another before the page could render, the single biggest
  // fixable cause of this page feeling slow to open. Wearable
  // discoverability (Premium Product Pass): a connected wearable replaces
  // the "unlock" pitch with today's real recovery numbers; no connection
  // at all also triggers the one-time welcome modal below.
  //
  // getMyCoachingDecision/getMyMorningBrief moved to the second batch
  // below (they need timezone, which this batch is what resolves) instead
  // of each independently re-querying profiles for the same row this
  // batch already reads. See the optional `timezone` param on both.
  const [
    { data: profile },
    isCoach,
    wearableConnections,
    baseline,
    bodyAssessments,
    questionnaireCatalog,
    assignedWorkouts,
  ] = await Promise.all([
    supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
    getMyWearableConnections(),
    getMyBaselineAssessment(),
    getMyAssessmentsAction(),
    getMyQuestionnaireCatalog(),
    getMyAssignedWorkoutsAction(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingAssignedWorkouts = assignedWorkouts
    .filter((w) => w.scheduled_date >= today && w.status !== 'completed' && w.status !== 'skipped')
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const movementAnalyzed = bodyAssessments.some((a) => a.completed_at !== null);
  const hasConnectedWearable = wearableConnections.some((c) => c.status === 'connected');

  // Quick Actions status lines — real data already fetched above, never a
  // new query. bodyAssessments is ordered newest-first (see
  // lib/body-assessment/data.ts), so the first completed one is the most
  // recent.
  const caseStatus =
    questionnaireCatalog.totalCount > 0
      ? `${questionnaireCatalog.completedCount} of ${questionnaireCatalog.totalCount} complete`
      : null;
  const latestAnalyzedAssessment = bodyAssessments.find((a) => a.completed_at !== null);
  const movementActionStatus = latestAnalyzedAssessment
    ? formatCompletedStatus(latestAnalyzedAssessment.completed_at!)
    : null;

  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const localDate = await resolveLocalDate(nowInTz, false);
  const timeContext = buildTimeContext(nowInTz);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  // recentCheckins doesn't depend on localDate, so it joins the rest of
  // this batch (which does) instead of a separate round trip.
  // rootScoreSnapshot reads today's already-calculated snapshot (or
  // calculates it once, the first time it's asked for today) — see
  // lib/scoring/service.ts; it never recalculates on every render.
  const [
    todaysCheckin,
    recentCheckins,
    rootScoreSnapshot,
    hydrationTotal,
    eveningReflection,
    decision,
    morningBrief,
  ] = await Promise.all([
    getTodaysCheckin(localDate),
    getRecentCheckins(30),
    getMyRootScore(localDate, timezone),
    getTodaysHydrationTotal(timezone),
    getTodaysEveningReflection(timezone),
    getMyCoachingDecision(timezone),
    getMyMorningBrief(timezone, profile?.display_name),
  ]);

  const wellnessIndex = calculateWellnessIndex(inputsFromCheckin(todaysCheckin));
  const hasCheckins = recentCheckins.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      {/* -------------------------------------------------------- */}
      {/* Hero — full-bleed, edge to edge, sits above the padded     */}
      {/* main column entirely so the photo can reach the true       */}
      {/* viewport edges. See components/dashboard/HomeHero.tsx.      */}
      {/* -------------------------------------------------------- */}
      <HomeHero
        firstName={firstName}
        greetingWord={timeContext.greetingWord}
        snapshot={rootScoreSnapshot}
        hasCheckins={hasCheckins}
      />

      <main className="mx-auto w-full max-w-md px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        {!hasCheckins ? (
          /* Premium UX Milestone 2: before a member's first completed
           check-in, Root has nothing real to personalize yet — one
           welcome moment with a single CTA replaces what would
           otherwise be an empty brief, an empty wearable pitch, an
           empty wellness index, seven "Not logged yet" tracker cards,
           and an empty trend chart all stacked on top of each other.
           A short gap here (not the zones' generous spacing below) —
           the hero above is already compact in this state, sized so
           this card's CTA sits within the first screen. */
          <div className="pt-3">
            <FirstCheckInWelcome />
          </div>
        ) : (
          <div className="pt-8 md:pt-10">
            {/* ==================================================== */}
            {/* Quick Actions — Case and Movement, as two capsule       */}
            {/* pills. Food Lens and Progress moved to the bottom nav;  */}
            {/* Flag a Concern moved out of Quick Actions entirely.     */}
            {/* See components/dashboard/QuickActionsGrid.tsx.          */}
            {/* ==================================================== */}
            <RevealOnScroll>
              <p className={ZONE_LABEL}>Quick Actions</p>
              <div className="mt-3">
                <QuickActionsGrid caseStatus={caseStatus} movementStatus={movementActionStatus} />
              </div>
            </RevealOnScroll>

            {/* ==================================================== */}
            {/* Today — Root's Daily Brief, coach-assigned workouts,    */}
            {/* the Morning Readiness / Daily Wellness Score panel,     */}
            {/* and today's numbers (or the check-in prompt when       */}
            {/* nothing's logged yet). Each element uses a different    */}
            {/* treatment (card / row / tinted panel / grid) so         */}
            {/* nothing repeats back to back.                           */}
            {/* ==================================================== */}
            <RevealOnScroll delayMs={60} className="mt-8 md:mt-10">
              <p className={ZONE_LABEL}>Today</p>
              <div className="mt-4 space-y-4">
                {morningBrief && (
                  <MorningBriefCard brief={morningBrief} rootScoreSnapshot={rootScoreSnapshot} />
                )}

                <AssignedProgramsCard upcomingWorkouts={upcomingAssignedWorkouts} />

                <DailyWellnessSection checkin={todaysCheckin} eveningReflection={eveningReflection} />

                {todaysCheckin ? (
                  <div>
                    <p className="pb-1 text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40">
                      Today&apos;s Numbers
                    </p>
                    <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
                      <HydrationTracker initialTotal={hydrationTotal} />

                      <div className={TRACKER_CARD}>
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">Sleep</p>
                        </div>
                        {todaysCheckin?.sleep_duration ? (
                          <>
                            <p
                              className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[sleepDurationStatus(todaysCheckin.sleep_duration)].text}`}
                            >
                              {todaysCheckin.sleep_duration}
                            </p>
                            <div className="mt-auto flex gap-1 pt-3">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <div
                                  key={n}
                                  className={`h-2 flex-1 rounded-full ${
                                    todaysCheckin?.sleep_quality && n <= todaysCheckin.sleep_quality
                                      ? STATUS_STYLES[sleepQualityStatus(todaysCheckin.sleep_quality)]
                                          .dot
                                      : 'bg-[#EFE9DB]'
                                  }`}
                                />
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="mt-auto text-sm text-[#6B7A72]">Not logged yet</p>
                        )}
                      </div>

                      <div className={TRACKER_CARD}>
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">Stress</p>
                        </div>
                        <p
                          className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[stressStatus(todaysCheckin?.stress_level ?? null)].text}`}
                        >
                          {stressLabel(todaysCheckin?.stress_level ?? null)}
                        </p>
                        <div className="mt-auto flex gap-1 pt-3">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              className={`h-2 flex-1 rounded-full ${
                                todaysCheckin?.stress_level && n <= todaysCheckin.stress_level
                                  ? STATUS_STYLES[stressStatus(todaysCheckin.stress_level)].dot
                                  : 'bg-[#EFE9DB]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className={TRACKER_CARD}>
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <Bone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">Pain</p>
                        </div>
                        <p
                          className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[painStatus(todaysCheckin?.pain_discomfort_level ?? null)].text}`}
                        >
                          {painLabel(todaysCheckin?.pain_discomfort_level ?? null)}
                        </p>
                        <div className="mt-auto flex gap-1 pt-3">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              className={`h-2 flex-1 rounded-full ${
                                todaysCheckin?.pain_discomfort_level != null &&
                                n <= todaysCheckin.pain_discomfort_level
                                  ? STATUS_STYLES[painStatus(todaysCheckin.pain_discomfort_level)].dot
                                  : 'bg-[#EFE9DB]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className={TRACKER_CARD}>
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <Smile className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">Mood</p>
                        </div>
                        <p
                          className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[moodStatus(todaysCheckin?.mood_level ?? null)].text}`}
                        >
                          {moodLabel(todaysCheckin?.mood_level ?? null)}
                        </p>
                        <div className="mt-auto flex gap-1 pt-3">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              className={`h-2 flex-1 rounded-full ${
                                todaysCheckin?.mood_level && n <= todaysCheckin.mood_level
                                  ? STATUS_STYLES[moodStatus(todaysCheckin.mood_level)].dot
                                  : 'bg-[#EFE9DB]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className={TRACKER_CARD}>
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <Utensils className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">Digestion</p>
                        </div>
                        <p
                          className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[digestionStatus(todaysCheckin?.digestion_rating ?? null)].text}`}
                        >
                          {digestionLabel(todaysCheckin?.digestion_rating ?? null)}
                        </p>
                        <div className="mt-auto flex gap-1 pt-3">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              className={`h-2 flex-1 rounded-full ${
                                todaysCheckin?.digestion_rating && n <= todaysCheckin.digestion_rating
                                  ? STATUS_STYLES[digestionStatus(todaysCheckin.digestion_rating)].dot
                                  : 'bg-[#EFE9DB]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className={TRACKER_CARD}>
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <Footprints className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">Movement</p>
                        </div>
                        <p
                          className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[movementStatus(todaysCheckin?.movement_today ?? null)].text}`}
                        >
                          {movementLabel(todaysCheckin?.movement_today ?? null)}
                        </p>
                        <div className="mt-auto pt-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[movementStatus(todaysCheckin?.movement_today ?? null)].bg} ${STATUS_STYLES[movementStatus(todaysCheckin?.movement_today ?? null)].text}`}
                          >
                            {todaysCheckin?.movement_today
                              ? movementStatus(todaysCheckin.movement_today) === 'good'
                                ? 'On track'
                                : movementStatus(todaysCheckin.movement_today) === 'attention'
                                  ? 'Could be more'
                                  : 'Sedentary'
                              : 'No data'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 border-b border-[#1B3A2D]/8 py-4">
                    <p className="text-sm text-[#6B7A72]">
                      Complete today&apos;s check-in to see today&apos;s numbers here.
                    </p>
                  </div>
                )}
              </div>
            </RevealOnScroll>

            {/* ==================================================== */}
            {/* Your Path — Guided Posture & Movement Assessment        */}
            {/* (image-backed card), Questionnaires (plain row +        */}
            {/* progress bar), Personalized Insights (white card, or     */}
            {/* nothing yet). Movement goes first and Questionnaires     */}
            {/* last-if-Comprehensive-is-absent on purpose: Comprehensive */}
            {/* (white) is conditional and can be null, and the zone      */}
            {/* right after this one is now an image-backed carousel —   */}
            {/* ending on image-backed here too (if Movement were last)   */}
            {/* would repeat that treatment back to back. With Movement   */}
            {/* first, this zone always ends on Comprehensive (white) or  */}
            {/* Questionnaires (row), never image-backed, regardless of   */}
            {/* which cards are present.                                 */}
            {/* ==================================================== */}
            <RevealOnScroll delayMs={0} className="mt-14 md:mt-20">
              <p className={ZONE_LABEL}>Your Path</p>
              <div className="mt-4 space-y-4">
                <MovementAssessmentCard assessments={bodyAssessments} variant="imageBacked" />
                <QuestionnairesHomeCard
                  completedCount={questionnaireCatalog.completedCount}
                  totalCount={questionnaireCatalog.totalCount}
                />
                <ComprehensiveAssessmentCard
                  baseline={baseline}
                  movementCompleted={movementAnalyzed}
                />
              </div>
            </RevealOnScroll>

            {/* ==================================================== */}
            {/* What Root Is Noticing — What We're Noticing, Your Root  */}
            {/* Map, From Root, and Recommended For You, as a            */}
            {/* horizontal carousel of image-backed vertical cards        */}
            {/* (components/dashboard/NoticingTile.tsx), matching the     */}
            {/* rest of the redesign's image-card language instead of     */}
            {/* the tinted panel of stacked white cards this zone used     */}
            {/* to be. Each card keeps its own Suspense boundary and       */}
            {/* independent fetch; a card that has nothing to say just     */}
            {/* isn't in the row (no gap, no placeholder). Tapping a card  */}
            {/* either navigates to its existing destination (Root Map,   */}
            {/* Recommendations) or opens a bottom sheet with the full     */}
            {/* original content (What We're Noticing, From Root — both   */}
            {/* previously had no dedicated destination page).             */}
            {/* ==================================================== */}
            <RevealOnScroll delayMs={60} className="mt-14 md:mt-20">
              <p className={ZONE_LABEL}>What Root Is Noticing</p>
              <div className="mef-scrollbar-hidden mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 pb-1">
                <Suspense fallback={<NoticingTileSkeleton />}>
                  <WhatWereNoticingCard />
                </Suspense>
                <Suspense fallback={<NoticingTileSkeleton />}>
                  <RootMapCard />
                </Suspense>
                <Suspense fallback={<NoticingTileSkeleton />}>
                  <CoachingMessageCard />
                </Suspense>
                <Suspense fallback={<NoticingTileSkeleton />}>
                  <RecommendationsCard />
                </Suspense>
              </div>
            </RevealOnScroll>

            {/* ==================================================== */}
            {/* Trends — Energy Trend, real recent check-ins, the       */}
            {/* line draws in on scroll via AnimatedEnergyTrendChart     */}
            {/* (a wrapper around the unmodified, coach-shared            */}
            {/* EnergyTrendChart — see that wrapper's own comment).       */}
            {/* ==================================================== */}
            <RevealOnScroll delayMs={0} className="mt-14 md:mt-20">
              <p className={ZONE_LABEL}>Trends</p>
              <section className={`${CARD} mt-4 p-6`}>
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Energy Trend</p>
                </div>
                <AnimatedEnergyTrendChart checkins={recentCheckins} todayLocalDate={localDate} />
              </section>
            </RevealOnScroll>

            {/* ==================================================== */}
            {/* Coming Up — next session (a small quiet row; there's    */}
            {/* no bookings table yet, so this honestly says nothing's  */}
            {/* scheduled instead of inventing one) and wearable         */}
            {/* status: today's real recovery numbers once connected,   */}
            {/* or the full-bleed "Unlock Smarter Coaching" panel        */}
            {/* until then. See                                          */}
            {/* components/wearables/ConnectWearableCard.tsx.            */}
            {/* ==================================================== */}
            <RevealOnScroll delayMs={60} className="mt-14 md:mt-20">
              <p className={ZONE_LABEL}>Coming Up</p>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-[#1B3A2D]/8 py-4">
                  <div className="flex items-center gap-2 text-[#6B7A72]">
                    <Calendar className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <p className="text-sm">
                      Next session: <span className="text-[#1B3A2D]/70">nothing scheduled yet</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-[#1B3A2D]/35">
                    Coming soon
                  </span>
                </div>

                {hasConnectedWearable ? (
                  decision?.wearableSnapshot ? (
                    <section className={`${CARD} p-6`}>
                      <div className="flex items-center gap-2 text-[#6B7A72]">
                        <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        <p className="text-sm font-semibold uppercase tracking-wider">
                          Today&apos;s Recovery
                        </p>
                      </div>
                      <WearableStatsRow snapshot={decision.wearableSnapshot} />
                    </section>
                  ) : (
                    <div className="flex items-center gap-3 border-b border-[#1B3A2D]/8 py-4">
                      <p className="text-sm leading-relaxed text-[#6B7A72]">
                        Your device is connected — recovery numbers will appear here after your first
                        sync.
                      </p>
                    </div>
                  )
                ) : (
                  <ConnectWearableCard variant="dashboard" />
                )}
              </div>
            </RevealOnScroll>
          </div>
        )}
      </main>

      {/* -------------------------------------------------------- */}
      {/* Bottom navigation (mobile) / side rail (md+)               */}
      {/* Same classes as before, now real Link navigation with a    */}
      {/* real active state — see components/BottomNav.tsx.          */}
      {/* -------------------------------------------------------- */}
      <BottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="dashboard"
        entryContext={buildDashboardEntryContext(wellnessIndex)}
      />

      {/* Suppressed during the pre-first-check-in welcome state, and
          during the first-check-in transition below — a modal competing
          with either of those single-CTA moments would undercut "one
          premium welcome experience." It still shows (once, per its own
          localStorage dismissal) on a later visit. */}
      {!hasConnectedWearable && hasCheckins && searchParams.firstCheckin !== '1' && (
        <WearableWelcomeModal />
      )}

      {/* Premium UX Milestone 4, part 6 — the one-time transition shown
          immediately after a member's first-ever completed check-in. */}
      {searchParams.firstCheckin === '1' && (
        <FirstCheckinTransition
          firstName={firstName}
          hasMovementAssessment={bodyAssessments.length > 0}
        />
      )}
    </div>
  );
}
