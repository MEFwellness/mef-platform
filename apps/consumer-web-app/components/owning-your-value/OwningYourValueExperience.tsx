'use client';

/**
 * Owning Your Value, whole, on one route.
 *
 * THE ALREADY-DONE PANEL LIVES HERE, NOT ON THE PAGE, and that is not a
 * layout preference. Finishing calls a Server Action, and a Server Action
 * re-renders the route it was called from. When a page owned the "pending
 * vs completed" branch, that re-render swapped the experience out for the
 * already-done panel the instant the write landed, so the closing screen
 * was on screen for a fraction of a second. That is the bug found live on
 * the Core Values Snapshot, the Life Signal Check and the Readiness Pulse
 * closings, and this deliberately does not inherit its shape. With the
 * branch inside this component, the re-render hands it new props while it
 * stays MOUNTED, so its own `step` survives and her closing stands until
 * she taps.
 *
 * TWELVE SCREENS, ONE THING ON EACH. The invitation, then nine questions
 * one at a time, then her own sentence on a screen of its own, then the one
 * small thing, then the piece of reading and the way out. One question per
 * screen because a page with nine boxes on it is a form, and this is meant
 * to be a sitting.
 *
 * SAVE AND RESUME. Every Continue writes the draft through a server action
 * she reached by tapping. Nothing is written by opening the screen. A save
 * that fails does NOT advance her, because advancing past a failed save is
 * how a member loses forty minutes of writing.
 *
 * ROOT SAYS NOTHING ABOUT HER. There is no scoring here, no pattern, no
 * observation and no summary of her answers. The closing screen shows the
 * sentence she wrote, exactly as she wrote it, and then says what happened.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import {
  OYV_QUESTIONS,
  blockedReasonFor,
  firstUnansweredIndex,
  isAnswered,
  type OyvAnswers,
  type OyvDraft,
} from '@/lib/owning-your-value/questions';
import {
  OYV_COPY,
  OYV_INTRO_BODY_LINES,
  OYV_LABEL,
  sectionFor,
} from '@/lib/owning-your-value/copy';
import { buildOyvExperiment } from '@/lib/owning-your-value/experiment';
import {
  saveOwningYourValueDraftAction,
  startOwningYourValueExperimentAction,
  submitOwningYourValueAction,
} from '@/app/actions/owningYourValue';
import { IntroReveal } from '@/components/IntroReveal';
import { OwningYourValueResource } from './OwningYourValueResource';

const INTRO_STEP = -1;
const FIRST_QUESTION_STEP = 0;
const CLOSING_STEP = OYV_QUESTIONS.length;
const EXPERIMENT_STEP = CLOSING_STEP + 1;
const DONE_STEP = CLOSING_STEP + 2;

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40';
const SECONDARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl border border-[#F5F0E4]/25 px-6 py-3 text-sm font-semibold text-[#F5F0E4] transition hover:bg-[#F5F0E4]/10 disabled:opacity-40';
const WRITING_BOX =
  'w-full min-h-[240px] resize-y rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4 text-[16px] leading-relaxed text-[#F5F0E4] placeholder:text-[#F5F0E4]/35 focus:border-[#C4A050] focus:outline-none';

type Finished = { sessionId: string; answers: OyvAnswers; heldSentence: string };

export function OwningYourValueExperience({
  status,
  draft: initialDraft,
  completed,
}: {
  status: 'pending' | 'completed';
  /** Whatever she had already written, from the stored draft. Empty when she has not started. */
  draft: OyvDraft;
  /** Her most recent finished sitting, when she is opening a route she has already answered. */
  completed: Finished | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<OyvDraft>(initialDraft);
  // Where she stopped. A member with nothing written starts at the
  // invitation; a member coming back lands on the first question she has
  // not answered, and never past the last one.
  const [step, setStep] = useState<number>(() => {
    const written = firstUnansweredIndex(initialDraft);
    if (written === 0) return INTRO_STEP;
    return Math.min(written, OYV_QUESTIONS.length - 1);
  });
  const [finished, setFinished] = useState<Finished | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True once a draft save has actually landed. It survives the move to
  // the next question on purpose: the note it drives is a fact about her
  // sitting ("this is stored"), not about the screen she is on, and a
  // sentence that appeared and vanished every tap would be noise.
  const [hasSaved, setHasSaved] = useState(() => firstUnansweredIndex(initialDraft) > 0);
  const [experimentNote, setExperimentNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const question =
    step >= FIRST_QUESTION_STEP && step < CLOSING_STEP ? (OYV_QUESTIONS[step] ?? null) : null;
  const answered = question ? isAnswered(draft[question.key]) : true;
  const blockedReason = question ? blockedReasonFor(draft[question.key]) : null;
  const isLastQuestion = step === CLOSING_STEP - 1;
  const experimentOffer = useMemo(() => buildOyvExperiment(), []);

  function leave() {
    router.push('/dashboard');
  }

  function setAnswer(key: string, value: string) {
    setError(null);
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function advance() {
    if (!question || !answered) return;
    setError(null);

    if (!isLastQuestion) {
      startTransition(async () => {
        const result = await saveOwningYourValueDraftAction(draft);
        if (!result.ok) {
          // Deliberately does NOT advance. Her words are still in this
          // component's state and on the screen, and the next Continue
          // sends the whole draft again.
          setError(OYV_COPY.saveFailedNote);
          return;
        }
        setHasSaved(true);
        setStep((previous) => previous + 1);
      });
      return;
    }

    startTransition(async () => {
      const result = await submitOwningYourValueAction(draft);
      if (!result.ok) {
        setError(result.error || OYV_COPY.submitError);
        return;
      }
      setFinished({
        sessionId: result.sessionId,
        answers: result.answers,
        heldSentence: result.heldSentence,
      });
      setStep(CLOSING_STEP);
    });
  }

  function acceptExperiment() {
    if (!finished) return;
    setError(null);
    startTransition(async () => {
      const result = await startOwningYourValueExperimentAction(finished.sessionId);
      setExperimentNote(result.ok ? OYV_COPY.experimentStarted : result.error);
      setStep(DONE_STEP);
    });
  }

  function declineExperiment() {
    setExperimentNote(OYV_COPY.experimentDeclined);
    setStep(DONE_STEP);
  }

  // A sitting she finished on an earlier visit, or one she opened again
  // from a link. She has not just finished (nothing is in `finished`), so
  // this is the honest answer rather than a silent redirect.
  if (status === 'completed' && !finished) {
    return (
      <div className={PANEL}>
        <Glow />
        <p className="relative text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
          {OYV_LABEL}
        </p>
        <h1 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
          {OYV_COPY.alreadyDoneHeading}
        </h1>
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
          {OYV_COPY.alreadyDoneBody}
        </p>
        {completed?.heldSentence && (
          <div className="relative mt-6">
            <HeldSentence
              label={OYV_COPY.alreadyDoneSentenceLabel}
              sentence={completed.heldSentence}
            />
          </div>
        )}
        <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
          {OYV_COPY.closingDone}
        </button>
      </div>
    );
  }

  if (step === INTRO_STEP) {
    return (
      <div className={PANEL}>
        <Glow />
        <div className="relative flex items-center justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {OYV_COPY.introEyebrow}
          </p>
          <button
            type="button"
            onClick={leave}
            aria-label={OYV_COPY.exitLabel}
            className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="relative mt-4">
          <IntroReveal
            title={OYV_COPY.introTitle}
            titleTag="h1"
            titleClassName="font-[family-name:var(--font-cormorant-garamond)] text-[34px] leading-tight text-[#F5F0E4]"
            lines={[...OYV_INTRO_BODY_LINES]}
            lineClassName="text-[16px] leading-relaxed text-[#F5F0E4]/85"
            storageKey="owning-your-value-intro"
            button={{
              label: OYV_COPY.introButton,
              onClick: () => setStep(FIRST_QUESTION_STEP),
              className: `${PRIMARY} mt-8`,
            }}
          />
        </div>
      </div>
    );
  }

  // The screen she is on is named ONCE, in the eyebrow, on every question
  // of that screen rather than only on its first. Printing it a second time
  // as a heading put "THE DOING" directly above "The Doing" on questions
  // one, four and seven, which reads as a mistake rather than as emphasis.
  // The Stress & Load Deep-Dive can carry both because its heading is a
  // different sentence from its section name; here the brief gives three
  // titles and nothing else, so there is one slot for them.
  const section = question ? sectionFor(question.screen) : null;

  return (
    <div className={PANEL}>
      <Glow />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {step > FIRST_QUESTION_STEP && step < CLOSING_STEP && (
            <button
              type="button"
              onClick={() => setStep((previous) => previous - 1)}
              disabled={isPending}
              aria-label={OYV_COPY.questionBack}
              className="mef-focus-ring mef-press -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/70 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {step === CLOSING_STEP
              ? OYV_COPY.closingEyebrow
              : step === EXPERIMENT_STEP
                ? OYV_COPY.experimentEyebrow
                : step === DONE_STEP
                  ? OYV_COPY.closingEyebrow
                  : (section?.title ?? OYV_LABEL)}
          </p>
        </div>

        <button
          type="button"
          onClick={leave}
          disabled={isPending}
          aria-label={OYV_COPY.exitLabel}
          className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {question && (
        <div className="relative mt-4">
          <p className="text-[11px] uppercase tracking-wider text-[#F5F0E4]/45">
            {`Question ${step + 1} of ${OYV_QUESTIONS.length}`}
          </p>

          <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-snug text-[#F5F0E4]">
            {question.prompt}
          </h1>

          <div className="mt-5">
            <textarea
              value={draft[question.key] ?? ''}
              onChange={(event) => setAnswer(question.key, event.target.value)}
              rows={9}
              placeholder={OYV_COPY.writingPlaceholder}
              aria-label={question.prompt}
              className={WRITING_BOX}
            />
          </div>

          {/* The sentence that makes a disabled Continue explainable. */}
          {blockedReason && <p className="mt-5 text-sm text-[#C4A050]">{blockedReason}</p>}
          {hasSaved && !error && (
            <p className="mt-4 text-sm text-[#F5F0E4]/55">{OYV_COPY.saveNote}</p>
          )}
          {error && <p className="mt-3 text-sm text-[#F5B7A0]">{error}</p>}

          <button
            type="button"
            onClick={advance}
            disabled={!answered || isPending}
            className={`${PRIMARY} ${blockedReason || hasSaved || error ? 'mt-3' : 'mt-5'}`}
          >
            {isLastQuestion ? OYV_COPY.questionSubmit : OYV_COPY.questionContinue}
          </button>
        </div>
      )}

      {/*
        THE CLOSING. It holds here until she taps Continue: nothing on this
        route redirects a completed sitting, and the finished/pending branch
        is inside this mounted component, so the Server Action re-render
        that arrives behind the completion reconciles this same tree instead
        of navigating her off it.
      */}
      {step === CLOSING_STEP && finished && (
        <div className="relative mt-6">
          <HeldSentence sentence={finished.heldSentence} />
          <h2 className="mt-8 font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-snug text-[#F5F0E4]">
            {OYV_COPY.closingHeading}
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[#F5F0E4]/85">
            {OYV_COPY.closingBody}
          </p>
          <button
            type="button"
            onClick={() => setStep(EXPERIMENT_STEP)}
            className={`${PRIMARY} mt-8`}
          >
            {OYV_COPY.closingContinue}
          </button>
        </div>
      )}

      {step === EXPERIMENT_STEP && (
        <div className="relative mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-tight text-[#F5F0E4]">
            {experimentOffer.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#F5F0E4]/60">
            {OYV_COPY.experimentIntro}
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
            {experimentOffer.action}
          </p>
          <div className="mt-4 rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
              {OYV_COPY.experimentHardDayLabel}
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
            {OYV_COPY.experimentAccept}
          </button>
          <button
            type="button"
            onClick={declineExperiment}
            disabled={isPending}
            className={`${SECONDARY} mt-3`}
          >
            {OYV_COPY.experimentDecline}
          </button>
        </div>
      )}

      {step === DONE_STEP && (
        <div className="relative mt-4">
          {finished && <HeldSentence sentence={finished.heldSentence} />}
          {experimentNote && (
            <p className="mt-6 text-[15px] leading-relaxed text-[#C4A050]">{experimentNote}</p>
          )}
          <div className="mt-6">
            <OwningYourValueResource />
          </div>
          <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
            {OYV_COPY.closingDone}
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

/**
 * Her sentence, exactly as she wrote it.
 *
 * The one piece of editorial treatment in this experience, and the reason
 * it exists: this is the screen worth keeping. Rendered as her own words
 * with nothing added, no quotation marks placed around them and no
 * capitalisation or punctuation corrected, because the moment Root tidies
 * her sentence it stops being hers.
 */
function HeldSentence({ sentence, label }: { sentence: string; label?: string }) {
  return (
    <figure className="rounded-[24px] border border-[#C4A050]/35 bg-[#F5F0E4]/[0.05] px-6 py-8 text-center">
      {label && (
        <figcaption className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
          {label}
        </figcaption>
      )}
      <p
        className={`font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-[1.35] text-[#F5F0E4] ${label ? 'mt-4' : ''}`}
      >
        {sentence}
      </p>
      <span
        aria-hidden="true"
        className="mx-auto mt-6 block h-px w-12 bg-[#C4A050]/50"
      />
    </figure>
  );
}
