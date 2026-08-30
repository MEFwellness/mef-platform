'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Smile, Moon, HeartPulse, MessageCircle, CheckCircle2, type LucideIcon } from 'lucide-react';
import { submitDailyCheckin, saveDailyCheckinDraft, logHabitCompletion } from '@/app/actions/checkin';
import { submitProbeAnswerAction } from '@/app/actions/dailyCheckinPlan';
import { PAIN_FOLLOWUP_THRESHOLD } from '@/lib/daily-checkin-adaptive/constants';
import { isLocalFollowUpEligible } from '@/lib/daily-checkin-adaptive/localFollowUps';
import { countMatchBlockedReason } from '@/lib/daily-checkin-adaptive/followUpValidation';
import { morningScreenForQuestion, type MorningScreenKey } from '@/lib/daily-checkin-adaptive/screenGrouping';
import {
  groupUnitsIntoScreens,
  isScreenComplete,
  screenBlockedReason,
  interleaveFollowUps,
  type CheckinUnit,
} from '@/lib/daily-checkin-adaptive/wizardUnits';
import type { DriverProbeQuestion } from '@/lib/daily-checkin-adaptive/types';
import type { TypicalSleepTimes } from '@/lib/daily-checkin-adaptive/sleepHistory';
import { getTodaysHydrationTotal } from '@/app/actions/events';
import { DriverProbeField, type ProbeAnswerValue } from '@/components/checkin/DriverProbeField';
import { CheckinWizard } from '@/components/checkin/CheckinWizard';
import { CheckInModeSwitch } from '@/components/checkin/CheckInModeSwitch';
import { FiveFacesScale } from '@/components/checkin/scales/FiveFacesScale';
import { VerticalFillScale } from '@/components/checkin/scales/VerticalFillScale';
import { CompressingRings } from '@/components/checkin/scales/CompressingRings';
import { FiveMoonsScale } from '@/components/checkin/scales/FiveMoonsScale';
import { BooleanPills } from '@/components/checkin/scales/BooleanPills';
import { SleepArc } from '@/components/checkin/SleepArc';
import { BodySeverityOutline } from '@/components/checkin/BodySeverityOutline';
import { DigestionIconTiles } from '@/components/checkin/DigestionIconTiles';
import { ConcernToCoach } from '@/components/checkin/ConcernToCoach';
import { EndingMoment } from '@/components/checkin/EndingMoment';
import { TemperatureOverlay, computeWarmth } from '@/components/checkin/TemperatureOverlay';
import { MOOD_RAMP, ENERGY_RAMP, STRESS_RAMP } from '@/lib/checkin-color-ramps';
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
  'checkin_probe.digestion_rating',
  'checkin_probe.pain_location',
  'checkin_probe.pain_aggravating_factor',
]);

