'use client';

/**
 * One-question-per-screen assessment flow. Every tap on an option
 * optimistically updates local state, fires a best-effort save to the
 * server (submitAssessmentAnswer — see app/actions/assessments.ts), and
 * auto-advances to the next question after a brief pause so the flow
 * feels continuous without ever requiring an extra "confirm" tap. Explicit
 * Previous/Next controls stay available for anyone who wants to move at
 * their own pace or revisit an earlier answer. Nothing here computes a
 * score or exposes one to the member — see the "never expose scoring
 * calculations during the assessment" rule this flow follows: only
 * completeMyAssessment(), called once at the very end, invokes the
 * scoring engine, and it happens entirely server-side.
 *
 * Steps: a questionnaire's take flow is a sequence of "steps," each either
 * a scored question or, for a questionnaire that declares
 * `contextQuestions`, a one-time intake prompt gating a category's
 * conditional questions. `steps` is rebuilt whenever `context` changes
 * (via `isQuestionActive`), so answering a context question immediately
 * reveals only the questions that apply, without the member ever seeing
 * or needing to skip past one that doesn't. This is a complete no-op for
 * a questionnaire that never declares `contextQuestions` — `steps` then
 * reduces to exactly the flattened question list, and `context` stays
 * `{}` for the life of the component.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { flattenQuestions, type FlatQuestionRef } from '@/lib/assessments/engine/navigation';
import { isQuestionActive, totalAnsweredCount } from '@/lib/assessments/engine/scoring';
import {
  completeMyAssessment,
  submitAssessmentAnswer,
  submitAssessmentContext,
} from '@/app/actions/assessments';
import { AssessmentProgressBar } from './AssessmentProgressBar';
import { QuestionCard } from './QuestionCard';
import { ContextQuestionCard } from './ContextQuestionCard';
import type {
  AssessmentContext,
  Questionnaire,
  QuestionnaireAnswers,
} from '@/lib/assessments/engine/types';

type Props = {
  questionnaire: Questionnaire;
  assessmentId: string;
  initialAnswers: QuestionnaireAnswers;
  /** Optional — only meaningful for a questionnaire that declares `contextQuestions`. Defaults to `{}`, so callers for every other questionnaire can omit it entirely. */
  initialContext?: AssessmentContext;
  resumeCategoryId: string | null;
  resumeQuestionNumber: number | null;
};

const AUTO_ADVANCE_DELAY_MS = 350;

type Step =
  | { kind: 'question'; ref: FlatQuestionRef }
  | { kind: 'context'; contextQuestion: NonNullable<Questionnaire['contextQuestions']>[number] };

function buildSteps(
  questionnaire: Questionnaire,
  flat: FlatQuestionRef[],
  context: AssessmentContext
): Step[] {
  const steps: Step[] = [];
  const gatedCategoryIds = new Set<string>();
  for (const ref of flat) {
    if (!gatedCategoryIds.has(ref.category.id)) {
      gatedCategoryIds.add(ref.category.id);
      const gate = questionnaire.contextQuestions?.find((cq) => cq.categoryId === ref.category.id);
      if (gate) steps.push({ kind: 'context', contextQuestion: gate });
    }
    if (isQuestionActive(ref.question, context)) {
      steps.push({ kind: 'question', ref });
    }
  }
  return steps;
}

function stepSectionInfo(questionnaire: Questionnaire, step: Step) {
  const categoryId =
    step.kind === 'question' ? step.ref.category.id : step.contextQuestion.categoryId;
  const category = questionnaire.categories.find((c) => c.id === categoryId)!;
  const sectionIndex = questionnaire.categories.findIndex((c) => c.id === categoryId) + 1;
  return { category, sectionIndex };
}

function isStepAnswered(
  step: Step,
  answers: QuestionnaireAnswers,
  context: AssessmentContext
): boolean {
  if (step.kind === 'context') return context[step.contextQuestion.key] !== undefined;
  return answers[step.ref.category.id]?.[step.ref.question.number] !== undefined;
}

function findStepIndexForQuestion(
  steps: Step[],
  categoryId: string,
  questionNumber: number
): number {
  return steps.findIndex(
    (step) =>
      step.kind === 'question' &&
      step.ref.category.id === categoryId &&
      step.ref.question.number === questionNumber
  );
}

