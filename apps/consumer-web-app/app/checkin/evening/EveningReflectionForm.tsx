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

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  submitEveningReflection,
  type EveningReflectionFormInput,
} from '@/app/actions/eveningReflection';
import { submitEveningBodyCheckin } from '@/app/actions/checkin';
import type { DailyCheckin, EnergyPattern, EveningReflection } from '@mef/shared-types-contracts';

const SECTION_CARD =
  'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] space-y-6 p-7';

const RATING_LABELS = ['Rough', 'Below average', 'Okay', 'Good', 'Great'] as const;
const STRESS_LABELS = ['Very calm', 'Calm', 'Moderate', 'High', 'Overwhelmed'] as const;
const RECOVERY_LABELS = ['Depleted', 'Low', 'Some', 'Good', 'Fully recovered'] as const;
const DIGESTION_MEANING = ['Poor', 'Somewhat off', 'Fair', 'Good', 'Excellent'] as const;
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

function ScaleQuestion({
  question,
  labels,
  value,
  onChange,
}: {
  question: string;
  labels: readonly string[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="text-[13px] leading-relaxed text-[#6B7A72]">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={question}>
        {labels.map((label, i) => {
          const optionValue = i + 1;
          const isSelected = value === optionValue;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(optionValue)}
              aria-pressed={isSelected}
              className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out active:scale-95 ${
                isSelected
                  ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                  : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  existing: EveningReflection | null;
  localDate: string;
  timezone: string;
  todaysCheckin: DailyCheckin | null;
};

export function EveningReflectionForm({ existing, localDate, timezone, todaysCheckin }: Props) {
  const router = useRouter();
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function handleSubmit() {
    setError('');
    const input: EveningReflectionFormInput = {
      overallDayRating,
      daytimeStress,
      energyPattern,
      symptomsOrChanges: symptomsOrChanges.trim() ? symptomsOrChanges.trim() : null,
      recovery,
    };

    startTransition(async () => {
      const [reflectionResult, bodyResult] = await Promise.all([
        submitEveningReflection(input),
        submitEveningBodyCheckin(localDate, timezone, movementToday, digestionRating),
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
    <div className="mt-6 space-y-6">
      <div className={SECTION_CARD}>
        <ScaleQuestion
          question="Overall, how was your day?"
          labels={RATING_LABELS}
          value={overallDayRating}
          onChange={setOverallDayRating}
        />
        <ScaleQuestion
          question="How much stress did you carry through the day?"
          labels={STRESS_LABELS}
          value={daytimeStress}
          onChange={setDaytimeStress}
        />
        <div>
          <p className="text-[13px] leading-relaxed text-[#6B7A72]">
            How did your energy move through the day?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ENERGY_PATTERNS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setEnergyPattern(option.value)}
                aria-pressed={energyPattern === option.value}
                className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out active:scale-95 ${
                  energyPattern === option.value
                    ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                    : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <ScaleQuestion
          question="How recovered do you feel heading into tonight?"
          labels={RECOVERY_LABELS}
          value={recovery}
          onChange={setRecovery}
        />
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
      </div>

      <div className={SECTION_CARD}>
        <div>
          <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
            Digestion &amp; movement
          </p>
          <p className="text-[13px] text-[#6B7A72]">
            Easier to answer honestly now that the day is done
          </p>
        </div>
        <ScaleQuestion
          question="How was your digestion today?"
          labels={DIGESTION_MEANING}
          value={digestionRating}
          onChange={setDigestionRating}
        />
        <div>
          <p className="text-[13px] leading-relaxed text-[#6B7A72]">
            How much did you move your body today overall?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MOVEMENT_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => setMovementToday(level.value)}
                aria-pressed={movementToday === level.value}
                className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-all duration-200 ease-out active:scale-95 ${
                  movementToday === level.value
                    ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                    : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition-all duration-200 ease-out hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
      >
        {isPending ? 'Saving…' : existing ? 'Update Evening Reflection' : 'Save Evening Reflection'}
      </button>
    </div>
  );
}
