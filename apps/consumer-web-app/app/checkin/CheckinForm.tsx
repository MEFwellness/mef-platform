'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Smile,
  Moon,
  Sunrise,
  HeartPulse,
  MessageCircle,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import {
  submitDailyCheckin,
  logHabitCompletion,
  markEveningReminderShown,
} from '@/app/actions/checkin';
import { submitProbeAnswerAction } from '@/app/actions/dailyCheckinPlan';
import { PAIN_FOLLOWUP_THRESHOLD } from '@/lib/daily-checkin-adaptive/constants';
import { isLocalFollowUpEligible } from '@/lib/daily-checkin-adaptive/localFollowUps';
import type { DriverProbeQuestion } from '@/lib/daily-checkin-adaptive/types';
import { getTodaysHydrationTotal } from '@/app/actions/events';
import { EveningReminderModal } from '@/components/checkin/EveningReminderModal';
import { DriverProbeField, type ProbeAnswerValue } from '@/components/checkin/DriverProbeField';
import type {
  BowelMovementStatus,
  DailyCheckin,
  DailyCheckinInput,
  Habit,
} from '@mef/shared-types-contracts';

const SPECIALLY_HANDLED_QUESTION_KEYS = new Set([
  'checkin_probe.night_waking_count',
  'checkin_probe.night_sweats',
  'checkin_probe.bowel_movement_status',
  'checkin_probe.morning_soreness',
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
   * guessed here.
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

const PAIN_LOCATION_OPTIONS = [
  { value: 'neck', label: 'Neck' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'upper_back', label: 'Upper back' },
  { value: 'lower_back', label: 'Lower back' },
  { value: 'hips', label: 'Hips' },
  { value: 'knees', label: 'Knees' },
  { value: 'feet_or_ankles', label: 'Feet or ankles' },
  { value: 'hands_or_wrists', label: 'Hands or wrists' },
  { value: 'widespread', label: 'Widespread' },
  { value: 'other', label: 'Other' },
] as const;

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

const SECTION_CARD =
  'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition-shadow duration-300 hover:shadow-[0_6px_32px_-6px_rgba(27,58,45,0.14)]';

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

/** A single "how much" rating, presented as its meaning rather than a bare number — the selected word is what the member reads back, the integer underneath is exactly what was scored before. */
function MeaningScale({
  question,
  meanings,
  value,
  onChange,
  min = 1,
}: {
  question: string;
  meanings: readonly string[];
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
}) {
  const options = meanings.map((word, i) => ({ value: min + i, word }));

  return (
    <div>
      <p className="text-[13px] leading-relaxed text-[#6B7A72]">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={question}>
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={isSelected}
              className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out active:scale-95 ${
                isSelected
                  ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                  : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
              }`}
            >
              {option.word}
            </button>
          );
        })}
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
  // Every rotating probe this screen renders generically — the new driver
  // questions (migration 109) plus any future one, minus the four keys
  // above (each has its own dedicated state/submit wiring into a real
  // daily_checkins column, kept exactly as it was) and morning_soreness
  // (already rendered unconditionally below; migration 109 only tags that
  // existing field as MOV-5 evidence, it doesn't add a second field for it).
  const genericRotatingProbes = rotatingProbes.filter((q) => !SPECIALLY_HANDLED_QUESTION_KEYS.has(q.questionKey));

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
  // already apply by hand (see painLevel's onChange below).
  useEffect(() => {
    setProbeAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const question of localFollowUps) {
        if (question.questionKey in next && !isLocalFollowUpEligible(question, prev)) {
          delete next[question.questionKey];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [probeAnswers, localFollowUps]);

  const eligibleLocalFollowUps = localFollowUps.filter((question) =>
    isLocalFollowUpEligible(question, probeAnswers)
  );

  const router = useRouter();
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

  // Premium UX Milestone 4, "better progress feedback" — a calm sense of
  // motion through the check-in rather than a blocking wizard. Habits and
  // the fully-optional reflection notes are deliberately excluded from the
  // denominator: their presence/size varies per member and per day, so
  // counting them would make the same effort look like a different amount
  // of "progress" from one day to the next.
  const { completedSections, totalSections } = useMemo(() => {
    const readinessDone =
      actualBedtime !== '' &&
      actualWakeTime !== '' &&
      moodLevel !== null &&
      energyLevel !== null &&
      stressLevel !== null;
    const sleepDone = sleepQuality !== null && sleepDuration !== null;
    const bodyDone = painLevel !== null && bowelMovementStatus !== null;
    return {
      completedSections: [readinessDone, sleepDone, bodyDone].filter(Boolean).length,
      totalSections: 3,
    };
  }, [
    actualBedtime,
    actualWakeTime,
    moodLevel,
    energyLevel,
    stressLevel,
    sleepQuality,
    sleepDuration,
    painLevel,
    bowelMovementStatus,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    // Required for a valid Morning Readiness day (see
    // lib/wellness/morningReadiness.ts's isMorningReadinessEligible, which
    // this list matches exactly) — everything else on this form is
    // optional-but-encouraged.
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

    router.push(isFirstCheckin ? '/dashboard?firstCheckin=1' : '/dashboard');
    router.refresh();
  }

  async function acknowledgeEveningReminder() {
    setShowEveningReminder(false);
    await markEveningReminderShown();
    router.push(isFirstCheckin ? '/dashboard?firstCheckin=1' : '/dashboard');
    router.refresh();
  }

  async function toggleHabit(habitId: string, completed: boolean) {
    setHabitStatus((current) => ({ ...current, [habitId]: completed }));
    const result = await logHabitCompletion(habitId, localDate, timezone, completed);
    if (result.error) {
      // Revert on failure so the checkbox never lies about what's saved.
      setHabitStatus((current) => ({ ...current, [habitId]: !completed }));
    }
  }

  const progressLabel =
    completedSections === totalSections
      ? 'All set — ready to save'
      : `${totalSections - completedSections} section${totalSections - completedSections === 1 ? '' : 's'} left`;

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* Progress feedback, subtle, never blocking submission. */}
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1B3A2D]/[0.07]">
            <div
              className="h-full rounded-full bg-[#1B3A2D] transition-all duration-500 ease-out"
              style={{ width: `${(completedSections / totalSections) * 100}%` }}
            />
          </div>
          <p className="shrink-0 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
            {progressLabel}
          </p>
        </div>

        <div className={`${SECTION_CARD} mef-animate-in space-y-6 p-7`}>
          <SectionHeader
            icon={Smile}
            title="How you're feeling"
            subtitle="A quick emotional and physical read on this morning"
          />
          <MeaningScale
            question="How are you feeling emotionally this morning?"
            meanings={MOOD_MEANING}
            value={moodLevel}
            onChange={setMoodLevel}
          />
          <MeaningScale
            question="How energized do you feel this morning?"
            meanings={ENERGY_MEANING}
            value={energyLevel}
            onChange={setEnergyLevel}
          />
          <MeaningScale
            question="How much stress are you carrying as you wake up?"
            meanings={STRESS_MEANING}
            value={stressLevel}
            onChange={setStressLevel}
          />
        </div>

        <div
          className={`${SECTION_CARD} mef-animate-in space-y-6 p-7`}
          style={{ animationDelay: '60ms' }}
        >
          <SectionHeader icon={Moon} title="Sleep" subtitle="How last night set up today" />
          <MeaningScale
            question="How restorative was your sleep?"
            meanings={SLEEP_QUALITY_MEANING}
            value={sleepQuality}
            onChange={setSleepQuality}
          />
          <div>
            <p className="text-[13px] leading-relaxed text-[#6B7A72]">
              About how many hours did you sleep?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SLEEP_DURATIONS.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() => setSleepDuration(duration)}
                  aria-pressed={sleepDuration === duration}
                  className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-all duration-200 ease-out active:scale-95 ${
                    sleepDuration === duration
                      ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                      : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
                  }`}
                >
                  {duration}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`${SECTION_CARD} mef-animate-in space-y-6 p-7`}
          style={{ animationDelay: '120ms' }}
        >
          <SectionHeader
            icon={Sunrise}
            title="Morning Readiness"
            subtitle="Bedtime, wake time, and how the night actually went"
          />
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[13px] leading-relaxed text-[#6B7A72]">Bedtime</span>
              <input
                type="time"
                value={actualBedtime}
                onChange={(event) => setActualBedtime(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 px-3 py-2.5 text-base text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[13px] leading-relaxed text-[#6B7A72]">Wake time</span>
              <input
                type="time"
                value={actualWakeTime}
                onChange={(event) => setActualWakeTime(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 px-3 py-2.5 text-base text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none"
              />
            </label>
          </div>

          {nightWakingQuestion && (
            <DriverProbeField
              question={nightWakingQuestion}
              value={nightWakingCount}
              onChange={(value) => setNightWakingCount(value as number)}
            />
          )}

          {nightSweatsQuestion && (
            <DriverProbeField
              question={nightSweatsQuestion}
              value={nightSweats}
              onChange={(value) => setNightSweats(value as boolean)}
            />
          )}

          <MeaningScale
            question="How sore does your body feel this morning?"
            meanings={SORENESS_MEANING}
            value={morningSoreness}
            onChange={setMorningSoreness}
          />

          {bowelMovementQuestion && (
            <DriverProbeField
              question={bowelMovementQuestion}
              value={bowelMovementStatus}
              onChange={(value) => setBowelMovementStatus(value as BowelMovementStatus)}
            />
          )}

          {genericRotatingProbes.map((question) => (
            <DriverProbeField
              key={question.questionKey}
              question={question}
              value={probeAnswers[question.questionKey] ?? null}
              onChange={(value) => setProbeAnswer(question.questionKey, value)}
            />
          ))}

          {eligibleLocalFollowUps.map((question) => (
            <DriverProbeField
              key={question.questionKey}
              question={question}
              value={probeAnswers[question.questionKey] ?? null}
              onChange={(value) => setProbeAnswer(question.questionKey, value)}
            />
          ))}
        </div>

        <div
          className={`${SECTION_CARD} mef-animate-in space-y-6 p-7`}
          style={{ animationDelay: '180ms' }}
        >
          <SectionHeader
            icon={HeartPulse}
            title="How your body feels"
            subtitle="Any pain or discomfort as you start the day"
          />
          <MeaningScale
            question="Are you noticing any pain or physical discomfort?"
            meanings={PAIN_MEANING}
            value={painLevel}
            onChange={(value) => {
              setPainLevel(value);
              if (value < PAIN_FOLLOWUP_THRESHOLD) {
                setPainLocation(null);
                setPainAggravatingFactor(null);
              }
            }}
            min={0}
          />

          {painLevel !== null && painLevel >= PAIN_FOLLOWUP_THRESHOLD && (
            <div>
              <p className="text-[13px] leading-relaxed text-[#6B7A72]">Where is it, mainly?</p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Where is it, mainly?">
                {PAIN_LOCATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPainLocation(option.value)}
                    aria-pressed={painLocation === option.value}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out active:scale-95 ${
                      painLocation === option.value
                        ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                        : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {painLevel !== null && painLevel >= PAIN_FOLLOWUP_THRESHOLD && painLocation !== null && (
            <div>
              <p className="text-[13px] leading-relaxed text-[#6B7A72]">What tends to make it worse?</p>
              <div
                className="mt-3 flex flex-wrap gap-2"
                role="group"
                aria-label="What tends to make it worse?"
              >
                {PAIN_AGGRAVATING_FACTOR_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPainAggravatingFactor(option.value)}
                    aria-pressed={painAggravatingFactor === option.value}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out active:scale-95 ${
                      painAggravatingFactor === option.value
                        ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                        : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {habits.length > 0 && (
          <div className={`${SECTION_CARD} mef-animate-in p-7`} style={{ animationDelay: '240ms' }}>
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
        )}

        <div className={`${SECTION_CARD} mef-animate-in p-7`} style={{ animationDelay: '300ms' }}>
          <SectionHeader
            icon={MessageCircle}
            title="Anything else?"
            subtitle="Entirely optional, share as much or as little as you'd like"
          />
          <label className="mt-4 flex items-start gap-3 text-sm text-[#1B3A2D]">
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

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition-all duration-200 ease-out hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {submitting ? 'Saving…' : existingCheckin ? 'Update check-in' : 'Save check-in'}
        </button>
      </form>
      {showEveningReminder && <EveningReminderModal onAcknowledge={acknowledgeEveningReminder} />}
    </>
  );
}
