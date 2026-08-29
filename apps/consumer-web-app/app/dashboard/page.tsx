/**
 * apps/consumer-web-app/app/dashboard/page.tsx
 *
 * HOME.
 *
 * =====================================================================
 * WHAT LOADS FIRST, AND WHY (Home speed build, 2026-08-28)
 * =====================================================================
 *
 * This page used to await nineteen things in two batches before it
 * returned a single tag of JSX. Everything on the screen therefore waited
 * on the slowest of them: her greeting took five to eight seconds on
 * production and the page did not settle for thirteen to twenty-two, while
 * roughly twenty cards each made their own server round trips, 331 of them
 * for one screen, a third of which were the same read asked for twice.
 *
 * It is written the other way round now, and the ordering is a design
 * decision rather than an accident of which promise resolved first:
 *
 *   INSTANT, in the first streamed response, awaiting only
 *   `lib/home/frame.ts`: the page, the hero photo and chrome, and HER
 *   GREETING. Three round trips, most of them in parallel. The hero's
 *   height is decided here too (short before her first check-in, tall
 *   after), and so is whether the dominant slot is going to hold the
 *   Priority Card, so nothing below moves when either lands.
 *
 *   FAST FOLLOW, each in its own boundary: the Root Score inside the hero,
 *   then the Priority Card, then the day frame she acts on.
 *
 *   STREAMS IN BEHIND: the insights, the carousels, the trend chart, the
 *   wearable panel. Each has a placeholder in the brand's own settling
 *   treatment (`.mef-settling`, app/globals.css), never a spinner.
 *
 * NO CARD WAS REMOVED AND NO COPY CHANGED. Every zone below renders
 * exactly what it rendered before, in exactly the same order, gated on
 * exactly the same conditions. What changed is WHEN it arrives.
 *
 * THE ORDER IN <main> IS LOAD-BEARING and is preserved across the
 * boundaries: the priority, then the newly-revealed sentence, her program,
 * the weekly review, the invites, then either the welcome card or the
 * zones, and the completed priority last. React puts a boundary's content
 * back in its own place no matter which order the boundaries resolve in,
 * so the split costs nothing in layout.
 *
 * EVERY REGION READS THE SAME FACTS. `getHomeFrame`, `getMyPriorityView`,
 * `getMemberVisibility`, `getTodaysCheckin` and the rest are all
 * request-memoized, so five boundaries asking the same question cost one
 * answer between them, and two cards on one screen cannot disagree.
 *
 * =====================================================================
 * THE VISIBILITY LAYER (2026-08-17). Home shows three things: the day's
 * one priority, one plain sentence about anything newly revealed, and the
 * features this member's own rules have actually revealed. Nothing else.
 *
 * The audit counted TEN simultaneous calls to action on this screen for
 * one member on one morning, and the Priority Card was not among them.
 * Every zone below asks lib/visibility before it renders, and a zone whose
 * contents are all hidden disappears along with its label rather than
 * leaving an empty heading. There are no locked states and no teaser
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
 * =====================================================================
 */

