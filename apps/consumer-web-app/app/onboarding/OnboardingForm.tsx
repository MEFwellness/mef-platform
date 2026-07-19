'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { submitOnboarding } from '../actions/onboarding';
import { SLIDER_ENDPOINT_LABELS, numericRange } from '@/lib/onboarding/scale';
import type {
  AnswerStatus,
  OnboardingAnswerInput,
  OnboardingQuestion,
} from '@mef/shared-types-contracts';

type Props = {
  questions: OnboardingQuestion[];
  /**
   * Called after a successful submit instead of the default
   * router.refresh() — used by the reassessment flow to navigate to the
   * new submission instead of re-rendering in place (which is what the
   * original /onboarding page relies on to flip into its "already
   * complete" state). Omit to keep the original behavior exactly.
   */
  onSubmitted?: () => void;
  /** Defaults to "Submit onboarding" — the reassessment flow relabels this without needing a second copy of the form. */
  submitLabel?: string;
};

type StoredAnswer = {
  status: AnswerStatus;
  value?: string | number | boolean | string[];
};

// HTMLButtonElement included for the multi-select tiles' focus target —
// they're real <button> elements (not checkboxes) for a cleaner premium
// tile look, but still need to be reachable by the same fieldRefs-based
// focus-on-invalid mechanism as every other question type.
type Focusable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;

/**
 * Friendlier display labels for specific enum values that read better as
 * a full phrase than as their normalized value uppercased (e.g. the
 * primary_concern/goal question's "pain" -> "GET OUT OF PAIN"). Falls
 * back to the generic value.replaceAll('_', ' ') for every value not
 * listed here (short enums like sleep-hours buckets read fine as-is),
 * so this stays additive rather than a per-question special case.
 */
const ENUM_OPTION_LABELS: Record<string, string> = {
  pain: 'Get out of pain',
  energy: 'Improve my energy',
  sleep: 'Sleep better',
  stress: 'Reduce stress',
  weight: 'Lose weight',
  digestion: 'Improve digestion',
  movement: 'Move better',
  performance: 'Increase performance',
  healthy_aging: 'Age healthier',
  habits: 'Build healthier habits',
  general_optimization: 'Overall wellness',
  other: 'Something else',
};

function enumOptionLabel(option: string): string {
  return ENUM_OPTION_LABELS[option] ?? option.replaceAll('_', ' ');
}

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';
const INPUT_INVALID = 'border-red-400 focus:border-red-400';

/**
 * A required question is satisfied either by a real, non-empty answer, or
 * by an opt-out status the question explicitly allows — an opt-out the
 * question doesn't offer (e.g. a stale client caching an old answer) never
 * counts, even if one somehow ended up in state.
 */
function isValidAnswer(question: OnboardingQuestion, answer: StoredAnswer | undefined): boolean {
  if (!answer) return false;

  if (answer.status !== 'answered') {
    if (answer.status === 'not_sure') return question.allows_not_sure;
    if (answer.status === 'not_applicable') return question.allows_not_applicable;
    if (answer.status === 'prefer_not_to_answer') return question.allows_prefer_not_to_answer;
    return false;
  }

  const value = answer.value;
  switch (question.answer_type) {
    case 'numeric':
      return typeof value === 'number' && Number.isFinite(value);
    case 'enum':
      return typeof value === 'string' && value.trim().length > 0;
    case 'multi_select':
      return Array.isArray(value) && value.length > 0;
    case 'boolean':
      return typeof value === 'boolean';
    case 'free_text':
      return typeof value === 'string' && value.trim().length > 0;
    default:
      return false;
  }
}

function NumericSlider({
  questionKey,
  legendId,
  value,
  invalid,
  onChange,
  inputRef,
}: {
  questionKey: string;
  legendId: string;
  value: number | null;
  invalid: boolean;
  onChange: (value: number) => void;
  inputRef: (el: Focusable | null) => void;
}) {
  const { min, max } = numericRange(questionKey);
  const endpoints = SLIDER_ENDPOINT_LABELS[questionKey] ?? { min: 'Low', max: 'High' };
  const touched = value !== null;
  const displayValue = value ?? Math.round((min + max) / 2);
  const percent = ((displayValue - min) / (max - min)) * 100;
  const trackFill = touched ? '#1B3A2D' : invalid ? '#FCA5A5' : '#EFE9DB';

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          {touched ? 'Your answer' : 'Drag to answer'}
        </span>
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-cormorant-garamond)] text-xl font-semibold transition-colors ${
            touched
              ? 'bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
              : 'bg-[#F3F6F4] text-[#1B3A2D]/30'
          }`}
        >
          {touched ? displayValue : '—'}
        </span>
      </div>
      <input
        ref={inputRef}
        type="range"
        min={min}
        max={max}
        step={1}
        value={displayValue}
        aria-labelledby={legendId}
        aria-valuetext={`${displayValue} out of ${max}`}
        aria-invalid={invalid}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          backgroundImage: `linear-gradient(to right, ${trackFill} ${percent}%, #EFE9DB ${percent}%)`,
        }}
        className="mef-slider mt-6 h-2 w-full cursor-pointer touch-manipulation rounded-full"
      />
      <div className="mt-3 flex justify-between text-xs font-semibold text-[#6B7A72]">
        <span>
          {min} — {endpoints.min}
        </span>
        <span>
          {max} — {endpoints.max}
        </span>
      </div>
    </div>
  );
}

