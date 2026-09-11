'use client';

/**
 * The generic points-scored questionnaire's answering flow.
 *
 * TWO OR THREE QUESTIONS PER SCREEN (2026-09-11). It used to be one
 * question per screen with an auto-advance after every tap, which made a
 * fifty-four question instrument fifty-four screens that changed under her
 * thumb. A screen now carries a small group of related questions from one
 * section and nothing moves until she presses Continue, so she can read
 * two things side by side, change her mind about the first one, and decide
 * herself when she is done with the screen. `lib/questionnaire/groups.ts`
 * owns the sizes, including the rule that stops a section ending on a
 * screen with one lonely question.
 *
 * NOTHING ABOUT SCORING CHANGED, AND NOTHING HERE COMPUTES ONE. Every tap
 * still optimistically updates local state and fires the same best-effort
 * save to the same Server Action (submitAssessmentAnswer), one answer at a
 * time, with the same keys and the same values. Only completeMyAssessment,
 * called once at the very end, invokes the scoring engine, and it happens
 * entirely server-side. This file has never seen a score and still does
 * not.
 *
 * Steps: a questionnaire's take flow is a sequence of "steps," each either
 * a scored question or, for a questionnaire that declares
 * `contextQuestions`, a one-time intake prompt gating a category's
 * conditional questions. `steps` is rebuilt whenever `context` changes
 * (via `isQuestionActive`), so answering a context question immediately
 * reveals only the questions that apply, without the member ever seeing
 * or needing to skip past one that doesn't. This is a complete no-op for
 * a questionnaire that never declares `contextQuestions`: `steps` then
 * reduces to exactly the flattened question list, and `context` stays
 * `{}` for the life of the component.
 *
 * Groups: steps are then cut into screens. A context prompt always gets a
 * screen to itself, because answering it changes which questions exist and
 * grouping it with two of them would rewrite the screen underneath her
 * thumb. Question steps are grouped within one category only, so a screen
 * never straddles two sections and the section transition always falls
 * between two screens.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronLeft, Loader2 } from 'lucide-react';
import { flattenQuestions, type FlatQuestionRef } from '@/lib/assessments/engine/navigation';
import { isQuestionActive } from '@/lib/assessments/engine/scoring';
import { toPublicSlug } from '@/lib/assessments/publicSlug';
import { chunkIntoGroups } from '@/lib/questionnaire/groups';
import { useScreenTop } from '@/lib/questionnaire/useScreenTop';
import { prefersReducedMotionNow } from '@/lib/motion/useReducedMotion';
import {
  completeMyAssessment,
  submitAssessmentAnswer,
  submitAssessmentContext,
} from '@/app/actions/assessments';
import { AssessmentProgressBar } from './AssessmentProgressBar';
import { QuestionCard } from './QuestionCard';
import { ContextQuestionCard } from './ContextQuestionCard';
import {
  SectionTransition,
  SECTION_TRANSITION_MS,
} from '@/components/questionnaire/SectionTransition';
import { CenterStage, Card } from '@/components/layout';
import { SuccessCheck } from '@/components/motion/SuccessCheck';
import { ROOT_FINISHING_LABEL } from '@/lib/reveal/copy';
import type {
  AssessmentContext,
  Questionnaire,
  QuestionnaireAnswers,
} from '@/lib/assessments/engine/types';
import type { AssessmentResult } from '@/lib/assessments/types';

type Props = {
  questionnaire: Questionnaire;
  /** The welcome/results display name (AssessmentCopy.displayTitle) — used only for the completion screen's copy, e.g. "Your Four Doctors Assessment has been successfully saved." */
  displayTitle: string;
  assessmentId: string;
  initialAnswers: QuestionnaireAnswers;
  /** Optional — only meaningful for a questionnaire that declares `contextQuestions`. Defaults to `{}`, so callers for every other questionnaire can omit it entirely. */
  initialContext?: AssessmentContext;
  resumeCategoryId: string | null;
  resumeQuestionNumber: number | null;
};

/** The line under a Continue she cannot press yet. */
function blockedHint(questionCount: number): string {
  return questionCount > 1
    ? 'Choose an answer for each question to continue.'
    : 'Choose an answer to continue.';
}