import { Fragment, Suspense } from 'react';
import { TrendingUp } from 'lucide-react';
import { getTodaysCheckin, getRecentCheckins } from '@/app/actions/checkin';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { calculateWellnessIndex, inputsFromCheckin } from '@/lib/wellness/wellness-index';
import { buildDashboardEntryContext } from '@/lib/conversation-coach/entryContext';
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
import { WeeklyReflectionEntry } from '@/components/weekly-reflection/WeeklyReflectionEntry';
import { getMyWeeklyReflection } from '@/lib/weekly-reflection/view';
import { getMyRootPopupMessageAction } from '@/app/actions/rootPopupMessages';
import { MorningBriefCard } from '@/components/MorningBriefCard';
import { FirstCheckInWelcome } from '@/components/FirstCheckInWelcome';
import { FirstCheckinTransition } from '@/components/FirstCheckinTransition';
import { ComprehensiveAssessmentCard } from '@/components/ComprehensiveAssessmentCard';
import { MovementAssessmentCard } from '@/components/MovementAssessmentCard';
import { lockNoteMessage, lockOffersPlanLink } from '@/lib/locked-content/copy';
import { AssignedProgramsCard } from '@/components/AssignedProgramsCard';
import { QuestionnairesHomeCard } from '@/components/questionnaires/QuestionnairesHomeCard';
import { DashboardInviteCards } from '@/components/dashboard/DashboardInviteCards';
import { WhatWereNoticingCard } from '@/components/dashboard/WhatWereNoticingCard';
import { RootMapCard } from '@/components/RootMapCard';
import { RecommendationsCard } from '@/components/dashboard/RecommendationsCard';
import { CoachingMessageCard } from '@/components/dashboard/CoachingMessageCard';
import { RootDiscoveryCard } from '@/components/dashboard/RootDiscoveryCard';
import { ActiveExperimentsSection } from '@/components/dashboard/ActiveExperimentsSection';
import { PersonalResetPlanCard } from '@/components/reset-plan/PersonalResetPlanCard';
import { HomeHeroBody, HomeHeroBodyPlaceholder, HomeHeroFrame } from '@/components/dashboard/HomeHero';
import {
  DayFramePlaceholder,
  NoticingTilePlaceholder,
  PriorityPlaceholder,
  StreamPlaceholder,
} from '@/components/dashboard/HomePlaceholders';
import { QuickActionsGrid } from '@/components/dashboard/QuickActionsGrid';
import { RevealOnScroll } from '@/components/dashboard/RevealOnScroll';
import { ScrollCarousel } from '@/components/carousel/ScrollCarousel';
import { AnimatedEnergyTrendChart } from '@/components/dashboard/AnimatedEnergyTrendChart';
import { buildGreetingLine, scoreDirectionFromChange } from '@/lib/dashboard/greeting';
import { orderTodayCards, type TodayCardKey } from '@/lib/dashboard/prioritization';
import { pageBackgroundForGreeting } from '@/lib/dashboard/timeOfDayPalette';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { getMemberVisibility } from '@/lib/visibility';
import { F } from '@/lib/visibility/catalog';
import { NewlyRevealedNotice } from '@/components/visibility/NewlyRevealedNotice';
import { requireHomeFrame } from '@/lib/home/frame';
import {
  homeBaselineAssessment,
  homeBodyAssessmentAccess,
  homeBodyAssessmentAssignment,
  homeBodyAssessments,
  homeCoachingDecision,
  homeCurrentProgram,
  homeLifestyleExperiments,
  homeMorningBrief,
  homeQuestionnaireCatalog,
  homeRootScore,
  homeWearableConnections,
} from '@/lib/home/data';

// Screen Layout System (Prompt 2): this used to be a hand-rolled
// `rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]`
// literal, duplicated verbatim across a dozen files. `.mef-card`
// (app/globals.css) is now that one recipe's single definition.
const CARD = 'mef-card';
const ZONE_LABEL = 'text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40';

function formatCompletedStatus(completedAt: string): string {
  const days = Math.floor((Date.now() - new Date(completedAt).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Completed today';
  if (days === 1) return 'Completed yesterday';
  return `Completed ${days} days ago`;
}

/**
 * Whether this screen is the welcome card or the real dashboard.
 *
 * Named and shared because two regions below have to agree on it: the day
 * frame draws either the welcome card or Quick Actions and Today, and the
 * stream below draws the rest of the zones only in the same branch.
 *
 * A member who has never checked in but already has a real active Weekly
 * Experiment (from Core Values Snapshot, Life Signal Check, or Readiness
 * Pulse, the exact free-arc path this dashboard needs to serve) still has
 * real, non-empty content: the plain "let's get started" welcome card would
 * otherwise hide the very experiment she just started, with no way to find
 * it until she also did an unrelated daily check-in. Real bug found and
 * fixed while verifying Readiness Pulse.
 */
async function memberHasRealHistory(): Promise<boolean> {
  const [recentCheckins, lifestyleExperiments] = await Promise.all([
    getRecentCheckins(30),
    homeLifestyleExperiments(),
  ]);
  return recentCheckins.length > 0 || lifestyleExperiments.some((e) => e.status === 'active');
}

/** Her program card, when her rules reveal it and a coach has actually given her one. Shared, because the Movement panel further down changes its own treatment depending on whether this exists. */
async function programHeroNode() {
  const [visibility, currentProgram] = await Promise.all([
    getMemberVisibility(),
    homeCurrentProgram(),
  ]);
  const shows = visibility.byKey.get(F.homeAssignedPrograms)?.visible ?? false;
  if (!shows || !currentProgram?.program) return null;
  return (
    <AssignedProgramsCard
      program={currentProgram.program}
      nextWorkout={currentProgram.nextWorkout}
      isNew={currentProgram.isNew}
    />
  );
}

// =====================================================================
// THE SHELL. Nothing is awaited here except lib/home/frame.ts.
// =====================================================================

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { firstCheckin?: string };
}) {
  const frame = await requireHomeFrame();
  const isFirstCheckinTransition = searchParams.firstCheckin === '1';

  return (
    <div
      className={`min-h-screen font-[family-name:var(--font-dm-sans)] ${pageBackgroundForGreeting(frame.timeContext.greetingWord)}`}
    >
      <TrackSurfaceView surface="home" />
      {/* -------------------------------------------------------- */}
      {/* Hero — full-bleed, edge to edge, sits above the padded     */}
      {/* main column entirely so the photo can reach the true       */}
      {/* viewport edges. See components/dashboard/HomeHero.tsx.      */}
      {/*                                                            */}
      {/* The frame (photo, chrome, her greeting) is in this first    */}
      {/* response. The Root Score inside it arrives next, into a     */}
      {/* box whose height was already decided, so nothing moves.     */}
      {/* -------------------------------------------------------- */}
      <HomeHeroFrame
        firstName={frame.firstName}
        greetingWord={frame.timeContext.greetingWord}
        hasCheckins={frame.hasCheckins}
      >
        <Suspense fallback={<HomeHeroBodyPlaceholder hasCheckins={frame.hasCheckins} />}>
          <HeroBodyRegion />
        </Suspense>
      </HomeHeroFrame>

      <main className="mx-auto w-full max-w-md px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Suspense fallback={<PriorityPlaceholder expectCard={frame.expectPriorityCard} />}>
          <PriorityRegion />
        </Suspense>

        <Suspense fallback={<DayFramePlaceholder />}>
          <DayFrameRegion />
        </Suspense>

        <Suspense fallback={<StreamPlaceholder />}>
          <StreamRegion />
        </Suspense>

        <Suspense fallback={null}>
          <CompletedPriorityRegion />
        </Suspense>
      </main>

      {/* -------------------------------------------------------- */}
      {/* Bottom navigation (mobile) / side rail (md+). In the first  */}
      {/* response with everything else she can reach immediately.    */}
      {/* -------------------------------------------------------- */}
      <MemberBottomNav isCoach={frame.isCoach} />

      <Suspense fallback={null}>
        <CoachLauncherRegion />
      </Suspense>

      <Suspense fallback={null}>
        <PopupRegion isFirstCheckinTransition={isFirstCheckinTransition} />
      </Suspense>

      {/* Premium UX Milestone 4, part 6 — the one-time transition shown
          immediately after a member's first-ever completed check-in. */}
      {isFirstCheckinTransition && (
        <Suspense fallback={null}>
          <FirstCheckinTransitionRegion />
        </Suspense>
      )}
    </div>
  );
}

