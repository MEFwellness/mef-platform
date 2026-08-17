import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  Sparkles,
  BookOpen,
  ListChecks,
  Info,
  Clock,
  History,
  Sunrise,
  Sun,
  Moon,
  Gift,
  Utensils,
  Wind,
  Dumbbell,
  Smile,
  TrendingUp,
  Wand2,
  Compass,
  HeartPulse,
  PartyPopper,
  GraduationCap,
  RotateCcw,
  ShieldAlert,
  MessageCircle,
  Droplet,
  Footprints,
  Watch,
} from 'lucide-react';
import type { FourDoctorsCategory } from '@mef/shared-types-contracts';
import { getFeedHistory } from '@/app/actions/feed';
import {
  getRecentCheckins,
  getTodaysCheckin,
  resolveLocalDate,
  getActiveHabits,
  getHabitLogsForDate,
  getTotalCheckinCount,
  getTotalMovementLoggedDaysCount,
} from '@/app/actions/checkin';
import { getMyCoachingDecision } from '@/app/actions/coaching-brain';
import { getTodaysHydrationTotal, getTodaysMovementLevel } from '@/app/actions/events';
import { getMyHydrationTracked } from '@/app/actions/hydration';
import { waterStatus, digestionStatus, STATUS_STYLES } from '@/lib/wellness/status';
import type { CoachingMode } from '@/lib/brain/types';
import { buildCoachNote, buildBonusChallenge, parseSelectionReason } from '@/lib/feed/copy';
import { buildTimeContext } from '@/lib/feed/timeContext';
import { buildFeedMemory } from '@/lib/feed/memory';
import { computeStreakInsight, buildStreakMessage } from '@/lib/feed/streakIntelligence';
import { buildContinuitySentence, buildChallengeCarryover } from '@/lib/feed/continuity';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { firstNameFrom } from '@/lib/profile/greeting';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { RootQuickLink } from '@/components/RootQuickLink';
import { FirstCheckInWelcome } from '@/components/FirstCheckInWelcome';
import { buildTodayEntryContext } from '@/lib/conversation-coach/entryContext';
import { getMyNotifications } from '@/app/actions/notifications';
import { Reading } from '@/components/layout';
import { FeedInteractions } from './FeedInteractions';
import { TodayZones } from './TodayZones';
import { TodaysNumbersGrid } from '@/components/today/TodaysNumbersGrid';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { PriorityCard } from '@/components/priority/PriorityCard';
import { TrackPriorityShown } from '@/components/priority/TrackPriorityShown';
import { buildPriorityView } from '@/lib/priority/service';
import type { TodaysFocusInput } from '@/lib/priority/types';
import { getMemberVisibility } from '@/lib/visibility';
import { F } from '@/lib/visibility/catalog';

// Screen Layout System (Prompt 2): was a hand-rolled duplicate of
// `.mef-card` (app/globals.css) — now the one shared recipe.
const CARD = 'mef-card';

const FOUR_DOCTORS_ICON: Record<FourDoctorsCategory, typeof Dumbbell> = {
  doctor_movement: Dumbbell,
  doctor_diet: Utensils,
  doctor_quiet: Wind,
  doctor_happiness: Smile,
};

/** The Coaching Brain's mode, rendered as a small badge next to the day-of-week pill — every page that shows coaching now visibly reflects the same one decision instead of implying its own. */
const MODE_BADGE: Record<CoachingMode, { label: string; icon: typeof Compass; className: string }> =
  {
    encourage: {
      label: 'Encourage',
      icon: Compass,
      className: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
    },
    challenge: {
      label: 'Challenge',
      icon: TrendingUp,
      className: 'bg-[#F5B700]/[0.12] text-[#854D0E]',
    },
    recover: { label: 'Recovery', icon: HeartPulse, className: 'bg-blue-50 text-blue-700' },
    educate: {
      label: 'Educate',
      icon: GraduationCap,
      className: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
    },
    celebrate: { label: 'Celebrate', icon: PartyPopper, className: 'bg-amber-50 text-amber-700' },
    reset: { label: 'Reset', icon: RotateCcw, className: 'bg-blue-50 text-blue-700' },
    maintain: {
      label: 'Steady',
      icon: Compass,
      className: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
    },
  };

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Fade-up entrance, staggered by section order — purely cosmetic, CSS-driven (see app/globals.css), reduced-motion aware. */
function stagger(index: number): CSSProperties {
  return { animationDelay: `${index * 70}ms` };
}

