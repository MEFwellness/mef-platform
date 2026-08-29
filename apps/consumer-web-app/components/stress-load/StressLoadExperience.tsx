'use client';

/**
 * The Stress & Load Deep-Dive, whole, on one route.
 *
 * THE ALREADY-DONE PANEL LIVES HERE, NOT ON THE PAGE, and that is not a
 * layout preference. Submitting calls a Server Action, and a Server Action
 * re-renders the route it was called from. When the Weekly Reflection's
 * page owned the "pending vs completed" branch, that re-render swapped the
 * experience out for the already-done panel the instant the write landed,
 * so its closing screen was on screen for a fraction of a second. Found
 * live on production, 2026-08-28. With the branch inside this component,
 * the re-render hands it a new `status` prop while it stays MOUNTED, so its
 * own `step` survives and her reading stands until she leaves it.
 *
 * FOURTEEN SCREENS, ONE AT A TIME. Eleven questions, then what Root found,
 * then one small thing built from her own answer, then the closing screen
 * with the piece she can read. One question per screen because a page with
 * eleven boxes on it is a form, and this is meant to be the one sitting
 * that feeds her next coaching session.
 *
 * CONTINUE IS NEVER SILENTLY DEAD. Every question carries its own
 * blockedReason sentence (lib/stress-load/questions.ts, which makes a
 * required question with no sentence unwritable), and that sentence is
 * shown above the disabled button. Same rule components/checkin/CheckinWizard.tsx
 * and the Weekly Reflection both obey.
 *
 * SHE CAN ALWAYS LEAVE. Close is on every screen and goes to Home. Back is
 * on every screen after the first question. Nothing is saved until the
 * submit, so leaving early loses the answers and leaves the invitation
 * standing, which is exactly what the assignment is for.
 *
 * TWO QUESTIONS ARE BUILT FROM HER OWN EARLIER ANSWERS, and the options
 * come from lib/stress-load/questions.ts's derivedOptionsFor rather than
 * from anything this component decides, so Q3 and Q8 can only ever offer
 * her what she actually picked.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import {
  STRESS_LOAD_QUESTIONS,
  blockedReasonFor,
  derivedOptionsFor,
  isAnswered,
  multiAnswerOf,
  OTHER_VALUE,
  STRESS_LOAD_OTHER_MAX_LENGTH,
  type MultiAnswer,
  type StressLoadAnswers,
  type StressLoadDraft,
  type StressLoadOption,
  type StressLoadQuestion,
} from '@/lib/stress-load/questions';
import { STRESS_LOAD_COPY, STRESS_LOAD_LABEL, sectionFor } from '@/lib/stress-load/copy';
import { buildStressLoadExperiment } from '@/lib/stress-load/experiment';
import type { StressLoadInterpretation } from '@/lib/stress-load/crossReference';
import {
  startStressLoadExperimentAction,
  submitStressLoadDeepDiveAction,
} from '@/app/actions/stressLoad';
import { StressLoadReadingBody } from './StressLoadReadingBody';
import { StressLoadResource } from './StressLoadResource';

const FIRST_QUESTION_STEP = 0;
const READING_STEP = STRESS_LOAD_QUESTIONS.length;
const EXPERIMENT_STEP = READING_STEP + 1;
const CLOSING_STEP = READING_STEP + 2;

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40';
const SECONDARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl border border-[#F5F0E4]/25 px-6 py-3 text-sm font-semibold text-[#F5F0E4] transition hover:bg-[#F5F0E4]/10 disabled:opacity-40';
const OPTION_BASE =
  'mef-focus-ring mef-press flex w-full items-center justify-between rounded-2xl border px-5 py-3.5 text-left text-[15px] transition';
const OPTION_ON = 'border-[#C4A050] bg-[#C4A050] font-semibold text-[#1B3A2D]';
const OPTION_OFF =
  'border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] text-[#F5F0E4] hover:bg-[#F5F0E4]/[0.12]';

type Finished = {
  sessionId: string;
  answers: StressLoadAnswers;
  interpretation: StressLoadInterpretation;
};

export function StressLoadExperience({
  status,
  completed,
}: {
  status: 'pending' | 'completed';
  /** Her most recent finished sitting, when she is opening a route she has already answered. */
  completed: Finished | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(FIRST_QUESTION_STEP);
  const [draft, setDraft] = useState<StressLoadDraft>({});
  const [finished, setFinished] = useState<Finished | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [experimentNote, setExperimentNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const question: StressLoadQuestion | null =
    step >= FIRST_QUESTION_STEP && step < READING_STEP
      ? (STRESS_LOAD_QUESTIONS[step] ?? null)
      : null;

  const answered = question ? isAnswered(question, draft[question.key], draft) : true;
  const blockedReason = question ? blockedReasonFor(question, draft) : null;
  const isLastQuestion = step === READING_STEP - 1;

  const experimentOffer = useMemo(
    () => (finished ? buildStressLoadExperiment(finished.answers) : null),
    [finished]
  );

  function leave() {
    router.push('/dashboard');
  }

  function setAnswer(key: string, value: number | string | MultiAnswer) {
    setError(null);
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  /**
   * Toggling a multi-select, preserving the ORDER she picked in.
   *
   * The order is a real answer, not an implementation detail: Q9's own hint
   * tells her the first thing she picks is the one Root builds the
   * experiment from, and Q3 and Q8 offer her selections back in the same
   * order she made them.
   */
  function toggleMulti(question: StressLoadQuestion, value: string) {
    const current = multiAnswerOf(draft, question.key);
    const selected = current.selected.includes(value)
      ? current.selected.filter((entry) => entry !== value)
      : [...current.selected, value];

    // Dropping "Something else" drops the words that went with it, so a
    // stale sentence can never travel to the next screen as a button label.
    const otherText = selected.includes(OTHER_VALUE) ? current.otherText : null;
    const next: MultiAnswer = { selected, otherText };
    setAnswer(question.key, next);

    // A derived question can only ever offer what its source still holds.
    // Clearing the dependent answer here is what stops "the one that
    // follows you home" pointing at a source she has just unticked.
    for (const dependent of STRESS_LOAD_QUESTIONS) {
      if (dependent.kind !== 'derived_single' || dependent.sourceKey !== question.key) continue;
      const chosen = draft[dependent.key];
      if (typeof chosen === 'string' && !selected.includes(chosen)) {
        setDraft((previous) => {
          const copy = { ...previous };
          delete copy[dependent.key];
          return copy;
        });
      }
    }
  }

  function advance() {
    if (question && !answered) return;
    if (!isLastQuestion) {
      setStep((previous) => previous + 1);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await submitStressLoadDeepDiveAction(draft);
      if (!result.ok) {
        setError(result.error || STRESS_LOAD_COPY.submitError);
        return;
      }
      setFinished({
        sessionId: result.sessionId,
        answers: result.answers,
        interpretation: result.interpretation,
      });
      setStep(READING_STEP);
    });
  }

  function acceptExperiment() {
    if (!finished) return;
    setError(null);
    startTransition(async () => {
      const result = await startStressLoadExperimentAction(finished.sessionId);
      setExperimentNote(result.ok ? STRESS_LOAD_COPY.experimentStarted : result.error);
      setStep(CLOSING_STEP);
    });
  }

  function declineExperiment() {
    setExperimentNote(STRESS_LOAD_COPY.experimentDeclined);
    setStep(CLOSING_STEP);
  }

  // A sitting she finished on an earlier visit, or one she opened again
  // from a link. She has not just submitted (nothing is in `finished`), so
  // this is the honest answer rather than a silent redirect.
  if (status === 'completed' && !finished) {
    return (
      <div className={PANEL}>
        <Glow />
        <Eyebrow text={STRESS_LOAD_LABEL} />
        <h1 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
          {STRESS_LOAD_COPY.alreadyDoneHeading}
        </h1>
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
          {STRESS_LOAD_COPY.alreadyDoneBody}
        </p>
        {completed && (
          <div className="relative mt-6">
            <StressLoadReadingBody
              interpretation={completed.interpretation}
              answers={completed.answers}
              tone="dark"
            />
          </div>
        )}
        <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
          {STRESS_LOAD_COPY.closingDone}
        </button>
      </div>
    );
  }

  const section = question ? sectionFor(question.screen) : null;
  const eyebrow =
    step === READING_STEP
      ? STRESS_LOAD_COPY.readingEyebrow
      : step === EXPERIMENT_STEP
        ? STRESS_LOAD_COPY.experimentEyebrow
        : step === CLOSING_STEP
          ? STRESS_LOAD_COPY.closingEyebrow
          : (section?.name ?? STRESS_LOAD_LABEL);

  // The section's own opening line, shown on the first question of each of
  // the three sections. It is the approved heading for that screen, and it
  // is where it belongs rather than on a screen of its own that would cost
  // her three extra taps.
  const showsSectionHeading =
    question !== null &&
    (step === 0 || STRESS_LOAD_QUESTIONS[step - 1]?.screen !== question.screen);

  return (
    <div className={PANEL}>
      <Glow />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {step > FIRST_QUESTION_STEP && step < READING_STEP && (
            <button
              type="button"
              onClick={() => setStep((previous) => previous - 1)}
              disabled={isPending}
              aria-label={STRESS_LOAD_COPY.questionBack}
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
          aria-label={STRESS_LOAD_COPY.exitLabel}
          className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {question && (
        <div className="relative mt-4">
          <p className="text-[11px] uppercase tracking-wider text-[#F5F0E4]/45">
            {`Question ${step + 1} of ${STRESS_LOAD_QUESTIONS.length}`}
          </p>

          {showsSectionHeading && section && (
            <p className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-[22px] leading-snug text-[#C4A050]">
              {section.heading}
            </p>
          )}

          <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-tight text-[#F5F0E4]">
            {question.prompt}
          </h1>
          {question.hint && (
            <p className="mt-2 text-sm leading-relaxed text-[#F5F0E4]/60">{question.hint}</p>
          )}

          <div className="mt-5">
            <QuestionBody
              question={question}
              draft={draft}
              onSet={setAnswer}
              onToggle={toggleMulti}
            />
          </div>

          {/* The sentence that makes a disabled Continue explainable. */}
          {blockedReason && <p className="mt-5 text-sm text-[#C4A050]">{blockedReason}</p>}
          {error && <p className="mt-3 text-sm text-[#F5B7A0]">{error}</p>}

          <button
            type="button"
            onClick={advance}
            disabled={!answered || isPending}
            className={`${PRIMARY} ${blockedReason ? 'mt-3' : 'mt-5'}`}
          >
            {isLastQuestion ? STRESS_LOAD_COPY.questionSubmit : STRESS_LOAD_COPY.questionContinue}
          </button>
        </div>
      )}

      {step === READING_STEP && finished && (
        <div className="relative mt-4">
          <StressLoadReadingBody
            interpretation={finished.interpretation}
            answers={finished.answers}
            tone="dark"
          />
          <button
            type="button"
            onClick={() => setStep(experimentOffer ? EXPERIMENT_STEP : CLOSING_STEP)}
            className={`${PRIMARY} mt-7`}
          >
            {STRESS_LOAD_COPY.questionContinue}
          </button>
        </div>
      )}

      {step === EXPERIMENT_STEP && experimentOffer && (
        <div className="relative mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-tight text-[#F5F0E4]">
            {experimentOffer.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#F5F0E4]/60">
            {STRESS_LOAD_COPY.experimentIntro}
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
            {experimentOffer.action}
          </p>
          <div className="mt-4 rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
              {STRESS_LOAD_COPY.experimentHardDayLabel}
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#F5F0E4]/85">
              {experimentOffer.hardDay}
            </p>
          </div>
          {error && <p className="mt-3 text-sm text-[#F5B7A0]">{error}</p>}
          <button
            type="button"
            onClick={acceptExperiment}
            disabled={isPending}
            className={`${PRIMARY} mt-6`}
          >
            {STRESS_LOAD_COPY.experimentAccept}
          </button>
          <button
            type="button"
            onClick={declineExperiment}
            disabled={isPending}
            className={`${SECONDARY} mt-3`}
          >
            {STRESS_LOAD_COPY.experimentDecline}
          </button>
        </div>
      )}

      {step === CLOSING_STEP && (
        <div className="relative mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
            {STRESS_LOAD_COPY.closingHeading}
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
            {STRESS_LOAD_COPY.closingBody}
          </p>
          {experimentNote && (
            <p className="mt-3 text-[15px] leading-relaxed text-[#C4A050]">{experimentNote}</p>
          )}
          <div className="mt-6">
            <StressLoadResource />
          </div>
          <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
            {STRESS_LOAD_COPY.closingDone}
          </button>
        </div>
      )}
    </div>
  );
}

function Glow() {
  return (
    <div
      className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#C4A050]/16 blur-3xl"
      aria-hidden="true"
    />
  );
}

function Eyebrow({ text }: { text: string }) {
  return (
    <p className="relative text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
      {text}
    </p>
  );
}

/** One question's controls. Five kinds, and the derived one reads its options from her own earlier answer rather than from a list of its own. */
function QuestionBody({
  question,
  draft,
  onSet,
  onToggle,
}: {
  question: StressLoadQuestion;
  draft: StressLoadDraft;
  onSet: (key: string, value: number | string | MultiAnswer) => void;
  onToggle: (question: StressLoadQuestion, value: string) => void;
}) {
  if (question.kind === 'scale') {
    return (
      <div role="radiogroup" aria-label={question.prompt} className="space-y-2">
        {question.options.map((option) => {
          const value = Number(option.value);
          const selected = draft[question.key] === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSet(question.key, value)}
              className={`${OPTION_BASE} ${selected ? OPTION_ON : OPTION_OFF}`}
            >
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (question.kind === 'single') {
    const chosen = draft[question.key];
    return (
      <div role="radiogroup" aria-label={question.prompt} className="space-y-2">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen === option.value}
            onClick={() => onSet(question.key, option.value)}
            className={`${OPTION_BASE} ${chosen === option.value ? OPTION_ON : OPTION_OFF}`}
          >
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (question.kind === 'derived_single') {
    const options: StressLoadOption[] = derivedOptionsFor(question, draft);
    const chosen = draft[question.key];
    return (
      <div role="radiogroup" aria-label={question.prompt} className="space-y-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen === option.value}
            onClick={() => onSet(question.key, option.value)}
            className={`${OPTION_BASE} ${chosen === option.value ? OPTION_ON : OPTION_OFF}`}
          >
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (question.kind === 'multi') {
    const answer = multiAnswerOf(draft, question.key);
    return (
      <div className="space-y-2">
        {question.options.map((option) => {
          const selected = answer.selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => onToggle(question, option.value)}
              className={`${OPTION_BASE} ${selected ? OPTION_ON : OPTION_OFF}`}
            >
              <span>{option.label}</span>
            </button>
          );
        })}

        {question.allowsOther && answer.selected.includes(OTHER_VALUE) && (
          <input
            type="text"
            value={answer.otherText ?? ''}
            onChange={(event) =>
              onSet(question.key, { selected: answer.selected, otherText: event.target.value })
            }
            maxLength={STRESS_LOAD_OTHER_MAX_LENGTH}
            placeholder={STRESS_LOAD_COPY.otherPlaceholder}
            aria-label={`${question.prompt} (something else)`}
            className="w-full rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] px-4 py-3 text-[16px] text-[#F5F0E4] placeholder:text-[#F5F0E4]/35 focus:border-[#C4A050] focus:outline-none"
          />
        )}
      </div>
    );
  }

  return (
    <>
      <textarea
        value={String(draft[question.key] ?? '')}
        onChange={(event) => onSet(question.key, event.target.value)}
        maxLength={question.maxLength}
        rows={5}
        aria-label={question.prompt}
        className="w-full resize-none rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4 text-[16px] leading-relaxed text-[#F5F0E4] placeholder:text-[#F5F0E4]/35 focus:border-[#C4A050] focus:outline-none"
      />
      <p className="mt-2 text-right text-[11px] text-[#F5F0E4]/40">
        {`${String(draft[question.key] ?? '').length} of ${question.maxLength}`}
      </p>
    </>
  );
}