// =====================================================================
// FAST FOLLOW
// =====================================================================

/**
 * The Root Score and the line above it.
 *
 * VISIBILITY LAYER: one authority for whether the score exists on this
 * screen. The hero's own gate ("has she ever checked in") and the score's
 * reveal rule ("at least one logged day") are the same fact, and this is
 * which of the two decides whether the number is drawn, so they cannot
 * drift apart later. The frame above has already committed to the tall
 * hero on `hasCheckins` alone; in the one case where those two can differ
 * (the visibility layer failing to read anything at all) she gets the tall
 * hero with her greeting in it and no score claim, which is the honest
 * thing to draw rather than a number nothing stands behind.
 */
async function HeroBodyRegion() {
  const frame = await requireHomeFrame();
  const [todaysCheckin, rootScoreSnapshot, visibility] = await Promise.all([
    getTodaysCheckin(frame.localDate),
    homeRootScore(),
    getMemberVisibility(),
  ]);

  const showsScore = frame.hasCheckins && (visibility.byKey.get(F.rootScore)?.visible ?? false);

  // Copy-and-honesty pass (2026-08-14): the greeting line sits directly
  // above the Root Score and its change pill, so it is handed the very
  // same number the pill renders. A score that is down or flat switches
  // the line to the neutral set; it can no longer say "Good start to the
  // day" over a score reading points down. See lib/dashboard/greeting.ts.
  const greetingLine = buildGreetingLine({
    greetingWord: frame.timeContext.greetingWord,
    hasCheckinToday: !!todaysCheckin,
    localDate: frame.localDate,
    scoreDirection: scoreDirectionFromChange(rootScoreSnapshot?.root_score_change),
  });

  return (
    <HomeHeroBody
      greetingLine={greetingLine}
      snapshot={rootScoreSnapshot}
      hasCheckins={showsScore}
    />
  );
}

