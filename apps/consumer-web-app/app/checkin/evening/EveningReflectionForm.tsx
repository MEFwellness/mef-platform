'use client';

/**
 * Evening Reflection — the five things that can't be reliably counted
 * automatically (overall day rating, daytime stress, energy pattern,
 * symptoms/changes, recovery). Digestion and movement — the two questions
 * this form used to also carry — moved elsewhere (task requirements 2 and
 * 4): digestion_rating folded back into the morning rotation pool so it
 * keeps a live evidence source for members who never open Evening, and
 * movement_today became a Today-screen quick tap, loggable any time.
 * Its own section grouping (How your day went / Anything else), sharing
 * the exact same wizard shell, unit model, hero color ramps, and
 * cinematic/section mode toggle as the morning form.
 */

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Sunset } from 'lucide-react';
import {
  submitEveningReflection,
  saveEveningReflectionDraft,
  type EveningReflectionFormInput,
} from '@/app/actions/eveningReflection';
import { submitProbeAnswerAction } from '@/app/actions/dailyCheckinPlan';
import { isLocalFollowUpEligible } from '@/lib/daily-checkin-adaptive/localFollowUps';
import { countMatchBlockedReason } from '@/lib/daily-checkin-adaptive/followUpValidation';
import { eveningScreenForQuestion, type EveningScreenKey } from '@/lib/daily-checkin-adaptive/screenGrouping';
import {
  groupUnitsIntoScreens,
  isScreenComplete,
  screenBlockedReason,
  interleaveFollowUps,
  type CheckinUnit,
} from '@/lib/daily-checkin-adaptive/wizardUnits';
import type { DriverProbeQuestion } from '@/lib/daily-checkin-adaptive/types';
import { DriverProbeField, type ProbeAnswerValue } from '@/components/checkin/DriverProbeField';
import { CheckinWizard } from '@/components/checkin/CheckinWizard';
import { CheckInModeSwitch } from '@/components/checkin/CheckInModeSwitch';
import { SunPathArc } from '@/components/checkin/scales/SunPathArc';
import { CompressingRings } from '@/components/checkin/scales/CompressingRings';
import { EnergyPatternLines } from '@/components/checkin/scales/EnergyPatternLines';
import { RecoveryFill } from '@/components/checkin/scales/RecoveryFill';
import { ShortOptionRow } from '@/components/checkin/scales/ShortOptionRow';
import { EndingMoment } from '@/components/checkin/EndingMoment';
import { TemperatureOverlay, computeWarmth } from '@/components/checkin/TemperatureOverlay';
import { MOOD_RAMP, STRESS_RAMP, RECOVERY_RAMP } from '@/lib/checkin-color-ramps';
import type { EnergyPattern, EveningReflection } from '@mef/shared-types-contracts';
import type { LucideIcon } from 'lucide-react';

const STRESS_LABELS = ['Very calm', 'Calm', 'Moderate', 'High', 'Overwhelmed'] as const;
const RATING_LABELS = ['Rough', 'Below average', 'Okay', 'Good', 'Great'] as const;
const RECOVERY_LABELS = ['Depleted', 'Low', 'Some', 'Good', 'Fully recovered'] as const;
const FORECAST_ENERGY_MEANING = ['Exhausted', 'Low', 'Moderate', 'Good', 'High'] as const;

const SECTION_ORDER: EveningScreenKey[] = ['day', 'body', 'other'];

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

// 'body' has no fixed content of its own anymore (digestion/movement
// moved elsewhere) but stays in the type/order — groupUnitsIntoScreens
// already drops a section with zero units, and a future evening-scoped
// driver probe (a coach could still author one) would need somewhere to
// land without a code change.
const SECTION_HEADINGS: Record<EveningScreenKey, { icon: LucideIcon; title: string; subtitle: string }> = {
  day: { icon: Sunset, title: 'How your day went', subtitle: 'Overall shape of the day' },
  body: { icon: MessageCircle, title: 'Your body', subtitle: 'Easier to answer honestly now that the day is done' },
  other: { icon: MessageCircle, title: 'Anything else', subtitle: 'Optional, then predict tomorrow' },
};

type Props = {
  existing: EveningReflection | null;
  localDate: string;
  rotatingProbes: DriverProbeQuestion[];
  localFollowUps: DriverProbeQuestion[];
  initialProbeAnswers: Record<string, unknown>;
  existingForecastLevel: number | null;
  /** Whether this is this member's very first check-in ever, across either flow — switches to cinematic (one question per screen) mode, same as the morning form. */
  isFirstCheckin: boolean;
};

