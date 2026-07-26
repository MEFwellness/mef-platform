'use client';

/**
 * Evening Reflection — the five things that can't be reliably counted
 * automatically (overall day rating, daytime stress, energy pattern,
 * symptoms/changes, recovery), plus digestion and overall movement,
 * which only became an honest question to ask once the day has actually
 * happened (Premium UX polish milestone moved these off Morning
 * Readiness). Structured exercise logging is still NOT asked here — a
 * specific workout/walk/stretch is already logged live the moment it
 * happens (see components/checkin/MovementLogger.tsx) — this section
 * only asks the coarse, end-of-day "how much did you move overall"
 * question, the same one Morning Readiness used to ask too early to
 * answer honestly.
 *
 * Daily Check-In redesign — "one section per screen ... using its own
 * grouping" (task requirement 1): 3 screens (How your day went / Your
 * body / Anything else), its own grouping since Evening Reflection's
 * content doesn't map onto Morning Readiness's 4 screens at all.
 *
 * No field here is required — see submitEveningReflection's own
 * behavior: whatever is left blank is stored as null (unknown), never
 * defaulted to a value that would silently lower a score. See
 * lib/wellness/dailyWellnessScore.ts for how a partially-answered
 * reflection is handled. Digestion and movement save through
 * submitEveningBodyCheckin (app/actions/checkin.ts) instead, onto the
 * same daily_checkins row Morning Readiness writes to, so
 * lib/wellness/wellness-index.ts and every coaching-insights source that
 * reads them keeps working unchanged.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HeartPulse, MessageCircle, Sunset } from 'lucide-react';
import {
  submitEveningReflection,
  type EveningReflectionFormInput,
} from '@/app/actions/eveningReflection';
import { submitEveningBodyCheckin } from '@/app/actions/checkin';
import { submitProbeAnswerAction } from '@/app/actions/dailyCheckinPlan';
import { isLocalFollowUpEligible } from '@/lib/daily-checkin-adaptive/localFollowUps';
import { eveningScreenForQuestion, type EveningScreenKey } from '@/lib/daily-checkin-adaptive/screenGrouping';
import type { DriverProbeQuestion } from '@/lib/daily-checkin-adaptive/types';
import { DriverProbeField, type ProbeAnswerValue } from '@/components/checkin/DriverProbeField';
import { CheckinWizard, StaggerItem } from '@/components/checkin/CheckinWizard';
import { SegmentedControl } from '@/components/checkin/scales/SegmentedControl';
import { useScreenAutoAdvance } from '@/hooks/useScreenAutoAdvance';
import type { DailyCheckin, EnergyPattern, EveningReflection } from '@mef/shared-types-contracts';
import type { LucideIcon } from 'lucide-react';

const SPECIALLY_HANDLED_QUESTION_KEYS = new Set([
  'checkin_probe.digestion_rating',
  'checkin_probe.movement_today',
]);

const RATING_LABELS = ['Rough', 'Below average', 'Okay', 'Good', 'Great'] as const;
const STRESS_LABELS = ['Very calm', 'Calm', 'Moderate', 'High', 'Overwhelmed'] as const;
const RECOVERY_LABELS = ['Depleted', 'Low', 'Some', 'Good', 'Fully recovered'] as const;
const DIGESTION_MEANING = ['Poor', 'Somewhat off', 'Fair', 'Good', 'Excellent'] as const;
/**
 * Forecast & Calibration Loop — the one new question this form adds, per
 * the task's explicit scope ("beyond adding the forecast question to the
 * end of Evening Reflection"). Same words as the morning check-in's own
 * energy question (CheckinForm.tsx's ENERGY_MEANING) so a prediction and
 * its later grade always read in the same vocabulary.
 */
const FORECAST_ENERGY_MEANING = ['Exhausted', 'Low', 'Moderate', 'Good', 'High'] as const;
const MOVEMENT_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'full_session', label: 'Full session' },
] as const;
const ENERGY_PATTERNS: { value: EnergyPattern; label: string }[] = [
  { value: 'steady', label: 'Steady all day' },
  { value: 'dipped', label: 'Dipped in the afternoon' },
  { value: 'crashed', label: 'Crashed' },
  { value: 'improved', label: 'Improved through the day' },
];

const SCREEN_COUNT = 3;

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

type Props = {
  existing: EveningReflection | null;
  localDate: string;
  timezone: string;
  todaysCheckin: DailyCheckin | null;
  /** This day's driver-probe questions chosen by the adaptive picker (lib/daily-checkin-adaptive/), already filtered to this screen (screen = 'evening', migration 109) — governs whether digestion/movement/other driver-probe questions render today. */
  rotatingProbes: DriverProbeQuestion[];
  /** Every active local-follow-up question (driver_id null) for this screen — see CheckinForm.tsx's identical prop for the full rationale. */
  localFollowUps: DriverProbeQuestion[];
  /** Today's previously-saved answers for storage='probe_answer' questions, keyed by question_key. */
  initialProbeAnswers: Record<string, unknown>;
  /**
   * Forecast & Calibration Loop — her forecast for tomorrow, if she (or an
   * earlier visit to this same form, today) already made one. Once
   * non-null the question renders as a locked record rather than a
   * selectable one: a forecast is permanent the moment it's made, so this
   * form must never look like it can be changed after the fact. Null
   * means she hasn't forecast yet — the question is still open.
   */
  existingForecastLevel: number | null;
};