/**
 * THE PRIORITY CARD, inline. The same card the Root pop-up delivers on
 * open, reading the same member_daily_priorities row, so whatever she did
 * in the pop-up is already reflected here with no syncing. First thing in
 * <main> on Home, above the invites and everything else. A saved card is
 * deliberately not rendered here: saving demotes it out of the dominant
 * slot, and Today is where it keeps its collapsed home.
 *
 * Completed-priority behavior (2026-08-14): this dominant slot holds the
 * card only while it is ACTIVE. Once she taps Done it leaves the top and
 * settles as a compact accomplished card at the bottom of this page (see
 * CompletedPriorityRegion) and of Today, for the rest of her own calendar
 * day. That is the same single member_daily_priorities row in both places,
 * keyed to her own local date, so it is gone tomorrow with no expiry logic
 * of its own.
 *
 * NOTHING refills this slot. The engine commits to one priority per day
 * (lib/priority/service.ts: today's stored row is authoritative and is
 * never re-selected), so a completed day leaves the top genuinely empty
 * rather than inventing a second focus. What may appear here next is only
 * a genuinely pending finite item that already had its own card: a coach
 * assignment or the next unstarted conversation (DashboardInviteCards,
 * lower down, which renders nothing when there is neither), and the day-3 /
 * day-7 follow-ups, which keep their own place in the Root pop-up chain
 * and in Active Experiments.
 *
 * ONE FOCUS (Member Interpretation Layer, 2026-08-17). Home holds the card
 * itself only while it is ACTIVE; a saved card keeps its collapsed home on
 * Today and a completed one settles at the bottom of this page. That left
 * Home naming no focus at all on a day she had set hers aside, while Root
 * Score, Today and Talk to Root all named it. `TodaysFocusLine` states the
 * same one, from the same engine, and points at where the card actually
 * is. It is a pointer with no buttons: there is still exactly one place to
 * act on it.
 *
 * The card reports nothing about being shown from here. Which presentation
 * she actually got is decided by the pop-up chain, so the analytics call
 * lives with the chain, in PopupRegion below.
 */
async function PriorityRegion() {
  const priority = await getMyPriorityView();
  if (!priority) return null;
  const isActive = priority.status === 'active';

  if (!isActive) {
    return (
      <div className="pt-3">
        <TodaysFocusLine href="/today" />
      </div>
    );
  }

  return (
    <div className="pt-3">
      <PriorityCard view={priority} />
    </div>
  );
}

/**
 * The frame of her day: the one plain sentence about anything newly
 * revealed, her program, the weekly review, the priority invites, and then
 * either the welcome card or Quick Actions and Today.
 *
 * Everything in here is something she reads or taps in the first screenful,
 * which is why it is one boundary rather than five: five boundaries over
 * one screenful is five separate settles in front of her.
 */
async function DayFrameRegion() {
  const [
    visibility,
    hasRealHistory,
    programHero,
    weeklyReview,
    weeklyReflection,
    catalog,
    bodyAssessmentCard,
  ] = await Promise.all([
      getMemberVisibility(),
      memberHasRealHistory(),
      programHeroNode(),
      getMyWeeklyReview(),
      // Request-memoized, and the pop-up chain in PopupRegion asks for the
      // same thing on the same render, so this costs one composition
      // between them rather than two.
      getMyWeeklyReflection(),
      homeQuestionnaireCatalog(),
      homeBodyAssessmentAssignment(),
    ]);
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  return (
    <>
      {/* ==================================================== */}
      {/* THE ONE PLAIN SENTENCE. Anything her rules revealed     */}
      {/* that she has not been told about yet, in Root's voice,  */}
      {/* directly under the day's one priority and above         */}
      {/* everything else. No buttons: this explains, it does not  */}
      {/* compete with the card above it for the day's action.     */}
      {/* ==================================================== */}
      <NewlyRevealedNotice reveals={visibility.newlyRevealed} />

      {/* ==================================================== */}
      {/* HER PROGRAM. The hero of this screen when one exists.   */}
      {/*                                                          */}
      {/* It used to be one of three blocks inside the "Today"     */}
      {/* zone, below Quick Actions, in the same white card        */}
      {/* language as everything around it. It is the most         */}
      {/* personal thing on Home, a prescription a coach wrote for */}
      {/* one member, and it now leads the page.                   */}
      {/*                                                          */}
      {/* Above the invites deliberately: those render the same    */}
      {/* deep green treatment, and a hero sitting underneath      */}
      {/* another full-bleed green panel is not a hero. The one    */}
      {/* thing outranking it is still the day's single priority   */}
      {/* directly above, and the sentence explaining it.          */}
      {/*                                                          */}
      {/* WHO sees it did not change. It is gated on the same      */}
      {/* hasRealHistory the branch below uses, so a member with   */}
      {/* no check-in history still gets the welcome card and      */}
      {/* nothing else.                                            */}
      {/*                                                          */}
      {/* No zone label: a heading over a card whose own eyebrow   */}
      {/* already says "Your program" is a second, quieter voice   */}
      {/* saying the same thing. No RevealOnScroll either: a hero  */}
      {/* that fades in as you scroll to it is a hero you already  */}
      {/* scrolled past.                                           */}
      {/* ==================================================== */}
      {hasRealHistory && programHero && <div className="pt-6 md:pt-8">{programHero}</div>}

      {/* ==================================================== */}
      {/* THE WEEKLY REFLECTION, persistent (program tier only). */}
      {/*                                                        */}
      {/* Above the Weekly Root Review for the same reason its   */}
      {/* pop-up sits above the review's in the chain: this one  */}
      {/* asks something of her and closes on Sunday night, and  */}
      {/* the review is a report that stays all week.            */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY, deliberately, and it is the one     */}
      {/* card on this page without one. membership tier is the  */}
      {/* whole gate (lib/weekly-reflection/access.ts); a reveal */}
      {/* rule on top of it would be the second invisible lock   */}
      {/* the standing rules forbid, and "why can she not see    */}
      {/* it" would stop having one answer.                      */}
      {/*                                                        */}
      {/* Renders nothing once she has finished the week, and    */}
      {/* nothing on Monday through Thursday: getMyWeeklyReflection */}
      {/* returns null or 'completed' in those cases.            */}
      {/* ==================================================== */}
      {weeklyReflection?.status === 'pending' && (
        <div className="pt-3">
          <WeeklyReflectionEntry />
        </div>
      )}

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
      {/* FIX 5, 2026-08-03). Deliberately NOT gated on           */}
      {/* hasRealHistory, since a brand-new member with zero      */}
      {/* check-ins is exactly who needs this reachable. Renders  */}
      {/* nothing when there is neither.                          */}
      {/* See components/dashboard/DashboardInviteCards.tsx.      */}
      {/* ==================================================== */}
      {shows(F.homeInviteCards) && (
        <DashboardInviteCards catalog={catalog} bodyAssessmentCard={bodyAssessmentCard} />
      )}

      {!hasRealHistory ? (
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
          <QuickActionsZone />

          {/* ==================================================== */}
          {/* Today — Root's Daily Brief and today's honest line      */}
          {/* when nothing is logged yet.                             */}
          {/* ==================================================== */}
          <TodayZone />
        </div>
      )}
    </>
  );
}

