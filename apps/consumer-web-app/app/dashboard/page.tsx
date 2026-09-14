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
 * boundaries. Since the editorial pass (2026-09-13) it is the order of
 * the seven questions this screen exists to answer, and it is the same
 * whether a boundary resolves first or last, because React puts a
 * boundary's content back in its own place regardless:
 *
 *   1. HERO          how am I doing        (the band alone)
 *   2. QUICK ACTIONS what can I do now     (its own boundary, and the
 *                                           FIRST thing in <main>)
 *   3. ASSIGNED      is anything owed      (every open assignment,
 *                                           including the coach-assigned
 *                                           questionnaires)
 *   4. YOUR PROGRAM  where am I up to
 *   5. WEEKLY/ACTIVE what else is running  (the weekly review, the
 *                                           free-arc invite, Today, the
 *                                           day's chosen action, the
 *                                           experiments, the reset plan)
 *   6. INSIGHTS      what is Root noticing (the carousel, energy)
 *   7. YOUR PATH     what can I explore    (history, the wearable)
 *
 * and the completed priority settles under all of it.
 *
 * THE DAY'S CHOSEN ACTION IS NO LONGER THE SECOND THING SHE SEES (final
 * structural pass, 2026-09-13). It was the feature card immediately under
 * the hero, which meant the top of Home was a photograph and then a task,
 * and the row of shortcuts that answers "what can I do right now" was
 * below both. A member arriving at her own home screen should be offered
 * her doors before she is handed a job. So Quick Actions leads <main>,
 * and the priority card sits in the active/today part of the page in the
 * ordinary card treatment both screens share, with its behaviour, its
 * actions, its motion and its writes untouched.
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
import { TrackWeeklyReflectionDelivered } from '@/components/weekly-reflection/TrackWeeklyReflectionDelivered';
import { getMyWeeklyReflection } from '@/lib/weekly-reflection/view';
import { StressLoadEntry } from '@/components/stress-load/StressLoadEntry';
import { BodySystemsEntry } from '@/components/body-systems/BodySystemsEntry';
import { WholeBodySignalEntry } from '@/components/whole-body-signal/WholeBodySignalEntry';
import { BreathingCheckInEntry } from '@/components/breathing-check-in/BreathingCheckInEntry';
import { getMyStressLoadDeepDive } from '@/lib/stress-load/view';
import { getMyBodySystemsSurvey } from '@/lib/body-systems/view';
import { getMyWholeBodySignal } from '@/lib/whole-body-signal/view';
import { HealthIntakeEntry } from '@/components/health-intake/HealthIntakeEntry';
import { getMyHealthIntake } from '@/lib/health-intake/view';
import { getMyBreathingCheckIn } from '@/lib/breathing-check-in/view';
import { OwningYourValueEntry } from '@/components/owning-your-value/OwningYourValueEntry';
import { getMyOwningYourValue } from '@/lib/owning-your-value/view';
import { WhereYourJoyLivesEntry } from '@/components/where-your-joy-lives/WhereYourJoyLivesEntry';
import { getMyWhereYourJoyLives } from '@/lib/where-your-joy-lives/view';
import { TheGivingLedgerEntry } from '@/components/the-giving-ledger/TheGivingLedgerEntry';
import { getMyTheGivingLedger } from '@/lib/the-giving-ledger/view';
import { TheWeightOfYesEntry } from '@/components/the-weight-of-yes/TheWeightOfYesEntry';
import { getMyTheWeightOfYes } from '@/lib/the-weight-of-yes/view';
import { BeingSeenEntry } from '@/components/being-seen/BeingSeenEntry';
import { getMyBeingSeen } from '@/lib/being-seen/view';
import { WhatYouPutDownEntry } from '@/components/what-you-put-down/WhatYouPutDownEntry';
import { getMyWhatYouPutDown } from '@/lib/what-you-put-down/view';
import { YourOwnCompanyEntry } from '@/components/your-own-company/YourOwnCompanyEntry';
import { getMyYourOwnCompany } from '@/lib/your-own-company/view';
import { TheLifeYoureBuildingEntry } from '@/components/the-life-youre-building/TheLifeYoureBuildingEntry';
import { getMyTheLifeYoureBuilding } from '@/lib/the-life-youre-building/view';
import { getMyRootPopupMessageAction } from '@/app/actions/rootPopupMessages';
import { MorningBriefCard } from '@/components/MorningBriefCard';
import { FirstCheckInWelcome } from '@/components/FirstCheckInWelcome';
import { FirstCheckinTransition } from '@/components/FirstCheckinTransition';
import { ComprehensiveAssessmentCard } from '@/components/ComprehensiveAssessmentCard';
import { MovementAssessmentCard } from '@/components/MovementAssessmentCard';
import { lockNoteMessage, lockOffersPlanLink } from '@/lib/locked-content/copy';
import { AssignedProgramsCard } from '@/components/AssignedProgramsCard';
import { QuestionnairesHomeCard } from '@/components/questionnaires/QuestionnairesHomeCard';
import { pickHomeNextQuestionnaire } from '@/lib/questionnaires/homeNextQuestionnaire';
import {
  AssignedInviteCards,
  FreeArcInviteCards,
  assignedInviteCandidates,
} from '@/components/dashboard/DashboardInviteCards';
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
  QuickActionsPlaceholder,
  StreamPlaceholder,
} from '@/components/dashboard/HomePlaceholders';
import {
  QuickActionsGrid,
  type QuickAction,
} from '@/components/dashboard/QuickActionsGrid';
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
import { RegionErrorBoundary } from '@/components/RegionErrorBoundary';
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
// (app/globals.css) is now that one recipe's single definition, and on
// this screen `.mef-home .mef-card` softens it: a hairline instead of a
// shadow edge, so a card reads as sitting on the cream rather than
// floating over it.
const CARD = 'mef-card';
// Home presentation pass (2026-09-13): was a hand-copied
// `text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40`,
// with its own duplicate in two other files. `.mef-home-label`
// (app/globals.css) is the one definition, a point smaller and a step
// wider, so a section's name reads as a name and not as a second heading
// competing with the content it introduces.
const ZONE_LABEL = 'mef-home-label';
// The one gap between two major sections of this page. It replaced
// mt-8/mt-10/mt-14/mt-20, which were four answers to one question.
const SECTION = 'mef-home-section';

/**
 * WHERE "YOUR WEEK WITH ROOT" ACTUALLY LIVES.
 *
 * The Weekly Root Review has no route of its own and never has: it is a
 * collapsed entry on this page (WeeklyReviewEntry, below), reading the
 * member_weekly_reviews row the Monday pop-up read. So the Quick Actions
 * tile for it points at that entry by anchor rather than at a screen
 * nobody built, and this is the one definition of both halves, so the
 * link and the element it lands on cannot drift apart.
 */
const WEEKLY_REVIEW_ANCHOR_ID = 'your-week-with-root';
const WEEKLY_REVIEW_ANCHOR_HREF = `/dashboard#${WEEKLY_REVIEW_ANCHOR_ID}`;

