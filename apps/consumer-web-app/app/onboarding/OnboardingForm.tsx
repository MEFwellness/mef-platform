'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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

type Focusable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

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

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
          {touched ? 'Your answer' : 'Drag to answer'}
        </span>
        <span
          className={`font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-none ${
            touched ? 'text-[#1B3A2D]' : 'text-[#1B3A2D]/30'
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
        className={`mt-3 h-2 w-full cursor-pointer touch-manipulation appearance-none rounded-full accent-[#F5B700] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          invalid ? 'outline-red-400' : 'outline-[#1B3A2D]'
        } ${touched ? 'bg-[#F5B700]/25' : 'bg-[#EFE9DB]'}`}
      />
      <div className="mt-1.5 flex justify-between text-xs text-[#6B7A72]">
        <span>
          {min} = {endpoints.min}
        </span>
        <span>
          {max} = {endpoints.max}
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
      return (
        <select
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
          className={`${INPUT} bg-white ${invalid ? INPUT_INVALID : ''}`}
        >
          <option value="">Select an option</option>
          {allowedValues.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      );
    }

    if (question.answer_type === 'multi_select') {
      const selected =
        current?.status === 'answered' && Array.isArray(current.value) ? current.value : [];

      return (
        <div className="mt-2 space-y-2">
          {allowedValues.map((option, index) => (
            <label
              key={option}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm text-[#1B3A2D] ${
                invalid ? 'border-red-400' : 'border-[#1B3A2D]/10'
              }`}
            >
              <input
                ref={index === 0 ? setRef : undefined}
                type="checkbox"
                aria-invalid={invalid}
                checked={selected.includes(option)}
                onChange={(event) => {
                  const nextValues = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);

                  updateAnswer(question.question_key, {
                    status: 'answered',
                    value: nextValues,
                  });
                }}
                className="h-4 w-4 accent-[#F5B700]"
              />
              {option.replaceAll('_', ' ')}
            </label>
          ))}
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
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {questions.map((question) => {
        const currentStatus = answers[question.question_key]?.status ?? 'answered';
        const invalid = invalidKey === question.question_key;
        const legendId = `${question.question_key}-label`;
        const errorId = `${question.question_key}-error`;

        return (
          <fieldset
            key={question.id}
            className={`${CARD} p-5 ${invalid ? 'ring-2 ring-red-400' : ''}`}
            aria-describedby={invalid ? errorId : undefined}
          >
            <legend id={legendId} className="px-1 text-sm font-medium text-[#1B3A2D]">
              {question.prompt_text}
            </legend>

            {currentStatus === 'answered' ? renderQuestion(question, legendId) : null}

            {invalid ? (
              <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-red-700">
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
                className="mt-3 text-sm font-medium text-[#854D0E] underline underline-offset-2"
              >
                Answer this question
              </button>
            ) : null}
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
        className="flex w-full items-center justify-center rounded-full bg-[#F5B700] px-6 py-3.5 text-base font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-60"
      >
        {submitting ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