/**
 * Quick Actions.
 *
 * The Case pill carries no second line. C2 (2026-08-27): it used to carry
 * `${completedCount} of ${totalCount} complete`, which is the QUESTIONNAIRE
 * count, printed again verbatim two zones lower under QUESTIONNAIRES. On the
 * pill it read as "your Case is 4 of 8 done", which is not a thing the Case
 * has or could have. There is no real completion fraction for a case, so
 * the pill carries no second line rather than borrowing a true number from
 * somewhere it is not about. Its own zone still shows the questionnaire
 * count, once.
 */
async function QuickActionsZone() {
  const [visibility, bodyAssessments] = await Promise.all([
    getMemberVisibility(),
    homeBodyAssessments(),
  ]);
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  // bodyAssessments is ordered newest-first (see lib/body-assessment/data.ts),
  // so the first completed one is the most recent.
  const latestAnalyzedAssessment = bodyAssessments.find((a) => a.completed_at !== null);
  const movementActionStatus = latestAnalyzedAssessment
    ? formatCompletedStatus(latestAnalyzedAssessment.completed_at!)
    : null;
  const caseStatus: string | null = null;

  return (
    <>
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
    </>
  );
}

/**
 * Today.
 *
 * Home cleanup pass (2026-08-14). Two blocks that used to live in this zone
 * are gone from Home:
 *
 *   Today's Wellness (DailyWellnessSection, "Daily Reset 60", "Daily
 *   Wellness Score 60") is removed outright. Two unexplained numbers
 *   competing with the Root Score directly above them is one score too many
 *   on a narrative screen. The scores themselves
 *   (lib/wellness/morningReadiness.ts, lib/wellness/dailyWellnessScore.ts)
 *   and their tests are untouched.
 *
 *   Today's Numbers moved to the Today tab
 *   (components/today/TodaysNumbersGrid.tsx). Home keeps the narrative,
 *   Today is the data and logging surface. What remains here is only the
 *   half of that block that was never a number: the honest line for a day
 *   with no check-in logged yet.
 *
 * The zone disappears with its label when every block in it is hidden,
 * rather than leaving a heading over nothing.
 */
