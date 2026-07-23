'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { submitOnboarding } from '../actions/onboarding';
import { SLIDER_ENDPOINT_LABELS, numericRange } from '@/lib/onboarding/scale';
import { DOMAIN_LABEL } from '@/lib/onboarding/baseline';
import { coachHelperFor, coachPromptFor } from '@/lib/onboarding/coachCopy';
import {
  PRIMARY_CONCERN_QUESTION_KEY,
  reorderOnboardingQuestions,
  transitionLineFor,
} from '@/lib/onboarding/branching';
import { OnboardingProgress } from './OnboardingProgress';
import { BranchTransition } from './BranchTransition';
import type {
  AnswerStatus,
  OnboardingAnswerInput,
  OnboardingQuestion,
} from '@mef/shared-types-contracts';

type Step =
  | { type: 'question'; question: OnboardingQuestion }
  | { type: 'transition'; line: string };

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
  /**
   * Guest mode (no signed-in session — see app/onboarding/OnboardingFlow.tsx's
   * 'guest' mode): skips the submitOnboarding() server call entirely (a
   * guest has no auth.uid() for RLS to even accept) and hands the built
   * payload to onGuestSave instead, which OnboardingFlow uses to persist it
   * to localStorage. Every other line of validation/branching/rendering is
   * identical to the authenticated path.
   */
  guestMode?: boolean;
  onGuestSave?: (payload: OnboardingAnswerInput[]) => void;
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
// text-base (16px), not text-sm. A focused text input/select/textarea
// under 16px triggers iOS Safari's automatic zoom-on-focus, which is
// exactly the "page scales unexpectedly while typing" behavior members
// were seeing. Range inputs (the sliders below) are unaffected by this;
// this only matters for the boolean <select> and free_text <textarea>.
const INPUT =
  'mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';
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

function parseAllowedValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  return [];
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
        // h-8 (32px), not h-2. The element's own hit box, not just the
        // thin visual track drawn by the ::-webkit/moz-range-track
        // pseudo-elements, since a taller invisible touch target is what
        // actually makes the slider easier to grab and drag accurately on
        // a phone. touch-manipulation removes the ~300ms tap-delay/
        // double-tap-zoom gesture detection that otherwise makes a fast
        // drag start feel like it hesitates before tracking the finger.
        className="mef-slider mt-6 h-8 w-full cursor-pointer touch-manipulation rounded-full"
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

/**
 * One question's fieldset, memoized so dragging one slider (which fires an
 * onChange on every pixel of movement) only re-renders the question being
 * dragged, not every other question on the page. This only works because
 * `answer` is the one specific value out of the parent's `answers` map.
 * every sibling question's `answer` prop keeps the exact same object
 * reference across a re-render (the parent's updateAnswer spreads into a
 * new object per key, leaving every other key's value untouched), so
 * React.memo's default shallow comparison correctly bails out for them.
 * `onAnswerChange` and `registerRef` are stable across renders (see their
 * useCallback deps in OnboardingForm) for the same reason: an unstable
 * function prop would defeat the memoization just as surely as an
 * unstable `answer` would.
 */
