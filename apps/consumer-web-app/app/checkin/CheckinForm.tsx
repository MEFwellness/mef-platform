'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Smile, Moon, HeartPulse, MessageCircle, CheckCircle2, type LucideIcon } from 'lucide-react';
import {
  submitDailyCheckin,
  logHabitCompletion,
  markEveningReminderShown,
} from '@/app/actions/checkin';
import { submitProbeAnswerAction } from '@/app/actions/dailyCheckinPlan';
import { PAIN_FOLLOWUP_THRESHOLD } from '@/lib/daily-checkin-adaptive/constants';
import { isLocalFollowUpEligible } from '@/lib/daily-checkin-adaptive/localFollowUps';
import { morningScreenForQuestion, type MorningScreenKey } from '@/lib/daily-checkin-adaptive/screenGrouping';
import type { DriverProbeQuestion } from '@/lib/daily-checkin-adaptive/types';
import { getTodaysHydrationTotal } from '@/app/actions/events';
import { EveningReminderModal } from '@/components/checkin/EveningReminderModal';
import { DriverProbeField, type ProbeAnswerValue } from '@/components/checkin/DriverProbeField';
import { CheckinWizard, StaggerItem } from '@/components/checkin/CheckinWizard';
import { FiveFacesScale } from '@/components/checkin/scales/FiveFacesScale';
import { VerticalFillScale } from '@/components/checkin/scales/VerticalFillScale';
import { TighteningShapeScale } from '@/components/checkin/scales/TighteningShapeScale';
import { FiveMoonsScale } from '@/components/checkin/scales/FiveMoonsScale';
import { SegmentedControl } from '@/components/checkin/scales/SegmentedControl';
import { PillRow } from '@/components/checkin/scales/PillRow';
import { BedtimeWakeArc } from '@/components/checkin/BedtimeWakeArc';
import { BodyOutlineTap } from '@/components/checkin/BodyOutlineTap';
import { useScreenAutoAdvance } from '@/hooks/useScreenAutoAdvance';
import type {
  BowelMovementStatus,
  DailyCheckin,
  DailyCheckinInput,
  Habit,
} from '@mef/shared-types-contracts';

// Handled by a dedicated component/state elsewhere in this screen rather
// than the generic DriverProbeField loop — night_waking_count/night_sweats
// write to their own daily_checkins columns via dedicated state (as
// before migration 109), bowel_movement_status renders under "Your body"
// (digestion), morning_soreness is a fixed-core-style field with its own
// SegmentedControl, and the two pain follow-ups render through
// BodyOutlineTap/a dedicated pill row instead of the generic renderer so
// they can share state with the pain severity question above them.
const SPECIALLY_HANDLED_QUESTION_KEYS = new Set([
  'checkin_probe.night_waking_count',
  'checkin_probe.night_sweats',
  'checkin_probe.bowel_movement_status',
  'checkin_probe.morning_soreness',
  'checkin_probe.pain_location',
  'checkin_probe.pain_aggravating_factor',
]);