async function TodayZone() {
  const frame = await requireHomeFrame();
  const [visibility, todaysCheckin, morningBrief, rootScoreSnapshot] = await Promise.all([
    getMemberVisibility(),
    getTodaysCheckin(frame.localDate),
    homeMorningBrief(),
    homeRootScore(),
  ]);
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  const morningBriefNode =
    morningBrief && shows(F.dailyBrief) ? (
      <MorningBriefCard brief={morningBrief} rootScoreSnapshot={rootScoreSnapshot} />
    ) : null;

  const checkinPromptNode = todaysCheckin ? null : (
    <div className="flex items-center justify-between gap-3 border-b border-[#1B3A2D]/8 py-4">
      <p className="text-sm text-[#6B7A72]">
        Once today&apos;s check-in is done, your numbers are on the Today tab.
      </p>
    </div>
  );

  const TODAY_CARD_NODES: Record<TodayCardKey, React.ReactNode> = {
    morning_brief: morningBriefNode,
    checkin_prompt: checkinPromptNode,
  };
  // Dashboard Evolution (Prompt 5), requirement 3: card prioritization.
  // Same blocks as before, now in the order
  // lib/dashboard/prioritization.ts's orderTodayCards computes from real
  // state (whether today's check-in exists) — the check-in prompt leads
  // when it is not done yet, today's real progress leads once it is. Every
  // block still renders exactly what it always did; only its position
  // changes.
  const todayCardOrder = orderTodayCards(!!todaysCheckin);
  if (!todayCardOrder.some((key) => TODAY_CARD_NODES[key] !== null)) return null;

  return (
    <RevealOnScroll delayMs={60} className="mt-8 md:mt-10">
      <p className={ZONE_LABEL}>Today</p>
      <div className="mt-4 space-y-4">
        {todayCardOrder.map((key) => (
          <Fragment key={key}>{TODAY_CARD_NODES[key]}</Fragment>
        ))}
      </div>
    </RevealOnScroll>
  );
}

// =====================================================================
// STREAMS IN BEHIND
// =====================================================================

/**
 * Everything below the first screenful: Active Experiments, the Personal
 * Reset Plan, Your Path, What Root Is Noticing, Trends and Your Device.
 *
 * All of it is gated on the same `hasRealHistory` the day frame above uses,
 * so a member still on the welcome card gets none of it, exactly as before.
 */
async function StreamRegion() {
  const [visibility, hasRealHistory] = await Promise.all([
    getMemberVisibility(),
    memberHasRealHistory(),
  ]);
  if (!hasRealHistory) return null;
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  return (
    <>
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

      <Suspense fallback={null}>
        <YourPathZone />
      </Suspense>

      {/* ==================================================== */}
      {/* What Root Is Noticing — What We're Noticing, Your Root  */}
      {/* Map, From Root, Recommended For You, and (Root Presence  */}
      {/* System, Prompt 4) a one-time Discovery card, as a         */}
      {/* horizontal carousel of image-backed vertical cards        */}
      {/* (components/dashboard/NoticingTile.tsx). Each card keeps  */}
      {/* its own boundary and independent fetch; a card that has    */}
      {/* nothing to say just isn't in the row (no gap, no           */}
      {/* placeholder). Tapping a card either navigates to its       */}
      {/* existing destination (Root Map, Recommendations) or opens  */}
      {/* a bottom sheet with the full original content.             */}
      {/* ==================================================== */}
      {shows(F.homeNoticingCarousel) && (
        <RevealOnScroll delayMs={60} className="mt-14 md:mt-20">
          <p className={ZONE_LABEL}>What Root Is Noticing</p>
          {/* Dashboard Evolution (Prompt 5), requirement 3: a new
              discovery moment outranks routine cards whenever one
              exists — RootDiscoveryCard leads this carousel
              (lib/dashboard/prioritization.ts's NOTICING_CARD_ORDER).
              It renders nothing at all on a day with no genuinely new
              finding, so this reordering costs nothing visually on
              every other day; no extra fetch was added to decide this,
              each tile still independently self-gates. */}
          <div className="mt-4">
            <ScrollCarousel>
              <Suspense fallback={<NoticingTilePlaceholder />}>
                <RootDiscoveryCard />
              </Suspense>
              <Suspense fallback={<NoticingTilePlaceholder />}>
                <WhatWereNoticingCard />
              </Suspense>
              <Suspense fallback={<NoticingTilePlaceholder />}>
                <RootMapCard />
              </Suspense>
              <Suspense fallback={<NoticingTilePlaceholder />}>
                <CoachingMessageCard />
              </Suspense>
              <Suspense fallback={<NoticingTilePlaceholder />}>
                <RecommendationsCard />
              </Suspense>
            </ScrollCarousel>
          </div>
        </RevealOnScroll>
      )}

      <Suspense fallback={null}>
        <TrendsZone />
      </Suspense>

      <Suspense fallback={null}>
        <YourDeviceZone />
      </Suspense>
    </>
  );
}

/**
 * Your Path — Guided Posture & Movement Assessment (image-backed card),
 * Questionnaires (plain row + progress bar), Personalized Insights (white
 * card, or nothing yet). Movement goes first and Questionnaires
 * last-if-Comprehensive-is-absent on purpose: Comprehensive (white) is
 * conditional and can be null, and the zone right after this one is an
 * image-backed carousel — ending on image-backed here too (if Movement were
 * last) would repeat that treatment back to back. With Movement first, this
 * zone always ends on Comprehensive (white) or Questionnaires (row), never
 * image-backed, regardless of which cards are present.
 *
 * VISIBILITY LAYER: no locked card ever renders here now. The Movement
 * Assessment used to appear for every member with a "Locked" treatment,
 * which is still an advertisement for something she cannot have. It appears
 * when her own rule reveals it and does not exist otherwise, and
 * `bodyAssessmentAccess` remains the independent server-side permission
 * check behind the route itself.
 */