export function AssessmentTaker({
  questionnaire,
  assessmentId,
  initialAnswers,
  initialContext = {},
  resumeCategoryId,
  resumeQuestionNumber,
}: Props) {
  const router = useRouter();
  const flat = useMemo(() => flattenQuestions(questionnaire), [questionnaire]);

  const [answers, setAnswers] = useState<QuestionnaireAnswers>(initialAnswers);
  const [context, setContext] = useState<AssessmentContext>(initialContext);
  const steps = useMemo(
    () => buildSteps(questionnaire, flat, context),
    [questionnaire, flat, context]
  );

  const startIndex = useMemo(() => {
    const initialSteps = buildSteps(questionnaire, flat, initialContext);
    if (resumeCategoryId && resumeQuestionNumber != null) {
      const index = findStepIndexForQuestion(initialSteps, resumeCategoryId, resumeQuestionNumber);
      if (index !== -1) return index;
    }
    const firstUnansweredStep = initialSteps.findIndex(
      (step) => !isStepAnswered(step, initialAnswers, initialContext)
    );
    return firstUnansweredStep !== -1 ? firstUnansweredStep : initialSteps.length - 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [stepIndex, setStepIndex] = useState(startIndex);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCompleting, startCompleting] = useTransition();
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  function clearPendingAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }

  const current = steps[Math.min(stepIndex, steps.length - 1)]!;
  const isLast = stepIndex >= steps.length - 1;
  const { category: currentCategory, sectionIndex } = stepSectionInfo(questionnaire, current);
  const isAnswered = isStepAnswered(current, answers, context);
  const totalQuestionSteps = steps.filter((s) => s.kind === 'question').length;
  const answeredCount = totalAnsweredCount(questionnaire, answers, context);
  /** Question steps up to and including the current one; +1 more when the current step is a context gate, since that always precedes the question it's unlocking. */
  const currentQuestionNumber = Math.min(
    steps.slice(0, stepIndex + 1).filter((s) => s.kind === 'question').length +
      (current.kind === 'context' ? 1 : 0),
    totalQuestionSteps
  );

  function goNext() {
    clearPendingAdvance();
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goPrev() {
    clearPendingAdvance();
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function advanceAfterAnswer() {
    clearPendingAdvance();
    if (!isLast) {
      advanceTimer.current = setTimeout(() => {
        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      }, AUTO_ADVANCE_DELAY_MS);
    }
  }

  function handleSelectOption(optionIndex: number) {
    if (current.kind !== 'question') return;
    const { category, question } = current.ref;
    setSaveError(null);
    setAnswers((prev) => ({
      ...prev,
      [category.id]: { ...prev[category.id], [question.number]: optionIndex },
    }));

    submitAssessmentAnswer(
      questionnaire.id,
      assessmentId,
      category.id,
      question.number,
      optionIndex
    )
      .then((result) => {
        if (!result.ok) setSaveError(result.error);
      })
      .catch(() => {
        // A genuine network failure (offline, timeout, server unreachable) rather than a
        // server-returned { ok: false } — the local answer still stands, but the member
        // needs to know it may not have saved, not see it silently vanish into a console error.
        setSaveError("Couldn't save that answer. Check your connection and try again.");
      });

    advanceAfterAnswer();
  }

  function handleSelectContext(value: string) {
    if (current.kind !== 'context') return;
    const { key } = current.contextQuestion;
    setSaveError(null);
    setContext((prev) => ({ ...prev, [key]: value }));

    submitAssessmentContext(questionnaire.id, assessmentId, key, value)
      .then((result) => {
        if (!result.ok) setSaveError(result.error);
      })
      .catch(() => {
        setSaveError("Couldn't save that answer. Check your connection and try again.");
      });

    advanceAfterAnswer();
  }

  function handleComplete() {
    startCompleting(async () => {
      try {
        const result = await completeMyAssessment(questionnaire.id, assessmentId);
        if (result) {
          router.push(`/assessments/${questionnaire.id}/results/${result.record.id}` as Route);
        } else {
          setSaveError('Something went wrong finishing your assessment. Please try again.');
        }
      } catch {
        // Same "don't let a network failure look like a crash" discipline as
        // handleSelectOption/handleSelectContext above.
        setSaveError('Something went wrong finishing your assessment. Please try again.');
      }
    });
  }

  return (
    <div>
      <AssessmentProgressBar
        currentNumber={currentQuestionNumber}
        totalQuestions={totalQuestionSteps}
        sectionLabel={currentCategory.name}
        sectionIndex={sectionIndex}
        sectionCount={questionnaire.categories.length}
      />

      <div className="mt-6">
        {current.kind === 'context' ? (
          <ContextQuestionCard
            key={`context-${current.contextQuestion.key}`}
            sectionPosition={`Section ${sectionIndex} of ${questionnaire.categories.length} · ${currentCategory.name}`}
            contextQuestion={current.contextQuestion}
            selectedValue={context[current.contextQuestion.key]}
            onSelect={handleSelectContext}
          />
        ) : (
          <QuestionCard
            key={`question-${current.ref.category.id}-${current.ref.question.number}`}
            categoryName={current.ref.category.name}
            sectionPosition={`Section ${sectionIndex} of ${questionnaire.categories.length}`}
            question={current.ref.question}
            selectedOptionIndex={answers[current.ref.category.id]?.[current.ref.question.number]}
            onSelect={handleSelectOption}
          />
        )}
      </div>

      {saveError && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {saveError}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={stepIndex === 0}
          className="inline-flex items-center gap-1 rounded-2xl px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#F3F6F4] disabled:opacity-30 disabled:hover:bg-transparent mef-focus-ring"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Previous
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleComplete}
            disabled={!isAnswered || isCompleting}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40 mef-focus-ring"
          >
            {isCompleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            See my results
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!isAnswered}
            className="inline-flex items-center gap-1 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40 mef-focus-ring"
          >
            Next
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-[#6B7A72]">
        {answeredCount} of {totalQuestionSteps} answered · Your progress is saved automatically,
        it&apos;s safe to come back later.
      </p>
    </div>
  );
}