type Props = {
  localDate: string;
  timezone: string;
  existingCheckin: DailyCheckin | null;
  habits: Habit[];
  initialHabitLogs: Record<string, boolean>;
  /**
   * True only when this member has never completed a check-in before this
   * one. Drives the post-save redirect to the Milestone 4 first-check-in
   * transition (`/dashboard?firstCheckin=1`) rather than a plain dashboard
   * redirect — computed by the server page from a real history read, not
   * guessed here. Also drives the one-time intro copy at the top of
   * Screen 1 (the "Let's Begin With Today" welcome-flow screen this
   * replaces — see WelcomeFlow.tsx).
   */
  isFirstCheckin: boolean;
  /**
   * True once profiles.evening_reflection_reminder_shown_at is already
   * set. When false, a successful save shows EveningReminderModal instead
   * of navigating straight to the dashboard, once, ever, per member.
   */
  eveningReminderAlreadyShown: boolean;
  /**
   * This day's driver-probe questions chosen by the adaptive picker
   * (lib/daily-checkin-adaptive/), already filtered to this screen
   * (screen = 'morning', migration 109) — governs which optional
   * sleep-timing / night-waking / night-sweats / bowel-status / other
   * driver-probe questions render today. The fixed core above (mood,
   * sleep quality, sleep duration, energy, stress, pain) is never gated
   * by this — it always renders regardless of what's in this list.
   */
  rotatingProbes: DriverProbeQuestion[];
  /**
   * Every active local-follow-up question (driver_id null) for this
   * screen — e.g. "What kept you up?" — never part of the daily rotating
   * plan (excluded from the adaptive bank entirely), shown instead once
   * its own `requires` rule is satisfied by an answer entered elsewhere
   * in this same check-in (lib/daily-checkin-adaptive/localFollowUps.ts).
   */
  localFollowUps: DriverProbeQuestion[];
  /** Today's previously-saved answers for storage='probe_answer' questions (daily_checkin_probe_answers), keyed by question_key — hydrates the generic probe fields when re-opening an already-answered check-in. */
  initialProbeAnswers: Record<string, unknown>;
};

const PAIN_AGGRAVATING_FACTOR_OPTIONS = [
  { value: 'sitting', label: 'Sitting' },
  { value: 'standing', label: 'Standing' },
  { value: 'movement', label: 'Movement' },
  { value: 'bending_or_lifting', label: 'Bending or lifting' },
  { value: 'first_thing_in_the_morning', label: 'First thing in the morning' },
  { value: 'by_end_of_day', label: 'By end of day' },
  { value: 'not_sure', label: 'Not sure' },
] as const;

const SLEEP_DURATIONS = ['<5h', '5-6h', '6-7h', '7-8h', '8h+'] as const;

/** The "replace numbers with meaning" word sets, per Premium UX Milestone 4 — the 1-5 (or 0-5) integer stored on the row never changes, only what the member sees while choosing it. */
const MOOD_MEANING = ['Very Low', 'Low', 'Okay', 'Good', 'Excellent'] as const;
const ENERGY_MEANING = ['Exhausted', 'Low', 'Moderate', 'Good', 'High'] as const;
const STRESS_MEANING = ['Very Calm', 'Calm', 'Moderate', 'High', 'Overwhelmed'] as const;
const SLEEP_QUALITY_MEANING = ['Terrible', 'Poor', 'Fair', 'Good', 'Excellent'] as const;
const PAIN_MEANING = [
  'None',
  'Mild',
  'Mild-moderate',
  'Moderate',
  'Significant',
  'Severe',
] as const;
const SORENESS_MEANING = ['None', 'Mild', 'Moderate', 'Noticeable', 'Significant'] as const;

const SCREEN_COUNT = 4;

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
        <Icon className="h-4 w-4 text-[#1B3A2D]/70" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div>
        <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
          {title}
        </p>
        <p className="text-[13px] text-[#6B7A72]">{subtitle}</p>
      </div>
    </div>
  );
}