export function EveningReflectionForm({
  existing,
  localDate,
  timezone,
  todaysCheckin,
  rotatingProbes,
  localFollowUps,
  initialProbeAnswers,
  existingForecastLevel,
}: Props) {
  const digestionQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.digestion_rating') ?? null;
  const movementQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.movement_today') ?? null;

  const probesByScreen = useMemo(() => {
    const groups: Record<EveningScreenKey, DriverProbeQuestion[]> = { day: [], body: [], other: [] };
    for (const question of rotatingProbes) {
      if (SPECIALLY_HANDLED_QUESTION_KEYS.has(question.questionKey)) continue;
      groups[eveningScreenForQuestion(question)].push(question);
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

  const eligibleLocalFollowUps = localFollowUps.filter((question) =>
    isLocalFollowUpEligible(question, probeAnswers)
  );
  const localFollowUpsByScreen = useMemo(() => {
    const groups: Record<EveningScreenKey, DriverProbeQuestion[]> = { day: [], body: [], other: [] };
    for (const question of eligibleLocalFollowUps) {
      groups[eveningScreenForQuestion(question)].push(question);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleLocalFollowUps.map((q) => q.questionKey).join(',')]);

  const router = useRouter();
  const [screenIndex, setScreenIndex] = useState(0);
  const [furthestScreenIndex, setFurthestScreenIndex] = useState(0);
  const [overallDayRating, setOverallDayRating] = useState<number | null>(
    existing?.overall_day_rating ?? null
  );
  const [daytimeStress, setDaytimeStress] = useState<number | null>(
    existing?.daytime_stress ?? null
  );
  const [energyPattern, setEnergyPattern] = useState<EnergyPattern | null>(
    existing?.energy_pattern ?? null
  );
  const [symptomsOrChanges, setSymptomsOrChanges] = useState(existing?.symptoms_or_changes ?? '');
  const [recovery, setRecovery] = useState<number | null>(existing?.recovery ?? null);
  const [digestionRating, setDigestionRating] = useState<number | null>(
    todaysCheckin?.digestion_rating ?? null
  );
  const [movementToday, setMovementToday] = useState<
    (typeof MOVEMENT_LEVELS)[number]['value'] | null
  >(todaysCheckin?.movement_today ?? null);
  // Forecast & Calibration Loop — always starts unset, never prefilled
  // from existingForecastLevel: once a forecast exists it renders as a
  // locked readback (below), not an editable control, so there is no
  // "current value" to seed a selectable input with.
  const [predictedEnergyLevel, setPredictedEnergyLevel] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function goToScreen(index: number) {
    const clamped = Math.max(0, Math.min(index, SCREEN_COUNT - 1));
    setScreenIndex(clamped);
    setFurthestScreenIndex((prev) => Math.max(prev, clamped));
  }
  const goNext = () => goToScreen(screenIndex + 1);
  const goBack = () => goToScreen(screenIndex - 1);

  const screen0Complete =
    overallDayRating !== null && daytimeStress !== null && energyPattern !== null && recovery !== null;
  const screen1Complete =
    (!digestionQuestion || digestionRating !== null) && (!movementQuestion || movementToday !== null);

  useScreenAutoAdvance(screen0Complete, () => screenIndex === 0 && goNext());
  useScreenAutoAdvance(screen1Complete, () => screenIndex === 1 && goNext());

  function handleSubmit() {
    setError('');
    const input: EveningReflectionFormInput = {
      overallDayRating,
      daytimeStress,
      energyPattern,
      symptomsOrChanges: symptomsOrChanges.trim() ? symptomsOrChanges.trim() : null,
      recovery,
      predictedEnergyLevel: existingForecastLevel === null ? predictedEnergyLevel : null,
    };

    startTransition(async () => {
      const [reflectionResult, bodyResult] = await Promise.all([
        submitEveningReflection(input),
        submitEveningBodyCheckin(localDate, timezone, movementToday, digestionRating),
        ...Object.entries(probeAnswers).map(([questionKey, value]) =>
          submitProbeAnswerAction(localDate, questionKey, value)
        ),
      ]);
      if (reflectionResult.error) {
        setError(reflectionResult.error);
        return;
      }
      if (bodyResult.error) {
        setError(bodyResult.error);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <CheckinWizard
        screenCount={SCREEN_COUNT}
        screenIndex={screenIndex}
        furthestScreenIndex={furthestScreenIndex}
        onBack={goBack}
        onSelectScreen={goToScreen}
      >
        {screenIndex === 0 && (
          <div key="evening-screen-0" className="space-y-6">
            <StaggerItem index={0}>
              <SectionHeader icon={Sunset} title="How your day went" subtitle="Overall shape of the day" />
            </StaggerItem>
            <StaggerItem index={1}>
              <SegmentedControl
                question="Overall, how was your day?"
                options={RATING_LABELS.map((label, i) => ({ value: i + 1, label }))}
                value={overallDayRating}
                onChange={setOverallDayRating}
              />
            </StaggerItem>
            <StaggerItem index={2}>
              <SegmentedControl
                question="How much stress did you carry through the day?"
                options={STRESS_LABELS.map((label, i) => ({ value: i + 1, label }))}
                value={daytimeStress}
                onChange={setDaytimeStress}
              />
            </StaggerItem>
            <StaggerItem index={3}>
              <SegmentedControl
                question="How did your energy move through the day?"
                options={ENERGY_PATTERNS}
                value={energyPattern}
                onChange={setEnergyPattern}
              />
            </StaggerItem>
            <StaggerItem index={4}>
              <SegmentedControl
                question="How recovered do you feel heading into tonight?"
                options={RECOVERY_LABELS.map((label, i) => ({ value: i + 1, label }))}
                value={recovery}
                onChange={setRecovery}
              />
            </StaggerItem>
            {[...probesByScreen.day, ...localFollowUpsByScreen.day].map((question, index) => (
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
          <div key="evening-screen-1" className="space-y-6">
            <StaggerItem index={0}>
              <SectionHeader
                icon={HeartPulse}
                title="Your body"
                subtitle="Easier to answer honestly now that the day is done"
              />
            </StaggerItem>
            {digestionQuestion && (
              <StaggerItem index={1}>
                <SegmentedControl
                  question="How was your digestion today?"
                  options={DIGESTION_MEANING.map((label, i) => ({ value: i + 1, label }))}
                  value={digestionRating}
                  onChange={setDigestionRating}
                />
              </StaggerItem>
            )}
            {movementQuestion && (
              <StaggerItem index={2}>
                <SegmentedControl
                  question="How much did you move your body today overall?"
                  options={MOVEMENT_LEVELS}
                  value={movementToday}
                  onChange={setMovementToday}
                />
              </StaggerItem>
            )}
            {[...probesByScreen.body, ...localFollowUpsByScreen.body].map((question, index) => (
              <StaggerItem key={question.questionKey} index={3 + index}>
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
          <div key="evening-screen-2" className="space-y-6">
            <StaggerItem index={0}>
              <SectionHeader icon={MessageCircle} title="Anything else" subtitle="Optional, then predict tomorrow" />
            </StaggerItem>

            {[...probesByScreen.other, ...localFollowUpsByScreen.other].map((question, index) => (
              <StaggerItem key={question.questionKey} index={1 + index}>
                <DriverProbeField
                  question={question}
                  value={probeAnswers[question.questionKey] ?? null}
                  onChange={(value) => setProbeAnswer(question.questionKey, value)}
                />
              </StaggerItem>
            ))}

            <StaggerItem index={2}>
              <div>
                <label className="text-[13px] leading-relaxed text-[#6B7A72]" htmlFor="symptoms">
                  Anything new or changed today? (optional)
                </label>
                <textarea
                  id="symptoms"
                  value={symptomsOrChanges}
                  onChange={(event) => setSymptomsOrChanges(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none"
                  placeholder="Symptoms, changes, anything worth noting"
                />
              </div>
            </StaggerItem>

            <StaggerItem index={3}>
              <div>
                <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
                  Predict tomorrow
                </p>
                <p className="text-[13px] text-[#6B7A72]">
                  {existingForecastLevel === null
                    ? "No wrong answer — tomorrow's check-in will tell you how close you were."
                    : "You've already made this prediction. It's locked in until tomorrow grades it."}
                </p>
                {existingForecastLevel === null ? (
                  <div className="mt-3">
                    <SegmentedControl
                      question="How do you think your energy will be tomorrow morning?"
                      options={FORECAST_ENERGY_MEANING.map((label, i) => ({ value: i + 1, label }))}
                      value={predictedEnergyLevel}
                      onChange={setPredictedEnergyLevel}
                    />
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl bg-[#1B3A2D]/[0.04] px-4 py-3 text-sm font-medium text-[#1B3A2D]">
                    Your prediction: {FORECAST_ENERGY_MEANING[existingForecastLevel - 1]}
                  </p>
                )}
              </div>
            </StaggerItem>

            {error && (
              <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="mef-press flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition-all duration-200 ease-out hover:brightness-110 disabled:opacity-60"
            >
              {isPending ? 'Saving…' : existing ? 'Update Evening Reflection' : 'Save Evening Reflection'}
            </button>
          </div>
        )}
      </CheckinWizard>
    </div>
  );
}