type Step =
  | { kind: 'question'; ref: FlatQuestionRef }
  | { kind: 'context'; contextQuestion: NonNullable<Questionnaire['contextQuestions']>[number] };

type Group = {
  steps: Step[];
  categoryId: string;
  /** Which question, counting from one across the whole questionnaire, the first question on this screen is. */
  firstQuestionNumber: number;
  /** The last one. Equal to the first when the screen holds a single question. */
  lastQuestionNumber: number;
};

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

function categoryIdOf(step: Step): string {
  return step.kind === 'question' ? step.ref.category.id : step.contextQuestion.categoryId;
}

/**
 * The steps, cut into the screens they are shown on.
 *
 * A context prompt is always a screen of its own. Question steps are
 * chunked inside one category at a time, so a screen never straddles two
 * sections.
 */
export function buildGroups(steps: Step[]): Group[] {
  const groups: Group[] = [];
  const questionCount = steps.filter((step) => step.kind === 'question').length;
  let answeredSoFar = 0;
  let index = 0;

  while (index < steps.length) {
    const step = steps[index]!;
    const categoryId = categoryIdOf(step);

    if (step.kind === 'context') {
      groups.push({
        steps: [step],
        categoryId,
        // A context prompt is not scored, so it borrows the number of the
        // question it is about to unlock rather than claiming one of its own.
        firstQuestionNumber: Math.min(answeredSoFar + 1, Math.max(1, questionCount)),
        lastQuestionNumber: Math.min(answeredSoFar + 1, Math.max(1, questionCount)),
      });
      index += 1;
      continue;
    }

    const run: Step[] = [];
    while (index < steps.length) {
      const candidate = steps[index]!;
      if (candidate.kind !== 'question' || categoryIdOf(candidate) !== categoryId) break;
      run.push(candidate);
      index += 1;
    }

    for (const chunk of chunkIntoGroups(run)) {
      groups.push({
        steps: chunk,
        categoryId,
        firstQuestionNumber: answeredSoFar + 1,
        lastQuestionNumber: answeredSoFar + chunk.length,
      });
      answeredSoFar += chunk.length;
    }
  }

  return groups;
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

/** Which screen a step index falls on. */
function groupIndexForStep(groups: Group[], steps: Step[], stepIndex: number): number {
  const target = steps[stepIndex];
  if (!target) return Math.max(0, groups.length - 1);
  const found = groups.findIndex((group) => group.steps.includes(target));
  return found === -1 ? 0 : found;
}

export function AssessmentTaker({
  questionnaire,
  displayTitle,
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
  const groups = useMemo(() => buildGroups(steps), [steps]);

  const startIndex = useMemo(() => {
    const initialSteps = buildSteps(questionnaire, flat, initialContext);
    const initialGroups = buildGroups(initialSteps);
    const resolveStep = () => {
      if (resumeCategoryId && resumeQuestionNumber != null) {
        const index = findStepIndexForQuestion(initialSteps, resumeCategoryId, resumeQuestionNumber);
        if (index !== -1) return index;
      }
      const firstUnansweredStep = initialSteps.findIndex(
        (step) => !isStepAnswered(step, initialAnswers, initialContext)
      );
      return firstUnansweredStep !== -1 ? firstUnansweredStep : initialSteps.length - 1;
    };
    return groupIndexForStep(initialGroups, initialSteps, resolveStep());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCompleting, startCompleting] = useTransition();
  const [isExiting, setIsExiting] = useState(false);
  /**
   * The section beat, while it is playing. Holds the screen it is on its
   * way to, so the timer landing is the only thing that moves her.
   */
  const [transitionTo, setTransitionTo] = useState<number | null>(null);
  /** Set once completeMyAssessment succeeds — switches the whole component into the completion-choice screen (View My Results / Back to Home) instead of auto-navigating, so a member decides when to see their results. */
  const [completedResult, setCompletedResult] = useState<AssessmentResult | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The most recent in-flight submitAssessmentAnswer/submitAssessmentContext
   * call. Every save is fire-and-forget from the tapping member's point of
   * view (see handleSelectOption/handleSelectContext below — nothing awaits
   * it there, so her tap is never blocked), but completing the
   * assessment is not allowed to race it: handleComplete awaits this before
   * calling completeMyAssessment, so a member who answers the very last
   * question and immediately taps "See my results" can never have the
   * server check completeness before that last answer has actually landed.
   */
  const pendingSaveRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, []);

  const safeIndex = Math.min(groupIndex, Math.max(0, groups.length - 1));
  const current = groups[safeIndex] ?? groups[0];
  const isLast = safeIndex >= groups.length - 1;
  const currentCategory = questionnaire.categories.find((c) => c.id === current?.categoryId);
  const sectionIndex = questionnaire.categories.findIndex((c) => c.id === current?.categoryId) + 1;
  const isAnswered = (current?.steps ?? []).every((step) => isStepAnswered(step, answers, context));
  const totalQuestionSteps = steps.filter((s) => s.kind === 'question').length;

  useScreenTop(transitionTo !== null ? 'section-transition' : `group-${safeIndex}`);

  function goNext() {
    if (!isAnswered || transitionTo !== null) return;
    const next = Math.min(safeIndex + 1, groups.length - 1);
    if (next === safeIndex) return;

    const crossesSection = groups[next]?.categoryId !== current?.categoryId;
    // Reduced motion skips the beat entirely rather than playing it
    // without motion: the honest reading of the setting for a decorative
    // pause is not to make her wait at all.
    if (!crossesSection || prefersReducedMotionNow()) {
      setGroupIndex(next);
      return;
    }

    setTransitionTo(next);
    transitionTimer.current = setTimeout(() => {
      transitionTimer.current = null;
      setGroupIndex(next);
      setTransitionTo(null);
    }, SECTION_TRANSITION_MS);
  }

  function goPrev() {
    if (transitionTo !== null) return;
    setGroupIndex((i) => Math.max(i - 1, 0));
  }

  function handleSelectOption(ref: FlatQuestionRef, optionIndex: number) {
    const { category, question } = ref;
    setSaveError(null);
    setAnswers((prev) => ({
      ...prev,
      [category.id]: { ...prev[category.id], [question.number]: optionIndex },
    }));

    pendingSaveRef.current = submitAssessmentAnswer(
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
  }

  function handleSelectContext(key: string, value: string) {
    setSaveError(null);
    setContext((prev) => ({ ...prev, [key]: value }));

    pendingSaveRef.current = submitAssessmentContext(questionnaire.id, assessmentId, key, value)
      .then((result) => {
        if (!result.ok) setSaveError(result.error);
      })
      .catch(() => {
        setSaveError("Couldn't save that answer. Check your connection and try again.");
      });
  }

  function handleComplete() {
    startCompleting(async () => {
      try {
        // Wait for the last answer's save to actually land before asking the
        // server to check completeness — otherwise a fast tap on "See my
        // results" right after the final answer can lose this exact race and
        // fail with "unanswered questions" even though the member answered
        // everything.
        if (pendingSaveRef.current) {
          await pendingSaveRef.current;
        }
        const result = await completeMyAssessment(questionnaire.id, assessmentId);
        if (result) {
          // Show the completion screen and let the member choose when to see
          // results, rather than forcing navigation straight there.
          setCompletedResult(result);
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

  function handleSaveAndExit() {
    setIsExiting(true);
    (async () => {
      try {
        // Same discipline as handleComplete: never leave the last answer's
        // save still in flight when the member navigates away.
        if (pendingSaveRef.current) {
          await pendingSaveRef.current;
        }
      } catch {
        // A save failure here doesn't block exiting, the member is leaving
        // anyway, and the overview page's own fresh read of the DB (not this
        // client's optimistic state) is what it shows next.
      }
      router.push(`/assessments/${toPublicSlug(questionnaire.id)}?saved=1` as Route);
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

  if (completedResult) {
    return (
      <CenterStage>
        <Card className="mef-animate-in text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0EA] text-[#4F7A63]">
            <SuccessCheck size={56} color="#4F7A63" />
          </span>
          <p className="mt-5 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
            Assessment Complete
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
            Your {displayTitle} has been successfully saved.
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/assessments/${toPublicSlug(questionnaire.id)}/results/${completedResult.record.id}` as Route
              )
            }
            className="mef-press mef-focus-ring mt-7 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
          >
            View My Results
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard' as Route)}
            className="mef-press mef-focus-ring mt-3 block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
          >
            Back to Home
          </button>
        </Card>
      </CenterStage>
    );
  }

  if (transitionTo !== null) {
    const nextCategory = questionnaire.categories.find(
      (c) => c.id === groups[transitionTo]?.categoryId
    );
    return (
      <Card className="mef-screen-enter mt-5">
        <SectionTransition
          tone="light"
          nextLine={
            nextCategory ? `Next, we'll look at ${nextCategory.name}.` : "Next, we'll look at another area."
          }
        />
      </Card>
    );
  }

  return (
    <div>
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
          tone="gold"
          currentNumber={current?.firstQuestionNumber ?? 1}
          throughNumber={current?.lastQuestionNumber}
          totalQuestions={totalQuestionSteps}
          sectionLabel={currentCategory?.name}
          sectionIndex={sectionIndex}
          sectionCount={questionnaire.categories.length}
        />

        <Card key={`group-${safeIndex}`} className="mef-screen-enter mt-6">
          <ol className="list-none">
            {(current?.steps ?? []).map((step, index) =>
              step.kind === 'context' ? (
                <ContextQuestionCard
                  key={`context-${step.contextQuestion.key}`}
                  contextQuestion={step.contextQuestion}
                  selectedValue={context[step.contextQuestion.key]}
                  onSelect={(value) => handleSelectContext(step.contextQuestion.key, value)}
                  withDivider={index > 0}
                />
              ) : (
                <QuestionCard
                  key={`question-${step.ref.category.id}-${step.ref.question.number}`}
                  position={(current?.firstQuestionNumber ?? 1) + index}
                  categoryId={step.ref.category.id}
                  question={step.ref.question}
                  selectedOptionIndex={answers[step.ref.category.id]?.[step.ref.question.number]}
                  onSelect={(optionIndex) => handleSelectOption(step.ref, optionIndex)}
                  withDivider={index > 0}
                />
              )
            )}
          </ol>
        </Card>

        {saveError && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {saveError}
          </p>
        )}

        {!isAnswered && (
          <p className="mt-4 text-center text-sm text-[#6B7A72]">
            {blockedHint(current?.steps.length ?? 1)}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          {safeIndex > 0 && (
            <button
              type="button"
              onClick={goPrev}
              className="mef-press mef-focus-ring inline-flex shrink-0 items-center gap-1 rounded-2xl border border-[#1B3A2D]/12 px-4 py-3.5 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Back
            </button>
          )}

          {isLast ? (
            <button
              type="button"
              onClick={handleComplete}
              disabled={!isAnswered || isCompleting}
              className="mef-press mef-focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#C4A050] px-6 py-3.5 text-sm font-semibold text-[#173025] shadow-[0_10px_24px_-14px_rgba(176,143,62,0.9)] transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-[#1B3A2D]/10 disabled:text-[#1B3A2D]/40 disabled:shadow-none"
            >
              See my results
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!isAnswered}
              className="mef-press mef-focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#C4A050] px-6 py-3.5 text-sm font-semibold text-[#173025] shadow-[0_10px_24px_-14px_rgba(176,143,62,0.9)] transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-[#1B3A2D]/10 disabled:text-[#1B3A2D]/40 disabled:shadow-none"
            >
              Continue
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>

        {/*
          THE COUNT MOVED UP INTO THE PROGRESS LINE. Saying "12 of 54
          answered" here beside "Questions 4 to 6 of 54" up there is two
          numbers counting two different things on one screen, which is
          exactly the confusion the house rule about one source per number
          is for. What is left is the reassurance, which is the only part
          of this line that was not already said above.
        */}
        <p className="mt-4 text-center text-xs text-[#6B7A72]">
          Your progress is saved automatically, it&apos;s safe to come back later.
        </p>
      </div>
    </div>
  );
}