/**
 * A QUICK ACTION'S STATUS IS AS SHORT AS THE TILE IS NARROW (2026-09-13).
 *
 * This line is read inside a tile that is 116px wide at 320px, which
 * leaves 86px for the text, and it is the only line in the row that grows
 * with a number. "Completed 26 days ago" needed both of the two lines the
 * hint is allowed and still left nothing in reserve: one more word, one
 * larger system font, one longer gap since her last assessment, and the
 * clamp starts hiding a true sentence.
 *
 * So it is shortened at the source rather than given more room. "Done 26d
 * ago" says the same thing on ONE line at every supported width, which is
 * also the calmer object: a thumb-sized tile is a glance, not a sentence.
 * Nothing else changed about it, including which tile carries it and on
 * what condition.
 */
function formatCompletedStatus(completedAt: string): string {
  const days = Math.floor((Date.now() - new Date(completedAt).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Done today';
  if (days === 1) return 'Done yesterday';
  return `Done ${days}d ago`;
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
      /* Home's own label treatment, light enough to read on this card's
         deep green. The card is shared with /movement, which passes
         nothing and keeps the 12px eyebrow it has always had. */
      labelClassName="mef-home-label-light"
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
    /* `mef-home` is the scope every rule in app/globals.css's Home block
       hangs off, and it is on this element and on nothing else in the app.
       See that block's own header for what it carries and why it is scoped
       rather than applied to `.mef-card` everywhere. */
    <div
      className={`mef-home min-h-screen font-[family-name:var(--font-dm-sans)] ${pageBackgroundForGreeting(frame.timeContext.greetingWord)}`}
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
        {/* Each region carries its own boundary: after the shell has been
            flushed there is nothing between a failed read and app/error.tsx,
            which is the whole route. See components/RegionErrorBoundary.tsx.
            The hero body is silent because a retry card on a photograph,
            under her greeting, is worse than the greeting standing alone. */}
        <RegionErrorBoundary silent>
          <Suspense fallback={<HomeHeroBodyPlaceholder hasCheckins={frame.hasCheckins} />}>
            <HeroBodyRegion />
          </Suspense>
        </RegionErrorBoundary>
      </HomeHeroFrame>

      <main className="mx-auto w-full max-w-md px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        {/* QUICK ACTIONS, the first thing in <main> and the first thing
            under the hero: "what can I do right now", asked immediately
            after "how am I doing". Its own boundary so that a row of
            shortcuts is not held behind the twenty reads the day frame
            makes. Silent on failure: a broken row of shortcuts is better
            as no row than as a retry card wedged directly under her
            greeting. */}
        <RegionErrorBoundary silent>
          <Suspense fallback={<QuickActionsPlaceholder />}>
            <QuickActionsRegion />
          </Suspense>
        </RegionErrorBoundary>

        <RegionErrorBoundary message="Your day didn't load.">
          <Suspense fallback={<DayFramePlaceholder />}>
            <DayFrameRegion />
          </Suspense>
        </RegionErrorBoundary>

        {/* THE DAY'S ONE CHOSEN ACTION, in the active/today part of the
            page rather than at the top of it. It keeps its own boundary,
            so it still arrives independently of everything around it, and
            it keeps every read, every action and every write it had. What
            changed is where it is and how heavy it looks. */}
        <RegionErrorBoundary message="Today's focus didn't load.">
          <Suspense fallback={<PriorityPlaceholder expectCard={frame.expectPriorityCard} />}>
            <PriorityRegion />
          </Suspense>
        </RegionErrorBoundary>

        <RegionErrorBoundary message="The rest of your screen didn't load.">
          <Suspense fallback={<StreamPlaceholder />}>
            <StreamRegion />
          </Suspense>
        </RegionErrorBoundary>

        <RegionErrorBoundary silent>
          <Suspense fallback={null}>
            <CompletedPriorityRegion />
          </Suspense>
        </RegionErrorBoundary>
      </main>

      {/* -------------------------------------------------------- */}
      {/* Bottom navigation (mobile) / side rail (md+). In the first  */}
      {/* response with everything else she can reach immediately.    */}
      {/* -------------------------------------------------------- */}
      <MemberBottomNav isCoach={frame.isCoach} />

      <RegionErrorBoundary silent>
        <Suspense fallback={null}>
          <CoachLauncherRegion />
        </Suspense>
      </RegionErrorBoundary>

      <RegionErrorBoundary silent>
        <Suspense fallback={null}>
          <PopupRegion isFirstCheckinTransition={isFirstCheckinTransition} />
        </Suspense>
      </RegionErrorBoundary>

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
 * in the pop-up is already reflected here with no syncing. A saved card is
 * deliberately not rendered here: saving demotes it out of this slot, and
 * Today is where it keeps its collapsed home.
 *
 * WHERE IT SITS (final structural pass, 2026-09-13). It was the first
 * block in <main> and it was drawn as the one feature card on the page.
 * Both are gone: it renders in the active/today half of Home, under the
 * Today zone, in the ordinary card treatment that the Today screen has
 * always used for the identical card. The reason is the shape of the top
 * of this screen rather than anything about the card. A member opening
 * her own home screen met a photograph and then a task, with the row of
 * doors that answers "what can I do right now" below both, so the day's
 * job was the only thing on offer. The engine, the stored row, the
 * buttons, the motion and everything this card writes are byte for byte
 * unchanged; it is smaller and it is lower.
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
      <div className={SECTION}>
        <TodaysFocusLine href="/today" />
      </div>
    );
  }

  /* ONE CARD ON BOTH SCREENS. Home passes no variant, exactly as the
     Today tab does, so the two surfaces render the identical object from
     the identical view. The card carries its own `mt-6`, so the wrapper
     adds the remainder of the page's one section gap (3.5rem) rather
     than stacking a second gap on top of it. */
  return (
    <div className="mt-8">
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
    stressLoad,
    bodySystems,
    wholeBodySignal,
    healthIntake,
    breathingCheckIn,
    owningYourValue,
    whereYourJoyLives,
    theGivingLedger,
    theWeightOfYes,
    beingSeen,
    whatYouPutDown,
    yourOwnCompany,
    theLifeYoureBuilding,
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
      // Request-memoized, exactly as the reflection above is, and the
      // pop-up chain in PopupRegion asks for the same thing on the same
      // render, so this costs one composition between them rather than two.
      getMyStressLoadDeepDive(),
      // Request-memoized, exactly as the deep-dive above is, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyBodySystemsSurvey(),
      getMyWholeBodySignal(),
      // Request-memoized, exactly as the three above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyHealthIntake(),
      // Request-memoized, exactly as the four above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyBreathingCheckIn(),
      // Request-memoized, exactly as the five above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyOwningYourValue(),
      // Request-memoized, exactly as the three above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyWhereYourJoyLives(),
      // Request-memoized, exactly as the four above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyTheGivingLedger(),
      // Request-memoized, exactly as the five above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyTheWeightOfYes(),
      // Request-memoized, exactly as the six above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyBeingSeen(),
      // Request-memoized, exactly as the seven above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyWhatYouPutDown(),
      // Request-memoized, exactly as the eight above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyYourOwnCompany(),
      // Request-memoized, exactly as the nine above are, and the pop-up
      // chain in PopupRegion asks for the same thing on the same render.
      getMyTheLifeYoureBuilding(),
      homeQuestionnaireCatalog(),
      homeBodyAssessmentAssignment(),
    ]);
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  /*
   * THE COACH-ASSIGNED QUESTIONNAIRES, INSIDE "ASSIGNED TO YOU" (final
   * structural pass, 2026-09-13).
   *
   * These are the registry questionnaires a coach has actually sent this
   * member by name (the Four Doctors Assessment among them) plus the Body
   * Assessment's own assignment, and they used to render BELOW her
   * program, under no heading, alongside the free-arc invite. That left
   * "Assigned to You" as a section that did not contain every assigned
   * thing, and it left a questionnaire she has been asked to complete
   * further down Home than anything else waiting on her.
   *
   * NOTHING ABOUT WHO SEES THEM CHANGED. The list is the identical one
   * `DashboardInviteCards` built (`assignedInviteCandidates`, now the one
   * definition of it so the section's heading and its contents are
   * counted from the same array), and it is still behind the identical
   * `home.invite_cards` reveal rule. Each card still reads its own pop-up
   * dismissal row to decide its badge. The free-arc conversation is NOT
   * here: nobody is waiting on an invitation, and it keeps the place the
   * pair used to share.
   */
  const showsInvites = shows(F.homeInviteCards);
  const assignedQuestionnaires = showsInvites
    ? assignedInviteCandidates(catalog, bodyAssessmentCard)
    : [];

  /*
   * WHETHER ANYTHING IS ASSIGNED TO HER AT ALL (Home presentation pass,
   * 2026-09-13).
   *
   * The cards below used to stack straight onto the page with no heading
   * and a 12px gap, immediately under the day's one action, each one a
   * full deep-green panel. Two of them at once read as two more things
   * shouting at the same volume as the card above them, and a member had
   * no way to tell that they are all the same KIND of thing: something a
   * person, or Root, has asked her for and is waiting on.
   *
   * They are one section now, under one name. Which of them render, and
   * on exactly what conditions, did not change by a single character; the
   * conditions are simply also counted here, so the section's name is
   * never drawn over nothing. Every one of them is already resolved above
   * this line, so counting them costs no read.
   */
  const assignedToHer =
    assignedQuestionnaires.length > 0 ||
    stressLoad?.status === 'pending' ||
    bodySystems?.status === 'pending' ||
    bodySystems?.status === 'in_progress' ||
    wholeBodySignal?.status === 'pending' ||
    wholeBodySignal?.status === 'in_progress' ||
    healthIntake?.status === 'pending' ||
    healthIntake?.status === 'in_progress' ||
    breathingCheckIn?.status === 'pending' ||
    breathingCheckIn?.status === 'in_progress' ||
    owningYourValue?.status === 'pending' ||
    whereYourJoyLives?.status === 'pending' ||
    theGivingLedger?.status === 'pending' ||
    theWeightOfYes?.status === 'pending' ||
    beingSeen?.status === 'pending' ||
    whatYouPutDown?.status === 'pending' ||
    yourOwnCompany?.status === 'pending' ||
    theLifeYoureBuilding?.status === 'pending' ||
    weeklyReflection?.status === 'pending';

  return (
    <>
      {/* ==================================================== */}
      {/* THE ONE PLAIN SENTENCE. Anything her rules revealed     */}
      {/* that she has not been told about yet, in Root's voice,  */}
      {/* and the first thing in this boundary. It sat directly   */}
      {/* under the day's one priority until the editorial pass   */}
      {/* (2026-09-13) put the Quick Actions row between the two;  */}
      {/* what it is FOR is unaffected, because it announces      */}
      {/* newly-revealed features rather than explaining that      */}
      {/* card. No buttons either way: this tells her something,   */}
      {/* it does not compete for the day's action.                */}
      {/* ==================================================== */}
      <NewlyRevealedNotice reveals={visibility.newlyRevealed} />

      {/* ==================================================== */}
      {/* ASSIGNED TO YOU — one section, one name, and the first   */}
      {/* thing under Quick Actions.                              */}
      {/*                                                         */}
      {/* Each of these is something a person or Root has asked    */}
      {/* her for and has not had back yet: a coach's assignment,  */}
      {/* a deep-dive left half finished, this week's reflection.  */}
      {/* They used to stack straight onto the page with no        */}
      {/* heading at all, and then under "Waiting on you", which   */}
      {/* named the state rather than the thing.                   */}
      {/*                                                         */}
      {/* THE HEADING IS THE WHOLE HEADING (final structural       */}
      {/* pass, 2026-09-13). "Assigned to You" stood over a        */}
      {/* second line reading "Waiting on you", which is the       */}
      {/* phrase the heading had just been changed away from, and  */}
      {/* which reads as a nudge rather than as a name. The name   */}
      {/* alone says what the section holds; it does not also      */}
      {/* need to say that she has not done it yet.                */}
      {/*                                                         */}
      {/* IT NOW HOLDS EVERY OPEN ASSIGNMENT. The coach-assigned   */}
      {/* questionnaires (Four Doctors among them) were below her  */}
      {/* program under no heading at all until this pass, which   */}
      {/* made this section's name untrue. They are the first      */}
      {/* block in it now, on their own unchanged conditions.      */}
      {/*                                                         */}
      {/* ABOVE HER PROGRAM NOW (editorial pass, 2026-09-13).      */}
      {/* The program is a standing thing she is in the middle of  */}
      {/* and will be in the middle of tomorrow; these are         */}
      {/* finite, they are somebody waiting, and they go stale.    */}
      {/* So the page asks "is anything owed" before it says       */}
      {/* "here is where you are", and the two are never confused  */}
      {/* for each other because they are different objects: a     */}
      {/* 24px flat forest card here, a 32px gradient hero there.  */}
      {/*                                                         */}
      {/* NOTHING ABOUT WHO SEES WHAT CHANGED. Every card below    */}
      {/* renders on exactly the condition it always did, with     */}
      {/* exactly the props it always got, and none of them is     */}
      {/* hidden behind a "view all". The section disappears with  */}
      {/* its heading when none of them render (`assignedToHer`    */}
      {/* above), rather than leaving a name over nothing.         */}
      {/* ==================================================== */}
      {assignedToHer && (
        <div className={SECTION}>
          <p className={ZONE_LABEL}>Assigned to You</p>
          <div className="mef-home-stack mt-4">
      {/* ==================================================== */}
      {/* THE COACH-ASSIGNED QUESTIONNAIRES, first in the       */}
      {/* section because they are the ones a person sent by    */}
      {/* name. Four Doctors, Primal Pattern, Short-HAQ, the    */}
      {/* Body Assessment: whichever of them is actually open.  */}
      {/* Renders nothing when none is.                         */}
      {/* ==================================================== */}
      {assignedQuestionnaires.length > 0 && (
        <div>
          <Suspense fallback={null}>
            <AssignedInviteCards cards={assignedQuestionnaires} />
          </Suspense>
        </div>
      )}

      {/* ==================================================== */}
      {/* THE STRESS & LOAD DEEP-DIVE, persistent, for as long   */}
      {/* as her coach's assignment is open.                     */}
      {/*                                                        */}
      {/* Above the Weekly Reflection for the same reason its    */}
      {/* pop-up sits above everything Root decides on its own:  */}
      {/* a coach asked her for this one, by name, for her.      */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate                           */}
      {/* (lib/stress-load/access.ts). A second rule on top of   */}
      {/* it would be the invisible lock the standing rules      */}
      {/* forbid.                                                */}
      {/*                                                        */}
      {/* Renders nothing once she has finished, and nothing for */}
      {/* a member who was never assigned it:                    */}
      {/* getMyStressLoadDeepDive returns 'completed' or null in */}
      {/* those cases.                                           */}
      {/* ==================================================== */}
      {stressLoad?.status === 'pending' && (
        <div>
          {/* The card carries the assignment's delivery receipt
              (migration 210), which is why it needs the assignment id. */}
          <StressLoadEntry assignmentId={stressLoad.assignmentId} />
        </div>
      )}

      {/* ==================================================== */}
      {/* THE MEF BODY SYSTEMS SURVEY, persistent, for as long  */}
      {/* as her coach's assignment is open.                    */}
      {/*                                                       */}
      {/* A STARTED SITTING STILL SHOWS THE CARD. The survey is */}
      {/* resumable, so 'in_progress' is not "done", it is      */}
      {/* "waiting for her to come back", and the card is the   */}
      {/* way back. It disappears on completion, which is when  */}
      {/* getMyBodySystemsSurvey returns 'completed'.           */}
      {/*                                                       */}
      {/* NO VISIBILITY KEY and no tier check, deliberately.    */}
      {/* The assignment is the whole gate                      */}
      {/* (lib/body-systems/access.ts).                         */}
      {/* ==================================================== */}
      {(bodySystems?.status === 'pending' || bodySystems?.status === 'in_progress') && (
        <div>
          {/* The card carries the assignment's delivery receipt
              (migration 210), which is why it needs the assignment id. */}
          <BodySystemsEntry assignmentId={bodySystems.assignmentId} />
        </div>
      )}

      {/* ==================================================== */}
      {/* THE MEF WHOLE-BODY SIGNAL ASSESSMENT, persistent, for  */}
      {/* as long as her coach's assignment is open.            */}
      {/*                                                       */}
      {/* A SEPARATE INSTRUMENT from the survey above it, so     */}
      {/* both cards stand when a coach has sent both. It is     */}
      {/* resumable, so 'in_progress' is not "done", it is       */}
      {/* "waiting for her to come back", and the card is the    */}
      {/* way back.                                              */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately.     */}
      {/* The assignment is the whole gate                       */}
      {/* (lib/whole-body-signal/access.ts).                     */}
      {/* ==================================================== */}
      {(wholeBodySignal?.status === 'pending' || wholeBodySignal?.status === 'in_progress') && (
        <div>
          {/* The card carries the assignment's delivery receipt
              (migration 210), which is why it needs the assignment id. */}
          <WholeBodySignalEntry assignmentId={wholeBodySignal.assignmentId} />
        </div>
      )}

      {/* ==================================================== */}
      {/* THE HEALTH & LIFESTYLE INTAKE, persistent, for as     */}
      {/* long as her coach's assignment is open.               */}
      {/*                                                       */}
      {/* A SEPARATE INSTRUMENT again, and the one that         */}
      {/* establishes the context the three above it are read   */}
      {/* against, so all four cards stand when a coach has     */}
      {/* sent all four. It is long and resumable, so           */}
      {/* 'in_progress' is not "done", it is "waiting for her   */}
      {/* to come back", and the card is the way back and says  */}
      {/* so in its own button.                                 */}
      {/*                                                       */}
      {/* NO VISIBILITY KEY and no tier check, deliberately.    */}
      {/* The assignment is the whole gate                      */}
      {/* (lib/health-intake/access.ts).                        */}
      {/* ==================================================== */}
      {(healthIntake?.status === 'pending' || healthIntake?.status === 'in_progress') && (
        <div>
          {/* The card carries the assignment's delivery receipt
              (migration 210), which is why it needs the assignment id. */}
          <HealthIntakeEntry
            assignmentId={healthIntake.assignmentId}
            inProgress={healthIntake.status === 'in_progress'}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* THE BREATHING PATTERN CHECK-IN, persistent, for as    */}
      {/* long as her coach's assignment is open.               */}
      {/*                                                       */}
      {/* A SEPARATE INSTRUMENT again, so all five cards stand   */}
      {/* when a coach has sent all five. It is short but        */}
      {/* resumable, so 'in_progress' is not "done", it is       */}
      {/* "waiting for her to come back", and the card is the    */}
      {/* way back and says so in its own button.                */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately.     */}
      {/* The assignment is the whole gate                       */}
      {/* (lib/breathing-check-in/access.ts).                    */}
      {/* ==================================================== */}
      {(breathingCheckIn?.status === 'pending' ||
        breathingCheckIn?.status === 'in_progress') && (
        <div>
          {/* The card carries the assignment's delivery receipt
              (migration 210), which is why it needs the assignment id. */}
          <BreathingCheckInEntry
            assignmentId={breathingCheckIn.assignmentId}
            inProgress={breathingCheckIn.status === 'in_progress'}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* OWNING YOUR VALUE, persistent, for as long as her      */}
      {/* coach's assignment is open.                            */}
      {/*                                                        */}
      {/* Directly below the Stress & Load Deep-Dive and for the */}
      {/* identical reasons: a coach asked her for this one, by  */}
      {/* name, for her. The two can be open at once, and when   */}
      {/* they are, both cards stand.                            */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate                           */}
      {/* (lib/owning-your-value/access.ts). A second rule on    */}
      {/* top of it would be the invisible lock the standing     */}
      {/* rules forbid.                                          */}
      {/* ==================================================== */}
      {owningYourValue?.status === 'pending' && (
        <div>
          {/* The card carries the assignment's delivery receipt
              (migration 210), which is why it needs the assignment id.
              `hasDraft` only chooses which words the button uses. */}
          <OwningYourValueEntry
            assignmentId={owningYourValue.assignmentId}
            hasDraft={Object.keys(owningYourValue.draft).length > 0}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* WHERE YOUR JOY LIVES, persistent, for as long as her   */}
      {/* coach's assignment is open.                            */}
      {/*                                                        */}
      {/* Directly below Owning Your Value and for the identical */}
      {/* reasons. The two Happiness deep-dives can be open at   */}
      {/* once, and when they are, both cards stand: neither     */}
      {/* replaces the other and neither hides the other.        */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate                           */}
      {/* (lib/where-your-joy-lives/access.ts), and there is no  */}
      {/* check that she finished the template above this one    */}
      {/* either. A second rule on top would be the invisible    */}
      {/* lock the standing rules forbid.                        */}
      {/* ==================================================== */}
      {whereYourJoyLives?.status === 'pending' && (
        <div>
          <WhereYourJoyLivesEntry
            assignmentId={whereYourJoyLives.assignmentId}
            hasDraft={Object.keys(whereYourJoyLives.draft).length > 0}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* THE GIVING LEDGER, persistent, for as long as her      */}
      {/* coach's assignment is open.                            */}
      {/*                                                        */}
      {/* Directly below Where Your Joy Lives and for the        */}
      {/* identical reasons. All three Happiness deep-dives can  */}
      {/* be open at once, and when they are, all three cards    */}
      {/* stand: none replaces another and none hides another.   */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate                           */}
      {/* (lib/the-giving-ledger/access.ts), and there is no     */}
      {/* check that she finished either template above this one */}
      {/* either. A second rule on top would be the invisible    */}
      {/* lock the standing rules forbid.                        */}
      {/* ==================================================== */}
      {theGivingLedger?.status === 'pending' && (
        <div>
          <TheGivingLedgerEntry
            assignmentId={theGivingLedger.assignmentId}
            hasDraft={Object.keys(theGivingLedger.draft).length > 0}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* THE WEIGHT OF YES, persistent, coach assigned only.    */}
      {/*                                                        */}
      {/* Directly below The Giving Ledger and for the identical */}
      {/* reasons. All four Happiness deep-dives can be open at  */}
      {/* once, and when they are, all four cards stand: none    */}
      {/* replaces another and none hides another.               */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate                           */}
      {/* (lib/the-weight-of-yes/access.ts). There is no check   */}
      {/* that she finished any template above this one either,  */}
      {/* including the one this can follow up on: that follow-  */}
      {/* up changes one question's wording and never whether    */}
      {/* she is offered this at all.                            */}
      {/* ==================================================== */}
      {theWeightOfYes?.status === 'pending' && (
        <div>
          <TheWeightOfYesEntry
            assignmentId={theWeightOfYes.assignmentId}
            hasDraft={Object.keys(theWeightOfYes.draft).length > 0}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* BEING SEEN, persistent, coach assigned only.           */}
      {/*                                                        */}
      {/* Directly below The Weight of Yes and for the identical */}
      {/* reasons. All five Happiness deep-dives can be open at  */}
      {/* once, and when they are, all five cards stand: none    */}
      {/* replaces another and none hides another.               */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate (lib/being-seen/access.ts)*/}
      {/* and there is no check that she finished any template   */}
      {/* above this one either. A second rule on top would be   */}
      {/* the invisible lock the standing rules forbid.          */}
      {/* ==================================================== */}
      {beingSeen?.status === 'pending' && (
        <div>
          <BeingSeenEntry
            assignmentId={beingSeen.assignmentId}
            hasDraft={Object.keys(beingSeen.draft).length > 0}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* WHAT YOU PUT DOWN, persistent, coach assigned only.    */}
      {/*                                                        */}
      {/* Directly below Being Seen and for the identical        */}
      {/* reasons. All six Happiness deep-dives can be open at   */}
      {/* once, and when they are, all six cards stand: none     */}
      {/* replaces another and none hides another.               */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate                           */}
      {/* (lib/what-you-put-down/access.ts) and there is no check */}
      {/* that she finished any template above this one either.  */}
      {/* A second rule on top would be the invisible lock the   */}
      {/* standing rules forbid.                                 */}
      {/*                                                        */}
      {/* A DRAFT HERE IS MORE THAN WRITING. Two of its nine     */}
      {/* questions leave no prose at all, so a member who       */}
      {/* placed every card and closed the app has a genuine     */}
      {/* sitting in progress. The resume label reads the shelf  */}
      {/* as well as the writing, or it would tell her to start  */}
      {/* something she is halfway through.                      */}
      {/* ==================================================== */}
      {whatYouPutDown?.status === 'pending' && (
        <div>
          <WhatYouPutDownEntry
            assignmentId={whatYouPutDown.assignmentId}
            hasDraft={
              Object.keys(whatYouPutDown.draft).length > 0 ||
              whatYouPutDown.shelf.placed.length > 0
            }
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* YOUR OWN COMPANY, persistent, coach assigned only.     */}
      {/*                                                        */}
      {/* Directly below What You Put Down and for the identical */}
      {/* reasons. All seven Happiness deep-dives can be open at */}
      {/* once, and when they are, all seven cards stand: none   */}
      {/* replaces another and none hides another.               */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate                           */}
      {/* (lib/your-own-company/access.ts) and there is no check  */}
      {/* that she finished any template above this one either.  */}
      {/* A second rule on top would be the invisible lock the   */}
      {/* standing rules forbid.                                 */}
      {/*                                                        */}
      {/* A DRAFT HERE IS MORE THAN WRITING. Five of its nine    */}
      {/* questions open with a pick that leaves no prose, so a  */}
      {/* member who answered a whole rapid round and closed the */}
      {/* app has a genuine sitting in progress. The resume      */}
      {/* label reads her picks as well as her writing, or it    */}
      {/* would tell her to start something she is halfway       */}
      {/* through.                                               */}
      {/* ==================================================== */}
      {yourOwnCompany?.status === 'pending' && (
        <div>
          <YourOwnCompanyEntry
            assignmentId={yourOwnCompany.assignmentId}
            hasDraft={
              Object.keys(yourOwnCompany.draft).length > 0 ||
              Object.keys(yourOwnCompany.instinct.picks).length > 0 ||
              Object.keys(yourOwnCompany.instinct.rapid).length > 0 ||
              yourOwnCompany.instinct.deepestCutLineId !== null
            }
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* THE LIFE YOU'RE BUILDING, persistent, coach assigned   */}
      {/* only.                                                  */}
      {/*                                                        */}
      {/* Directly below Your Own Company and for the identical  */}
      {/* reasons. All eight Happiness deep-dives can be open at */}
      {/* once, and when they are, all eight cards stand: none   */}
      {/* replaces another and none hides another.               */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY and no tier check, deliberately. The */}
      {/* assignment is the whole gate                           */}
      {/* (lib/the-life-youre-building/access.ts) and there is   */}
      {/* no check that she finished any template above this     */}
      {/* one, including the one this can follow. A second rule  */}
      {/* on top would be the invisible lock the standing rules  */}
      {/* forbid.                                                */}
      {/*                                                        */}
      {/* A DRAFT HERE IS MORE THAN WRITING. Three of its nine   */}
      {/* questions open with a mark that leaves no prose, so a  */}
      {/* member who placed herself on two lines and closed the  */}
      {/* app has a genuine sitting in progress. The resume      */}
      {/* label reads her marks as well as her writing, or it    */}
      {/* would tell her to start something she is halfway       */}
      {/* through.                                               */}
      {/*                                                        */}
      {/* THIS CARD NAMES NO OTHER EXPERIENCE, in either mode.   */}
      {/* Whether her sitting runs as a follow-up is decided     */}
      {/* when she opens it, and the card is never told.         */}
      {/* ==================================================== */}
      {theLifeYoureBuilding?.status === 'pending' && (
        <div>
          <TheLifeYoureBuildingEntry
            assignmentId={theLifeYoureBuilding.assignmentId}
            hasDraft={
              Object.keys(theLifeYoureBuilding.draft).length > 0 ||
              Object.keys(theLifeYoureBuilding.sliders.positions).length > 0
            }
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* THE WEEKLY REFLECTION, persistent.                     */}
      {/*                                                        */}
      {/* Above the Weekly Root Review for the same reason its   */}
      {/* pop-up sits above the review's in the chain: this one  */}
      {/* asks something of her and has a deadline on it, and    */}
      {/* the review is a report that stays all week.            */}
      {/*                                                        */}
      {/* NO VISIBILITY KEY, deliberately. The plan, plus a coach */}
      {/* assignment that only ever adds, is the whole gate      */}
      {/* (lib/weekly-reflection/access.ts). A reveal rule on top */}
      {/* of it would be the second invisible lock the standing  */}
      {/* rules forbid, and "why can she not see it" would stop  */}
      {/* having one answer.                                     */}
      {/*                                                        */}
      {/* Renders nothing once she has finished the week, and    */}
      {/* nothing for a week nobody opened for her:              */}
      {/* getMyWeeklyReflection returns null or 'completed'.     */}
      {/* ==================================================== */}
      {weeklyReflection?.status === 'pending' && (
        <div>
          {/* The delivery receipt (migration 191). This card really is the
              reflection reaching her, so it records that, exactly as the
              pop-up does. Both can mount in this one pass; the database's
              unique constraint on (member_id, week_start) is what makes
              that one receipt rather than two. */}
          <TrackWeeklyReflectionDelivered
            weekStart={weeklyReflection.weekStart}
            presentation="home_card"
          />
          <WeeklyReflectionEntry offer={weeklyReflection.offer} />
        </div>
      )}

          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* YOUR PROGRAM. The richest single object on this screen,  */}
      {/* and the answer to "where am I in my program".            */}
      {/*                                                          */}
      {/* It used to be one of three blocks inside the "Today"     */}
      {/* zone, below Quick Actions, in the same white card        */}
      {/* language as everything around it. It is the most         */}
      {/* personal thing on Home, a prescription a coach wrote for */}
      {/* one member, so it is a 32px gradient feature card with   */}
      {/* its own warm halo, and it is the only thing on the page  */}
      {/* drawn that way apart from the day's one action.          */}
      {/*                                                          */}
      {/* BELOW ASSIGNED TO YOU (editorial pass, 2026-09-13), for  */}
      {/* the reason written over that section: the things a       */}
      {/* person is waiting on go stale and this does not. It is   */}
      {/* still above the invites deliberately, since those render */}
      {/* the same deep green treatment and a feature card         */}
      {/* underneath another full-bleed green panel is not a       */}
      {/* feature card.                                            */}
      {/*                                                          */}
      {/* WHO sees it did not change. It is gated on the same      */}
      {/* hasRealHistory the branch below uses, so a member with   */}
      {/* no check-in history still gets the welcome card and      */}
      {/* nothing else.                                            */}
      {/*                                                          */}
      {/* No zone label: the card's own eyebrow already reads      */}
      {/* "Your program", and a heading over it saying the same    */}
      {/* words is a second, quieter voice. No RevealOnScroll      */}
      {/* either: a card that fades in as you scroll to it is a    */}
      {/* card you already scrolled past.                          */}
      {/* ==================================================== */}
      {hasRealHistory && programHero && <div className={SECTION}>{programHero}</div>}

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
        /* No label over it: the card's own first line already says
           "Weekly Root Review", and a quieter second voice above it
           saying the same words is one of the four this pass removed. */
        <div id={WEEKLY_REVIEW_ANCHOR_ID} className={`${SECTION} scroll-mt-6`}>
          <WeeklyReviewEntry
            review={weeklyReview.review}
            label={WEEKLY_REVIEW_LABEL}
            weekStart={weeklyReview.weekStart}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* QUESTIONNAIRES, directly under Your Week with Root      */}
      {/* (2026-09-14). It was the flattest row on the page, in   */}
      {/* the Your Path zone at the very bottom, which is where   */}
      {/* a member goes to look back rather than to keep going.   */}
      {/* Thirteen questionnaires are the substance of what Root  */}
      {/* knows about her, so they sit in the half of the screen  */}
      {/* she acts on, under the weekly panel and above           */}
      {/* everything that used to follow it. Nothing else moved.  */}
      {/*                                                         */}
      {/* THE SAME GATE, THE SAME NUMBERS, THE SAME ROUTE. The    */}
      {/* card still renders only when `home.questionnaires_card`  */}
      {/* reveals it, its two numbers are still                   */}
      {/* getMyQuestionnaireCatalog()'s own completedCount and    */}
      {/* totalCount, and it still opens /questionnaires. The     */}
      {/* catalog it reads is the SAME memoized object this       */}
      {/* boundary already awaits for Assigned to You, so the     */}
      {/* move costs no read at all.                              */}
      {/*                                                         */}
      {/* THE QUIET LINE NAMES NOTHING ALREADY DRAWN ABOVE. The   */}
      {/* selector is handed the keys of the cards Assigned to    */}
      {/* You is rendering on this same pass, and refuses them,   */}
      {/* so this card can never be a second CTA for a request    */}
      {/* that already has a full deep-green card of its own.     */}
      {/* ==================================================== */}
      {shows(F.homeQuestionnairesCard) && (
        <div className={SECTION}>
          <QuestionnairesHomeCard
            completedCount={catalog.completedCount}
            totalCount={catalog.totalCount}
            nextItem={pickHomeNextQuestionnaire(
              catalog,
              new Set(assignedQuestionnaires.map((card) => card.key))
            )}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* The free-arc invite — the next unstarted conversation   */}
      {/* (Core Values Snapshot / Life Signal Check / Readiness   */}
      {/* Pulse, FIX 5, 2026-08-03). Deliberately NOT gated on    */}
      {/* hasRealHistory, since a brand-new member with zero      */}
      {/* check-ins is exactly who needs this reachable. Renders  */}
      {/* nothing when there is none left.                        */}
      {/*                                                         */}
      {/* IT IS AN OFFER, NOT AN ASSIGNMENT, which is the whole   */}
      {/* reason it is down here and the coach-assigned           */}
      {/* questionnaires are up in Assigned to You: nobody is     */}
      {/* waiting on an invitation.                               */}
      {/* See components/dashboard/DashboardInviteCards.tsx.      */}
      {/* ==================================================== */}
      {showsInvites && (
        <Suspense fallback={null}>
          <FreeArcInviteCards catalog={catalog} />
        </Suspense>
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
        <div className="pt-6">
          <FirstCheckInWelcome />
        </div>
      ) : (
        /* ==================================================== */
        /* Today — Root's Daily Brief and today's honest line     */
        /* when nothing is logged yet.                            */
        /*                                                        */
        /* Quick Actions used to be the first thing in this       */
        /* branch. It is its own streamed region directly under   */
        /* the hero now (QuickActionsRegion, in the shell above), */
        /* because a shortcut a member wants in the first two     */
        /* seconds cannot be behind the fourteen assignment       */
        /* cards and the program card in the same boundary. The   */
        /* branch itself is unchanged: a member with no history   */
        /* still gets the welcome card and nothing else, and the  */
        /* region above makes the identical check.                */
        /* ==================================================== */
        <TodayZone />
      )}
    </>
  );
}

/**
 * QUICK ACTIONS, the compact row directly under the hero.
 *
 * IT IS THE FIRST THING IN <main> (final structural pass, 2026-09-13).
 * It was second, under the day's chosen action drawn as a feature card,
 * which meant a member opening her own home screen was handed a job
 * before she was offered a door. The chosen action moved down; this row
 * moved up; nothing about either one's contents changed.
 *
 * IT IS ITS OWN BOUNDARY. It used to be the first block inside the day
 * frame, which meant it could not paint until every one of that
 * boundary's twenty reads had resolved: the fourteen assignment views,
 * the program, the weekly review, the questionnaire catalog. Every read
 * below is request-memoized and is already being made by another region
 * on the same render, so having its own boundary costs no extra round
 * trip.
 *
 * NOTHING HERE IS A NEW DOOR.
 *
 *   Daily Reset is the gold + in the bottom bar, on every screen.
 *   Progress and Food Lens were tabs in that same bar until this pass
 *   and are tiles here instead, Food Lens still decided by the identical
 *   `tracker.food_lens` rule that used to decide its tab.
 *   Movement and Case keep the exact visibility keys they have always
 *   had.
 *   Your Week with Root is the Weekly Root Review entry that already
 *   stands further down this same page, drawn on exactly the two
 *   conditions that entry is drawn on (the week has a review at all, and
 *   `home.weekly_review` reveals it), so the tile can never point at
 *   something that is not there. Both reads are the memoized ones the
 *   day frame makes on this same render.
 *
 * THE HINTS ARE REAL OR THEY ARE FIXED, NEVER INVENTED. Movement carries
 * its true completion status when one exists, Daily Reset says whether
 * today's check-in is already logged (one read, the same memoized one the
 * hero and the Today zone make), and the rest carry a fixed line naming
 * what the tap opens.
 *
 * THE TONES ARE A ROTATION, NOT A CODE. Five Rooted Reset tones (cream,
 * sage, forest, gold, charcoal) and one rule: no tile carries the tone of
 * the tile beside it. They are assigned here rather than in the component
 * because which tiles survive their gates is decided here, and a tone
 * that is chosen before the gating can leave two neighbours matching.
 * Forest, the one dark tile, is Your Week with Root: the most personal
 * door in the row, drawn on the brand's own surface so a member's eye
 * finds it without anything glowing.
 *
 * THE ONE LIT TILE. Exactly one tile may carry the warm halo, and it is
 * the Daily Reset tile on a day she has not checked in yet, decided from
 * the stored row rather than from the copy. Once she has, nothing in this
 * row glows: a row where everything is highlighted highlights nothing.
 *
 * The Case tile carries no status line of its own. C2 (2026-08-27): it
 * used to carry `${completedCount} of ${totalCount} complete`, which is
 * the QUESTIONNAIRE count, printed again verbatim further down the page.
 * There is no real completion fraction for a case, so the tile says what
 * the tap opens instead of borrowing a true number from somewhere it is
 * not about.
 */
async function QuickActionsRegion() {
  const frame = await requireHomeFrame();
  const [visibility, hasRealHistory, bodyAssessments, todaysCheckin, weeklyReview] =
    await Promise.all([
      getMemberVisibility(),
      memberHasRealHistory(),
      homeBodyAssessments(),
      getTodaysCheckin(frame.localDate),
      // Request-memoized, and the day frame asks for the same thing on
      // the same render, so the tile and the entry it points at cannot
      // disagree about whether this week has a review.
      getMyWeeklyReview(),
    ]);
  /* The same gate the day frame's own branch makes: before her first
     check-in the welcome card is the whole screen, and a row of
     shortcuts above it would be the empty dashboard that card exists to
     replace. */
  if (!hasRealHistory) return null;

  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  // bodyAssessments is ordered newest-first (see lib/body-assessment/data.ts),
  // so the first completed one is the most recent.
  const latestAnalyzedAssessment = bodyAssessments.find((a) => a.completed_at !== null);
  const movementActionStatus = latestAnalyzedAssessment
    ? formatCompletedStatus(latestAnalyzedAssessment.completed_at!)
    : null;

  const actions: QuickAction[] = [
    {
      icon: 'dailyReset',
      label: 'Daily Reset',
      hint: todaysCheckin ? 'Logged today' : 'Check in',
      href: '/checkin',
      tone: 'gold',
      accent: !todaysCheckin,
    },
    ...(shows(F.trackerFoodLens)
      ? [
          {
            icon: 'foodLens' as const,
            label: 'Food Lens',
            hint: 'Scan a meal',
            href: '/food-lens',
            tone: 'cream' as const,
          },
        ]
      : []),
    ...(weeklyReview && shows(F.homeWeeklyReview)
      ? [
          {
            icon: 'weekWithRoot' as const,
            label: 'Your Week with Root',
            hint: 'See your week',
            /* The review has no page of its own. It lives on Home, as the
               collapsed entry further down this screen, and this is that
               entry's own anchor. A tile that invented a destination for
               it would be a screen nobody built. */
            href: WEEKLY_REVIEW_ANCHOR_HREF,
            tone: 'forest' as const,
          },
        ]
      : []),
    ...(shows(F.homeQuickActionMovement)
      ? [
          {
            icon: 'movement' as const,
            label: 'Movement',
            hint: movementActionStatus ?? 'Your movement',
            href: '/movement',
            tone: 'sage' as const,
          },
        ]
      : []),
    { icon: 'progress', label: 'Progress', hint: 'View trends', href: '/progress', tone: 'charcoal' },
    ...(shows(F.homeQuickActionCase)
      ? [
          {
            icon: 'case' as const,
            label: 'Case',
            hint: 'What Root found',
            href: '/case',
            tone: 'cream' as const,
          },
        ]
      : []),
  ];

  return (
    <div className="pt-6">
      <p className={ZONE_LABEL}>Quick Actions</p>
      <div className="mt-4">
        <QuickActionsGrid actions={actions} />
      </div>
    </div>
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

  /* A tonal panel rather than a rule under a line of gray text. Same
     sentence, same condition, one less border on a screen the pass was
     removing borders from. */
  const checkinPromptNode = todaysCheckin ? null : (
    <div className="mef-home-quiet">
      <p className="mef-home-body">
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
    <RevealOnScroll delayMs={60} className={SECTION}>
      <p className={ZONE_LABEL}>Today</p>
      <div className="mt-4 mef-home-stack">
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
 * Everything below the first screenful, in the page's own order: Active
 * Experiments and the Personal Reset Plan (still things she is doing),
 * then What Root Is Noticing and the Energy Trend (things she reads),
 * then Your Path and Your Device (things she explores).
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
        <RevealOnScroll delayMs={30} className={SECTION}>
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
        <RevealOnScroll delayMs={30} className={SECTION}>
          <Suspense fallback={null}>
            <PersonalResetPlanCard />
          </Suspense>
        </RevealOnScroll>
      )}

      {/* ==================================================== */}
      {/* INSIGHTS. From here down the page is something she      */}
      {/* READS rather than something she acts on, and the two    */}
      {/* sections below open that half: what Root has noticed,   */}
      {/* and the shape of her own energy. `.mef-home-section-    */}
      {/* quiet` is the hairline and the wider gap that says so.  */}
      {/* It is carried by the section itself rather than drawn   */}
      {/* as a divider between two of them, so a rule can never   */}
      {/* be left hanging over a section that had nothing to      */}
      {/* draw. Your Path moved BELOW both (editorial pass,       */}
      {/* 2026-09-13): history and the deeper screens are the     */}
      {/* last question this page answers, not the fifth.         */}
      {/* ==================================================== */}

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
        <RevealOnScroll delayMs={60} className="mef-home-section-quiet">
          <p className={ZONE_LABEL}>What Root Is Noticing</p>
          <p className="mef-home-section-note">What your own weeks keep showing</p>
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

      {/* ==================================================== */}
      {/* YOUR PATH and YOUR DEVICE — the longer-term half.       */}
      {/* Everything she can explore rather than everything she   */}
      {/* owes: past assessments, the questionnaire library, the  */}
      {/* comprehensive baseline, her wearable. Last on the page  */}
      {/* on purpose, and unchanged in what it holds or who sees  */}
      {/* it.                                                     */}
      {/* ==================================================== */}
      <Suspense fallback={null}>
        <YourPathZone />
      </Suspense>

      <Suspense fallback={null}>
        <YourDeviceZone />
      </Suspense>
    </>
  );
}

/**
 * Your Path — Guided Posture & Movement Assessment (image-backed card) and
 * the Comprehensive baseline (white card, or nothing yet). Movement goes
 * first on purpose: Comprehensive is conditional and can be null, and a
 * zone that ends on an image-backed card butts that treatment against
 * whatever comes next.
 *
 * QUESTIONNAIRES LEFT THIS ZONE (2026-09-14). It was the third card here,
 * a plain row with a progress bar, at the very bottom of a page a member
 * reaches by scrolling past everything she is actually doing. It is a
 * card directly under Your Week with Root now, in the day frame above.
 * Nothing about what it shows, who sees it or where it goes changed; only
 * where it sits. The two cards left here keep the order they had.
 *
 * THE ZONE IT SITS BESIDE CHANGED (editorial pass, 2026-09-13) and the
 * rule survived it intact. It used to come immediately before the
 * image-backed Noticing carousel; it now comes after that carousel and
 * after the Energy Trend, at the bottom of the page with Your Device
 * under it.
 *
 * VISIBILITY LAYER: no locked card ever renders here now. The Movement
 * Assessment used to appear for every member with a "Locked" treatment,
 * which is still an advertisement for something she cannot have. It appears
 * when her own rule reveals it and does not exist otherwise, and
 * `bodyAssessmentAccess` remains the independent server-side permission
 * check behind the route itself.
 */
async function YourPathZone() {
  const [visibility, bodyAssessments, bodyAssessmentAccess, baseline, programHero] =
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
      homeBaselineAssessment(),
      programHeroNode(),
    ]);
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  /* The questionnaire catalog is NOT read here any more: the card that
     used it moved up into the day frame, which was already awaiting the
     same memoized object. */
  if (!shows(F.homeMovementAssessmentCard) && !shows(F.homeComprehensiveCard)) {
    return null;
  }

  return (
    <RevealOnScroll delayMs={0} className="mef-home-section-quiet">
      <p className={ZONE_LABEL}>Your Path</p>
      <p className="mef-home-section-note">Where you have been, and what is still open</p>
      <div className="mef-home-stack mt-5">
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

  /*
   * NO CARD, AND ONE HEADING INSTEAD OF TWO (Home presentation pass,
   * 2026-09-13). This was a white box inside a section labelled "Trends"
   * whose first line then said "Energy Trend": a heading, a quieter
   * heading saying the same thing, and a container round both. The chart
   * sits on the page now under the one name it has, and the section reads
   * as a section rather than as another website card. The chart itself,
   * its data, its scroll-replay draw-in and its wrapper are untouched.
   */
  return (
    /* `.mef-home-section-quiet` rather than the plain section gap: this is
       the second of the two sections a member READS, and each one carries
       its own hairline so the quieter half of the page opens with a rule
       whichever of them she actually has. A divider drawn between two
       sections instead would be left hanging over nothing the moment one
       of them had nothing to draw. */
    <RevealOnScroll delayMs={0} className="mef-home-section-quiet">
      <p className={ZONE_LABEL}>Energy Trend</p>
      <section className="mt-4">
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
        /*
         * NO ZONE LABEL (Home presentation pass, 2026-09-13). All three
         * states below already name themselves: the connected card says
         * "Today's Recovery", the waiting line says her device is
         * connected, and the pitch panel says "Unlock Smarter Coaching".
         * "Your Device" above any of them was a second, quieter voice
         * saying a third thing.
         */
        <RevealOnScroll delayMs={60} className={SECTION}>
          {hasConnectedWearable ? (
            decision?.wearableSnapshot ? (
              <section className={CARD}>
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className={ZONE_LABEL}>Today&apos;s Recovery</p>
                </div>
                <WearableStatsRow snapshot={decision.wearableSnapshot} />
              </section>
            ) : (
              /* A tonal panel, not a bordered row. The rule under it was
                 the only bottom border left on this screen. */
              <div className="mef-home-quiet">
                <p className="mef-home-body">
                  Your device is connected. Recovery numbers will appear here after your first
                  sync.
                </p>
              </div>
            )
          ) : (
            <ConnectWearableCard variant="dashboard" />
          )}
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
    <div className={SECTION}>
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