export function EveningReflectionForm({
  existing,
  localDate,
  rotatingProbes,
  localFollowUps,
  initialProbeAnswers,
  existingForecastLevel,
  isFirstCheckin,
}: Props) {
  const [probeAnswers, setProbeAnswers] = useState<Record<string, ProbeAnswerValue>>(() => {
    const initial: Record<string, ProbeAnswerValue> = {};
    for (const [key, value] of Object.entries(initialProbeAnswers)) {
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

  const eligibleLocalFollowUps = localFollowUps.filter((question) =>
    isLocalFollowUpEligible(question, probeAnswers)
  );

  /** Every question available on this screen today, parents included — see the morning form's own comment on why both lists are needed. */
  const allProbeQuestions = [...rotatingProbes, ...localFollowUps];

  const router = useRouter();
  // Elapsed-time instrumentation (task requirement 3), same approach as
  // CheckinForm — captured once at first render, read only at a genuine
  // final submission, never on a draft/exit save.
  const startTimeRef = useRef<number>(Date.now());
  const [screenIndex, setScreenIndex] = useState(0);
  const [showEnding, setShowEnding] = useState(false);
  const [furthestScreenIndex, setFurthestScreenIndex] = useState(0);
  const [overallDayRating, setOverallDayRating] = useState<number | null>(existing?.overall_day_rating ?? null);
  const [daytimeStress, setDaytimeStress] = useState<number | null>(existing?.daytime_stress ?? null);
  const [energyPattern, setEnergyPattern] = useState<EnergyPattern | null>(existing?.energy_pattern ?? null);
  const [symptomsOrChanges, setSymptomsOrChanges] = useState(existing?.symptoms_or_changes ?? '');
  const [recovery, setRecovery] = useState<number | null>(existing?.recovery ?? null);
  const [predictedEnergyLevel, setPredictedEnergyLevel] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const mode = isFirstCheckin ? ('cinematic' as const) : ('section' as const);

  const units: CheckinUnit[] = useMemo(() => {
    const list: CheckinUnit[] = [
      {
        key: 'overall-day',
        section: 'day',
        blockedReason: 'Choose how your day was overall.',
        answered: overallDayRating !== null,
        render: () => (
          <SunPathArc
            question="Overall, how was your day?"
            labels={RATING_LABELS}
            value={overallDayRating}
            onChange={setOverallDayRating}
          />
        ),
      },
      {
        key: 'daytime-stress',
        section: 'day',
        blockedReason: 'Choose how much stress you carried today.',
        answered: daytimeStress !== null,
        render: () => (
          <CompressingRings
            question="How much stress did you carry through the day?"
            labels={STRESS_LABELS}
            value={daytimeStress}
            onChange={setDaytimeStress}
          />
        ),
      },
      {
        key: 'energy-pattern',
        section: 'day',
        blockedReason: 'Choose how your energy moved through the day.',
        answered: energyPattern !== null,
        render: () => (
          <EnergyPatternLines
            question="How did your energy move through the day?"
            value={energyPattern}
            onChange={setEnergyPattern}
          />
        ),
      },
      {
        key: 'recovery',
        section: 'day',
        blockedReason: 'Choose how recovered you feel.',
        answered: recovery !== null,
        render: () => (
          <RecoveryFill
            question="How recovered do you feel heading into tonight?"
            labels={RECOVERY_LABELS}
            value={recovery}
            onChange={setRecovery}
          />
        ),
      },
    ];

    // Same interleaving fix as CheckinForm.tsx (2026-07-28) — see
    // interleaveFollowUps' own doc comment. No local follow-up is
    // currently seeded on the 'evening' screen (migration 113 folded them
    // all onto 'morning'), so this had no visible symptom today, but the
    // same two-groups-concatenated shape was here and would have
    // misplaced the first evening-screen follow-up ever added.
    // Same count-match rule as the morning form (2026-08-14 fix) — no
    // evening-screen question pairs a count parent with a multi_select
    // follow-up today, so this changes nothing visible right now, but
    // leaving it out is how the morning form ended up being the only
    // place a shared bug class was guarded against.
    const probeUnit = (question: DriverProbeQuestion): CheckinUnit => {
      const value = probeAnswers[question.questionKey] ?? null;
      const countReason = countMatchBlockedReason(question, allProbeQuestions, probeAnswers, value);
      return {
        key: question.questionKey,
        section: eveningScreenForQuestion(question),
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

    for (const question of interleaveFollowUps(rotatingProbes, eligibleLocalFollowUps)) {
      list.push(probeUnit(question));
    }

    list.push({
      key: 'symptoms',
      section: 'other',
      blockedReason: null,
      answered: true,
      render: () => (
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
      ),
    });

    list.push({
      key: 'forecast',
      section: 'other',
      blockedReason: null,
      answered: true,
      render: () => (
        <div>
          <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
            Predict tomorrow
          </p>
          <p className="text-[13px] text-[#6B7A72]">
            {existingForecastLevel === null
              ? "No wrong answer, tomorrow's check-in will tell you how close you were."
              : "You've already made this prediction. It's locked in until tomorrow grades it."}
          </p>
          {existingForecastLevel === null ? (
            <div className="mt-3">
              <ShortOptionRow
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
      ),
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    overallDayRating,
    daytimeStress,
    energyPattern,
    recovery,
    symptomsOrChanges,
    predictedEnergyLevel,
    probeAnswers,
    existingForecastLevel,
  ]);

  const screens = useMemo(() => groupUnitsIntoScreens(units, mode, SECTION_ORDER), [units, mode]);
  const screenCount = screens.length;
  const clampedIndex = Math.min(screenIndex, screenCount - 1);
  const currentScreen = screens[clampedIndex] ?? [];
  const screenComplete = isScreenComplete(currentScreen);
  const blockedReason = screenBlockedReason(currentScreen);
  const isLastScreen = clampedIndex === screenCount - 1;

  function goToScreenClamped(index: number) {
    const clamped = Math.max(0, Math.min(index, screenCount - 1));
    setScreenIndex(clamped);
    setFurthestScreenIndex((prev) => Math.max(prev, clamped));
  }
  function goNext() {
    goToScreenClamped(clampedIndex + 1);
  }
  function goBack() {
    goToScreenClamped(clampedIndex - 1);
  }

  const warmth = computeWarmth({ mood: overallDayRating, energy: null, stress: daytimeStress, recovery });

  function handleSubmit() {
    setError('');
    const completionSeconds = Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000));
    const input: EveningReflectionFormInput = {
      overallDayRating,
      daytimeStress,
      energyPattern,
      symptomsOrChanges: symptomsOrChanges.trim() ? symptomsOrChanges.trim() : null,
      recovery,
      predictedEnergyLevel: existingForecastLevel === null ? predictedEnergyLevel : null,
      completion_seconds: completionSeconds,
    };

    startTransition(async () => {
      const [reflectionResult] = await Promise.all([
        submitEveningReflection(input),
        ...Object.entries(probeAnswers).map(([questionKey, value]) => submitProbeAnswerAction(localDate, questionKey, value)),
      ]);
      if (reflectionResult.error) {
        setError(reflectionResult.error);
        return;
      }
      setShowEnding(true);
    });
  }

  /**
   * Navigation fix (task requirement 1) — same discipline as CheckinForm's
   * saveProgressAndExit: saves whatever's filled as a draft (no forecast
   * commit, no "completed" side effects) and returns her to Home.
   *
   * 2026-07-27 fix — same guard as the morning form: `exitingRef` makes
   * every tap after the first a no-op (a `useState` alone commits too
   * late to block a fast second tap), and `exiting` disables the button
   * and swaps its label to "Saving…" so a real tap gives immediate
   * feedback instead of looking unresponsive while the sequential
   * awaited server round trips below are still in flight.
   */
  const exitingRef = useRef(false);
  const [exiting, setExiting] = useState(false);

  async function saveProgressAndExit() {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    await saveEveningReflectionDraft({
      overallDayRating,
      daytimeStress,
      energyPattern,
      symptomsOrChanges: symptomsOrChanges.trim() ? symptomsOrChanges.trim() : null,
      recovery,
    });
    await Promise.all(
      Object.entries(probeAnswers).map(([questionKey, value]) => submitProbeAnswerAction(localDate, questionKey, value))
    );
    router.push('/dashboard');
  }

  function handleContinue() {
    if (isLastScreen) {
      handleSubmit();
      return;
    }
    goNext();
  }

  if (showEnding) {
    const endingValues = [
      overallDayRating !== null ? { ramp: MOOD_RAMP, value: overallDayRating, max: 5 } : null,
      daytimeStress !== null ? { ramp: STRESS_RAMP, value: daytimeStress, max: 5 } : null,
      recovery !== null ? { ramp: RECOVERY_RAMP, value: recovery, max: 5 } : null,
    ].filter((v): v is { ramp: typeof MOOD_RAMP; value: number; max: number } => v !== null);
    return (
      <EndingMoment
        continuing={false}
        onContinue={() => {
          router.push('/dashboard');
          router.refresh();
        }}
        values={endingValues}
      />
    );
  }

  const sectionKeyForScreen = (index: number): EveningScreenKey => {
    const unit = screens[index]?.[0];
    return (unit?.section as EveningScreenKey) ?? 'other';
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
          continueLabel={isLastScreen ? (isPending ? 'Saving…' : existing ? 'Update Evening Reflection' : 'Save Evening Reflection') : 'Continue'}
          continueDisabled={isPending || !screenComplete}
          continueBusy={isPending}
          continueBlockedReason={blockedReason}
          renderScreen={(index) => {
            const screen = screens[index] ?? [];
            const section = sectionKeyForScreen(index);
            const showSectionHeading =
              mode === 'section' || screen[0]?.key === units.find((u) => u.section === section)?.key;
            return (
              <div className="space-y-6">
                {index === 0 && (
                  <div className="mef-checkin-stagger">
                    <p className="text-[15px] leading-relaxed text-[#4F645A]">
                      {existing
                        ? "You've already reflected on today. Update anything below."
                        : 'A short close to the day. Available any time, morning or night. Your Daily Reset never depends on this.'}
                    </p>
                    <CheckInModeSwitch active="evening" />
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
