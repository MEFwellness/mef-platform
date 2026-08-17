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
 *
 * ===================================================================
 * THE VISIBILITY LAYER (2026-08-17). Home shows three things now: the
 * day's one priority, one plain sentence about anything newly revealed,
 * and the features this member's own rules have actually revealed.
 * Nothing else.
 *
 * The audit counted TEN simultaneous calls to action on this screen for
 * one member on one morning, and the Priority Card was not among them.
 * Every zone below now asks lib/visibility before it renders, and a zone
 * whose contents are all hidden disappears along with its label rather
 * than leaving an empty heading. There are no locked states and no teaser
 * states on this page: an entry point for a feature her rules have not
 * revealed does not exist, because a lock is still an advertisement.
 *
 * Two things left outright rather than being gated:
 *
 *   The "Next session: nothing scheduled yet, Coming soon" row. There is
 *   no booking system, so it has only ever told every member that nothing
 *   is scheduled. A row that can never say anything else is not a feature
 *   waiting for an audience.
 *
 *   The wearable welcome MODAL. The same pitch was on this screen twice on
 *   one load, as a full-bleed panel and as a pop-up over it. The panel
 *   survives, gated on her own sleep or recovery actually having come up
 *   more than once; the modal is gone.
 * ===================================================================
 */

import { Fragment, Suspense } from 'react';
import { TrendingUp } from 'lucide-react';
import { getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { redirect } from 'next/navigation';
import { getTodaysCheckin, getRecentCheckins, resolveLocalDate } from '@/app/actions/checkin';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { calculateWellnessIndex, inputsFromCheckin } from '@/lib/wellness/wellness-index';
import { getMyRootScore } from '@/app/actions/scoring';
import { buildDashboardEntryContext } from '@/lib/conversation-coach/entryContext';
import { buildTimeContext } from '@/lib/feed/timeContext';
import { getMyWearableConnections } from '@/app/actions/wearables';
import { getMyCoachingDecision } from '@/app/actions/coaching-brain';
import { getMyMorningBrief } from '@/app/actions/coaching-engine';
import { ConnectWearableCard } from '@/components/wearables/ConnectWearableCard';
import { WearableStatsRow } from '@/app/today/WearableStatsRow';
import { HomeScreenPopups } from '@/components/dashboard/HomeScreenPopups';
import { PriorityCard } from '@/components/priority/PriorityCard';
import { TodaysFocusLine } from '@/components/focus/TodaysFocusLine';
import { TrackPriorityShown } from '@/components/priority/TrackPriorityShown';
import { getMyPriorityView } from '@/lib/priority/view';
import { getMyWeeklyReview } from '@/lib/weekly-review/view';
import { WEEKLY_REVIEW_LABEL } from '@/lib/weekly-review/copy';
import { WeeklyReviewEntry } from '@/components/weekly-review/WeeklyReviewEntry';
import { getMyRootPopupMessageAction } from '@/app/actions/rootPopupMessages';
import { MorningBriefCard } from '@/components/MorningBriefCard';
import { FirstCheckInWelcome } from '@/components/FirstCheckInWelcome';
import { FirstCheckinTransition } from '@/components/FirstCheckinTransition';
import { ComprehensiveAssessmentCard } from '@/components/ComprehensiveAssessmentCard';
import { MovementAssessmentCard } from '@/components/MovementAssessmentCard';
import { AssignedProgramsCard } from '@/components/AssignedProgramsCard';
import { getMyAssignedWorkoutsAction } from '@/app/actions/coach-programs';
import { getMyBaselineAssessment } from '@/app/actions/onboarding';
import { getMyAssessmentsAction } from '@/app/actions/body-assessment';
import { getMyQuestionnaireCatalog, getMyBodyAssessmentAssignmentCard } from '@/app/actions/questionnaireCatalog';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { QuestionnairesHomeCard } from '@/components/questionnaires/QuestionnairesHomeCard';
import { DashboardInviteCards } from '@/components/dashboard/DashboardInviteCards';
import { WhatWereNoticingCard } from '@/components/dashboard/WhatWereNoticingCard';
import { RootMapCard } from '@/components/RootMapCard';
import { RecommendationsCard } from '@/components/dashboard/RecommendationsCard';
import { CoachingMessageCard } from '@/components/dashboard/CoachingMessageCard';
import { RootDiscoveryCard } from '@/components/dashboard/RootDiscoveryCard';
import { ActiveExperimentsSection } from '@/components/dashboard/ActiveExperimentsSection';
import { PersonalResetPlanCard } from '@/components/reset-plan/PersonalResetPlanCard';
import { getMyLifestyleExperiments } from '@/app/actions/lifestyleExperiments';
import { HomeHero } from '@/components/dashboard/HomeHero';
import { QuickActionsGrid } from '@/components/dashboard/QuickActionsGrid';
import { RevealOnScroll } from '@/components/dashboard/RevealOnScroll';
import { ScrollCarousel } from '@/components/carousel/ScrollCarousel';
import { AnimatedEnergyTrendChart } from '@/components/dashboard/AnimatedEnergyTrendChart';
import { buildGreetingLine, scoreDirectionFromChange } from '@/lib/dashboard/greeting';
import { firstNameFrom } from '@/lib/profile/greeting';
import { orderTodayCards, type TodayCardKey } from '@/lib/dashboard/prioritization';
import { pageBackgroundForGreeting } from '@/lib/dashboard/timeOfDayPalette';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { getMemberVisibility } from '@/lib/visibility';
import { F } from '@/lib/visibility/catalog';
import { NewlyRevealedNotice } from '@/components/visibility/NewlyRevealedNotice';
// Screen Layout System (Prompt 2): this used to be a hand-rolled
// `rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]`
// literal, duplicated verbatim across a dozen files. `.mef-card`
// (app/globals.css) is now that one recipe's single definition.
const CARD = 'mef-card';
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { firstCheckin?: string };
}) {
  const supabase = getRequestClient();
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
    rootPopupMessage,
    bodyAssessmentAccess,
    bodyAssessmentAssignmentCard,
    priority,
    weeklyReview,
    visibility,
  ] = await Promise.all([
    supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
    getMyWearableConnections(),
    getMyBaselineAssessment(),
    getMyAssessmentsAction(),
    getMyQuestionnaireCatalog(),
    getMyAssignedWorkoutsAction(),
    getMyRootPopupMessageAction(),
    // Coach-Assign-Only Gating task (2026-08-04): Body Assessment is now
    // requiresAssignment, same as Four Doctors/CHEK HLC1/Primal Pattern/
    // Short-HAQ/WBSA — a free member with no history and no pending
    // assignment sees MovementAssessmentCard locked, not an open "Start
    // Assessment" invite. checkAssessmentAccess already lets through
    // anyone with real history or a pending assignment (never hides
    // progress), so this is safe to call unconditionally.
    checkAssessmentAccess(supabase, user.id, 'body-assessment'),
    getMyBodyAssessmentAssignmentCard(),
    // Shares its work with getMyRootPopupMessageAction above, which asks
    // for the same view: getMyPriorityView is request-memoized, so the
    // pop-up decision and this inline card cost one computation between
    // them and are handed the identical object.
    getMyPriorityView(),
    // The Weekly Root Review, on exactly the same terms: request-memoized,
    // so the pop-up chain's own call above and this persistent entry share
    // one composition and are handed the identical review.
    getMyWeeklyReview(),
    // The Visibility Layer. Request-memoized for the same reason the
    // interpretation layer is: several Suspense boundaries on this page
    // want the same answer, and two cards on one screen must not be able to
    // disagree about whether a third exists.
    getMemberVisibility(),
  ]);
  /** The one question every zone below asks before it renders. */
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;
  // Whether the Root pop-up chain is delivering the Priority Card on this
  // very load. Mirrors exactly the condition HomeScreenPopups renders on
  // below, so the two can never disagree about which presentation the
  // member is actually getting.
  const priorityShownAsPopup =
    rootPopupMessage?.kind === 'priority_card' && searchParams.firstCheckin !== '1';

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
  const firstName = firstNameFrom(profile?.display_name);

  // recentCheckins doesn't depend on localDate, so it joins the rest of
  // this batch (which does) instead of a separate round trip.
  // rootScoreSnapshot reads today's already-calculated snapshot (or
  // calculates it once, the first time it's asked for today) — see
  // lib/scoring/service.ts; it never recalculates on every render.
  const [
    todaysCheckin,
    recentCheckins,
    rootScoreSnapshot,
    decision,
    morningBrief,
    lifestyleExperiments,
  ] = await Promise.all([
    getTodaysCheckin(localDate),
    getRecentCheckins(30),
    getMyRootScore(localDate, timezone),
    getMyCoachingDecision(timezone),
    getMyMorningBrief(timezone, profile?.display_name),
    getMyLifestyleExperiments(),
  ]);

  const wellnessIndex = calculateWellnessIndex(inputsFromCheckin(todaysCheckin));
  const hasCheckins = recentCheckins.length > 0;
  // A member who has never checked in but already has a real active
  // Weekly Experiment (from Core Values Snapshot, Life Signal Check, or
  // Readiness Pulse — the exact free-arc path this dashboard needs to
  // serve) still has real, non-empty content: the plain "let's get
  // started" welcome card would otherwise hide the very experiment they
  // just started, with no way to find it until they also do an unrelated
  // daily check-in. Real bug found and fixed while verifying Readiness
  // Pulse: a fresh member who completes the whole free arc and starts an
  // experiment saw this empty-state card instead of Active Experiments.
  const hasActiveExperiment = lifestyleExperiments.some((e) => e.status === 'active');

  // Dashboard Evolution (Prompt 5): both of these are pure functions of
  // facts already fetched above (todaysCheckin, timeContext, localDate)
  // — no new query, no new state. See lib/dashboard/greeting.ts and
  // lib/dashboard/prioritization.ts for the actual rules.
  const hasCheckinToday = !!todaysCheckin;
  // Copy-and-honesty pass (2026-08-14): the greeting line sits directly
  // above the Root Score and its change pill, so it is handed the very
  // same number the pill renders. A score that is down or flat switches
  // the line to the neutral set; it can no longer say "Good start to the
  // day" over a score reading points down. See lib/dashboard/greeting.ts.
  const heroGreetingLine = buildGreetingLine({
    greetingWord: timeContext.greetingWord,
    hasCheckinToday,
    localDate,
    scoreDirection: scoreDirectionFromChange(rootScoreSnapshot?.root_score_change),
  });
  const todayCardOrder = orderTodayCards(hasCheckinToday);

  const morningBriefNode =
    morningBrief && shows(F.dailyBrief) ? (
      <MorningBriefCard brief={morningBrief} rootScoreSnapshot={rootScoreSnapshot} />
    ) : null;

  const assignedProgramsNode = shows(F.homeAssignedPrograms) ? (
    <AssignedProgramsCard upcomingWorkouts={upcomingAssignedWorkouts} />
  ) : null;

  // Home cleanup pass (2026-08-14). Two blocks that used to live in this
  // zone are gone from Home:
  //
  //   Today's Wellness (DailyWellnessSection — "Daily Reset 60", "Daily
  //   Wellness Score 60") is removed outright. Two unexplained numbers
  //   competing with the Root Score directly above them is one score too
  //   many on a narrative screen. The scores themselves
  //   (lib/wellness/morningReadiness.ts, lib/wellness/dailyWellnessScore.ts)
  //   and their tests are untouched.
  //
  //   Today's Numbers moved to the Today tab
  //   (components/today/TodaysNumbersGrid.tsx) — Home keeps the narrative,
  //   Today is the data and logging surface. What remains here is only the
  //   half of that block that was never a number: the honest line for a day
  //   with no check-in logged yet.
  const checkinPromptNode = todaysCheckin ? null : (
    <div className="flex items-center justify-between gap-3 border-b border-[#1B3A2D]/8 py-4">
      <p className="text-sm text-[#6B7A72]">
        Once today&apos;s check-in is done, your numbers are on the Today tab.
      </p>
    </div>
  );

  const TODAY_CARD_NODES: Record<TodayCardKey, React.ReactNode> = {
    morning_brief: morningBriefNode,
    assigned_programs: assignedProgramsNode,
    checkin_prompt: checkinPromptNode,
  };

  return (
    <div
      className={`min-h-screen font-[family-name:var(--font-dm-sans)] ${pageBackgroundForGreeting(timeContext.greetingWord)}`}
    >
      <TrackSurfaceView surface="home" />
      {/* -------------------------------------------------------- */}
      {/* Hero — full-bleed, edge to edge, sits above the padded     */}
      {/* main column entirely so the photo can reach the true       */}
      {/* viewport edges. See components/dashboard/HomeHero.tsx.      */}
      {/* -------------------------------------------------------- */}
      <HomeHero
        firstName={firstName}
        greetingWord={timeContext.greetingWord}
        greetingLine={heroGreetingLine}
        snapshot={rootScoreSnapshot}
        // VISIBILITY LAYER: one authority for whether the score exists on
        // this screen. The hero's own gate ("has she ever checked in") and
        // the score's reveal rule ("at least one logged day") are the same
        // fact, and this is which of the two the hero now reads, so they
        // cannot drift apart later.
        hasCheckins={hasCheckins && shows(F.rootScore)}
      />

      <main className="mx-auto w-full max-w-md px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        {/* ==================================================== */}
        {/* THE PRIORITY CARD, inline. The same card the Root       */}
        {/* pop-up delivers on open, reading the same               */}
        {/* member_daily_priorities row, so whatever she did in the  */}
        {/* pop-up is already reflected here with no syncing.       */}
        {/* First thing in <main> on Home, above the invites and     */}
        {/* everything else, in both branches below. A saved card    */}
        {/* is deliberately not rendered here: saving demotes it     */}
        {/* out of the dominant slot, and Today is where it keeps    */}
        {/* its collapsed home.                                     */}
        {/*                                                          */}
        {/* Completed-priority behavior (2026-08-14): this dominant   */}
        {/* slot now holds the card only while it is ACTIVE. Once she */}
        {/* taps Done it leaves the top and settles as a compact      */}
        {/* accomplished card at the bottom of this page (see the end */}
        {/* of <main>) and of Today, for the rest of her own calendar */}
        {/* day. That is the same single member_daily_priorities row  */}
        {/* in both places, keyed to her own local date, so it is     */}
        {/* gone tomorrow with no expiry logic of its own.            */}
        {/*                                                          */}
        {/* NOTHING refills this slot. The engine commits to one      */}
        {/* priority per day (lib/priority/service.ts: today's stored */}
        {/* row is authoritative and is never re-selected), so a      */}
        {/* completed day leaves the top genuinely empty rather than  */}
        {/* inventing a second focus. What may appear here next is    */}
        {/* only a genuinely pending finite item that already had its */}
        {/* own card: a coach assignment or the next unstarted        */}
        {/* conversation (DashboardInviteCards, just below, which     */}
        {/* renders nothing when there is neither), and the day-3 /    */}
        {/* day-7 follow-ups, which keep their own place in the Root  */}
        {/* pop-up chain and in Active Experiments.                   */}
        {/* ==================================================== */}
        {/* ONE FOCUS (Member Interpretation Layer, 2026-08-17). Home holds
            the card itself only while it is ACTIVE; a saved card keeps its
            collapsed home on Today and a completed one settles at the bottom
            of this page. That left Home naming no focus at all on a day she
            had set hers aside, while Root Score, Today and Talk to Root all
            named it. This states the same one, from the same engine, and
            points at where the card actually is. It is a pointer with no
            buttons: there is still exactly one place to act on it. */}
        {priority && priority.status !== 'active' && (
          <div className="pt-3">
            <TodaysFocusLine href="/today" />
          </div>
        )}

        {priority && priority.status === 'active' && (
          <div className="pt-3">
            {/* The pop-up and this inline card mount in the same paint on
                Home, so if both reported themselves the recorded
                presentation would be a race between two round trips, and
                "was she interrupted with this or did she browse to it"
                would be unanswerable. The pop-up is what genuinely reached
                her first whenever it is showing, so it reports and this
                does not. On Today, where no pop-up exists, the inline card
                always reports. */}
            {!priorityShownAsPopup && (
              <TrackPriorityShown
                rule={priority.selected.rule}
                isReEntry={priority.isReEntry}
                presentation="inline"
              />
            )}
            <PriorityCard view={priority} />
          </div>
        )}

        {/* ==================================================== */}
        {/* THE ONE PLAIN SENTENCE. Anything her rules revealed     */}
        {/* that she has not been told about yet, in Root's voice,  */}
        {/* directly under the day's one priority and above         */}
        {/* everything else. No buttons: this explains, it does not  */}
        {/* compete with the card above it for the day's action.     */}
        {/* ==================================================== */}
        <NewlyRevealedNotice reveals={visibility.newlyRevealed} />

        {/* ==================================================== */}
        {/* THE WEEKLY ROOT REVIEW, persistent (Adaptive Coaching  */}
        {/* Direction, Part 2). After the pop-up has had its one    */}
        {/* showing this week, the review stays reachable here for  */}
        {/* the rest of the week, reading the same                  */}
        {/* member_weekly_reviews row the pop-up read, so           */}
        {/* acknowledging in either place shows acknowledged in     */}
        {/* both with no syncing.                                   */}
        {/* Collapsed by default and BELOW the priority card: it    */}
        {/* has already interrupted her once this week, and today's */}
        {/* one thing outranks last week's report on every day      */}
        {/* except the one the pop-up owned.                        */}
        {/* ==================================================== */}
        {weeklyReview && shows(F.homeWeeklyReview) && (
          <div className="pt-3">
            <WeeklyReviewEntry
              review={weeklyReview.review}
              label={WEEKLY_REVIEW_LABEL}
              weekStart={weeklyReview.weekStart}
            />
          </div>
        )}

        {/* ==================================================== */}
        {/* Priority invites — a coach-assigned questionnaire and/  */}
        {/* or the next unstarted free-arc conversation (Core       */}
        {/* Values Snapshot / Life Signal Check / Readiness Pulse,  */}
        {/* FIX 5, 2026-08-03). Always the first thing in <main>,   */}
        {/* above Quick Actions/Today, in both branches below —     */}
        {/* deliberately NOT gated on hasCheckins, since a brand-    */}
        {/* new member with zero check-ins is exactly who needs      */}
        {/* this reachable. Renders nothing when there is neither.  */}
        {/* See components/dashboard/DashboardInviteCards.tsx.      */}
        {/* ==================================================== */}
        {shows(F.homeInviteCards) && (
          <Suspense fallback={null}>
            <DashboardInviteCards catalog={questionnaireCatalog} bodyAssessmentCard={bodyAssessmentAssignmentCard} />
          </Suspense>
        )}

        {!hasCheckins && !hasActiveExperiment ? (
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
            {(shows(F.homeQuickActionCase) || shows(F.homeQuickActionMovement)) && (
              <RevealOnScroll>
                <p className={ZONE_LABEL}>Quick Actions</p>
                <div className="mt-3">
                  <QuickActionsGrid
                    caseStatus={caseStatus}
                    movementStatus={movementActionStatus}
                    showCase={shows(F.homeQuickActionCase)}
                    showMovement={shows(F.homeQuickActionMovement)}
                  />
                </div>
              </RevealOnScroll>
            )}

            {/* ==================================================== */}
            {/* Today — Root's Daily Brief, coach-assigned workouts,    */}
            {/* the Morning Readiness / Daily Wellness Score panel,     */}
            {/* and today's numbers (or the check-in prompt when       */}
            {/* nothing's logged yet). Each element uses a different    */}
            {/* treatment (card / row / tinted panel / grid) so         */}
            {/* nothing repeats back to back.                           */}
            {/* ==================================================== */}
            {/* The zone disappears with its label when every block in it is
                hidden, rather than leaving a heading over nothing. */}
            {todayCardOrder.some((key) => TODAY_CARD_NODES[key] !== null) && (
            <RevealOnScroll delayMs={60} className="mt-8 md:mt-10">
              <p className={ZONE_LABEL}>Today</p>
              {/* Dashboard Evolution (Prompt 5), requirement 3: card
                  prioritization. Same four blocks as before, now in the
                  order lib/dashboard/prioritization.ts's orderTodayCards
                  computes from real state (whether today's check-in
                  exists) -- the check-in prompt leads when it is not
                  done yet, today's real progress/reflection leads once
                  it is. Every block still renders exactly what it
                  always did; only its position changes. */}
              <div className="mt-4 space-y-4">
                {todayCardOrder.map((key) => (
                  <Fragment key={key}>{TODAY_CARD_NODES[key]}</Fragment>
                ))}
              </div>
            </RevealOnScroll>
            )}

            {/* ==================================================== */}
            {/* Active Experiments — every currently-running Weekly     */}
            {/* Experiment (any source), with real day progress and     */}
            {/* today's daily question, plus any "start it later"       */}
            {/* offer — one persistent place, see                       */}
            {/* components/dashboard/ActiveExperimentsSection.tsx.      */}
            {/* Renders nothing at all when there is truly nothing to   */}
            {/* show, so this zone silently disappears rather than      */}
            {/* leaving an empty heading.                                */}
            {/* ==================================================== */}
            {shows(F.homeActiveExperiments) && (
              <RevealOnScroll delayMs={30} className="mt-14 md:mt-20">
                <Suspense fallback={null}>
                  <ActiveExperimentsSection />
                </Suspense>
              </RevealOnScroll>
            )}

            {/* ==================================================== */}
            {/* Personal Reset Plan — its own permanent section, never  */}
            {/* folded into Active Experiments or the free-arc          */}
            {/* branches. Renders nothing at all for a member without   */}
            {/* profiles.reset_plan_granted_at, see                     */}
            {/* components/reset-plan/PersonalResetPlanCard.tsx.        */}
            {/* ==================================================== */}
            {shows(F.homeResetPlan) && (
              <RevealOnScroll delayMs={30} className="mt-14 md:mt-20">
                <Suspense fallback={null}>
                  <PersonalResetPlanCard />
                </Suspense>
              </RevealOnScroll>
            )}

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
            {/* VISIBILITY LAYER: no locked card ever renders here now. The
                Movement Assessment used to appear for every member with a
                "Locked" treatment, which is still an advertisement for
                something she cannot have. It appears when her own rule
                reveals it and does not exist otherwise, and
                `bodyAssessmentAccess` remains the independent server-side
                permission check behind the route itself. */}
            {(shows(F.homeMovementAssessmentCard) ||
              shows(F.homeQuestionnairesCard) ||
              shows(F.homeComprehensiveCard)) && (
              <RevealOnScroll delayMs={0} className="mt-14 md:mt-20">
                <p className={ZONE_LABEL}>Your Path</p>
                <div className="mt-4 space-y-4">
                  {shows(F.homeMovementAssessmentCard) && (
                    <MovementAssessmentCard
                      assessments={bodyAssessments}
                      variant="imageBacked"
                      locked={!bodyAssessmentAccess.allowed}
                    />
                  )}
                  {shows(F.homeQuestionnairesCard) && (
                    <QuestionnairesHomeCard
                      completedCount={questionnaireCatalog.completedCount}
                      totalCount={questionnaireCatalog.totalCount}
                    />
                  )}
                  {shows(F.homeComprehensiveCard) && (
                    <ComprehensiveAssessmentCard
                      baseline={baseline}
                      movementCompleted={movementAnalyzed}
                    />
                  )}
                </div>
              </RevealOnScroll>
            )}

            {/* ==================================================== */}
            {/* What Root Is Noticing — What We're Noticing, Your Root  */}
            {/* Map, From Root, Recommended For You, and (Root Presence  */}
            {/* System, Prompt 4) a one-time Discovery card, as a         */}
            {/* horizontal carousel of image-backed vertical cards        */}
            {/* (components/dashboard/NoticingTile.tsx), matching the     */}
            {/* rest of the redesign's image-card language instead of     */}
            {/* the tinted panel of stacked white cards this zone used     */}
            {/* to be. Each card keeps its own Suspense boundary and       */}
            {/* independent fetch; a card that has nothing to say just     */}
            {/* isn't in the row (no gap, no placeholder). Tapping a card  */}
            {/* either navigates to its existing destination (Root Map,   */}
            {/* Recommendations) or opens a bottom sheet with the full     */}
            {/* original content (What We're Noticing, From Root, and     */}
            {/* the Discovery card all previously/never had a dedicated   */}
            {/* destination page).                                        */}
            {/* ==================================================== */}
            {shows(F.homeNoticingCarousel) && (
            <RevealOnScroll delayMs={60} className="mt-14 md:mt-20">
              <p className={ZONE_LABEL}>What Root Is Noticing</p>
              {/* Dashboard Evolution (Prompt 5), requirement 3: a new
                  discovery moment outranks routine cards whenever one
                  exists — RootDiscoveryCard now leads this carousel
                  (lib/dashboard/prioritization.ts's NOTICING_CARD_ORDER).
                  It renders nothing at all on a day with no genuinely
                  new finding, so this reordering costs nothing visually
                  on every other day; no extra fetch was added to decide
                  this, each tile still independently self-gates. */}
              <div className="mt-4">
                <ScrollCarousel>
                  <Suspense fallback={<NoticingTileSkeleton />}>
                    <RootDiscoveryCard />
                  </Suspense>
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
                </ScrollCarousel>
              </div>
            </RevealOnScroll>
            )}

            {/* ==================================================== */}
            {/* Trends — Energy Trend, real recent check-ins, the       */}
            {/* line draws in on scroll via AnimatedEnergyTrendChart     */}
            {/* (a wrapper around the unmodified, coach-shared            */}
            {/* EnergyTrendChart — see that wrapper's own comment).       */}
            {/* ==================================================== */}
            {shows(F.homeTrendsEnergy) && (
              <RevealOnScroll delayMs={0} className="mt-14 md:mt-20">
                <p className={ZONE_LABEL}>Trends</p>
                <section className={`${CARD} mt-4`}>
                  <div className="flex items-center gap-2 text-[#6B7A72]">
                    <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    <p className="text-sm font-semibold uppercase tracking-wider">Energy Trend</p>
                  </div>
                  <AnimatedEnergyTrendChart checkins={recentCheckins} todayLocalDate={localDate} />
                </section>
              </RevealOnScroll>
            )}

            {/* ==================================================== */}
            {/* Your Device. Was "Coming Up", and held two things: a    */}
            {/* permanently empty "Next session: nothing scheduled yet  */}
            {/* / Coming soon" row, and the wearable panel.             */}
            {/*                                                          */}
            {/* The next-session row is GONE. There is no booking        */}
            {/* system, so it could only ever tell every member that     */}
            {/* nothing is scheduled. A row that can never say anything  */}
            {/* else is not a feature waiting for an audience, and       */}
            {/* "Coming soon" on a member's first screen is a promise    */}
            {/* nobody made.                                             */}
            {/*                                                          */}
            {/* The wearable panel survives, and is now revealed only    */}
            {/* when her own sleep or recovery has come up more than     */}
            {/* once, or she already has a device. See                   */}
            {/* components/wearables/ConnectWearableCard.tsx.            */}
            {/* ==================================================== */}
            {shows(F.homeWearableConnect) && (
              <RevealOnScroll delayMs={60} className="mt-14 md:mt-20">
                <p className={ZONE_LABEL}>Your Device</p>
                <div className="mt-4 space-y-4">
                  {hasConnectedWearable ? (
                    decision?.wearableSnapshot ? (
                      <section className={CARD}>
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
                          Your device is connected. Recovery numbers will appear here after your
                          first sync.
                        </p>
                      </div>
                    )
                  ) : (
                    <ConnectWearableCard variant="dashboard" />
                  )}
                </div>
              </RevealOnScroll>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* THE COMPLETED PRIORITY, in its compact accomplished     */}
        {/* state, at the very bottom of Home.                      */}
        {/*                                                          */}
        {/* One shared state, one row: this is the same              */}
        {/* member_daily_priorities row the card at the top read, so */}
        {/* Done in the pop-up, on Home, or on Today all land here.  */}
        {/* It persists for the rest of her own calendar day because */}
        {/* the row is keyed to her local date, and tomorrow's row   */}
        {/* is simply a new one; nothing expires this card by hand.  */}
        {/* Outside the check-in-history branch above deliberately,  */}
        {/* so a member with no check-ins yet who completes her      */}
        {/* priority still sees what she finished.                   */}
        {/* Only 'done' lands here. A saved card keeps its existing  */}
        {/* collapsed home on Today, unchanged by this pass.         */}
        {/* ==================================================== */}
        {priority && priority.status === 'done' && (
          <div className="mt-10">
            <PriorityCard view={priority} collapsed />
          </div>
        )}
      </main>

      {/* -------------------------------------------------------- */}
      {/* Bottom navigation (mobile) / side rail (md+)               */}
      {/* Same classes as before, now real Link navigation with a    */}
      {/* real active state — see components/BottomNav.tsx.          */}
      {/* -------------------------------------------------------- */}
      <MemberBottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="dashboard"
        entryContext={buildDashboardEntryContext(wellnessIndex)}
      />

      {/* Root's pop-up message (day-3/day-7 Weekly Experiment follow-ups,
          each experience's own one-time "start it later" offer, a coach-
          assigned questionnaire, or the next unstarted free-arc
          conversation) and the wearable welcome modal, arbitrated so they
          never stack — see components/dashboard/HomeScreenPopups.tsx.
          FIX 5 (2026-08-03): the pop-up itself is deliberately NOT gated on
          hasCheckins anymore — a brand-new member with zero check-ins can
          still have a coach assignment or a free-arc conversation waiting,
          and that's exactly the member this fix needs to reach. Still
          suppressed during the one-time first-check-in transition below
          (never alongside another pop-up), and the wearable prompt keeps
          its own unchanged hasCheckins gate (today's real recovery numbers
          have nothing to show before a first check-in exists). */}
      {/* VISIBILITY LAYER (2026-08-17): `showWearablePrompt` is now always
          false and the prop is left in place only so the pop-up chain's own
          arbitration code is untouched by this build. The same wearable
          pitch was on this screen twice on one load, as a full-bleed panel
          and as a modal over it, for a member thirteen days in with no
          device. The panel above is the one that survives, and it is gated;
          a second delivery of a gated pitch would defeat the gate. */}
      <HomeScreenPopups
        rootPopupMessage={searchParams.firstCheckin !== '1' ? rootPopupMessage : null}
        showWearablePrompt={false}
      />

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
