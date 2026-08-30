'use client';

/**
 * The Weekly Reflection, all three parts, on one route.
 *
 * THE ALREADY-DONE PANEL LIVES HERE, NOT ON THE PAGE, and that is not a
 * layout preference. Submitting calls a Server Action, and a Server Action
 * re-renders the route it was called from. When the page owned the
 * "pending vs completed" branch, that re-render swapped this component out
 * for the already-done panel the instant the write landed, so Part 3 was
 * on screen for a fraction of a second and the member went straight from
 * her last answer to "this week is done". Found live on production,
 * 2026-08-28, on the first verification run.
 *
 * With the branch inside this component, the re-render hands it a new
 * `status` prop while it stays MOUNTED, so its own `step` state survives
 * and Part 3 stands until she leaves it. The page passes the state down
 * and decides nothing.
 *
 * SEVEN SCREENS, ONE AT A TIME. Part 1 is the recap she reads. Part 2 is
 * the five questions, one per screen, because a page with five boxes on it
 * is a form and this is meant to be the quiet ten minutes of her week.
 * Part 3 is the closing confirmation.
 *
 * CONTINUE IS NEVER SILENTLY DEAD. Every question carries its own
 * blockedReason sentence (lib/weekly-reflection/questions.ts, which makes
 * a required question with no sentence unwritable), and that sentence is
 * shown above the disabled button. This is the same rule
 * components/checkin/CheckinWizard.tsx obeys, and it exists because a dead
 * Continue with nothing on screen explaining it was a real reported bug.
 *
 * SHE CAN ALWAYS LEAVE. Close is on every screen and goes to Home. Back is
 * on every screen after the first. Nothing here is a trap, and nothing is
 * saved until the last button, so leaving early loses the answers and
 * leaves the invitation standing for the rest of the window.
 *
 * NO PROGRESS BAR AND NO SCORE. Part 3 says thank you and says her coach
 * will read it. It does not read her answers back to her or analyse them,
 * because at this stage there is nothing true to say about them yet.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { WeeklyReflectionRecapBody } from './WeeklyReflectionRecapBody';
import { WEEKLY_REFLECTION_COPY, WEEKLY_REFLECTION_LABEL } from '@/lib/weekly-reflection/copy';
import {
  WEEKLY_REFLECTION_QUESTIONS,
  isAnswered,
  type ReflectionAnswerDraft,
  type ReflectionQuestion,
} from '@/lib/weekly-reflection/questions';
import { submitWeeklyReflectionAction } from '@/app/actions/weeklyReflection';
import type { RenderedRecap } from '@/lib/weekly-reflection/recap';
import type { WeeklyReflectionOffer } from '@/lib/weekly-reflection/service';

const RECAP_STEP = 0;
const FIRST_QUESTION_STEP = 1;
const CLOSING_STEP = FIRST_QUESTION_STEP + WEEKLY_REFLECTION_QUESTIONS.length;

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40';

export function WeeklyReflectionExperience({
  status,
  offer,
  recap,
}: {
  status: 'pending' | 'completed';
  /** Which route opened this week. It changes one sentence on the already-done screen and nothing else. */
  offer: WeeklyReflectionOffer;
  recap: RenderedRecap | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(RECAP_STEP);
  const [draft, setDraft] = useState<ReflectionAnswerDraft>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const question: ReflectionQuestion | null =
    step >= FIRST_QUESTION_STEP && step < CLOSING_STEP
      ? (WEEKLY_REFLECTION_QUESTIONS[step - FIRST_QUESTION_STEP] ?? null)
      : null;

  const isLastQuestion = step === CLOSING_STEP - 1;
  const answered = question ? isAnswered(question, draft[question.key]) : true;

  function leave() {
    router.push('/dashboard');
  }

  function setAnswer(key: string, value: number | string) {
    setError(null);
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function advance() {
    if (question && !answered) return;
    if (!isLastQuestion) {
      setStep((previous) => previous + 1);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await submitWeeklyReflectionAction(draft);
      if (!result.ok) {
        setError(result.error || WEEKLY_REFLECTION_COPY.submitError);
        return;
      }
      setStep(CLOSING_STEP);
      // Deliberately no router.refresh() here. Home is already correct on
      // arrival: the action revalidates /dashboard, and leave() navigates
      // there. Refreshing this route would only re-run the render that
      // this component's own header explains has to be survived.
    });
  }

  // A week she finished on an earlier visit, or one she opened again from
  // a link. She has not just submitted (step is still the first screen),
  // so this is the honest answer rather than a silent redirect.
  if (status === 'completed' && step !== CLOSING_STEP) {
    return (
      <div className={PANEL}>
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#C4A050]/16 blur-3xl"
          aria-hidden="true"
        />
        <p className="relative text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
          {WEEKLY_REFLECTION_LABEL}
        </p>
        <h1 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
          {WEEKLY_REFLECTION_COPY.alreadyDoneHeading}
        </h1>
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
          {offer === 'assigned'
            ? WEEKLY_REFLECTION_COPY.alreadyDoneBodyAssigned
            : WEEKLY_REFLECTION_COPY.alreadyDoneBody}
        </p>
        <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
          {WEEKLY_REFLECTION_COPY.closingDone}
        </button>
      </div>
    );
  }

  const eyebrow =
    step === RECAP_STEP
      ? WEEKLY_REFLECTION_COPY.recapEyebrow
      : step === CLOSING_STEP
        ? WEEKLY_REFLECTION_COPY.closingEyebrow
        : WEEKLY_REFLECTION_COPY.questionsEyebrow;

  return (
    <div className={PANEL}>
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#C4A050]/16 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {step > RECAP_STEP && step < CLOSING_STEP && (
            <button
              type="button"
              onClick={() => setStep((previous) => previous - 1)}
              disabled={isPending}
              aria-label={WEEKLY_REFLECTION_COPY.questionBack}
              className="mef-focus-ring mef-press -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/70 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {eyebrow}
          </p>
        </div>

        <button
          type="button"
          onClick={leave}
          disabled={isPending}
          aria-label={WEEKLY_REFLECTION_COPY.exitLabel}
          className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {step === RECAP_STEP && recap && (
        <div className="relative mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
            {WEEKLY_REFLECTION_COPY.recapHeading}
          </h1>
          <div className="mt-4">
            <WeeklyReflectionRecapBody recap={recap} tone="dark" />
          </div>
          <button type="button" onClick={advance} className={`${PRIMARY} mt-7`}>
            {WEEKLY_REFLECTION_COPY.recapContinue}
          </button>
        </div>
      )}

      {question && (
        <div className="relative mt-4">
          <p className="text-[11px] uppercase tracking-wider text-[#F5F0E4]/45">
            {`Question ${step} of ${WEEKLY_REFLECTION_QUESTIONS.length}`}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-tight text-[#F5F0E4]">
            {question.prompt}
          </h1>
          {question.hint && (
            <p className="mt-2 text-sm leading-relaxed text-[#F5F0E4]/60">{question.hint}</p>
          )}

          <div className="mt-5">
            {question.kind === 'scale' ? (
              <div role="radiogroup" aria-label={question.prompt} className="space-y-2">
                {question.options.map((option) => {
                  const selected = draft[question.key] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setAnswer(question.key, option.value)}
                      className={`mef-focus-ring mef-press flex w-full items-center justify-between rounded-2xl border px-5 py-3.5 text-left text-[15px] transition ${
                        selected
                          ? 'border-[#C4A050] bg-[#C4A050] font-semibold text-[#1B3A2D]'
                          : 'border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] text-[#F5F0E4] hover:bg-[#F5F0E4]/[0.12]'
                      }`}
                    >
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <textarea
                  value={String(draft[question.key] ?? '')}
                  onChange={(event) => setAnswer(question.key, event.target.value)}
                  maxLength={question.maxLength}
                  rows={5}
                  aria-label={question.prompt}
                  className="w-full resize-none rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4 text-[16px] leading-relaxed text-[#F5F0E4] placeholder:text-[#F5F0E4]/35 focus:border-[#C4A050] focus:outline-none"
                />
                <p className="mt-2 text-right text-[11px] text-[#F5F0E4]/40">
                  {`${String(draft[question.key] ?? '').length} of ${question.maxLength}`}
                </p>
              </>
            )}
          </div>

          {/* The sentence that makes a disabled Continue explainable. */}
          {!answered && (
            <p className="mt-5 text-sm text-[#C4A050]">{question.blockedReason}</p>
          )}
          {error && <p className="mt-3 text-sm text-[#F5B7A0]">{error}</p>}

          <button
            type="button"
            onClick={advance}
            disabled={!answered || isPending}
            className={`${PRIMARY} ${answered ? 'mt-5' : 'mt-3'}`}
          >
            {isLastQuestion
              ? WEEKLY_REFLECTION_COPY.questionSubmit
              : WEEKLY_REFLECTION_COPY.questionContinue}
          </button>
        </div>
      )}

      {step === CLOSING_STEP && (
        <div className="relative mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
            {WEEKLY_REFLECTION_COPY.closingHeading}
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
            {WEEKLY_REFLECTION_COPY.closingBody}
          </p>
          <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
            {WEEKLY_REFLECTION_COPY.closingDone}
          </button>
        </div>
      )}
    </div>
  );
}