async function YourPathZone() {
  const [visibility, bodyAssessments, bodyAssessmentAccess, catalog, baseline, programHero] =
    await Promise.all([
      getMemberVisibility(),
      homeBodyAssessments(),
      // Coach-Assign-Only Gating task (2026-08-04): Body Assessment is
      // requiresAssignment, same as Four Doctors/Primal Pattern/Short-HAQ/
      // WBSA — a free member with no history and no pending assignment sees
      // MovementAssessmentCard locked, not an open "Start Assessment"
      // invite. checkAssessmentAccess already lets through anyone with real
      // history or a pending assignment (never hides progress), so this is
      // safe to call unconditionally.
      homeBodyAssessmentAccess(),
      homeQuestionnaireCatalog(),
      homeBaselineAssessment(),
      programHeroNode(),
    ]);
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  if (
    !shows(F.homeMovementAssessmentCard) &&
    !shows(F.homeQuestionnairesCard) &&
    !shows(F.homeComprehensiveCard)
  ) {
    return null;
  }

  return (
    <RevealOnScroll delayMs={0} className="mt-14 md:mt-20">
      <p className={ZONE_LABEL}>Your Path</p>
      <div className="mt-4 space-y-4">
        {shows(F.homeMovementAssessmentCard) && (
          /* SECOND, NOT EQUAL (polish pass, 2026-08-18). This panel and the
             program hero above share one visual treatment, the deep-green
             image-backed one, and two of them on one screen is two heroes
             and therefore none. When her coach has actually given her a
             program, that is the screen's hero and this drops to the plain
             white card language it already has and already uses on the
             Today tab. With no program, it keeps the full treatment. */
          <MovementAssessmentCard
            assessments={bodyAssessments}
            variant={programHero ? 'card' : 'imageBacked'}
            locked={!bodyAssessmentAccess.allowed}
            lockMessage={
              bodyAssessmentAccess.allowed
                ? undefined
                : lockNoteMessage(bodyAssessmentAccess.reason)
            }
            lockReason={
              bodyAssessmentAccess.allowed ? undefined : bodyAssessmentAccess.reason.kind
            }
            lockPlanHref={
              !bodyAssessmentAccess.allowed && lockOffersPlanLink(bodyAssessmentAccess.reason)
                ? '/membership'
                : undefined
            }
          />
        )}
        {shows(F.homeQuestionnairesCard) && (
          <QuestionnairesHomeCard
            completedCount={catalog.completedCount}
            totalCount={catalog.totalCount}
          />
        )}
        {shows(F.homeComprehensiveCard) && (
          <ComprehensiveAssessmentCard
            baseline={baseline}
            movementCompleted={bodyAssessments.some((a) => a.completed_at !== null)}
          />
        )}
      </div>
    </RevealOnScroll>
  );
}

/**
 * Trends — Energy Trend, real recent check-ins, the line draws in on scroll
 * via AnimatedEnergyTrendChart (a wrapper around the unmodified,
 * coach-shared EnergyTrendChart, see that wrapper's own comment).
 */
async function TrendsZone() {
  const frame = await requireHomeFrame();
  const [visibility, recentCheckins] = await Promise.all([
    getMemberVisibility(),
    getRecentCheckins(30),
  ]);
  if (!(visibility.byKey.get(F.homeTrendsEnergy)?.visible ?? false)) return null;

  return (
    <RevealOnScroll delayMs={0} className="mt-14 md:mt-20">
      <p className={ZONE_LABEL}>Trends</p>
      <section className={`${CARD} mt-4`}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Energy Trend</p>
        </div>
        <AnimatedEnergyTrendChart checkins={recentCheckins} todayLocalDate={frame.localDate} />
      </section>
    </RevealOnScroll>
  );
}

/**
 * Your Device. Was "Coming Up", and held two things: a permanently empty
 * "Next session: nothing scheduled yet / Coming soon" row, and the wearable
 * panel.
 *
 * The next-session row is GONE. There is no booking system, so it could
 * only ever tell every member that nothing is scheduled. A row that can
 * never say anything else is not a feature waiting for an audience, and
 * "Coming soon" on a member's first screen is a promise nobody made.
 *
 * The wearable panel survives, and is revealed only when her own sleep or
 * recovery has come up more than once, or she already has a device. See
 * components/wearables/ConnectWearableCard.tsx.
 */
