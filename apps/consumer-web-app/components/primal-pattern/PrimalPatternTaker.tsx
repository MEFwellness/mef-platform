'use client';

/**
 * Premium Primal Pattern take flow (Prompt 2). Same underlying contract
 * as Prompt 1's version — persist on every toggle, Skip clears an
 * answer, Next/Finish only ever advance already-saved state — but
 * redesigned around the "guided wellness experience, not a form" goal:
 * a resume banner on return, a live auto-save indicator instead of a
 * silent save, a percent-complete progress readout, and a fresh
 * mef-animate-in entrance on every question via a per-question `key`.
 *
 * No scoring, persistence, or resume-position logic changed here — see
 * lib/primal-pattern/store.ts (Prompt 1, not touched by this prompt).
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import {
  completeMyPrimalPatternAssessment,
  skipMyPrimalPatternQuestion,
  submitPrimalPatternAnswer,
} from '@/app/actions/primal-pattern';
import { PrimalPatternQuestionCard } from './PrimalPatternQuestionCard';
import { AutoSaveIndicator, type SaveStatus } from './AutoSaveIndicator';
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

const SAVED_INDICATOR_TIMEOUT_MS = 1500;
const RESUME_BANNER_TIMEOUT_MS = 5000;

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

  const isResuming = Object.keys(initialAnswers).length > 0 && startIndex > 0;
  const [showResumeBanner, setShowResumeBanner] = useState(isResuming);

  const [answers, setAnswers] = useState<PrimalPatternAnswers>(initialAnswers);
  const [index, setIndex] = useState(startIndex);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [isCompleting, startCompleting] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showResumeBanner) return;
    const timer = setTimeout(() => setShowResumeBanner(false), RESUME_BANNER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [showResumeBanner]);

  useEffect(() => {
    setError(null);
  }, [index]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const current = questions[index]!;
  const isLast = index === questions.length - 1;
  const selected = answers[current.number] ?? [];
  const answeredCount = questions.filter((q) => (answers[q.number]?.length ?? 0) > 0).length;
  const percentComplete = Math.round(((index + 1) / questions.length) * 100);

  function markSaved() {
    setSaveStatus('saved');
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveStatus('idle'), SAVED_INDICATOR_TIMEOUT_MS);
  }

  async function persist(letters: Letter[]) {
    setSaveStatus('saving');
    const result =
      letters.length === 0
        ? await skipMyPrimalPatternQuestion(assessmentId, current.number)
        : await submitPrimalPatternAnswer(assessmentId, current.number, letters);

    if (!result.ok) {
      setSaveStatus('error');
      setError({ message: result.error, retry: () => void persist(letters) });
    } else {
      markSaved();
    }
  }

  function toggleLetter(letter: Letter) {
    setError(null);
    const next = selected.includes(letter)
      ? selected.filter((l) => l !== letter)
      : [...selected, letter];
    setAnswers((prev) => ({ ...prev, [current.number]: next }));
    void persist(next);
  }

  function handleSkip() {
    setError(null);
    setAnswers((prev) => ({ ...prev, [current.number]: [] }));
    void persist([]);
    goNext();
  }

  function goNext() {
    setShowResumeBanner(false);
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  }

  function goPrev() {
    setShowResumeBanner(false);
    setIndex((i) => Math.max(i - 1, 0));
  }

  function handleComplete() {
    startCompleting(async () => {
      const record = await completeMyPrimalPatternAssessment(assessmentId);
      if (record) {
        router.push(`/assessments/primal-pattern-diet-type/results/${record.id}` as Route);
      } else {
        setError({
          message: 'Something went wrong finishing your assessment.',
          retry: handleComplete,
        });
      }
    });
  }

  return (
    <div>
      {showResumeBanner && (
        <div className="mef-animate-in mb-5 flex items-center gap-2.5 rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm text-[#1B3A2D]">
          <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Welcome back. Picking up right where you left off.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 text-xs font-medium text-[#6B7A72]">
          <span>
            Question {index + 1} of {questions.length}
          </span>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#EFE9DB]"
          role="progressbar"
          aria-valuenow={percentComplete}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Assessment progress"
        >
          <div
            className="h-full rounded-full bg-[#1B3A2D] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      </div>

      <div className="mt-6">
        <PrimalPatternQuestionCard question={current} selected={selected} onToggle={toggleLetter} />
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-3" role="alert">
          <p className="text-sm text-red-600">{error.message}</p>
          <button
            type="button"
            onClick={error.retry}
            className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold text-red-700 underline decoration-red-300 underline-offset-2 hover:text-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-7 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          className="inline-flex items-center gap-1 rounded-2xl px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#F3F6F4] active:scale-[0.97] disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100 motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Previous
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-2xl px-4 py-3 text-sm font-medium text-[#6B7A72] transition hover:bg-[#F3F6F4] active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
          >
            Skip
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isCompleting}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
            >
              {isCompleting && (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              See my results
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-1 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
            >
              Next
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-[#6B7A72]">
        {answeredCount} of {questions.length} answered · Your progress saves automatically,
        it&apos;s safe to come back later.
      </p>
    </div>
  );
}