export function CheckinForm({
  localDate,
  timezone,
  existingCheckin,
  habits,
  initialHabitLogs,
  isFirstCheckin,
  eveningReminderAlreadyShown,
  rotatingProbes,
  localFollowUps,
  initialProbeAnswers,
}: Props) {
  const nightWakingQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.night_waking_count') ?? null;
  const nightSweatsQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.night_sweats') ?? null;
  const bowelMovementQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.bowel_movement_status') ?? null;

  // Every rotating probe this screen renders generically, grouped by
  // which of the 4 wizard screens matches its driver's domain (task
  // requirement 1: "rotating probe questions ... slot into whichever
  // screen matches their driver domain") — minus the keys handled by a
  // dedicated component/state above.
  const probesByScreen = useMemo(() => {
    const groups: Record<MorningScreenKey, DriverProbeQuestion[]> = { feeling: [], night: [], body: [], other: [] };
    for (const question of rotatingProbes) {
      if (SPECIALLY_HANDLED_QUESTION_KEYS.has(question.questionKey)) continue;
      groups[morningScreenForQuestion(question)].push(question);
    }
    return groups;
  }, [rotatingProbes]);

  const [probeAnswers, setProbeAnswers] = useState<Record<string, ProbeAnswerValue>>(() => {
    const initial: Record<string, ProbeAnswerValue> = {};
    for (const [key, value] of Object.entries(initialProbeAnswers)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        initial[key] = value;
      }
    }
    return initial;
  });

  function setProbeAnswer(questionKey: string, value: ProbeAnswerValue) {
    setProbeAnswers((prev) => ({ ...prev, [questionKey]: value }));
  }

  // A local follow-up whose `requires` no longer holds (e.g. the member
  // lowered an answer back below its trigger) has its stored answer
  // cleared too — the same discipline the pre-existing pain follow-ups
  // already apply by hand (see painLevel's onChange below). Recomputed
  // straight from state rather than an effect, so it never lags a render
  // behind the answer that changed it.
  const eligibleLocalFollowUps = localFollowUps.filter(
    (question) =>
      !SPECIALLY_HANDLED_QUESTION_KEYS.has(question.questionKey) &&
      isLocalFollowUpEligible(question, probeAnswers)
  );
  const localFollowUpsByScreen = useMemo(() => {
    const groups: Record<MorningScreenKey, DriverProbeQuestion[]> = { feeling: [], night: [], body: [], other: [] };
    for (const question of eligibleLocalFollowUps) {
      groups[morningScreenForQuestion(question)].push(question);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleLocalFollowUps.map((q) => q.questionKey).join(',')]);

  const router = useRouter();
  const [screenIndex, setScreenIndex] = useState(0);
  const [furthestScreenIndex, setFurthestScreenIndex] = useState(0);
  const [showEveningReminder, setShowEveningReminder] = useState(false);
  const [moodLevel, setMoodLevel] = useState<number | null>(existingCheckin?.mood_level ?? null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(
    existingCheckin?.sleep_quality ?? null
  );
  const [sleepDuration, setSleepDuration] = useState<(typeof SLEEP_DURATIONS)[number] | null>(
    existingCheckin?.sleep_duration ?? null
  );
  const [energyLevel, setEnergyLevel] = useState<number | null>(
    existingCheckin?.energy_level ?? null
  );
  const [stressLevel, setStressLevel] = useState<number | null>(
    existingCheckin?.stress_level ?? null
  );
  const [painLevel, setPainLevel] = useState<number | null>(
    existingCheckin?.pain_discomfort_level ?? null
  );
  // Local follow-ups to the pain question (requirement 5) — level 2 only
  // ever appears once level 1 has an answer, and both disappear again if
  // pain is edited back down below the threshold. Persisted separately
  // (daily_checkin_probe_answers) since neither has a dedicated
  // daily_checkins column.
  const [painLocation, setPainLocation] = useState<string | null>(null);
  const [painAggravatingFactor, setPainAggravatingFactor] = useState<string | null>(null);
  const [concern, setConcern] = useState(existingCheckin?.new_or_worsening_concern ?? false);
  const [notes, setNotes] = useState(existingCheckin?.optional_notes ?? '');
  const [habitStatus, setHabitStatus] = useState<Record<string, boolean>>(initialHabitLogs);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Morning Readiness fields (migration 63) — bedtime/wake time/night
  // waking/night sweats/soreness/bowel movement status. These, plus mood/
  // energy/stress above, are what a Morning Readiness day needs — see
  // lib/wellness/morningReadiness.ts's eligibility rule, which this form's
  // required-field validation below matches.
  const [actualBedtime, setActualBedtime] = useState(existingCheckin?.actual_bedtime ?? '');
  const [actualWakeTime, setActualWakeTime] = useState(existingCheckin?.actual_wake_time ?? '');
  const [nightWakingCount, setNightWakingCount] = useState<number | null>(
    existingCheckin?.night_waking_count ?? null
  );
  const [nightSweats, setNightSweats] = useState<boolean | null>(
    existingCheckin?.night_sweats ?? null
  );
  const [morningSoreness, setMorningSoreness] = useState<number | null>(
    existingCheckin?.morning_soreness ?? null
  );
  const [bowelMovementStatus, setBowelMovementStatus] = useState<BowelMovementStatus | null>(
    existingCheckin?.bowel_movement_status ?? null
  );

  function goToScreen(index: number) {
    const clamped = Math.max(0, Math.min(index, SCREEN_COUNT - 1));
    setScreenIndex(clamped);
    setFurthestScreenIndex((prev) => Math.max(prev, clamped));
  }
  const goNext = () => goToScreen(screenIndex + 1);
  const goBack = () => goToScreen(screenIndex - 1);

  const screen0Complete = moodLevel !== null && energyLevel !== null && stressLevel !== null;
  const screen1Complete =
    sleepQuality !== null && sleepDuration !== null && actualBedtime !== '' && actualWakeTime !== '';
  const screen2Complete = useMemo(() => {
    if (morningSoreness === null || painLevel === null) return false;
    if (painLevel >= PAIN_FOLLOWUP_THRESHOLD && (painLocation === null || painAggravatingFactor === null)) {
      return false;
    }
    if (bowelMovementQuestion && bowelMovementStatus === null) return false;
    return true;
  }, [morningSoreness, painLevel, painLocation, painAggravatingFactor, bowelMovementQuestion, bowelMovementStatus]);

  // Each hook watches only that screen's OWN field-completeness, never
  // multiplied by whether that screen is currently on-screen: these
  // fields can only change while their own screen is showing anyway (no
  // other screen renders their controls), so gating on screenIndex too
  // would falsely read a pre-filled reopen (existingCheckin) as "just
  // completed" the moment the member's later screen comes into view.
  useScreenAutoAdvance(screen0Complete, () => screenIndex === 0 && goNext());
  useScreenAutoAdvance(screen1Complete, () => screenIndex === 1 && goNext());
  useScreenAutoAdvance(screen2Complete, () => screenIndex === 2 && goNext());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    // Required for a valid Morning Readiness day (see
    // lib/wellness/morningReadiness.ts's isMorningReadinessEligible, which
    // this list matches exactly) — belt-and-suspenders: the wizard's own
    // auto-advance gating already guarantees these are set by the time
    // Screen 4 is reachable, but this check stays as the same safety net
    // it always was.
    if (
      actualBedtime === '' ||
      actualWakeTime === '' ||
      moodLevel === null ||
      energyLevel === null ||
      stressLevel === null
    ) {
      setError('Please add your bedtime, wake time, mood, energy, and stress before saving.');
      return;
    }

    setSubmitting(true);

    const input: DailyCheckinInput = {
      timezone,
      local_date: localDate,
      mood_level: moodLevel,
      sleep_quality: sleepQuality,
      sleep_duration: sleepDuration,
      energy_level: energyLevel,
      stress_level: stressLevel,
      // Hydration is now a live running counter logged throughout the day
      // (see app/actions/events.ts) rather than a field this form edits —
      // the member's current live total is snapshotted here purely so
      // historical/coach views of this checkin row still carry a real
      // water_cups value, same as before this feature.
      water_cups: await getTodaysHydrationTotal(),
      // Digestion and movement are now asked in Evening Reflection, not
      // here (Premium UX polish milestone) — preserve whatever Evening
      // already saved for today rather than overwriting it with null on
      // a Morning Readiness save.
      digestion_rating: existingCheckin?.digestion_rating ?? null,
      pain_discomfort_level: painLevel,
      movement_today: existingCheckin?.movement_today ?? null,
      new_or_worsening_concern: concern,
      optional_notes: notes.trim() ? notes.trim() : null,
      actual_bedtime: actualBedtime || null,
      actual_wake_time: actualWakeTime || null,
      night_waking_count: nightWakingCount,
      night_sweats: nightSweats,
      morning_soreness: morningSoreness,
      bowel_movement_status: bowelMovementStatus,
    };

    const result = await submitDailyCheckin(input);

    if (painLocation) {
      await submitProbeAnswerAction(localDate, 'checkin_probe.pain_location', painLocation);
    }
    if (painAggravatingFactor) {
      await submitProbeAnswerAction(
        localDate,
        'checkin_probe.pain_aggravating_factor',
        painAggravatingFactor
      );
    }
    // Every generic driver-probe/local-follow-up answer (migration 109) —
    // the same submitProbeAnswerAction the two pain follow-ups above
    // already use, just looped over N question_keys instead of 2.
    await Promise.all(
      Object.entries(probeAnswers).map(([questionKey, value]) =>
        submitProbeAnswerAction(localDate, questionKey, value)
      )
    );

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    // Shown once, ever, never interrupts a later Morning Readiness save.
    if (!eveningReminderAlreadyShown) {
      setShowEveningReminder(true);
      return;
    }

    router.push(resultHref() as Route);
    router.refresh();
  }

  async function acknowledgeEveningReminder() {
    setShowEveningReminder(false);
    await markEveningReminderShown();
    router.push(resultHref() as Route);
    router.refresh();
  }

  /**
   * Forecast & Calibration Loop (Part 4) — the ending screen's own route,
   * same slot every day, replacing the old direct-to-dashboard redirect.
   * `date` is passed explicitly (rather than the result page recomputing
   * "today") so logging for yesterday still grades the right day's
   * forecast. `firstCheckin` is forwarded unchanged so the existing
   * Milestone 4 first-check-in transition still fires from /dashboard
   * once she continues past this screen — untouched, just one hop later.
   */
  function resultHref(): string {
    const params = new URLSearchParams({ date: localDate });
    if (isFirstCheckin) params.set('firstCheckin', '1');
    return `/checkin/result?${params.toString()}`;
  }

  async function toggleHabit(habitId: string, completed: boolean) {
    setHabitStatus((current) => ({ ...current, [habitId]: completed }));
    const result = await logHabitCompletion(habitId, localDate, timezone, completed);
    if (result.error) {
      // Revert on failure so the checkbox never lies about what's saved.
      setHabitStatus((current) => ({ ...current, [habitId]: !completed }));
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6">
        <CheckinWizard
          screenCount={SCREEN_COUNT}
          screenIndex={screenIndex}
          furthestScreenIndex={furthestScreenIndex}
          onBack={goBack}
          onSelectScreen={goToScreen}
        >
          {screenIndex === 0 && (
            <div key="screen-0" className="space-y-6">
              <StaggerItem index={0}>
                <SectionHeader
                  icon={Smile}
                  title="How you're feeling"
                  subtitle="A quick emotional and physical read on this morning"
                />
              </StaggerItem>
              {isFirstCheckin && (
                <StaggerItem index={1}>
                  <div>
                    <p className="text-[15px] font-medium text-[#1B3A2D]">
                      Your first check-in sets your starting point.
                    </p>
                    <p className="mt-1 text-[13px] text-[#6B7A72]">
                      There are no perfect answers. Just answer honestly.
                    </p>
                  </div>
                </StaggerItem>
              )}
              <StaggerItem index={2}>
                <FiveFacesScale
                  question="How are you feeling emotionally this morning?"
                  labels={MOOD_MEANING}
                  value={moodLevel}
                  onChange={setMoodLevel}
                />
              </StaggerItem>
              <StaggerItem index={3}>
                <VerticalFillScale
                  question="How energized do you feel this morning?"
                  labels={ENERGY_MEANING}
                  value={energyLevel}
                  onChange={setEnergyLevel}
                />
              </StaggerItem>
              <StaggerItem index={4}>
                <TighteningShapeScale
                  question="How much stress are you carrying as you wake up?"
                  labels={STRESS_MEANING}
                  value={stressLevel}
                  onChange={setStressLevel}
                />
              </StaggerItem>
              {[...probesByScreen.feeling, ...localFollowUpsByScreen.feeling].map((question, index) => (
                <StaggerItem key={question.questionKey} index={5 + index}>
                  <DriverProbeField
                    question={question}
                    value={probeAnswers[question.questionKey] ?? null}
                    onChange={(value) => setProbeAnswer(question.questionKey, value)}
                  />
                </StaggerItem>
              ))}
            </div>
          )}

          {screenIndex === 1 && (
            <div key="screen-1" className="space-y-6">
              <StaggerItem index={0}>
                <SectionHeader icon={Moon} title="Your night" subtitle="How last night set up today" />
              </StaggerItem>
              <StaggerItem index={1}>
                <FiveMoonsScale
                  question="How restorative was your sleep?"
                  labels={SLEEP_QUALITY_MEANING}
                  value={sleepQuality}
                  onChange={setSleepQuality}
                />
              </StaggerItem>
              <StaggerItem index={2}>
                <SegmentedControl
                  question="About how many hours did you sleep?"
                  options={SLEEP_DURATIONS.map((d) => ({ value: d, label: d }))}
                  value={sleepDuration}
                  onChange={setSleepDuration}
                />
              </StaggerItem>
              <StaggerItem index={3}>
                <BedtimeWakeArc
                  bedtime={actualBedtime}
                  wakeTime={actualWakeTime}
                  onChange={(bedtime, wake) => {
                    setActualBedtime(bedtime);
                    setActualWakeTime(wake);
                  }}
                />
              </StaggerItem>
              {nightWakingQuestion && (
                <StaggerItem index={4}>
                  <DriverProbeField
                    question={nightWakingQuestion}
                    value={nightWakingCount}
                    onChange={(value) => setNightWakingCount(value as number)}
                  />
                </StaggerItem>
              )}
              {nightSweatsQuestion && (
                <StaggerItem index={5}>
                  <DriverProbeField
                    question={nightSweatsQuestion}
                    value={nightSweats}
                    onChange={(value) => setNightSweats(value as boolean)}
                  />
                </StaggerItem>
              )}
              {[...probesByScreen.night, ...localFollowUpsByScreen.night].map((question, index) => (
                <StaggerItem key={question.questionKey} index={6 + index}>
                  <DriverProbeField
                    question={question}
                    value={probeAnswers[question.questionKey] ?? null}
                    onChange={(value) => setProbeAnswer(question.questionKey, value)}
                  />
                </StaggerItem>
              ))}
            </div>
          )}

          {screenIndex === 2 && (
            <div key="screen-2" className="space-y-6">
              <StaggerItem index={0}>
                <SectionHeader
                  icon={HeartPulse}
                  title="Your body"
                  subtitle="Soreness, pain, and digestion"
                />
              </StaggerItem>
              <StaggerItem index={1}>
                <SegmentedControl
                  question="How sore does your body feel this morning?"
                  options={SORENESS_MEANING.map((word, i) => ({ value: i + 1, label: word }))}
                  value={morningSoreness}
                  onChange={setMorningSoreness}
                />
              </StaggerItem>
              <StaggerItem index={2}>
                <SegmentedControl
                  question="Are you noticing any pain or physical discomfort?"
                  options={PAIN_MEANING.map((word, i) => ({ value: i, label: word }))}
                  value={painLevel}
                  onChange={(value) => {
                    setPainLevel(value);
                    if (value < PAIN_FOLLOWUP_THRESHOLD) {
                      setPainLocation(null);
                      setPainAggravatingFactor(null);
                    }
                  }}
                />
              </StaggerItem>

              {painLevel !== null && painLevel >= PAIN_FOLLOWUP_THRESHOLD && (
                <StaggerItem index={3}>
                  <BodyOutlineTap
                    question="Where is it, mainly?"
                    value={painLocation}
                    onChange={setPainLocation}
                  />
                </StaggerItem>
              )}

              {painLevel !== null && painLevel >= PAIN_FOLLOWUP_THRESHOLD && painLocation !== null && (
                <StaggerItem index={4}>
                  <PillRow
                    question="What tends to make it worse?"
                    options={PAIN_AGGRAVATING_FACTOR_OPTIONS}
                    value={painAggravatingFactor}
                    onChange={setPainAggravatingFactor}
                  />
                </StaggerItem>
              )}

              {bowelMovementQuestion && (
                <StaggerItem index={5}>
                  <DriverProbeField
                    question={bowelMovementQuestion}
                    value={bowelMovementStatus}
                    onChange={(value) => setBowelMovementStatus(value as BowelMovementStatus)}
                  />
                </StaggerItem>
              )}

              {[...probesByScreen.body, ...localFollowUpsByScreen.body].map((question, index) => (
                <StaggerItem key={question.questionKey} index={6 + index}>
                  <DriverProbeField
                    question={question}
                    value={probeAnswers[question.questionKey] ?? null}
                    onChange={(value) => setProbeAnswer(question.questionKey, value)}
                  />
                </StaggerItem>
              ))}
            </div>
          )}

          {screenIndex === 3 && (
            <div key="screen-3" className="space-y-6">
              <StaggerItem index={0}>
                <SectionHeader
                  icon={MessageCircle}
                  title="Anything else"
                  subtitle="Entirely optional, share as much or as little as you'd like"
                />
              </StaggerItem>

              {[...probesByScreen.other, ...localFollowUpsByScreen.other].map(
                (question, index) => (
                  <StaggerItem key={question.questionKey} index={1 + index}>
                    <DriverProbeField
                      question={question}
                      value={probeAnswers[question.questionKey] ?? null}
                      onChange={(value) => setProbeAnswer(question.questionKey, value)}
                    />
                  </StaggerItem>
                )
              )}

              {habits.length > 0 && (
                <StaggerItem index={2}>
                  <div>
                    <SectionHeader
                      icon={CheckCircle2}
                      title="Today's habits"
                      subtitle="Mark off what you've already done"
                    />
                    <div className="mt-4 space-y-2">
                      {habits.map((habit) => (
                        <label
                          key={habit.id}
                          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-200 ease-out ${
                            habitStatus[habit.id]
                              ? 'border-[#1B3A2D]/15 bg-[#1B3A2D]/[0.04] text-[#1B3A2D]'
                              : 'border-[#1B3A2D]/10 text-[#1B3A2D]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={habitStatus[habit.id] ?? false}
                            onChange={(event) => toggleHabit(habit.id, event.target.checked)}
                            className="h-4 w-4 accent-[#F5B700]"
                          />
                          {habit.title}
                        </label>
                      ))}
                    </div>
                  </div>
                </StaggerItem>
              )}

              <StaggerItem index={3}>
                <div>
                  <label className="flex items-start gap-3 text-sm text-[#1B3A2D]">
                    <input
                      type="checkbox"
                      checked={concern}
                      onChange={(event) => setConcern(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#F5B700]"
                    />
                    I have a new or worsening concern I want my coach to know about
                  </label>
                  <div className="mt-4">
                    <label className="text-[13px] leading-relaxed text-[#6B7A72]" htmlFor="notes">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      value={notes ?? ''}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none"
                      placeholder="Anything else worth noting today?"
                    />
                  </div>
                </div>
              </StaggerItem>

              {error && (
                <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mef-press flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition-all duration-200 ease-out hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? 'Saving…' : existingCheckin ? 'Update check-in' : 'Save check-in'}
              </button>
            </div>
          )}
        </CheckinWizard>
      </form>
      {showEveningReminder && <EveningReminderModal onAcknowledge={acknowledgeEveningReminder} />}
    </>
  );
}