const QuestionField = memo(function QuestionField({
  question,
  answer,
  invalid,
  onAnswerChange,
  registerRef,
}: {
  question: OnboardingQuestion;
  answer: StoredAnswer | undefined;
  invalid: boolean;
  onAnswerChange: (questionKey: string, answer: StoredAnswer) => void;
  registerRef: (questionKey: string, el: Focusable | null) => void;
}) {
  const legendId = `${question.question_key}-label`;
  const errorId = `${question.question_key}-error`;
  const currentStatus = answer?.status ?? 'answered';
  const allowedValues = parseAllowedValues(question.allowed_values);

  const setRef = useCallback(
    (el: Focusable | null) => registerRef(question.question_key, el),
    [registerRef, question.question_key]
  );
  const update = useCallback(
    (next: StoredAnswer) => onAnswerChange(question.question_key, next),
    [onAnswerChange, question.question_key]
  );

  function renderControl() {
    if (question.answer_type === 'numeric') {
      return (
        <NumericSlider
          questionKey={question.question_key}
          legendId={legendId}
          value={
            answer?.status === 'answered' && typeof answer.value === 'number' ? answer.value : null
          }
          invalid={invalid}
          onChange={(value) => update({ status: 'answered', value })}
          inputRef={setRef}
        />
      );
    }

    if (question.answer_type === 'enum') {
      const selectedValue =
        answer?.status === 'answered' && typeof answer.value === 'string' ? answer.value : null;

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
                onClick={() => update({ status: 'answered', value: option })}
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
        answer?.status === 'answered' && Array.isArray(answer.value) ? answer.value : [];
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

        update({ status: 'answered', value: nextValues });
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
                className={`mef-focus-ring flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider transition-colors ${
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
            answer?.status === 'answered' && typeof answer.value === 'boolean'
              ? String(answer.value)
              : ''
          }
          onChange={(event) => update({ status: 'answered', value: event.target.value === 'true' })}
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
          answer?.status === 'answered' && typeof answer.value === 'string' ? answer.value : ''
        }
        onChange={(event) => update({ status: 'answered', value: event.target.value })}
        rows={3}
        className={`${INPUT} ${invalid ? INPUT_INVALID : ''}`}
      />
    );
  }

  return (
    <fieldset aria-describedby={invalid ? errorId : undefined}>
      <legend
        id={legendId}
        className="mb-1 block px-0.5 font-[family-name:var(--font-cormorant-garamond)] text-xl font-semibold leading-snug text-[#1B3A2D] md:text-2xl"
      >
        {coachPromptFor(question)}
      </legend>

      {coachHelperFor(question) ? (
        <p className="mb-3 px-0.5 text-sm text-[#6B7A72]">{coachHelperFor(question)}</p>
      ) : null}

      <div className={`${CARD} mt-3 p-5 md:p-6 ${invalid ? 'ring-2 ring-red-400' : ''}`}>
        {currentStatus === 'answered' ? renderControl() : null}

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
                onChange={() => update({ status: 'not_sure' })}
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
                onChange={() => update({ status: 'not_applicable' })}
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
                onChange={() => update({ status: 'prefer_not_to_answer' })}
                className="h-4 w-4 accent-[#F5B700]"
              />
              Prefer not to answer
            </label>
          ) : null}
        </div>

        {currentStatus !== 'answered' ? (
          <button
            type="button"
            onClick={() => update({ status: 'answered' })}
            className="mt-3 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
          >
            Answer this question
          </button>
        ) : null}
      </div>
    </fieldset>
  );
});

export function OnboardingForm({
  questions,
  onSubmitted,
  submitLabel = 'Submit onboarding',
  guestMode = false,
  onGuestSave,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, StoredAnswer>>({});
  const [error, setError] = useState('');
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const fieldRefs = useRef<Record<string, Focusable | null>>({});
  // Mirrors invalidKey for updateAnswer's stable callback below. Reading
  // state directly there would either go stale (empty deps) or force the
  // callback to change identity on every invalidKey change (breaking the
  // memoization every QuestionField instance relies on).
  const invalidKeyRef = useRef<string | null>(null);
  invalidKeyRef.current = invalidKey;

  const registerRef = useCallback((questionKey: string, el: Focusable | null) => {
    fieldRefs.current[questionKey] = el;
  }, []);

  const updateAnswer = useCallback((questionKey: string, answer: StoredAnswer) => {
    setAnswers((current) => ({
      ...current,
      [questionKey]: answer,
    }));
    if (questionKey === invalidKeyRef.current) {
      setInvalidKey(null);
      setError('');
    }
  }, []);

  const primaryConcernAnswer = answers[PRIMARY_CONCERN_QUESTION_KEY];
  const primaryConcernValue =
    primaryConcernAnswer?.status === 'answered' && typeof primaryConcernAnswer.value === 'string'
      ? primaryConcernAnswer.value
      : null;

  // Reordering (and the one-off transition step it earns) only ever moves
  // questions the member hasn't reached yet — see reorderOnboardingQuestions,
  // which pins primary_concern first and is a pure key-preserving permutation
  // of `questions`, so the final submit payload below stays correct
  // regardless of which order the member actually saw them in.
  const orderedQuestions = useMemo(
    () => reorderOnboardingQuestions(questions, primaryConcernValue),
    [questions, primaryConcernValue]
  );

  const steps = useMemo<Step[]>(() => {
    const result: Step[] = [];
    for (const question of orderedQuestions) {
      result.push({ type: 'question', question });
      if (question.question_key === PRIMARY_CONCERN_QUESTION_KEY && primaryConcernValue) {
        result.push({ type: 'transition', line: transitionLineFor(primaryConcernValue) });
      }
    }
    return result;
  }, [orderedQuestions, primaryConcernValue]);

  const clampedStepIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[clampedStepIndex];
  const isLastStep = clampedStepIndex === steps.length - 1;
  const totalQuestionSteps = questions.length;

  const completedQuestionSteps = useMemo(() => {
    let count = 0;
    for (let i = 0; i < clampedStepIndex; i++) {
      if (steps[i]?.type === 'question') count++;
    }
    return count;
  }, [steps, clampedStepIndex]);

  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // Auto-focus the new step's control on advance — with only one question
  // visible at a time, the member shouldn't have to hunt for it (parallels
  // the existing focus-on-invalid behavior below, just on every step, not
  // only a failed one).
  useEffect(() => {
    const step = stepsRef.current[clampedStepIndex];
    if (step?.type === 'question') {
      fieldRefs.current[step.question.question_key]?.focus();
    }
  }, [clampedStepIndex]);

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    if (currentStep?.type !== 'question') {
      setStepIndex((i) => i + 1);
      return;
    }

    const { question } = currentStep;
    if (!isValidAnswer(question, answers[question.question_key])) {
      setInvalidKey(question.question_key);
      setError(`This question is required: ${coachPromptFor(question)}`);
      const target = fieldRefs.current[question.question_key];
      target?.focus();
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setInvalidKey(null);
    setError('');
    setStepIndex((i) => i + 1);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const missingQuestion = questions.find(
      (question) => !isValidAnswer(question, answers[question.question_key])
    );

    if (missingQuestion) {
      const missingStepIndex = steps.findIndex(
        (step) => step.type === 'question' && step.question.question_key === missingQuestion.question_key
      );
      if (missingStepIndex >= 0) setStepIndex(missingStepIndex);
      setInvalidKey(missingQuestion.question_key);
      setError(`This question is required: ${coachPromptFor(missingQuestion)}`);
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

    if (guestMode) {
      onGuestSave?.(payload);
    } else {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
      const result = await submitOnboarding(timezone, payload);

      if (result.error) {
        setError(result.error);
        setSubmitting(false);
        return;
      }
    }

    if (onSubmitted) {
      onSubmitted();
    } else {
      router.refresh();
    }
  }

  if (!currentStep) return null;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div
        key={currentStep.type === 'question' ? currentStep.question.question_key : 'transition'}
        className="mef-animate-in space-y-5"
      >
        <OnboardingProgress
          questionNumber={
            currentStep.type === 'question' ? completedQuestionSteps + 1 : completedQuestionSteps
          }
          totalQuestions={totalQuestionSteps}
          domainLabel={
            currentStep.type === 'question' ? DOMAIN_LABEL[currentStep.question.domain] : undefined
          }
        />

        {currentStep.type === 'transition' ? (
          <BranchTransition line={currentStep.line} onContinue={goNext} />
        ) : (
          <>
            <QuestionField
              question={currentStep.question}
              answer={answers[currentStep.question.question_key]}
              invalid={invalidKey === currentStep.question.question_key}
              onAnswerChange={updateAnswer}
              registerRef={registerRef}
            />

            {error ? (
              <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3">
              {clampedStepIndex > 0 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="mef-focus-ring flex items-center justify-center rounded-full border border-[#1B3A2D]/15 px-6 py-3.5 text-base font-semibold text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
                >
                  Back
                </button>
              ) : null}

              {isLastStep ? (
                <button
                  type="submit"
                  disabled={submitting}
                  className="mef-focus-ring flex flex-1 items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : submitLabel}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  className="mef-focus-ring flex flex-1 items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
                >
                  Continue
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </form>
  );
}