type Props = {
  localDate: string;
  timezone: string;
  existingCheckin: DailyCheckin | null;
  habits: Habit[];
  initialHabitLogs: Record<string, boolean>;
  /** True only on this member's very first check-in ever — switches the whole flow into cinematic (one question per screen, full ceremony) mode and shows the one-time intro above the first question. */
  isFirstCheckin: boolean;
  rotatingProbes: DriverProbeQuestion[];
  localFollowUps: DriverProbeQuestion[];
  initialProbeAnswers: Record<string, unknown>;
  coachFirstName: string | null;
  /** Sleep dial pre-fill (task 3c) — her recent check-ins' typical bedtime/wake, or all-null with no history. Only ever used as this component's *initial* state; never re-applied once she's touched the dial. */
  typicalSleep: TypicalSleepTimes;
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

const MOOD_MEANING = ['Very Low', 'Low', 'Okay', 'Good', 'Excellent'] as const;
const ENERGY_MEANING = ['Exhausted', 'Low', 'Moderate', 'Good', 'High'] as const;
const STRESS_MEANING = ['Very Calm', 'Calm', 'Moderate', 'High', 'Overwhelmed'] as const;
const SLEEP_QUALITY_MEANING = ['Terrible', 'Poor', 'Fair', 'Good', 'Excellent'] as const;
/** Severity for the combined body outline gesture — its 0-based index writes straight to pain_discomfort_level (0-5, this exact word set already), and clamped to 1+ for morning_soreness (1-5 only — see BodySeverityOutline's own doc comment for why the two fields can't share the literal same 0 value). */
const SEVERITY_MEANING = ['None', 'Mild', 'Mild-moderate', 'Moderate', 'Significant', 'Severe'] as const;

const SECTION_ORDER: MorningScreenKey[] = ['feeling', 'night', 'body', 'other'];

function SectionHeader({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
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

const SECTION_HEADINGS: Record<MorningScreenKey, { icon: LucideIcon; title: string; subtitle: string }> = {
  feeling: { icon: Smile, title: "How you're feeling", subtitle: 'A quick emotional and physical read on right now' },
  night: { icon: Moon, title: 'Your night', subtitle: 'How last night set up today' },
  body: { icon: HeartPulse, title: 'Your body', subtitle: 'Soreness, pain, and digestion' },
  other: { icon: MessageCircle, title: 'Anything else', subtitle: "Entirely optional, share as much or as little as you'd like" },
};

export function CheckinForm({
  localDate,
  timezone,
  existingCheckin,
  habits,
  initialHabitLogs,
  isFirstCheckin,
  rotatingProbes,
  localFollowUps,
  initialProbeAnswers,
  coachFirstName,
  typicalSleep,
}: Props) {
  const nightWakingQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.night_waking_count') ?? null;
  const nightSweatsQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.night_sweats') ?? null;
  const bowelMovementQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.bowel_movement_status') ?? null;
  const digestionQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.digestion_rating') ?? null;

  const genericRotatingProbes = rotatingProbes.filter((q) => !SPECIALLY_HANDLED_QUESTION_KEYS.has(q.questionKey));

  /**
   * Every question the member could meet on this screen today, parents
   * included. followUpValidation needs a follow-up's PARENT row (to read
   * its response_type), and a parent can be a specially-handled key or a
   * rotating probe, so neither list on its own is enough.
   */
  const allProbeQuestions = [...rotatingProbes, ...localFollowUps];

  // Root-cause fix (2026-07-29, found live): a specially-handled key
  // (pain_location, pain_aggravating_factor, bowel_movement_status,
  // night_waking_count, night_sweats, digestion_rating) must never also
  // live in this generic map -- its OWN state (painLocation,
  // bowelMovementStatus, etc.) is the single source of truth, submitted
  // through its own explicit call in submitProbeAndFollowUpAnswers.
  // Without this filter, a specially-handled key present in
  // initialProbeAnswers on page load got copied in here too (it matches
  // the same value-shape check) and then sat untouched forever, since
  // nothing in the UI ever calls setProbeAnswer for a specially-handled
  // key -- but submitProbeAndFollowUpAnswers' own generic loop below
  // re-submits every key in this map on every save, silently
  // overwriting a genuinely-changed specially-handled answer back to
  // whatever it was when the page first loaded. Confirmed live: editing
  // pain_location on a day that already had one stored appeared to
  // succeed, then reverted to the old value on the very next page load.
  const [probeAnswers, setProbeAnswers] = useState<Record<string, ProbeAnswerValue>>(() => {
    const initial: Record<string, ProbeAnswerValue> = {};
    for (const [key, value] of Object.entries(initialProbeAnswers)) {
      if (SPECIALLY_HANDLED_QUESTION_KEYS.has(key)) continue;
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (Array.isArray(value) && value.every((v) => typeof v === 'string'))
      ) {
        initial[key] = value as ProbeAnswerValue;
      }
    }
    return initial;
  });

  function setProbeAnswer(questionKey: string, value: ProbeAnswerValue) {
    setProbeAnswers((prev) => ({ ...prev, [questionKey]: value }));
  }

  const router = useRouter();
  // Elapsed-time instrumentation (task requirement 3): captured once, at
  // this component's first render — as close to "first screen render" as
  // this app gets without a rendering harness — and read only at
  // submission. A draft (exit) save never reads this; only a genuine
  // final submission is timed.
  const startTimeRef = useRef<number>(Date.now());
  const [screenIndex, setScreenIndex] = useState(0);
  const [furthestScreenIndex, setFurthestScreenIndex] = useState(0);
  const [showEnding, setShowEnding] = useState(false);
  const [moodLevel, setMoodLevel] = useState<number | null>(existingCheckin?.mood_level ?? null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(existingCheckin?.sleep_quality ?? null);
  const [sleepDuration, setSleepDuration] = useState<DailyCheckin['sleep_duration']>(
    existingCheckin?.sleep_duration ?? typicalSleep.durationBucket
  );
  const [energyLevel, setEnergyLevel] = useState<number | null>(existingCheckin?.energy_level ?? null);
  const [stressLevel, setStressLevel] = useState<number | null>(existingCheckin?.stress_level ?? null);
  // The combined body-outline severity — null until she taps a location AND a severity level. Feeds both painLevel and morningSoreness (see BodySeverityOutline's own comment on the 0-vs-1-5 clamp).
  const [severity, setSeverity] = useState<number | null>(
    existingCheckin?.pain_discomfort_level ?? null
  );
  const painLevel = severity;
  const morningSoreness = severity === null ? null : Math.max(severity, 1);
  // Resuming after an exit must never discard answers (task requirement
  // 1) — these two live in daily_checkin_probe_answers, so they arrive
  // through initialProbeAnswers like any other generic probe answer,
  // never seeded before this pass.
  const [painLocation, setPainLocation] = useState<string[]>(() => {
    const stored = initialProbeAnswers['checkin_probe.pain_location'];
    // Existing stored single answers (recorded before this multi-select
    // redesign) read as a set of one — never discarded.
    if (Array.isArray(stored)) return stored.filter((v): v is string => typeof v === 'string');
    if (typeof stored === 'string') return [stored];
    return [];
  });
  const [painAggravatingFactor, setPainAggravatingFactor] = useState<string | null>(
    typeof initialProbeAnswers['checkin_probe.pain_aggravating_factor'] === 'string'
      ? (initialProbeAnswers['checkin_probe.pain_aggravating_factor'] as string)
      : null
  );
  /**
   * "Any discomfort today?" gate (2026-07-29 redesign) — location,
   * severity, and the "what makes it worse" follow-up only ever render
   * once this is answered yes. Answering no writes severity 0 (the
   * exact value picking "None" already wrote under the old
   * always-shown flow) and an empty location set, so
   * pain_discomfort_level/morning_soreness still get a real value every
   * day exactly as before — root-map coverage, scoring, and every other
   * downstream reader of those two columns sees no difference between
   * "answered no" and the old "answered None." Derived once from
   * history, never re-derived: a location already on file means she
   * must have said yes (the old flow could never set severity without
   * picking one first); a recorded severity with an empty location set
   * means she said no under this new flow; neither on file means she
   * hasn't reached this section yet today.
   */
  const [hasDiscomfort, setHasDiscomfort] = useState<boolean | null>(() => {
    if (painLocation.length > 0) return true;
    if (existingCheckin && existingCheckin.pain_discomfort_level !== null) return false;
    return null;
  });
  const [concern, setConcern] = useState(existingCheckin?.new_or_worsening_concern ?? false);
  const [notes, setNotes] = useState(existingCheckin?.optional_notes ?? '');
  const [nothingToAdd, setNothingToAdd] = useState(false);
  const [habitStatus, setHabitStatus] = useState<Record<string, boolean>>(initialHabitLogs);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Sleep dial pre-fill (task 3c): "seed both handles from her recent
  // check-ins' typical bedtime and wake time" — applied only as this
  // state's initial value, and only when today's row (if any) has no
  // bedtime/wake of its own yet. With no history at all, typicalSleep's
  // fields are null and this falls through to '' exactly as before —
  // the arc's own DEFAULT_BEDTIME_MINUTES/DEFAULT_WAKE_MINUTES constants
  // still show a plain visual default in that case, without this state
  // (and therefore the night screen's answered/required check) ever
  // treating an invented default as something she actually confirmed.
  const [actualBedtime, setActualBedtime] = useState(
    existingCheckin?.actual_bedtime ?? typicalSleep.bedtime ?? ''
  );
  const [actualWakeTime, setActualWakeTime] = useState(
    existingCheckin?.actual_wake_time ?? typicalSleep.wakeTime ?? ''
  );
  const [nightWakingCount, setNightWakingCount] = useState<number | null>(
    existingCheckin?.night_waking_count ?? null
  );
  const [nightSweats, setNightSweats] = useState<boolean | null>(existingCheckin?.night_sweats ?? null);
  const [bowelMovementStatus, setBowelMovementStatus] = useState<BowelMovementStatus | null>(
    existingCheckin?.bowel_movement_status ?? null
  );
  const [digestionRating, setDigestionRating] = useState<number | null>(
    existingCheckin?.digestion_rating ?? null
  );

  // A follow-up's `requires` may reference a specially-handled field (e.g.
  // digestive_symptom_type requires checkin_probe.digestion_rating <= 2,
  // and digestion_rating writes to its own dailyCheckinsColumn state, not
  // probeAnswers) — merge in the specially-handled answers so eligibility
  // sees the real current value without also duplicating it into
  // probeAnswers (and, downstream, into a second submitProbeAnswerAction write).
  const answeredIncludingSpecialFields = useMemo(
    () => ({
      ...probeAnswers,
      ...(digestionRating !== null ? { 'checkin_probe.digestion_rating': digestionRating } : {}),
      // The body outline's own severity, under the key a rule names it by
      // (migration 192 gates the two pain follow-ups on it). It is a fixed
      // core answer rather than a probe answer, so it reaches the rule
      // evaluator only if it is merged in here, exactly as digestion is.
      ...(severity !== null ? { 'checkin_probe.pain_discomfort_level': severity } : {}),
    }),
    [probeAnswers, digestionRating, severity]
  );

  const eligibleLocalFollowUps = localFollowUps.filter(
    (question) =>
      !SPECIALLY_HANDLED_QUESTION_KEYS.has(question.questionKey) &&
      isLocalFollowUpEligible(question, answeredIncludingSpecialFields)
  );

  /**
   * Follow-ups that are NO LONGER being asked but already have an answer
   * on file, in state or from an earlier save today (2026-08-14 fix, same
   * bug class as the meals count mismatch). Answer "2 meals skipped" then
   * "breakfast, lunch", then change the count back to 0: the follow-up
   * correctly disappears, but without this its two selections were still
   * submitted, leaving the database saying she skipped no meals AND that
   * the ones she skipped were breakfast and lunch. Every case is handled
   * the same way, generically, rather than per question: the stored row
   * is overwritten with an empty answer so it can never be read back as
   * a real one.
   */
  const stalePersistedFollowUpKeys = localFollowUps
    .filter((question) => !SPECIALLY_HANDLED_QUESTION_KEYS.has(question.questionKey))
    .filter((question) => !isLocalFollowUpEligible(question, answeredIncludingSpecialFields))
    .filter(
      (question) => question.questionKey in probeAnswers || question.questionKey in initialProbeAnswers
    );

  const mode = isFirstCheckin ? ('cinematic' as const) : ('section' as const);

  const units: CheckinUnit[] = useMemo(() => {
    const list: CheckinUnit[] = [
      {
        key: 'mood',
        section: 'feeling',
        blockedReason: 'Choose how you are feeling emotionally.',
        answered: moodLevel !== null,
        render: () => (
          <FiveFacesScale
            question="How are you feeling emotionally right now?"
            labels={MOOD_MEANING}
            value={moodLevel}
            onChange={setMoodLevel}
          />
        ),
      },
      {
        key: 'energy',
        section: 'feeling',
        blockedReason: 'Choose how energized you feel.',
        answered: energyLevel !== null,
        render: () => (
          <VerticalFillScale
            question="How energized do you feel right now?"
            labels={ENERGY_MEANING}
            value={energyLevel}
            onChange={setEnergyLevel}
          />
        ),
      },
      {
        key: 'stress',
        section: 'feeling',
        blockedReason: 'Choose how much stress you are carrying.',
        answered: stressLevel !== null,
        render: () => (
          <CompressingRings
            question="How much stress are you carrying right now?"
            labels={STRESS_MEANING}
            value={stressLevel}
            onChange={setStressLevel}
          />
        ),
      },
      {
        key: 'night',
        section: 'night',
        blockedReason: 'Add your sleep quality, bedtime, and wake time.',
        answered: sleepQuality !== null && actualBedtime !== '' && actualWakeTime !== '',
        render: () => (
          <div className="space-y-6">
            <FiveMoonsScale
              question="How restorative was your sleep?"
              labels={SLEEP_QUALITY_MEANING}
              value={sleepQuality}
              onChange={setSleepQuality}
            />
            <SleepArc
              bedtime={actualBedtime}
              wakeTime={actualWakeTime}
              nightWakingCount={nightWakingCount}
              sleepQuality={sleepQuality}
              notchesEnabled={!!nightWakingQuestion}
              onTimesChange={(bedtime, wake, durationBucket) => {
                setActualBedtime(bedtime);
                setActualWakeTime(wake);
                setSleepDuration(durationBucket);
              }}
              onNightWakingChange={setNightWakingCount}
            />
            {nightSweatsQuestion && (
              <BooleanPills
                question="Any night sweats?"
                value={nightSweats}
                onChange={setNightSweats}
              />
            )}
          </div>
        ),
      },
    ];

    // Folded back from Evening Reflection into the morning rotation
    // (migration 113, task requirement 2) — daily_checkins_column
    // storage, same reason night_waking_count/bowel_movement_status/etc.
    // below are specially handled rather than routed through
    // genericRotatingProbes: its answer must land in a real
    // daily_checkins column via submitDailyCheckin, not the generic
    // probe_answer table.
    //
    // 2026-07-29 UX-audit fix: this used to be pushed *after* the
    // interleaveFollowUps loop below, which put its own local follow-up
    // (checkin_probe.digestive_symptom_type, requires digestion_rating
    // <= 2 — unmatched by that loop since digestion_rating is
    // specially-handled and never in `genericRotatingProbes`) ahead of
    // this, its own parent question, on the "body" screen — a
    // detached-follow-up bug of the same shape the pain-location gate
    // fixes elsewhere on this same screen. Pushing it here, before that
    // loop runs, means the parent always renders above any follow-up it
    // triggers.
    if (digestionQuestion) {
      list.push({
        key: digestionQuestion.questionKey,
        section: 'body',
        blockedReason: null,
        answered: digestionRating !== null,
        render: () => (
          <DriverProbeField
            question={digestionQuestion}
            value={digestionRating}
            onChange={(value) => setDigestionRating(typeof value === 'number' ? value : null)}
          />
        ),
      });
    }

    // Every follow-up must render directly beneath the question that
    // triggered it (2026-07-28 fix) — see interleaveFollowUps' own doc
    // comment for why this used to fail (two separate loops/arrays).
    const probeUnit = (question: DriverProbeQuestion): CheckinUnit => {
      // A rotating probe is optional and never blocks Continue — with one
      // data-driven exception (2026-08-14 fix): a multi_select follow-up
      // hanging off a `count` parent must match the number that parent
      // recorded, or the two answers contradict each other on the way
      // into the database. countMatchBlockedReason returns null for every
      // other question in the bank, so nothing else changes.
      const value = probeAnswers[question.questionKey] ?? null;
      const countReason = countMatchBlockedReason(
        question,
        allProbeQuestions,
        answeredIncludingSpecialFields,
        value
      );
      return {
        key: question.questionKey,
        section: morningScreenForQuestion(question),
        blockedReason: countReason,
        answered: question.questionKey in probeAnswers && countReason === null,
        render: () => (
          <DriverProbeField
            question={question}
            value={value}
            onChange={(newValue) => setProbeAnswer(question.questionKey, newValue)}
          />
        ),
      };
    };

    for (const question of interleaveFollowUps(genericRotatingProbes, eligibleLocalFollowUps)) {
      list.push(probeUnit(question));
    }

    // "Any discomfort today?" gate (2026-07-29 redesign) — the fixed
    // core pain question. Its own small heading keeps this block
    // visually separate from whatever rotating "body"-domain probe
    // happens to land just above it on this screen, so the gate never
    // reads as a follow-up to an unrelated question (the exact bug this
    // redesign fixes). Location, severity, and the "what makes it
    // worse" follow-up (below) only ever render once this is yes.
    list.push({
      key: 'discomfort-gate',
      section: 'body',
      blockedReason: 'Answer whether you had any discomfort today.',
      answered: hasDiscomfort !== null,
      render: () => (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B3A2D]/45">Discomfort</p>
          <div className="mt-2">
            <BooleanPills
              question="Any discomfort today?"
              value={hasDiscomfort}
              onChange={(value) => {
                if (!value) {
                  // No discomfort: write the exact same values picking
                  // "None" under the old always-shown flow used to write,
                  // so pain_discomfort_level/morning_soreness still get a
                  // real value every day — no downstream reader (root-map
                  // coverage, scoring) sees a difference.
                  setSeverity(0);
                  setPainLocation([]);
                  setPainAggravatingFactor(null);
                } else if (hasDiscomfort === false) {
                  // Coming back from a prior "no" this same session — let
                  // her actually answer rather than keeping the
                  // auto-filled none/empty-location values.
                  setSeverity(null);
                  setPainLocation([]);
                }
                setHasDiscomfort(value);
              }}
            />
          </div>
        </div>
      ),
    });

    if (hasDiscomfort) {
      list.push({
        key: 'body-severity',
        section: 'body',
        blockedReason: 'Tap where the discomfort is, then how strong it is.',
        answered: painLocation.length > 0 && severity !== null,
        render: () => (
          <BodySeverityOutline
            locationValue={painLocation}
            onLocationChange={(locations) => setPainLocation(locations)}
            severityValue={severity}
            onSeverityChange={(value) => {
              setSeverity(value);
              // 2026-07-27 fix: this used to also clear painLocation here,
              // which reset the location answer any time severity dropped
              // below PAIN_FOLLOWUP_THRESHOLD — reproducible by tapping a
              // location, then a low severity level, and watching the
              // location deselect. Location and severity are independent
              // answers; location must never be cleared by a severity
              // change in either direction. Only the pain-aggravating-
              // factor follow-up's own answer is cleared here, since that
              // follow-up genuinely stops being asked (and disappears from
              // the screen) once severity drops below the threshold —
              // clearing its own now-orphaned answer is not the same bug
              // as clearing a sibling question's answer.
              if (value < PAIN_FOLLOWUP_THRESHOLD) {
                setPainAggravatingFactor(null);
              }
            }}
            severityLabels={SEVERITY_MEANING}
          />
        ),
      });

      if (painLevel !== null && painLevel >= PAIN_FOLLOWUP_THRESHOLD && painLocation.length > 0) {
        list.push({
          key: 'pain-aggravating-factor',
          section: 'body',
          blockedReason: null,
          answered: painAggravatingFactor !== null,
          render: () => (
            <div>
              <p className="text-[13px] leading-relaxed text-[#6B7A72]">What tends to make it worse?</p>
              <div className="mt-3 flex flex-col gap-2" role="group" aria-label="What tends to make it worse?">
                {PAIN_AGGRAVATING_FACTOR_OPTIONS.map((option) => {
                  const isSelected = painAggravatingFactor === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPainAggravatingFactor(option.value)}
                      aria-pressed={isSelected}
                      className={`mef-press w-full rounded-2xl border px-4 py-3.5 text-left text-[14px] font-medium transition-all duration-200 ease-out ${
                        isSelected
                          ? 'border-transparent bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.4)]'
                          : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D]/75'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ),
        });
      }
    }

    if (bowelMovementQuestion) {
      list.push({
        key: bowelMovementQuestion.questionKey,
        section: 'body',
        blockedReason: null,
        answered: bowelMovementStatus !== null,
        render: () => (
          <DigestionIconTiles
            question={bowelMovementQuestion.prompt}
            options={bowelMovementQuestion.options.map((o) =>
              typeof o === 'object' ? o : { value: String(o), label: String(o) }
            )}
            value={bowelMovementStatus}
            onChange={(value) => setBowelMovementStatus(value as BowelMovementStatus)}
          />
        ),
      });
    }

    if (habits.length > 0) {
      list.push({
        key: 'habits',
        section: 'other',
        blockedReason: null,
        answered: true,
        render: () => (
          <div>
            <SectionHeader icon={CheckCircle2} title="Today's habits" subtitle="Mark off what you've already done" />
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
        ),
      });
    }

    list.push({
      key: 'concern',
      section: 'other',
      blockedReason: null,
      answered: true,
      render: () => <ConcernToCoach coachFirstName={coachFirstName} checked={concern} onChange={setConcern} />,
    });

    list.push({
      key: 'notes',
      section: 'other',
      blockedReason: null,
      answered: true,
      render: () => (
        <div>
          <label className="text-[13px] leading-relaxed text-[#6B7A72]" htmlFor="notes">
            Anything else worth noting?
          </label>
          <textarea
            id="notes"
            value={notes ?? ''}
            onChange={(event) => {
              setNotes(event.target.value);
              setNothingToAdd(false);
            }}
            rows={3}
            disabled={nothingToAdd}
            className="mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none disabled:opacity-50"
            placeholder="Anything else worth noting today?"
          />
          <button
            type="button"
            onClick={() => {
              setNotes('');
              setNothingToAdd(true);
            }}
            className={`mef-press mt-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-all duration-200 ease-out ${
              nothingToAdd
                ? 'border-transparent bg-[#1B3A2D] text-white'
                : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D]/75'
            }`}
          >
            {nothingToAdd ? '✓ Nothing to add today' : 'Nothing to add today'}
          </button>
        </div>
      ),
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    moodLevel,
    energyLevel,
    stressLevel,
    sleepQuality,
    actualBedtime,
    actualWakeTime,
    nightWakingCount,
    nightSweats,
    hasDiscomfort,
    severity,
    painLocation,
    painAggravatingFactor,
    bowelMovementStatus,
    digestionRating,
    concern,
    notes,
    nothingToAdd,
    habitStatus,
    probeAnswers,
    coachFirstName,
  ]);

  const screens = useMemo(() => groupUnitsIntoScreens(units, mode, SECTION_ORDER), [units, mode]);
  const screenCount = screens.length;
  const clampedIndex = Math.min(screenIndex, screenCount - 1);
  const currentScreen = screens[clampedIndex] ?? [];
  const screenComplete = isScreenComplete(currentScreen);
  const blockedReason = screenBlockedReason(currentScreen);

  function goNext() {
    goToScreenClamped(clampedIndex + 1);
  }
  function goBack() {
    goToScreenClamped(clampedIndex - 1);
  }
  function goToScreenClamped(index: number) {
    const clamped = Math.max(0, Math.min(index, screenCount - 1));
    setScreenIndex(clamped);
    setFurthestScreenIndex((prev) => Math.max(prev, clamped));
  }

  const warmth = computeWarmth({ mood: moodLevel, energy: energyLevel, stress: stressLevel });

  /** Every field currently entered, as a DailyCheckinInput — shared by the real submit (completion_seconds set, validated first) and the exit-triggered draft save (completion_seconds always null, never validated: whatever's filled is saved as-is). */
  async function buildCurrentInput(completionSeconds: number | null): Promise<DailyCheckinInput> {
    return {
      timezone,
      local_date: localDate,
      mood_level: moodLevel,
      sleep_quality: sleepQuality,
      sleep_duration: sleepDuration,
      energy_level: energyLevel,
      stress_level: stressLevel,
      water_cups: await getTodaysHydrationTotal(),
      digestion_rating: digestionRating,
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
      completion_seconds: completionSeconds,
    };
  }

  async function submitProbeAndFollowUpAnswers() {
    // hasDiscomfort !== null (not painLocation.length > 0) is the real
    // guard: the gate is required on the "body" screen, so by the time
    // a genuine submit reaches here it's always answered. Writing
    // whenever it's answered — even an empty array — means flipping the
    // gate from yes+a location to no actually overwrites the stored
    // answer with "no locations" instead of silently leaving a stale
    // location in daily_checkin_probe_answers (confirmed live: without
    // this, resuming the same day's check-in after a yes-then-no flip
    // re-read the old location and re-derived the gate back to yes). A
    // draft-exit before ever reaching the gate (hasDiscomfort still
    // null) still skips the write entirely, preserving history exactly
    // as the old `if (painLocation)` guard did.
    if (hasDiscomfort !== null) {
      await submitProbeAnswerAction(localDate, 'checkin_probe.pain_location', painLocation);
    }
    if (painAggravatingFactor) {
      await submitProbeAnswerAction(localDate, 'checkin_probe.pain_aggravating_factor', painAggravatingFactor);
    }
    // See stalePersistedFollowUpKeys above: a follow-up her current
    // answers no longer ask must not leave a contradicting row behind.
    // An empty array (multi_select) / JSON null (everything else) is what
    // every reader in this app already treats as "not answered" — the
    // same convention the pain-location write above relies on.
    const staleKeys = new Set(stalePersistedFollowUpKeys.map((q) => q.questionKey));
    await Promise.all(
      stalePersistedFollowUpKeys.map((question) =>
        submitProbeAnswerAction(localDate, question.questionKey, question.responseType === 'multi_select' ? [] : null)
      )
    );
    await Promise.all(
      Object.entries(probeAnswers)
        .filter(([questionKey]) => !staleKeys.has(questionKey))
        .map(([questionKey, value]) => submitProbeAnswerAction(localDate, questionKey, value))
    );
  }

  async function performSave() {
    setError('');
    if (actualBedtime === '' || actualWakeTime === '' || moodLevel === null || energyLevel === null || stressLevel === null) {
      setError('Please add your bedtime, wake time, mood, energy, and stress before saving.');
      return;
    }
    setSubmitting(true);

    const completionSeconds = Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000));
    const input = await buildCurrentInput(completionSeconds);
    const result = await submitDailyCheckin(input);
    await submitProbeAndFollowUpAnswers();

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setShowEnding(true);
  }

  /**
   * Navigation fix (task requirement 1): "exiting mid-check-in saves
   * progress and resumes on return. Never discard answers." Saves
   * whatever's currently filled as a draft (no validation, completion_seconds
   * always null — this is not a timed completion) and returns her to Home,
   * where she came from.
   *
   * 2026-07-27 fix — the actual cause of "needs four or five taps": this
   * function is `async` and does several sequential awaited server round
   * trips (getTodaysHydrationTotal, saveDailyCheckinDraft, then each probe
   * answer) before router.push ever fires. The button itself gave zero
   * visual feedback while that was in flight, so a real tap registered
   * every time — it just hadn't *finished* yet — and each additional tap
   * fired this whole async chain again concurrently, competing for the
   * same network/DB connections and making the eventual navigation even
   * slower, which read as "the button doesn't work" rather than "the
   * button is still working." `exitingRef` is a synchronous guard (a
   * `useState` alone isn't enough — its update is not visible until the
   * next render, and a second tap can land before that commit) that makes
   * every tap after the first a no-op; `exiting` state disables the
   * button and swaps its label to "Saving…" so the first tap gives
   * immediate, honest feedback instead of looking dead.
   */
  const exitingRef = useRef(false);
  const [exiting, setExiting] = useState(false);

  async function saveProgressAndExit() {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    const input = await buildCurrentInput(null);
    await saveDailyCheckinDraft(input);
    await submitProbeAndFollowUpAnswers();
    router.push('/dashboard' as Route);
  }

  function handleContinue() {
    if (clampedIndex === screenCount - 1) {
      performSave();
      return;
    }
    goNext();
  }

  function continueToResult() {
    const params = new URLSearchParams({ date: localDate });
    if (isFirstCheckin) params.set('firstCheckin', '1');
    router.push(`/checkin/result?${params.toString()}` as Route);
    router.refresh();
  }

  async function toggleHabit(habitId: string, completed: boolean) {
    setHabitStatus((current) => ({ ...current, [habitId]: completed }));
    const result = await logHabitCompletion(habitId, localDate, timezone, completed);
    if (result.error) {
      setHabitStatus((current) => ({ ...current, [habitId]: !completed }));
    }
  }

  if (showEnding) {
    const endingValues = [
      moodLevel !== null ? { ramp: MOOD_RAMP, value: moodLevel, max: 5 } : null,
      energyLevel !== null ? { ramp: ENERGY_RAMP, value: energyLevel, max: 5 } : null,
      stressLevel !== null ? { ramp: STRESS_RAMP, value: stressLevel, max: 5 } : null,
    ].filter((v): v is { ramp: typeof MOOD_RAMP; value: number; max: number } => v !== null);
    return <EndingMoment continuing={false} onContinue={continueToResult} values={endingValues} />;
  }

  const isLastScreen = clampedIndex === screenCount - 1;
  const sectionKeyForScreen = (index: number): MorningScreenKey => {
    const unit = screens[index]?.[0];
    return (unit?.section as MorningScreenKey) ?? 'other';
  };

  return (
    <>
      <TemperatureOverlay warmth={warmth} />
      <div className="relative z-10 mt-6">
        <CheckinWizard
          screenCount={screenCount}
          screenIndex={clampedIndex}
          furthestScreenIndex={Math.min(furthestScreenIndex, screenCount - 1)}
          onBack={goBack}
          onSelectScreen={goToScreenClamped}
          onExit={saveProgressAndExit}
          exitDisabled={exiting}
          exitLabel={exiting ? 'Saving…' : 'Home'}
          onContinue={handleContinue}
          continueLabel={isLastScreen ? (submitting ? 'Saving…' : existingCheckin ? 'Update check-in' : 'Save check-in') : 'Continue'}
          continueDisabled={submitting || !screenComplete}
          continueBusy={submitting}
          continueBlockedReason={blockedReason}
          renderScreen={(index) => {
            const screen = screens[index] ?? [];
            const section = sectionKeyForScreen(index);
            const showSectionHeading = mode === 'section' || screen[0]?.key === units.find((u) => u.section === section)?.key;
            return (
              <div className="space-y-6">
                {index === 0 && (
                  <div className="mef-checkin-stagger">
                    <p className="text-[15px] leading-relaxed text-[#4F645A]">
                      {existingCheckin
                        ? "You've already logged this day. Update anything below."
                        : 'A few gentle questions so Root understands how today actually feels. Takes about a minute.'}
                    </p>
                    <CheckInModeSwitch active="morning" />
                  </div>
                )}
                {showSectionHeading && (
                  <div className="mef-checkin-stagger">
                    <SectionHeader
                      icon={SECTION_HEADINGS[section].icon}
                      title={SECTION_HEADINGS[section].title}
                      subtitle={SECTION_HEADINGS[section].subtitle}
                    />
                  </div>
                )}
                {index === 0 && isFirstCheckin && (
                  <div className="mef-checkin-stagger" style={{ animationDelay: '80ms' }}>
                    <p className="text-[15px] font-medium text-[#1B3A2D]">Your first check-in sets your starting point.</p>
                    <p className="mt-1 text-[13px] text-[#6B7A72]">There are no perfect answers. Just answer honestly.</p>
                  </div>
                )}
                {screen.map((unit, i) => (
                  <div key={unit.key} className="mef-checkin-stagger" style={{ animationDelay: `${(i + 2) * 80}ms` }}>
                    {unit.render()}
                  </div>
                ))}
                {isLastScreen && index === screenCount - 1 && error && (
                  <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                )}
              </div>
            );
          }}
        />
      </div>
    </>
  );
}