async function YourDeviceZone() {
  const [visibility, wearableConnections, decision] = await Promise.all([
    getMemberVisibility(),
    homeWearableConnections(),
    homeCoachingDecision(),
  ]);
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;
  const hasConnectedWearable = wearableConnections.some((c) => c.status === 'connected');

  return (
    <>
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
                Your device is connected. Recovery numbers will appear here after your first sync.
              </p>
            </div>
          )
        ) : (
          <ConnectWearableCard variant="dashboard" />
        )}
      </div>
        </RevealOnScroll>
      )}
    </>
  );
}

/**
 * THE COMPLETED PRIORITY, in its compact accomplished state, at the very
 * bottom of Home.
 *
 * One shared state, one row: this is the same member_daily_priorities row
 * the card at the top read, so Done in the pop-up, on Home, or on Today all
 * land here. It persists for the rest of her own calendar day because the
 * row is keyed to her local date, and tomorrow's row is simply a new one;
 * nothing expires this card by hand. Outside the check-in-history branch
 * deliberately, so a member with no check-ins yet who completes her
 * priority still sees what she finished. Only 'done' lands here. A saved
 * card keeps its existing collapsed home on Today.
 */
async function CompletedPriorityRegion() {
  const priority = await getMyPriorityView();
  const isDone = priority?.status === 'done';
  if (!priority || !isDone) return null;
  return (
    <div className="mt-10">
      <PriorityCard view={priority} collapsed />
    </div>
  );
}

/** Root's chat launcher, carrying today's wellness index as its entry context. */
async function CoachLauncherRegion() {
  const frame = await requireHomeFrame();
  const todaysCheckin = await getTodaysCheckin(frame.localDate);
  return (
    <FloatingCoachLauncher
      entryPoint="dashboard"
      entryContext={buildDashboardEntryContext(calculateWellnessIndex(inputsFromCheckin(todaysCheckin)))}
    />
  );
}

/**
 * Root's pop-up message (day-3/day-7 Weekly Experiment follow-ups, each
 * experience's own one-time "start it later" offer, a coach-assigned
 * questionnaire, or the next unstarted free-arc conversation) and the
 * wearable welcome modal, arbitrated so they never stack — see
 * components/dashboard/HomeScreenPopups.tsx.
 *
 * FIX 5 (2026-08-03): the pop-up is deliberately NOT gated on hasCheckins.
 * A brand-new member with zero check-ins can still have a coach assignment
 * or a free-arc conversation waiting, and that is exactly the member this
 * fix needs to reach. Still suppressed during the one-time first-check-in
 * transition, never alongside another pop-up.
 *
 * VISIBILITY LAYER (2026-08-17): `showWearablePrompt` is always false and
 * the prop is left in place only so the pop-up chain's own arbitration code
 * is untouched. The same wearable pitch was on this screen twice on one
 * load, as a full-bleed panel and as a modal over it, for a member thirteen
 * days in with no device. The panel is the one that survives, and it is
 * gated; a second delivery of a gated pitch would defeat the gate.
 *
 * WHICH PRESENTATION SHE GOT IS DECIDED HERE, AND ONLY HERE. The pop-up and
 * the inline card mount in the same paint on Home, so if both reported
 * themselves the recorded presentation would be a race between two round
 * trips, and "was she interrupted with this or did she browse to it" would
 * be unanswerable. The pop-up is what genuinely reached her first whenever
 * it is showing, so it reports and the inline card does not. On Today,
 * where no pop-up exists, the inline card always reports. That is why
 * `TrackPriorityShown` for the INLINE presentation is rendered from here
 * rather than from PriorityRegion: this is the boundary that holds the
 * chain's answer, so it is the only one that can tell the two apart.
 */
async function PopupRegion({ isFirstCheckinTransition }: { isFirstCheckinTransition: boolean }) {
  const [rootPopupMessage, priority] = await Promise.all([
    getMyRootPopupMessageAction(),
    getMyPriorityView(),
  ]);

  const deliveredMessage = isFirstCheckinTransition ? null : rootPopupMessage;
  const priorityShownAsPopup = deliveredMessage?.kind === 'priority_card';

  return (
    <>
      {priority?.status === 'active' && !priorityShownAsPopup && (
        <TrackPriorityShown
          rule={priority.selected.rule}
          isReEntry={priority.isReEntry}
          presentation="inline"
        />
      )}
      <HomeScreenPopups rootPopupMessage={deliveredMessage} showWearablePrompt={false} />
    </>
  );
}

/** The one-time transition shown immediately after a member's first-ever completed check-in. */
async function FirstCheckinTransitionRegion() {
  const [frame, bodyAssessments] = await Promise.all([
    requireHomeFrame(),
    homeBodyAssessments(),
  ]);
  return (
    <FirstCheckinTransition
      firstName={frame.firstName}
      hasMovementAssessment={bodyAssessments.length > 0}
    />
  );
}
