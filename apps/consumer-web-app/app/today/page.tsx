import type { CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
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
import { getRecentCheckins, getTodaysCheckin, resolveLocalDate } from '@/app/actions/checkin';
import { getMyCoachingDecision } from '@/app/actions/coaching-brain';
import { waterStatus, digestionStatus, STATUS_STYLES } from '@/lib/wellness/status';
import type { CoachingMode } from '@/lib/brain/types';
import { buildCoachNote, buildBonusChallenge, parseSelectionReason } from '@/lib/feed/copy';
import { buildTimeContext } from '@/lib/feed/timeContext';
import { buildFeedMemory } from '@/lib/feed/memory';
import { computeStreakInsight, buildStreakMessage } from '@/lib/feed/streakIntelligence';
import { buildContinuitySentence, buildChallengeCarryover } from '@/lib/feed/continuity';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildTodayEntryContext } from '@/lib/conversation-coach/entryContext';
import { getMyNotifications } from '@/app/actions/notifications';
import { FeedInteractions } from './FeedInteractions';
import { CoachMessages } from './CoachMessages';
import { WearableStatsRow } from './WearableStatsRow';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

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
  const [isCoach, { data: profile }, decision, history, notifications] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
    getMyCoachingDecision(),
    getFeedHistory(),
    getMyNotifications(5),
  ]);

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const timeContext = buildTimeContext(nowInTz);
  const GreetingIcon = timeContext.hour < 12 ? Sunrise : timeContext.hour < 18 ? Sun : Moon;

  // Oldest-first, per getRecentCheckins' contract — exactly what streak/trend detection expects.
  const recentCheckins = await getRecentCheckins(30);
  const localDate = await resolveLocalDate(nowInTz, false);
  const todaysCheckin = await getTodaysCheckin(localDate);

  let sectionIndex = 0;
  const modeBadge = decision ? MODE_BADGE[decision.mode] : null;
  const ModeIcon = modeBadge?.icon ?? Compass;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Your MEF Coaching Experience
          </p>
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

        {/* Daily Coaching Brief (Part 5) — recovery/movement/stress/sleep
            lines are only ever real wearable-derived recommendations
            (lib/brain/wearableRecommendations.ts), never shown when no
            wearable is connected/synced yet; hydration/nutrition reuse the
            same check-in status classification the Dashboard already uses. */}
        <section className={`${CARD} mef-animate-in mt-6 p-7`}>
          <div className="flex items-center gap-2 text-[#854D0E]">
            <Watch className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">
              Today&apos;s Coaching Brief
            </p>
          </div>

          <WearableStatsRow snapshot={decision?.wearableSnapshot ?? null} />

          {decision?.wearableBrief ? (
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
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
              Connect a wearable to see recovery, sleep, and stress recommendations here.{' '}
              <Link href="/connections" className="font-medium text-[#1B3A2D] underline underline-offset-2">
                Connect a device
              </Link>
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#1B3A2D]/5 pt-4">
            <div className="flex items-start gap-2">
              <Droplet
                className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className={`text-sm leading-relaxed ${todaysCheckin?.water_cups != null ? STATUS_STYLES[waterStatus(todaysCheckin.water_cups)].text : 'text-[#6B7A72]'}`}>
                {todaysCheckin?.water_cups != null
                  ? `${todaysCheckin.water_cups} of 8 cups of water today.`
                  : 'Log your water intake in today’s check-in.'}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Utensils
                className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className={`text-sm leading-relaxed ${todaysCheckin?.digestion_rating != null ? STATUS_STYLES[digestionStatus(todaysCheckin.digestion_rating)].text : 'text-[#6B7A72]'}`}>
                {todaysCheckin?.digestion_rating != null
                  ? 'A grounding, whole-food meal fits well today.'
                  : "Note how today's meals feel in your check-in."}
              </p>
            </div>
          </div>
        </section>

        <CoachMessages notifications={notifications} />

        {!decision || !decision.feedItem || !decision.content ? (
          <section className={`${CARD} mt-6 p-8`}>
            <p className="text-base text-[#1B3A2D]">Nothing here yet.</p>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
              Your coaching lesson for today hasn&apos;t been prepared yet — check back shortly, or
              complete today&apos;s check-in to help personalize it.
            </p>
          </section>
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
                  {/* Today's Coach's Note — the emotional centerpiece */}
                  <section
                    className={`${CARD} mef-animate-in relative overflow-hidden p-7`}
                    style={stagger(sectionIndex++)}
                  >
                    <div
                      className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#F5B700]/10"
                      aria-hidden="true"
                    />
                    <div className="relative flex items-center gap-2 text-[#854D0E]">
                      <GreetingIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      <p className="text-sm font-semibold uppercase tracking-wider">
                        Today&apos;s Coach&apos;s Note
                      </p>
                    </div>
                    <p className="relative mt-3 text-lg leading-relaxed text-[#1B3A2D]">
                      {coachNote}
                    </p>
                    <p className="relative mt-4 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
                      — Your MEF Coach
                    </p>
                  </section>

                  {/* Today's Focus */}
                  <section className={`${CARD} mef-animate-in p-7`} style={stagger(sectionIndex++)}>
                    <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
                      Today&apos;s Focus
                    </p>
                    <p className="mt-3 text-lg leading-relaxed text-[#1B3A2D]">
                      {today.feedItem.focus_text}
                    </p>
                  </section>

                  {/* Today's Lesson */}
                  <section
                    className={`${CARD} mef-animate-in overflow-hidden p-0`}
                    style={stagger(sectionIndex++)}
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
                        <div className="flex items-center gap-2 text-[#854D0E]">
                          <BookOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <p className="text-sm font-semibold uppercase tracking-wider">
                            Today&apos;s Lesson
                          </p>
                        </div>
                        <span className="flex items-center gap-1 text-xs text-[#6B7A72]">
                          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {today.content.estimated_reading_minutes} min
                        </span>
                      </div>
                      <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug text-[#1B3A2D]">
                        {today.content.title}
                      </h2>
                      <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]/85">
                        {today.content.body}
                      </p>
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
                  <section className={`${CARD} mef-animate-in p-7`} style={stagger(sectionIndex++)}>
                    <div className="flex items-center gap-2 text-[#854D0E]">
                      <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      <p className="text-sm font-semibold uppercase tracking-wider">
                        Today&apos;s Challenge
                      </p>
                    </div>
                    {challengeCarryover && (
                      <p className="mt-2 text-sm font-medium text-[#854D0E]">
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

                  {/* Talk to Your Coach — a single, contextual entry point into the
                      Conversation Coach (Milestone 7), never a second decision
                      surface; it always opens the same thread the member's own
                      /conversation page shows. */}
                  <section className={`${CARD} mef-animate-in p-6`} style={stagger(sectionIndex++)}>
                    <div className="flex items-center gap-2 text-[#854D0E]">
                      <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      <p className="text-sm font-semibold uppercase tracking-wider">
                        Talk to Your Coach
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href="/conversation?entry=today_focus"
                        className="rounded-full border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.06]"
                      >
                        Talk through today&apos;s challenge
                      </Link>
                      {today.feedItem.completed_at ? (
                        <Link
                          href="/conversation?entry=today_completed"
                          className="rounded-full border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.06]"
                        >
                          I completed this — what&apos;s next?
                        </Link>
                      ) : (
                        <Link
                          href="/conversation?entry=today_easier_option"
                          className="rounded-full border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.06]"
                        >
                          I need an easier option
                        </Link>
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
                      className={`${CARD} mef-animate-in p-6`}
                      style={stagger(sectionIndex++)}
                    >
                      <div className="flex items-center gap-2 text-[#854D0E]">
                        <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        <p className="text-sm font-semibold uppercase tracking-wider">
                          Coach Insight
                        </p>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">{coachInsight}</p>
                    </section>
                  )}

                  {/* Why You're Seeing This — the Coaching Brain's own reason leads, with the specific lesson's own reason underneath. */}
                  <section className={`${CARD} mef-animate-in p-6`} style={stagger(sectionIndex++)}>
                    <div className="flex items-center gap-2 text-[#854D0E]">
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
                    <Link
                      href="/conversation?entry=today_why"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
                    >
                      <MessageCircle
                        className="h-3.5 w-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Ask your coach why
                    </Link>
                  </section>
                </>
              );
            })()}
          </div>
        )}

        {/* Past Lessons */}
        {history.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center gap-2 text-[#854D0E]">
              <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Past Lessons</p>
            </div>
            <div className={`${CARD} mt-3 divide-y divide-[#1B3A2D]/5 p-2`}>
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
      </main>

      <BottomNav isCoach={isCoach} />

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
