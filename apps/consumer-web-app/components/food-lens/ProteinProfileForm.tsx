'use client';

/**
 * Protein Phase 1a — member profile setup, safety screen, and target
 * result. Deliberately plain (weight input, radio cards, checkboxes, one
 * submit action), same "foundation, not polish" scope as
 * components/health-safety/NutritionSafetyFlagsForm.tsx, which this
 * reuses the design language of.
 */

import { useState, useTransition } from 'react';
import { Loader2, HeartHandshake } from 'lucide-react';
import { submitMyProteinProfile, type ProteinSetupState } from '@/app/actions/protein';
import { ACTIVITY_LEVELS } from '@/lib/protein/calculation';
import type { ActivityLevelKey } from '@/lib/protein/types';

const CARD = 'rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SAFETY_QUESTIONS: { key: keyof SafetyAnswersState; label: string }[] = [
  { key: 'hasKidneyDisease', label: 'Kidney disease' },
  { key: 'hasSignificantLiverDisease', label: 'Significant liver disease' },
  { key: 'isPregnant', label: "I'm currently pregnant" },
  { key: 'hasEatingDisorder', label: 'An active or recovering eating disorder' },
  {
    key: 'hasMedicalProteinLimit',
    label: 'A healthcare provider has told me to limit my protein intake',
  },
];

type SafetyAnswersState = {
  hasKidneyDisease: boolean;
  hasSignificantLiverDisease: boolean;
  isPregnant: boolean;
  hasEatingDisorder: boolean;
  hasMedicalProteinLimit: boolean;
};

const EMPTY_SAFETY_ANSWERS: SafetyAnswersState = {
  hasKidneyDisease: false,
  hasSignificantLiverDisease: false,
  isPregnant: false,
  hasEatingDisorder: false,
  hasMedicalProteinLimit: false,
};

function SummaryCard({
  state,
  onEdit,
}: {
  state: Extract<ProteinSetupState, { stage: 'active' | 'pending_review' | 'blocked' }>;
  onEdit: () => void;
}) {
  if (state.stage === 'blocked') {
    return (
      <div className={CARD}>
        <div className="flex items-center gap-2 text-[#1B3A2D]">
          <HeartHandshake className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Protein target</p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">{state.message}</p>
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
        >
          Update your info
        </button>
      </div>
    );
  }

  if (state.stage === 'pending_review') {
    return (
      <div className={CARD}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Protein target
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
          Thanks — we&apos;ve got your info. Your coach is setting up your personalized protein
          target and it&apos;ll show here once it&apos;s ready.
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
        >
          Update your info
        </button>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Your protein target
      </p>
      {state.suggestedRange ? (
        <>
          <p className="mt-3 text-3xl font-[family-name:var(--font-cormorant-garamond)] text-[#1B3A2D]">
            {state.suggestedRange.low}&ndash;{state.suggestedRange.high}g
            <span className="ml-2 text-sm font-[family-name:var(--font-dm-sans)] font-medium text-[#6B7A72]">
              per day
            </span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
            This is guidance, not a prescription — a suggested range built around your numbers (
            {state.activeGrams}g), for you to use as a starting point.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-3xl font-[family-name:var(--font-cormorant-garamond)] text-[#1B3A2D]">
            {state.activeGrams}g
            <span className="ml-2 text-sm font-[family-name:var(--font-dm-sans)] font-medium text-[#6B7A72]">
              per day
            </span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
            {state.isCoachEdited
              ? 'Set by your coach.'
              : 'Approved by your coach as calculated.'}
          </p>
        </>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="mt-4 text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
      >
        Update your info
      </button>
    </div>
  );
}

export function ProteinProfileForm({ initial }: { initial: ProteinSetupState | null }) {
  const [view, setView] = useState<'summary' | 'form'>(
    initial && initial.stage !== 'not_started' ? 'summary' : 'form'
  );
  const [currentState, setCurrentState] = useState<ProteinSetupState | null>(initial);

  const [bodyWeightLb, setBodyWeightLb] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevelKey | null>(null);
  const [safety, setSafety] = useState<SafetyAnswersState>(EMPTY_SAFETY_ANSWERS);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSafety(key: keyof SafetyAnswersState) {
    setSafety((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSubmit() {
    setFormError(null);
    const weight = Number(bodyWeightLb);
    if (!Number.isFinite(weight) || weight <= 0) {
      setFormError('Enter your body weight in pounds.');
      return;
    }
    if (!activityLevel) {
      setFormError('Choose the activity level that fits you best.');
      return;
    }

    startTransition(async () => {
      const result = await submitMyProteinProfile({
        bodyWeightLb: weight,
        activityLevel,
        safety,
      });

      if ('error' in result && result.error) {
        setFormError(result.error);
        return;
      }
      if ('blocked' in result && result.blocked) {
        setCurrentState({ stage: 'blocked', message: result.message });
        setView('summary');
        return;
      }
      if ('state' in result) {
        setCurrentState(result.state);
        setView('summary');
      }
    });
  }

  if (
    view === 'summary' &&
    currentState &&
    (currentState.stage === 'active' ||
      currentState.stage === 'pending_review' ||
      currentState.stage === 'blocked')
  ) {
    return <SummaryCard state={currentState} onEdit={() => setView('form')} />;
  }

  return (
    <div className="space-y-5">
      <div className={CARD}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Body weight</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Your current body weight, in pounds.
        </p>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          value={bodyWeightLb}
          onChange={(e) => setBodyWeightLb(e.target.value)}
          placeholder="e.g. 165"
          className="mt-3 w-full rounded-2xl border border-[#B9C6BF] px-4 py-2.5 text-sm text-[#1B3A2D] focus:border-[#1B3A2D] focus:outline-none"
        />
      </div>

      <div className={CARD}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Activity level
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Choose the description that fits you best right now.
        </p>
        <div className="mt-3 space-y-2">
          {ACTIVITY_LEVELS.map((option) => (
            <label
              key={option.key}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                activityLevel === option.key
                  ? 'border-[#1B3A2D] bg-[#F3F6F4]'
                  : 'border-[#E3E8E5] hover:bg-[#FAFAF8]'
              }`}
            >
              <input
                type="radio"
                name="activityLevel"
                checked={activityLevel === option.key}
                onChange={() => setActivityLevel(option.key)}
                className="mt-0.5 h-4 w-4 text-[#1B3A2D] focus:ring-[#1B3A2D]"
              />
              <div>
                <p className="font-medium text-[#1B3A2D]">{option.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className={CARD}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Before we calculate anything
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Let us know if any of these apply to you. If they do, we won&apos;t auto-calculate a
          number — we&apos;ll point you to your coach or healthcare provider instead.
        </p>
        <div className="mt-3 space-y-2">
          {SAFETY_QUESTIONS.map((q) => (
            <label
              key={q.key}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
            >
              <input
                type="checkbox"
                checked={safety[q.key]}
                onChange={() => toggleSafety(q.key)}
                className="h-4 w-4 rounded border-[#B9C6BF] text-[#1B3A2D] focus:ring-[#1B3A2D]"
              />
              {q.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Calculate my target
        </button>
        {formError && <span className="text-sm text-red-600">{formError}</span>}
      </div>
    </div>
  );
}