export default async function TodayPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Milestone 5: the Coaching Brain is the single source of truth for
  // what today's coaching experience is and why — this page renders its
  // decision instead of independently deciding a mode, risk posture, or
  // encouragement line of its own. See app/actions/coaching-brain.ts.
  // getRecentCheckins and getActiveHabits don't depend on the
  // profile/timezone lookups below, so they join this first batch
  // instead of paying their own, separate round trips afterward.
  const [
    isCoach,
    { data: profile },
    decision,
    history,
    notifications,
    recentCheckins,
    habits,
    visibility,
  ] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
    getMyCoachingDecision(),
    getFeedHistory(),
    getMyNotifications(5),
    // Oldest-first, per getRecentCheckins' contract — exactly what streak/trend detection expects.
    getRecentCheckins(30),
    getActiveHabits(),
    // VISIBILITY LAYER (2026-08-17). Same rule as Home: this screen may not
    // advertise a feature her rules have not revealed. Request-memoized, so
    // Today asking and Home asking on the same navigation cost one gather.
    getMemberVisibility(),
  ]);
  /** The one question every block below asks before it renders. */
  const shows = (key: string): boolean => visibility.byKey.get(key)?.visible ?? false;

  const firstName = firstNameFrom(profile?.display_name);
  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const timeContext = buildTimeContext(nowInTz);
  const GreetingIcon = timeContext.hour < 12 ? Sunrise : timeContext.hour < 18 ? Sun : Moon;

  const localDate = await resolveLocalDate(nowInTz, false);
  // Conditional water tracking (migration 163). One read, used by all three
  // water surfaces on this page (the line in Today's Recommendations, and
  // the tracker in both of TodayZones' positions) so they can never
  // disagree with each other.
  const hydrationFocusOn = await getMyHydrationTracked();

  const [todaysCheckin, habitLogs, hydrationTotal, movementLevel, totalCheckins, totalMovementDays] =
    await Promise.all([
      getTodaysCheckin(localDate),
      getHabitLogsForDate(localDate),
      hydrationFocusOn ? getTodaysHydrationTotal() : Promise.resolve(0),
      getTodaysMovementLevel(),
      // Accomplished zone's cumulative totals — all-time, never a windowed read like getRecentCheckins above.
      getTotalCheckinCount(),
      getTotalMovementLoggedDaysCount(),
    ]);

  /**
   * Water, decided once for this whole screen.
   *
   * Two facts, both real, and both have to agree before a member sees a
   * water control: her own hydration answer (profiles.hydration_focus,
   * migration 163, which is what stops water being SCORED against her) and
   * the visibility layer's rule for the tracker (which is what stops it
   * being SHOWN). One variable, so the recommendation line and the tracker
   * in both of TodayZones' positions can never disagree with each other.
   */
  const showWater = hydrationFocusOn && shows(F.trackerWater);

  /**
   * Today's Numbers, moved here from Home (2026-08-14). Home keeps the
   * narrative; this page is the data and logging surface, so the grid now
   * renders directly beneath the day's zones — immediately under the water
   * and movement controls that already live there, which is why those two
   * are not repeated inside the grid (see the component's own header).
   *
   * Nothing new is fetched for it: `todaysCheckin` was already loaded above
   * for this page's own zones. No check-in yet means no numbers to show, and
   * TodayZones' own "You haven't checked in yet today" card is already the
   * page's prompt for that, so this renders nothing rather than a second one.
   */
  const numbersGridNode =
    todaysCheckin && shows(F.todayNumbers) ? <TodaysNumbersGrid checkin={todaysCheckin} /> : null;

  let sectionIndex = 0;
  const modeBadge = decision ? MODE_BADGE[decision.mode] : null;
  const ModeIcon = modeBadge?.icon ?? Compass;

  // Priority Card (Part 1). The engine is handed what this page already
  // fetched — the Coaching Brain's decision and the member's recent
  // check-ins — so rule 4 and the absence read cost no extra queries here.
  // It decides one winner across five rules; see lib/priority/select.ts.
  const todaysFocusInput: TodaysFocusInput | null = decision?.feedItem
    ? {
        feedItemId: decision.feedItem.id,
        focusText: decision.feedItem.focus_text,
        reasonText: decision.reasonText ?? null,
        suggestedAction: decision.content?.suggested_action ?? null,
      }
    : null;

  const priority = await buildPriorityView(supabase, user.id, localDate, {
    recentCheckins,
    todaysFocus: todaysFocusInput,
    // The final fallback's two inputs, both already fetched above for the
    // page's own zones, so this costs nothing extra.
    checkinDoneToday: Boolean(todaysCheckin),
    totalCheckins,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <TrackSurfaceView surface="today" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">
              Your MEF Coaching Experience
            </p>
          </div>
          <AvatarLink firstName={firstName} />
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Today
          </h1>
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-medium capitalize text-[#1B3A2D]/70">
            {timeContext.dayOfWeek} · {timeContext.weekPhase.label}
          </span>
          {modeBadge && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${modeBadge.className}`}
            >
              <ModeIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {modeBadge.label}
            </span>
          )}
          {decision?.riskLevel === 'elevated' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Lighter today
            </span>
          )}
        </div>
        <p className="mt-2 text-[15px] italic text-[#6B7A72]">{decision?.encouragement ?? ''}</p>

        {/* THE PRIORITY CARD — the dominant first element of this screen,
            above every other card including the first-check-in welcome.
            One winner, never two, never a list. Rendered here only while
            it is ACTIVE: a done card and a saved card both move to the
            bottom of the page (see further down), which is what
            "collapses and moves lower down the page, no longer dominant"
            means in practice.

            Completed-priority behavior (2026-08-14): 'done' joins 'saved'
            in that lower slot rather than staying at the top in its
            accomplished state. Home does exactly the same thing with the
            same row, so wherever she finishes it, it leaves the top of
            both screens and settles at the bottom of both for the rest of
            her own calendar day. Nothing takes its place at the top:
            today's decision is already made and stored, and the engine
            never selects a second one for the same day. */}
        {priority && priority.status === 'active' && (
          <>
            <TrackPriorityShown
              rule={priority.selected.rule}
              isReEntry={priority.isReEntry}
              presentation="inline"
            />
            <PriorityCard view={priority} />
          </>
        )}

        {recentCheckins.length === 0 ? (
          /* Premium UX Milestone 2: same welcome moment Dashboard shows
             before a member's first completed check-in — Root has no
             lesson, no recommendations, and no habit status to show yet
             either, so this replaces what would otherwise be its own
             pile of empty cards here too. */
          <div className="mt-6">
            <FirstCheckInWelcome />
          </div>
        ) : (
          <>
            {/* Evening Reflection — optional depth, entered deliberately
                (task requirement 2), never a second required ritual. No
                streak/missed-day language here on purpose. Not one of the
                Forward Zone's named quick actions (check-in/water/
                movement), so it isn't folded into TodayZones below — it
                stays its own low-emphasis link, same copy/behavior as
                before. */}
            {/* Safety exemption: the evening reflection carries the same
                free-text box that routes into safety classification, so it
                is one of the features that can never be hidden from anyone.
                The check asks the layer rather than assuming, so the
                exemption is visible here rather than implied. */}
            {shows(F.checkinEvening) && (
              <Link
                href={'/checkin/evening' as Route}
                className="mef-card-lift mt-6 flex items-center justify-between rounded-2xl border border-[#1B3A2D]/10 px-5 py-3.5 text-sm text-[#1B3A2D] transition hover:border-[#1B3A2D]/25"
              >
                <span className="font-medium">Evening Reflection</span>
                <span className="text-xs text-[#6B7A72]">Optional · a short close to the day</span>
              </Link>
            )}

            {/* Today's Recommendations (renamed from "Today's Coaching
                Brief," Milestone 2) — recovery/movement/stress/sleep lines
                are only ever real wearable-derived recommendations
                (lib/brain/wearableRecommendations.ts), shown only when a
                wearable is actually connected/synced; the wearable
                connect pitch and raw stats themselves moved to Dashboard
                so they're not shown here a second time. Hydration/
                nutrition always show — they reuse the same check-in
                status classification the Dashboard already uses. */}
            {shows(F.todayRecommendations) && (
            <section className={`${CARD} mef-animate-in mt-6`}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <Watch className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">
                  Today&apos;s Recommendations
                </p>
              </div>

              {decision?.wearableBrief && (
                <div className="mt-3 space-y-3">
                  {decision.wearableBrief.recoveryStatus && (
                    <div className="flex items-start gap-2">
                      <HeartPulse
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-relaxed text-[#1B3A2D]">
                        {decision.wearableBrief.recoveryStatus}
                      </p>
                    </div>
                  )}
                  {decision.wearableBrief.sleepRecommendation && (
                    <div className="flex items-start gap-2">
                      <Moon
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-relaxed text-[#1B3A2D]">
                        {decision.wearableBrief.sleepRecommendation}
                      </p>
                    </div>
                  )}
                  {decision.wearableBrief.movementRecommendation && (
                    <div className="flex items-start gap-2">
                      <Footprints
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-relaxed text-[#1B3A2D]">
                        {decision.wearableBrief.movementRecommendation}
                      </p>
                    </div>
                  )}
                  {decision.wearableBrief.stressRecommendation && (
                    <div className="flex items-start gap-2">
                      <Wind
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-relaxed text-[#1B3A2D]">
                        {decision.wearableBrief.stressRecommendation}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div
                className={`mt-4 grid gap-3 ${showWater ? 'grid-cols-2' : 'grid-cols-1'} ${decision?.wearableBrief ? 'border-t border-[#1B3A2D]/5 pt-4' : ''}`}
              >
                {/* Conditional water tracking (migration 163) — water is not
                    a universal recommendation. For a member who told us she
                    already drinks plenty, this cell does not exist and
                    nutrition takes the full row, rather than her being shown
                    a nudge for a problem she does not have. */}
                {showWater && (
                  <div className="flex items-start gap-2">
                    <Droplet
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <p
                      className={`text-sm leading-relaxed ${
                        /* UX audit fix (batch 1, item 3): 0 cups so far today
                           is neutral, not a failure — see HydrationTracker.tsx's
                           matching fix for the full explanation. */
                        STATUS_STYLES[hydrationTotal === 0 ? 'no-data' : waterStatus(hydrationTotal)].text
                      }`}
                    >
                      {hydrationTotal > 0
                        ? `${hydrationTotal} of 8 cups of water today.`
                        : 'Log water as you drink it, any time today.'}
                    </p>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Utensils
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <p
                    className={`text-sm leading-relaxed ${todaysCheckin?.digestion_rating != null ? STATUS_STYLES[digestionStatus(todaysCheckin.digestion_rating)].text : 'text-[#6B7A72]'}`}
                  >
                    {todaysCheckin?.digestion_rating != null
                      ? 'A grounding, whole-food meal fits well today.'
                      : "Note how today's meals feel in your check-in."}
                  </p>
                </div>
              </div>
            </section>
            )}

            {!decision || !decision.feedItem || !decision.content || !shows(F.todayLesson) ? (
              <>
                {/* NO PLACEHOLDER HERE, DELIBERATELY.
                    This slot used to hold an apology saying the day's lesson
                    was still being assembled and to check back shortly. That
                    was not true: nothing was being assembled, there is no
                    background job that produces a lesson later in the day,
                    and a member who came back an hour later read the same
                    words again. It was an unfinished state describing itself
                    as work in progress.
                    The section simply does not render when there is no
                    lesson, which is the same rule components/layout/
                    WhenNotEmpty.tsx already enforces for headings: a heading
                    over nothing, and an apology for nothing, are the same
                    mistake. Everything else on Today is unaffected. */}
                <TodayZones
                  todaysCheckinDone={Boolean(todaysCheckin)}
                  hydrationTracked={showWater}
                  hydrationInitialTotal={hydrationTotal}
                  movementInitialLevel={movementLevel}
                  showMovementTracker={shows(F.trackerMovementLevel)}
                  showHabits={shows(F.trackerHabits)}
                  showTotals={shows(F.todayTotals)}
                  showCapability={shows(F.todayCapability)}
                  habits={habits}
                  habitLogs={habitLogs}
                  notifications={notifications}
                  totalCheckins={totalCheckins}
                  totalMovementDays={totalMovementDays}
                />
                {numbersGridNode}
              </>
            ) : (
              <div className="mt-6 space-y-5">
                {(() => {
                  const today = { feedItem: decision.feedItem!, content: decision.content! };
                  const LessonIcon = FOUR_DOCTORS_ICON[today.content.four_doctors_category];
                  const reason = parseSelectionReason(today.feedItem.selection_reasons);
                  const localDate = today.feedItem.local_date;

                  // Member Coaching Memory Engine (Part 2) + Streak Intelligence (Part 5) —
                  // deterministic facts derived entirely from this member's own real history.
                  const feedMemory = buildFeedMemory(history, localDate);
                  const streakInsight = computeStreakInsight(recentCheckins, localDate);
                  const streakMessage = buildStreakMessage(streakInsight);
                  const continuitySentence = buildContinuitySentence(feedMemory);
                  const challengeCarryover = buildChallengeCarryover(
                    feedMemory,
                    today.feedItem.content_item_id
                  );
                  // Milestone 5: Coach Insight and the adaptive-difficulty note are
                  // now attached by the Coaching Brain (app/actions/coaching-brain.ts),
                  // not recomputed independently here.
                  const coachInsight = decision.coachInsight;
                  const adaptiveNote = decision.adaptiveNote;

                  const coachNote =
                    today.feedItem.coach_note ??
                    buildCoachNote({
                      firstName,
                      timeContext,
                      reason,
                      streakMessage,
                      continuitySentence,
                      category: today.content.four_doctors_category,
                    });
                  const bonusChallenge = buildBonusChallenge(today.content.four_doctors_category);

                  return (
                    <>
                      {/* Today's Focus — merged with "A Note from Root" (UX
                          audit batch 1, item 4): the two cards used to sit
                          back-to-back making the same point about movement
                          in different words. focus_text and coachNote are
                          both templated from the same underlying reason/
                          category for today's lesson (see lib/feed/copy.ts's
                          buildFocusText/buildCoachNote — "never a second
                          copy... a warmer, complementary lead-in"), so they
                          can never actually disagree; merging is safe. The
                          focus itself leads, Root's note carries beneath it
                          as the reasoning. */}
                      <section
                        className={`${CARD} mef-animate-in relative overflow-hidden`}
                        style={stagger(sectionIndex++)}
                      >
                        <div
                          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#F5B700]/10"
                          aria-hidden="true"
                        />
                        <div className="relative flex items-center gap-2 text-[#6B7A72]">
                          <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          {/* ONE FOCUS (Member Interpretation Layer,
                              2026-08-17). This card introduces the day's
                              LESSON, from the Daily Coaching Feed, and it
                              used to call itself "Today's Focus" on the same
                              screen where "Your Priority Today" named
                              something different. It is not the focus, and it
                              cannot be called "Today's Lesson" either, since
                              the lesson card itself further down already is.
                              What it actually is, is what the day's lesson is
                              about. */}
                          <p className="text-sm font-semibold uppercase tracking-wider">
                            What Today Is About
                          </p>
                        </div>
                        <p className="relative mt-3 text-lg leading-relaxed text-[#1B3A2D]">
                          {today.feedItem.focus_text}
                        </p>
                        <div className="relative mt-5 border-t border-[#1B3A2D]/5 pt-4">
                          <div className="flex items-center gap-2 text-[#6B7A72]">
                            <GreetingIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            <p className="text-xs font-semibold uppercase tracking-wider">
                              A Note from Root
                            </p>
                          </div>
                          <p className="mt-2 text-sm italic leading-relaxed text-[#1B3A2D]/85">
                            {coachNote}
                          </p>
                          <p className="mt-2 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
                            (Root)
                          </p>
                        </div>
                      </section>

                      <TodayZones
                        todaysCheckinDone={Boolean(todaysCheckin)}
                        hydrationTracked={showWater}
                        hydrationInitialTotal={hydrationTotal}
                        movementInitialLevel={movementLevel}
                        showMovementTracker={shows(F.trackerMovementLevel)}
                        showHabits={shows(F.trackerHabits)}
                        showTotals={shows(F.todayTotals)}
                        showCapability={shows(F.todayCapability)}
                        habits={habits}
                        habitLogs={habitLogs}
                        notifications={notifications}
                        totalCheckins={totalCheckins}
                        totalMovementDays={totalMovementDays}
                      />

                      {numbersGridNode}

                      {/* Today's Lesson — the one card in this scope that
                          needs zero outer padding (the illustration band
                          bleeds to the card's own edges, with the text
                          below in its own p-7 div) — .mef-card's own
                          padding always overrides a plain Tailwind
                          utility class here (unlayered CSS beats the
                          `utilities` layer), so this is set via inline
                          style instead of a `p-0` class that would
                          silently do nothing. */}
                      <section
                        className={`${CARD} mef-animate-in overflow-hidden`}
                        style={{ ...stagger(sectionIndex++), padding: 0 }}
                      >
                        {/* Illustration placeholder — a soft gradient band with the lesson's Four Doctors icon, ready to swap for real lesson artwork whenever it exists. */}
                        <div className="flex h-28 items-center justify-center bg-gradient-to-br from-[#1B3A2D]/[0.07] via-[#F5B700]/[0.08] to-[#1B3A2D]/[0.04]">
                          <LessonIcon
                            className="h-9 w-9 text-[#1B3A2D]/40"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="p-7">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[#6B7A72]">
                              <BookOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              <p className="text-sm font-semibold uppercase tracking-wider">
                                Today&apos;s Lesson
                              </p>
                            </div>
                            <span className="flex items-center gap-1 text-xs text-[#6B7A72]">
                              <Clock
                                className="h-3.5 w-3.5"
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                              {today.content.estimated_reading_minutes} min
                            </span>
                          </div>
                          <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug text-[#1B3A2D]">
                            {today.content.title}
                          </h2>
                          <Reading className="mt-3">
                            <p className="text-[15px] leading-relaxed text-[#1B3A2D]/85">
                              {today.content.body}
                            </p>
                          </Reading>
                          {today.content.evidence_sources.length > 0 && (
                            <div className="mt-5 border-t border-[#1B3A2D]/5 pt-4">
                              <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
                                Learn More
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {today.content.evidence_sources.map((source) => (
                                  <li key={source.url}>
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="text-xs text-[#1B3A2D] underline underline-offset-2"
                                    >
                                      {source.title}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </section>

                      {/* Today's Challenge */}
                      <section
                        className={`${CARD} mef-animate-in`}
                        style={stagger(sectionIndex++)}
                      >
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">
                            Today&apos;s Challenge
                          </p>
                        </div>
                        {challengeCarryover && (
                          <p className="mt-2 text-sm font-medium text-[#6B7A72]">
                            {challengeCarryover}
                          </p>
                        )}
                        <p className="mt-3 text-base leading-relaxed text-[#1B3A2D]">
                          {today.content.suggested_action}
                        </p>
                        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#F5B700]/[0.08] p-4">
                          <Gift
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#854D0E]"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                              Bonus
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]/85">
                              {bonusChallenge}
                            </p>
                          </div>
                        </div>
                        {adaptiveNote && (
                          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#1B3A2D]/[0.05] p-4">
                            <Wand2
                              className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/70"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/70">
                                Adjusted For You
                              </p>
                              <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]/85">
                                {adaptiveNote}
                              </p>
                            </div>
                          </div>
                        )}
                      </section>

                      {/* Talk to Root — a single, contextual entry point into the
                          Conversation Coach (Milestone 7), never a second decision
                          surface; it always opens the same thread the member's own
                          /conversation page shows. */}
                      <section
                        className={`${CARD} mef-animate-in`}
                        style={stagger(sectionIndex++)}
                      >
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <MessageCircle
                            className="h-4 w-4"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <p className="text-sm font-semibold uppercase tracking-wider">
                            Talk to Root
                          </p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <RootQuickLink
                            entryPoint="today_focus"
                            entryContext={buildTodayEntryContext(
                              decision,
                              decision?.content?.title ?? null,
                              decision?.content?.suggested_action ?? null
                            )}
                          >
                            Talk through today&apos;s challenge
                          </RootQuickLink>
                          {today.feedItem.completed_at ? (
                            <RootQuickLink
                              entryPoint="today_completed"
                              entryContext={buildTodayEntryContext(
                                decision,
                                decision?.content?.title ?? null,
                                decision?.content?.suggested_action ?? null
                              )}
                            >
                              I completed this, what&apos;s next?
                            </RootQuickLink>
                          ) : (
                            <RootQuickLink
                              entryPoint="today_easier_option"
                              entryContext={buildTodayEntryContext(
                                decision,
                                decision?.content?.title ?? null,
                                decision?.content?.suggested_action ?? null
                              )}
                            >
                              I need an easier option
                            </RootQuickLink>
                          )}
                        </div>
                      </section>

                      {/* Interactions: complete / save / dismiss / reflection / helpful */}
                      <div className="mef-animate-in" style={stagger(sectionIndex++)}>
                        <FeedInteractions
                          feedItem={today.feedItem}
                          reflectionPrompt={today.content.reflection_prompt}
                        />
                      </div>

                      {/* Coach Insight — a single, real, derived observation (Part 7); omitted entirely when there isn't one worth showing. */}
                      {coachInsight && (
                        <section
                          className={`${CARD} mef-animate-in`}
                          style={stagger(sectionIndex++)}
                        >
                          <div className="flex items-center gap-2 text-[#6B7A72]">
                            <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            <p className="text-sm font-semibold uppercase tracking-wider">
                              Coach Insight
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">
                            {coachInsight}
                          </p>
                        </section>
                      )}

                      {/* Why You're Seeing This — the Coaching Brain's own reason leads, with the specific lesson's own reason underneath. */}
                      <section
                        className={`${CARD} mef-animate-in`}
                        style={stagger(sectionIndex++)}
                      >
                        <div className="flex items-center gap-2 text-[#6B7A72]">
                          <Info className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">
                            Why You&apos;re Seeing This
                          </p>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                          {decision.reasonText}
                        </p>
                        {today.feedItem.why_text !== decision.reasonText && (
                          <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
                            {today.feedItem.why_text}
                          </p>
                        )}
                        <RootQuickLink
                          entryPoint="today_why"
                          entryContext={buildTodayEntryContext(
                            decision,
                            decision?.content?.title ?? null,
                            decision?.content?.suggested_action ?? null
                          )}
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
                        >
                          <MessageCircle
                            className="h-3.5 w-3.5"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Ask your coach why
                        </RootQuickLink>
                      </section>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Past Lessons. Suppressed entirely on a re-entry opening:
                this is the one list on the page that labels old items
                "Not completed", and a member returning after a real
                absence is precisely who must not be handed a column of
                them. Nothing is lost, it returns on her next ordinary
                visit. */}
            {history.length > 0 && !priority?.isReEntry && shows(F.todayPastLessons) && (
              <section className="mt-6">
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Past Lessons</p>
                </div>
                <div className={`${CARD} mt-3 divide-y divide-[#1B3A2D]/5`}>
                  {history.map(({ feedItem, content }) => (
                    <div
                      key={feedItem.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-[#1B3A2D]">
                          {content?.title ?? 'Lesson unavailable'}
                        </p>
                        <p className="text-xs text-[#6B7A72]">{formatDate(feedItem.local_date)}</p>
                      </div>
                      <span className="text-xs text-[#6B7A72]">
                        {feedItem.completed_at
                          ? 'Completed'
                          : feedItem.dismissed_at
                            ? 'Dismissed'
                            : 'Not completed'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* The resolved priority's collapsed home. Still available, no
            longer dominant: it sits below the day's zones rather than above
            them, and Root does not raise it back to the top again today.
            Outside the history branch above deliberately, so a member with
            no check-ins yet who saves or completes her priority can still
            find it.

            Both resolved states live here now (2026-08-14): 'saved' as
            before, and 'done' as the compact accomplished card, which is
            the same card Home shows at its own bottom, from the same row. */}
        {priority && priority.status !== 'active' && (
          /* The extra bottom margin is not decoration: this page's own
             bottom padding is shorter than Home's, and the floating Root
             launcher is fixed above the nav, so without it the launcher
             sits on top of this card's right edge once she scrolls to the
             end. Seen on the live site, not guessed. */
          <div className="mb-16 mt-6">
            <PriorityCard view={priority} collapsed />
          </div>
        )}
      </main>

      <MemberBottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="today_focus"
        entryContext={buildTodayEntryContext(
          decision,
          decision?.content?.title ?? null,
          decision?.content?.suggested_action ?? null
        )}
      />
    </div>
  );
}
