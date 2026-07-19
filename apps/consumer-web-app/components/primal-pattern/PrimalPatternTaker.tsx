'use client';

/**
 * One-question-per-screen Primal Pattern flow. Structurally parallel to
 * components/assessments/AssessmentTaker.tsx (same visual language, same
 * "auto-save on every interaction" discipline) but not a reuse of it:
 * that component is single-select and auto-advances the instant an
 * option is tapped, which doesn't fit a question where a member may
 * select BOTH letters. Here, toggling a letter saves immediately but only
 * Next/Skip/Finish advance the question — giving a member room to tap
 * both letters before moving on.
 *
 * Skipping is a first-class, always-available action (not just "leave it
 * blank and move on") — see lib/primal-pattern/store.ts's
 * skipPrimalPatternQuestion, which explicitly clears any prior answer so
 * a member can change their mind from "answered" to "skipped."
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  completeMyPrimalPatternAssessment,
  skipMyPrimalPatternQuestion,
  submitPrimalPatternAnswer,
} from '@/app/actions/primal-pattern';
import type {
  Letter,
  PrimalPatternAnswers,
  PrimalPatternQuestionnaire,
} from '@/lib/primal-pattern/types';

type Props = {
  questionnaire: PrimalPatternQuestionnaire;
  assessmentId: string;
  initialAnswers: PrimalPatternAnswers;
  resumeQuestionNumber: number | null;
};

export function PrimalPatternTaker({
  questionnaire,
  assessmentId,
  initialAnswers,
  resumeQuestionNumber,
}: Props) {
  const router = useRouter();
  const questions = useMemo(
    () => [...questionnaire.questions].sort((a, b) => a.number - b.number),
    [questionnaire]
  );

  const startIndex = useMemo(() => {
    if (resumeQuestionNumber != null) {
      const idx = questions.findIndex((q) => q.number === resumeQuestionNumber);
      if (idx !== -1) return idx;
    }
    return 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [answers, setAnswers] = useState<PrimalPatternAnswers>(initialAnswers);
  const [index, setIndex] = useState(startIndex);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCompleting, startCompleting] = useTransition();
  const savingRef = useRef(false);

  useEffect(() => {
    setSaveError(null);
  }, [index]);

  const current = questions[index]!;
  const isLast = index === questions.length - 1;
  const selected = answers[current.number] ?? [];
  const answeredCount = questions.filter((q) => (answers[q.number]?.length ?? 0) > 0).length;

  async function persist(letters: Letter[]) {
    savingRef.current = true;
    const result =
      letters.length === 0
        ? await skipMyPrimalPatternQuestion(assessmentId, current.number)
        : await submitPrimalPatternAnswer(assessmentId, current.number, letters);
    savingRef.current = false;
    if (!result.ok) setSaveError(result.error);
  }

  function toggleLetter(letter: Letter) {
    setSaveError(null);
    const next = selected.includes(letter)
      ? selected.filter((l) => l !== letter)
      : [...selected, letter];
    setAnswers((prev) => ({ ...prev, [current.number]: next }));
    void persist(next);
  }

  function handleSkip() {
    setSaveError(null);
    setAnswers((prev) => ({ ...prev, [current.number]: [] }));
    void persist([]);
    goNext();
  }

  function goNext() {
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  }

  function goPrev() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  function handleComplete() {
    startCompleting(async () => {
      const record = await completeMyPrimalPatternAssessment(assessmentId);
      if (record) {
        router.push(`/assessments/primal-pattern-diet-type/results/${record.id}` as Route);
      } else {
        setSaveError('Something went wrong finishing your assessment. Please try again.');
      }
    });
  }

  return (
    <div>
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-[#6B7A72]">
          <span>
            Question {index + 1} of {questions.length}
          </span>
          <span>{answeredCount} answered</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E3EBE6]">
          <div
            className="h-full rounded-full bg-[#1B3A2D] transition-all"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-6 rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-base font-medium leading-relaxed text-[#1B3A2D]">{current.prompt}</p>

        <div className="mt-4 space-y-3">
          {(['A', 'B'] as const).map((letter) => {
            const label = letter === 'A' ? current.optionA : current.optionB;
            const isSelected = selected.includes(letter);
            return (
              <button
                key={letter}
                type="button"
                onClick={() => toggleLetter(letter)}
                aria-pressed={isSelected}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left text-sm leading-relaxed transition ${
                  isSelected
                    ? 'border-[#1B3A2D] bg-[#F3F6F4] text-[#1B3A2D]'
                    : 'border-[#E3EBE6] text-[#1B3A2D] hover:bg-[#FAFAF8]'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isSelected ? 'bg-[#1B3A2D] text-white' : 'bg-[#F3F6F4] text-[#6B7A72]'
                  }`}
                >
                  {letter}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-[#6B7A72]">
          Choose whichever feels most true. You may select both if both apply, or skip if neither
          does.
        </p>
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
          disabled={index === 0}
          className="inline-flex items-center gap-1 rounded-2xl px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#F3F6F4] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Previous
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-2xl px-4 py-3 text-sm font-medium text-[#6B7A72] transition hover:bg-[#F3F6F4]"
          >
            Skip
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isCompleting}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
            >
              {isCompleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              See my results
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-1 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-[#6B7A72]">
        Your progress is saved automatically, it&apos;s safe to come back later.
      </p>
    </div>
  );
}
