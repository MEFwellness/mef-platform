'use client';

/**
 * Evening Reflection — the five things that can't be reliably counted
 * automatically (overall day rating, daytime stress, energy pattern,
 * symptoms/changes, recovery), plus digestion and overall movement,
 * which only became an honest question to ask once the day has actually
 * happened. Its own section grouping (How your day went / Your body /
 * Anything else), sharing the exact same wizard shell, unit model, hero
 * color ramps, and cinematic/section mode toggle as the morning form.
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
import { groupUnitsIntoScreens, isScreenComplete, type CheckinUnit } from '@/lib/daily-checkin-adaptive/wizardUnits';
import type { DriverProbeQuestion } from '@/lib/daily-checkin-adaptive/types';
import { DriverProbeField, type ProbeAnswerValue } from '@/components/checkin/DriverProbeField';
import { CheckinWizard } from '@/components/checkin/CheckinWizard';
import { SunPathArc } from '@/components/checkin/scales/SunPathArc';
import { CompressingRings } from '@/components/checkin/scales/CompressingRings';
import { EnergyPatternLines } from '@/components/checkin/scales/EnergyPatternLines';
import { RecoveryFill } from '@/components/checkin/scales/RecoveryFill';
import { ShortOptionRow } from '@/components/checkin/scales/ShortOptionRow';
import { StackedOptionRows } from '@/components/checkin/scales/StackedOptionRows';
import { EndingMoment } from '@/components/checkin/EndingMoment';
import { TemperatureOverlay, computeWarmth } from '@/components/checkin/TemperatureOverlay';
import { MOOD_RAMP, STRESS_RAMP, RECOVERY_RAMP } from '@/lib/checkin-color-ramps';
import { useScreenAutoAdvance } from '@/hooks/useScreenAutoAdvance';
import type { DailyCheckin, EnergyPattern, EveningReflection } from '@mef/shared-types-contracts';
import type { LucideIcon } from 'lucide-react';

const SPECIALLY_HANDLED_QUESTION_KEYS = new Set([
  'checkin_probe.digestion_rating',
  'checkin_probe.movement_today',
]);

const STRESS_LABELS = ['Very calm', 'Calm', 'Moderate', 'High', 'Overwhelmed'] as const;
const RATING_LABELS = ['Rough', 'Below average', 'Okay', 'Good', 'Great'] as const;
const RECOVERY_LABELS = ['Depleted', 'Low', 'Some', 'Good', 'Fully recovered'] as const;
const DIGESTION_MEANING = ['Poor', 'Somewhat off', 'Fair', 'Good', 'Excellent'] as const;
const FORECAST_ENERGY_MEANING = ['Exhausted', 'Low', 'Moderate', 'Good', 'High'] as const;
const MOVEMENT_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'full_session', label: 'Full session' },
] as const;

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

const SECTION_HEADINGS: Record<EveningScreenKey, { icon: LucideIcon; title: string; subtitle: string }> = {
  day: { icon: Sunset, title: 'How your day went', subtitle: 'Overall shape of the day' },
  body: { icon: HeartPulse, title: 'Your body', subtitle: 'Easier to answer honestly now that the day is done' },
  other: { icon: MessageCircle, title: 'Anything else', subtitle: 'Optional, then predict tomorrow' },
};

type Props = {
  existing: EveningReflection | null;
  localDate: string;
  timezone: string;
  todaysCheckin: DailyCheckin | null;
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
  timezone,
  todaysCheckin,
  rotatingProbes,
  localFollowUps,
  initialProbeAnswers,
  existingForecastLevel,
  isFirstCheckin,
}: Props) {
  const digestionQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.digestion_rating') ?? null;
  const movementQuestion =
    rotatingProbes.find((q) => q.questionKey === 'checkin_probe.movement_today') ?? null;

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

  const eligibleLocalFollowUps = localFollowUps.filter((question) =>
    isLocalFollowUpEligible(question, probeAnswers)
  );

  const router = useRouter();
  const [screenIndex, setScreenIndex] = useState(0);
  const [showEnding, setShowEnding] = useState(false);
  const [furthestScreenIndex, setFurthestScreenIndex] = useState(0);
  const [overallDayRating, setOverallDayRating] = useState<number | null>(existing?.overall_day_rating ?? null);
  const [daytimeStress, setDaytimeStress] = useState<number | null>(existing?.daytime_stress ?? null);
  const [energyPattern, setEnergyPattern] = useState<EnergyPattern | null>(existing?.energy_pattern ?? null);
  const [symptomsOrChanges, setSymptomsOrChanges] = useState(existing?.symptoms_or_changes ?? '');
  const [recovery, setRecovery] = useState<number | null>(existing?.recovery ?? null);
  const [digestionRating, setDigestionRating] = useState<number | null>(todaysCheckin?.digestion_rating ?? null);
  const [movementToday, setMovementToday] = useState<(typeof MOVEMENT_LEVELS)[number]['value'] | null>(
    todaysCheckin?.movement_today ?? null
  );
  const [predictedEnergyLevel, setPredictedEnergyLevel] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const mode = isFirstCheckin ? ('cinematic' as const) : ('section' as const);

  const units: CheckinUnit[] = useMemo(() => {
    const list: CheckinUnit[] = [
      {
        key: 'overall-day',
        section: 'day',
        required: true,
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
        required: true,
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
        required: true,
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
        required: true,
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

    for (const question of [...genericRotatingProbes, ...eligibleLocalFollowUps]) {
      list.push({
        key: question.questionKey,
        section: eveningScreenForQuestion(question),
        required: false,
        answered: question.questionKey in probeAnswers,
        render: () => (
          <DriverProbeField
            question={question}
            value={probeAnswers[question.questionKey] ?? null}
            onChange={(value) => setProbeAnswer(question.questionKey, value)}
          />
        ),
      });
    }

    if (digestionQuestion) {
      list.push({
        key: digestionQuestion.questionKey,
        section: 'body',
        required: false,
        answered: digestionRating !== null,
        render: () => (
          <StackedOptionRows
            question="How was your digestion today?"
            options={DIGESTION_MEANING.map((label, i) => ({ value: i + 1, label }))}
            value={digestionRating}
            onChange={setDigestionRating}
          />
        ),
      });
    }

    if (movementQuestion) {
      list.push({
        key: movementQuestion.questionKey,
        section: 'body',
        required: false,
        answered: movementToday !== null,
        render: () => (
          <StackedOptionRows
            question="How much did you move your body today overall?"
            options={MOVEMENT_LEVELS}
            value={movementToday}
            onChange={setMovementToday}
          />
        ),
      });
    }

    list.push({
      key: 'symptoms',
      section: 'other',
      required: false,
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
      required: false,
      answered: true,
      render: () => (
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
    digestionRating,
    movementToday,
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

  useScreenAutoAdvance(screenComplete, clampedIndex, goNext);

  const warmth = computeWarmth({ mood: overallDayRating, energy: null, stress: daytimeStress, recovery });

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
        ...Object.entries(probeAnswers).map(([questionKey, value]) => submitProbeAnswerAction(localDate, questionKey, value)),
      ]);
      if (reflectionResult.error) {
        setError(reflectionResult.error);
        return;
      }
      if (bodyResult.error) {
        setError(bodyResult.error);
        return;
      }
      setShowEnding(true);
    });
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

  const isLastScreen = clampedIndex === screenCount - 1;
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
          renderScreen={(index) => {
            const screen = screens[index] ?? [];
            const section = sectionKeyForScreen(index);
            const showSectionHeading =
              mode === 'section' || screen[0]?.key === units.find((u) => u.section === section)?.key;
            return (
              <div className="space-y-6">
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
                {isLastScreen && index === screenCount - 1 && (
                  <>
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
                  </>
                )}
              </div>
            );
          }}
        />
      </div>
    </>
  );
}
