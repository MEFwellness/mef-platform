'use client';

/**
 * WBSA's one-question-per-screen take flow — same UX discipline as
 * components/assessments/AssessmentTaker.tsx (optimistic local state,
 * fire-and-forget save with a brief auto-advance, explicit Back/Continue,
 * save-and-exit that awaits the in-flight save first), but built on the
 * Unified Adaptive Assessment Runtime's pure functions
 * (calculateVisibleQuestions/flattenVisibleQuestions) instead of the
 * generic engine's, since branching here is driven by real requires/
 * excludes/skip_rules conditions, not the old Rule vocabulary.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { UnifiedAssessmentQuestion, UnifiedAssessmentSection } from '@mef/shared-types-contracts';
import {
  calculateVisibleQuestions,
  findFirstUnanswered,
  flattenVisibleQuestions,
  type FlatQuestionRef,
} from '@/lib/assessment-runtime/session';
import type { AnswerValue, SessionAnswers } from '@/lib/assessment-runtime/types';
import { completeWbsaAssessmentAction, submitWbsaAnswerAction } from '@/app/actions/wbsa';
import { AssessmentProgressBar } from '@/components/assessments/AssessmentProgressBar';
import { WbsaQuestionCard } from './WbsaQuestionCard';
import { WBSA_COMPLETION_COPY, WBSA_DISPLAY_TITLE } from '@/lib/wbsa/copy';
import { CenterStage, Card } from '@/components/layout';
import { SuccessCheck } from '@/components/motion/SuccessCheck';
import { ROOT_FINISHING_LABEL } from '@/lib/reveal/copy';

type Props = {
  sessionId: string;
  sections: UnifiedAssessmentSection[];
  questions: UnifiedAssessmentQuestion[];
  initialAnswers: SessionAnswers;
  resumeQuestionKey: string | null;
};

const AUTO_ADVANCE_DELAY_MS = 350;

function sectionIndexFor(sections: UnifiedAssessmentSection[], ref: FlatQuestionRef): number {
  if (!ref.section) return 0;
  return sections
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .findIndex((s) => s.id === ref.section!.id);
}

export function WbsaTaker({ sessionId, sections, questions, initialAnswers, resumeQuestionKey }: Props) {
  const router = useRouter();

  const [answers, setAnswers] = useState<SessionAnswers>(initialAnswers);
  const flat = useMemo(() => {
    const { visible } = calculateVisibleQuestions(questions, answers);
    return flattenVisibleQuestions(sections, visible);
  }, [sections, questions, answers]);

  const startIndex = useMemo(() => {
    const { visible } = calculateVisibleQuestions(questions, initialAnswers);
    const initialFlat = flattenVisibleQuestions(sections, visible);
    if (resumeQuestionKey) {
      const index = initialFlat.findIndex((ref) => ref.question.question_key === resumeQuestionKey);
      if (index !== -1) return index;
    }
    const firstUnanswered = findFirstUnanswered(initialFlat, initialAnswers);
    if (firstUnanswered) {
      const index = initialFlat.findIndex((ref) => ref.question.question_key === firstUnanswered.question.question_key);
      if (index !== -1) return index;
    }
    return Math.max(initialFlat.length - 1, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [stepIndex, setStepIndex] = useState(startIndex);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCompleting, startCompleting] = useTransition();
  const [isExiting, setIsExiting] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<Promise<unknown> | null>(null);

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

  const current = flat[Math.min(stepIndex, flat.length - 1)];
  const isLast = stepIndex >= flat.length - 1;
  const sectionIndex = current ? sectionIndexFor(sections, current) + 1 : 1;
  const isAnswered = current ? answers[current.question.question_key] !== undefined : false;
  const answeredCount = flat.filter((ref) => answers[ref.question.question_key] !== undefined).length;
  const currentQuestionNumber = Math.min(stepIndex + 1, flat.length);

  function goNext() {
    clearPendingAdvance();
    setStepIndex((i) => Math.min(i + 1, flat.length - 1));
  }

  function goPrev() {
    clearPendingAdvance();
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function advanceAfterAnswer() {
    clearPendingAdvance();
    if (!isLast) {
      advanceTimer.current = setTimeout(() => {
        setStepIndex((i) => Math.min(i + 1, flat.length - 1));
      }, AUTO_ADVANCE_DELAY_MS);
    }
  }

  function handleAnswerChange(value: AnswerValue) {
    if (!current) return;
    const { question } = current;
    setSaveError(null);
    setAnswers((prev) => ({ ...prev, [question.question_key]: value }));

    pendingSaveRef.current = submitWbsaAnswerAction(sessionId, question.id, value)
      .then((result) => {
        if (!result.ok) setSaveError(result.error);
      })
      .catch(() => {
        setSaveError("Couldn't save that answer. Check your connection and try again.");
      });

    if (question.answer_type !== 'multi_select') advanceAfterAnswer();
  }

  function handleComplete() {
    startCompleting(async () => {
      try {
        if (pendingSaveRef.current) await pendingSaveRef.current;
        const result = await completeWbsaAssessmentAction(sessionId);
        if (result.ok) {
          setCompletedSessionId(result.session.id);
        } else {
          setSaveError(result.error);
        }
      } catch {
        setSaveError('Something went wrong finishing your assessment. Please try again.');
      }
    });
  }

  function handleSaveAndExit() {
    setIsExiting(true);
    (async () => {
      try {
        if (pendingSaveRef.current) await pendingSaveRef.current;
      } catch {
        // Leaving anyway — the overview page re-reads real state next.
      }
      router.push('/assessments/wbsa?saved=1' as Route);
      router.refresh();
    })();
  }

  if (isCompleting) {
    return (
      <CenterStage>
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#1B3A2D]" aria-hidden="true" />
          <p className="text-sm text-[#6B7A72]">{ROOT_FINISHING_LABEL}</p>
        </div>
      </CenterStage>
    );
  }

  if (completedSessionId) {
    return (
      <CenterStage>
        <Card className="mef-animate-in text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0EA] text-[#4F7A63]">
            <SuccessCheck size={56} color="#4F7A63" />
          </span>
          <p className="mt-5 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
            {WBSA_COMPLETION_COPY.heading}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{WBSA_COMPLETION_COPY.body}</p>

          <button
            type="button"
            onClick={() => router.push(`/assessments/wbsa/results/${completedSessionId}` as Route)}
            className="mef-press mef-focus-ring mt-7 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
          >
            View My Results
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard' as Route)}
            className="mef-press mef-focus-ring mt-3 block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
          >
            Return to Dashboard
          </button>
        </Card>
      </CenterStage>
    );
  }

  if (!current) {
    return null;
  }

  return (
    <div>
      <h1 className="sr-only">{WBSA_DISPLAY_TITLE}</h1>

      <button
        type="button"
        onClick={handleSaveAndExit}
        disabled={isExiting}
        className="mef-press mef-focus-ring inline-flex items-center gap-1 rounded-lg text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D] disabled:opacity-60"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {isExiting ? 'Saving…' : 'Save and exit'}
      </button>

      <div className="mt-5">
        <AssessmentProgressBar
          currentNumber={currentQuestionNumber}
          totalQuestions={flat.length}
          sectionLabel={current.section?.title ?? ''}
          sectionIndex={sectionIndex}
          sectionCount={sections.length}
        />

        <div className="mt-6">
          <WbsaQuestionCard
            key={current.question.question_key}
            sectionPosition={`Section ${sectionIndex} of ${sections.length}`}
            question={current.question}
            value={answers[current.question.question_key]}
            onChange={handleAnswerChange}
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
            disabled={stepIndex === 0}
            className="mef-press mef-focus-ring inline-flex items-center gap-1 rounded-2xl px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#F3F6F4] disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Previous
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={handleComplete}
              disabled={!isAnswered || isCompleting}
              className="mef-press mef-focus-ring inline-flex items-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
            >
              See my results
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!isAnswered}
              className="mef-press mef-focus-ring inline-flex items-center gap-1 rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
            >
              Continue
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-[#6B7A72]">
          {answeredCount} of {flat.length} answered · Your progress is saved automatically, it&apos;s
          safe to come back later.
        </p>
      </div>
    </div>
  );
}
