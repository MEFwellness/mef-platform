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
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { flattenQuestions, findFirstUnanswered, getFlatIndex } from '@/lib/assessments/engine/navigation';
import { totalAnsweredCount } from '@/lib/assessments/engine/scoring';
import { completeMyAssessment, submitAssessmentAnswer } from '@/app/actions/assessments';
import { AssessmentProgressBar } from './AssessmentProgressBar';
import { QuestionCard } from './QuestionCard';
import type { Questionnaire, QuestionnaireAnswers } from '@/lib/assessments/engine/types';

type Props = {
  questionnaire: Questionnaire;
  assessmentId: string;
  initialAnswers: QuestionnaireAnswers;
  resumeCategoryId: string | null;
  resumeQuestionNumber: number | null;
};

const AUTO_ADVANCE_DELAY_MS = 350;

export function AssessmentTaker({
  questionnaire,
  assessmentId,
  initialAnswers,
  resumeCategoryId,
  resumeQuestionNumber,
}: Props) {
  const router = useRouter();
  const flat = useMemo(() => flattenQuestions(questionnaire), [questionnaire]);

  const startIndex = useMemo(() => {
    if (resumeCategoryId && resumeQuestionNumber != null) {
      try {
        return getFlatIndex(flat, resumeCategoryId, resumeQuestionNumber);
      } catch {
        // Stored resume position no longer resolves (e.g. stale after a
        // content edit) — fall through to the answers-based fallback below.
      }
    }
    const firstUnanswered = findFirstUnanswered(flat, initialAnswers);
    return firstUnanswered ? firstUnanswered.flatIndex : flat.length - 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [answers, setAnswers] = useState<QuestionnaireAnswers>(initialAnswers);
  const [flatIndex, setFlatIndex] = useState(startIndex);
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

  const current = flat[flatIndex]!;
  const isLast = flatIndex === flat.length - 1;
  const selectedOptionIndex = answers[current.category.id]?.[current.question.number];
  const sectionIndex = questionnaire.categories.findIndex((c) => c.id === current.category.id) + 1;
  const answeredCount = totalAnsweredCount(questionnaire, answers);

  function goNext() {
    clearPendingAdvance();
    setFlatIndex((i) => Math.min(i + 1, flat.length - 1));
  }

  function goPrev() {
    clearPendingAdvance();
    setFlatIndex((i) => Math.max(i - 1, 0));
  }

  function handleSelect(optionIndex: number) {
    setSaveError(null);
    setAnswers((prev) => ({
      ...prev,
      [current.category.id]: { ...prev[current.category.id], [current.question.number]: optionIndex },
    }));

    submitAssessmentAnswer(
      questionnaire.id,
      assessmentId,
      current.category.id,
      current.question.number,
      optionIndex
    ).then((result) => {
      if (!result.ok) setSaveError(result.error);
    });

    clearPendingAdvance();
    if (!isLast) {
      advanceTimer.current = setTimeout(() => {
        setFlatIndex((i) => Math.min(i + 1, flat.length - 1));
      }, AUTO_ADVANCE_DELAY_MS);
    }
  }

  function handleComplete() {
    startCompleting(async () => {
      const result = await completeMyAssessment(questionnaire.id, assessmentId);
      if (result) {
        router.push(`/assessments/${questionnaire.id}/results/${result.record.id}` as Route);
      } else {
        setSaveError('Something went wrong finishing your assessment. Please try again.');
      }
    });
  }

  return (
    <div>
      <AssessmentProgressBar
        currentNumber={flatIndex + 1}
        totalQuestions={flat.length}
        sectionLabel={current.category.name}
        sectionIndex={sectionIndex}
        sectionCount={questionnaire.categories.length}
      />

      <div className="mt-6">
        <QuestionCard
          key={current.flatIndex}
          categoryName={current.category.name}
          sectionPosition={`Section ${sectionIndex} of ${questionnaire.categories.length}`}
          question={current.question}
          selectedOptionIndex={selectedOptionIndex}
          onSelect={handleSelect}
        />
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
          disabled={flatIndex === 0}
          className="inline-flex items-center gap-1 rounded-2xl px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#F3F6F4] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Previous
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleComplete}
            disabled={selectedOptionIndex === undefined || isCompleting}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
          >
            {isCompleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            See my results
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={selectedOptionIndex === undefined}
            className="inline-flex items-center gap-1 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-[#6B7A72]">
        {answeredCount} of {flat.length} answered · Your progress is saved automatically, it&apos;s safe to
        come back later.
      </p>
    </div>
  );
}