export function OnboardingForm({
  questions,
  onSubmitted,
  submitLabel = 'Submit onboarding',
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, StoredAnswer>>({});
  const [error, setError] = useState('');
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fieldRefs = useRef<Record<string, Focusable | null>>({});

  function updateAnswer(questionKey: string, answer: StoredAnswer) {
    setAnswers((current) => ({
      ...current,
      [questionKey]: answer,
    }));
    if (questionKey === invalidKey) {
      setInvalidKey(null);
      setError('');
    }
  }

  function parseAllowedValues(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }

    return [];
  }

  function renderQuestion(question: OnboardingQuestion, legendId: string) {
    const current = answers[question.question_key];
    const allowedValues = parseAllowedValues(question.allowed_values);
    const invalid = invalidKey === question.question_key;
    const setRef = (el: Focusable | null) => {
      fieldRefs.current[question.question_key] = el;
    };

    if (question.answer_type === 'numeric') {
      return (
        <NumericSlider
          questionKey={question.question_key}
          legendId={legendId}
          value={
            current?.status === 'answered' && typeof current.value === 'number'
              ? current.value
              : null
          }
          invalid={invalid}
          onChange={(value) => updateAnswer(question.question_key, { status: 'answered', value })}
          inputRef={setRef}
        />
      );
    }

    if (question.answer_type === 'enum') {
      const selectedValue =
        current?.status === 'answered' && typeof current.value === 'string' ? current.value : null;

      return (
        <div
          role="radiogroup"
          aria-labelledby={legendId}
          aria-invalid={invalid}
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          {allowedValues.map((option, index) => {
            const isSelected = selectedValue === option;
            return (
              <button
                key={option}
                ref={index === 0 ? setRef : undefined}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() =>
                  updateAnswer(question.question_key, { status: 'answered', value: option })
                }
                className={`mef-focus-ring flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider transition-colors ${
                  isSelected
                    ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                    : invalid
                      ? 'border-red-400 bg-white text-[#1B3A2D]/70'
                      : 'border-[#1B3A2D]/12 bg-white text-[#1B3A2D]/70 hover:border-[#1B3A2D]/30'
                }`}
              >
                {enumOptionLabel(option)}
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      );
    }

    if (question.answer_type === 'multi_select') {
      const selected =
        current?.status === 'answered' && Array.isArray(current.value) ? current.value : [];
      const hasNoneOption = allowedValues.includes('none');

      const toggleOption = (option: string) => {
        const isSelected = selected.includes(option);
        let nextValues: string[];

        if (isSelected) {
          nextValues = selected.filter((item) => item !== option);
        } else if (hasNoneOption && option === 'none') {
          // Selecting "none" is exclusive — it replaces any other areas.
          nextValues = ['none'];
        } else if (hasNoneOption) {
          // Selecting a real area clears "none" — the two are contradictory.
          nextValues = [...selected.filter((item) => item !== 'none'), option];
        } else {
          nextValues = [...selected, option];
        }

        updateAnswer(question.question_key, { status: 'answered', value: nextValues });
      };

      return (
        <div
          role="group"
          aria-labelledby={legendId}
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
        >
          {allowedValues.map((option, index) => {
            const isSelected = selected.includes(option);
            return (
              <button
                key={option}
                ref={index === 0 ? setRef : undefined}
                type="button"
                aria-pressed={isSelected}
                aria-invalid={invalid}
                onClick={() => toggleOption(option)}
                className={`flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider transition-colors ${
                  isSelected
                    ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                    : invalid
                      ? 'border-red-400 bg-white text-[#1B3A2D]/70'
                      : 'border-[#1B3A2D]/12 bg-white text-[#1B3A2D]/70 hover:border-[#1B3A2D]/30'
                }`}
              >
                {option.replaceAll('_', ' ')}
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      );
    }

    if (question.answer_type === 'boolean') {
      return (
        <select
          ref={setRef}
          aria-labelledby={legendId}
          aria-invalid={invalid}
          value={
            current?.status === 'answered' && typeof current.value === 'boolean'
              ? String(current.value)
              : ''
          }
          onChange={(event) =>
            updateAnswer(question.question_key, {
              status: 'answered',
              value: event.target.value === 'true',
            })
          }
          className={`${INPUT} bg-white ${invalid ? INPUT_INVALID : ''}`}
        >
          <option value="">Select an option</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }

    return (
      <textarea
        ref={setRef}
        aria-labelledby={legendId}
        aria-invalid={invalid}
        value={
          current?.status === 'answered' && typeof current.value === 'string' ? current.value : ''
        }
        onChange={(event) =>
          updateAnswer(question.question_key, {
            status: 'answered',
            value: event.target.value,
          })
        }
        rows={3}
        className={`${INPUT} ${invalid ? INPUT_INVALID : ''}`}
      />
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const missingQuestion = questions.find(
      (question) => !isValidAnswer(question, answers[question.question_key])
    );

    if (missingQuestion) {
      setInvalidKey(missingQuestion.question_key);
      setError(`This question is required: ${missingQuestion.prompt_text}`);
      const target = fieldRefs.current[missingQuestion.question_key];
      target?.focus();
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);

    const payload: OnboardingAnswerInput[] = questions.map((question) => {
      // Non-null: the isValidAnswer check above already guarantees every
      // question has a valid answer before this map runs.
      const answer = answers[question.question_key]!;

      return {
        question_key: question.question_key,
        question_version: question.question_version,
        answer_status: answer.status,
        ...(answer.status === 'answered' ? { value: answer.value } : {}),
      };
    });

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

    const result = await submitOnboarding(timezone, payload);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (onSubmitted) {
      onSubmitted();
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7" noValidate>
      {questions.map((question) => {
        const currentStatus = answers[question.question_key]?.status ?? 'answered';
        const invalid = invalidKey === question.question_key;
        const legendId = `${question.question_key}-label`;
        const errorId = `${question.question_key}-error`;

        return (
          <fieldset key={question.id} aria-describedby={invalid ? errorId : undefined}>
            <legend
              id={legendId}
              className="mb-3 block px-0.5 font-[family-name:var(--font-cormorant-garamond)] text-xl font-semibold leading-snug text-[#1B3A2D] md:text-2xl"
            >
              {question.prompt_text}
            </legend>

            <div className={`${CARD} p-5 md:p-6 ${invalid ? 'ring-2 ring-red-400' : ''}`}>
              {currentStatus === 'answered' ? renderQuestion(question, legendId) : null}

              {invalid ? (
                <p id={errorId} role="alert" className="mt-3 text-sm font-medium text-red-700">
                  This question is required.
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#6B7A72]">
                {question.allows_not_sure ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${question.question_key}-status`}
                      checked={currentStatus === 'not_sure'}
                      onChange={() =>
                        updateAnswer(question.question_key, {
                          status: 'not_sure',
                        })
                      }
                      className="h-4 w-4 accent-[#F5B700]"
                    />
                    Not sure
                  </label>
                ) : null}

                {question.allows_not_applicable ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${question.question_key}-status`}
                      checked={currentStatus === 'not_applicable'}
                      onChange={() =>
                        updateAnswer(question.question_key, {
                          status: 'not_applicable',
                        })
                      }
                      className="h-4 w-4 accent-[#F5B700]"
                    />
                    Not applicable
                  </label>
                ) : null}

                {question.allows_prefer_not_to_answer ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${question.question_key}-status`}
                      checked={currentStatus === 'prefer_not_to_answer'}
                      onChange={() =>
                        updateAnswer(question.question_key, {
                          status: 'prefer_not_to_answer',
                        })
                      }
                      className="h-4 w-4 accent-[#F5B700]"
                    />
                    Prefer not to answer
                  </label>
                ) : null}
              </div>

              {currentStatus !== 'answered' ? (
                <button
                  type="button"
                  onClick={() =>
                    updateAnswer(question.question_key, {
                      status: 'answered',
                    })
                  }
                  className="mt-3 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
                >
                  Answer this question
                </button>
              ) : null}
            </div>
          </fieldset>
        );
      })}

      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {submitting ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
