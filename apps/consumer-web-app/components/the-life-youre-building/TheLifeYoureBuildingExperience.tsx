'use client';

/**
 * The Life You're Building, whole, on one route.
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
 * one at a time, then her own three marks and her own sentence on a screen
 * of their own, then the one small thing, then the piece of reading and the
 * way out.
 *
 * THE SIGNATURE IS THE PLACE-YOURSELF SLIDER, AND NOT THE INSTINCT PICK.
 * Your Own Company used this-or-that pairs, a rapid round and a sentence
 * that took another's place, and NONE of those appears here: the standing
 * rotation rule is at the top of lib/happiness-deep-dive/interactive.ts.
 * There is no shelf here either and nothing is dragged. Three of these nine
 * open with a line that has a word at each end, she commits to a position
 * between them, and only then does the written half arrive, which is the
 * other standing rule in that same file. Nothing here collects a mark
 * instead of a sentence: all nine questions carry a writing box.
 *
 * SAVE AND RESUME COVERS BOTH HALVES. Every Continue writes her writing AND
 * her marks through a server action she reached by tapping. Nothing is
 * written by opening the screen. A save that fails does NOT advance her,
 * because advancing past a failed save is how a member loses forty minutes
 * of writing, and on this template it is also how she loses the positions
 * she has just placed.
 *
 * THE FOLLOW-UP IS HANDED IN, NEVER DECIDED HERE. `followUp` is resolved on
 * the server (lib/the-life-youre-building/service.ts) before this component
 * is rendered at all. When it is null this screen has no way to name any
 * other experience, because it is never given one: the extra intro line is
 * absent rather than hidden, question nine is the standalone question, and
 * the closing prints one sentence under the standalone line.
 *
 * ROOT SAYS NOTHING ABOUT HER. There is no scoring here, no pattern, no
 * observation and no summary. Her three positions are never combined, never
 * averaged and never given an adjective. The closing prints her own marks
 * and her own sentence, under one fixed line that claims nothing about her.
 *
 * THE MOTION IS NOT THIS TEMPLATE'S. The question typing itself, the
 * writing box arriving only once it has, the follow-up prompt after a mark
 * is placed, the chapter beat between the three screens, the ambient layer,
 * the staged closing, the line and the picture of the lines are all
 * components/happiness-deep-dive/, shared with the seven templates beside
 * it and with whatever comes next. Nothing about the treatment is authored
 * here.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import {
  TLYB_CLOSING_KEY,
  TLYB_QUESTIONS,
  firstUnfinishedIndex,
  tlybBlockedReasonFor,
  tlybInteractionDone,
  tlybLeadPromptFor,
  tlybPromptFor,
  tlybQuestionDone,
  type TlybAnswers,
  type TlybDraft,
  type TlybQuestion,
} from '@/lib/the-life-youre-building/questions';
import {
  tlybPositionFor,
  tlybWithPosition,
  type TlybSliderState,
} from '@/lib/the-life-youre-building/sliders';
import type { TlybFollowUp } from '@/lib/the-life-youre-building/followUp';
import {
  TLYB_CLOSING_FOLLOW_UP_LINE,
  TLYB_CLOSING_NOW_LABEL,
  TLYB_CLOSING_STANDALONE_LINE,
  TLYB_CLOSING_THEN_LABEL,
  TLYB_COPY,
  TLYB_INTRO_BODY_LINES,
  TLYB_INTRO_FOLLOW_UP_LINE,
  TLYB_LABEL,
  TLYB_SLIDER_COPY,
  sectionFor,
} from '@/lib/the-life-youre-building/copy';
import { buildTlybExperiment } from '@/lib/the-life-youre-building/experiment';
import {
  saveTheLifeYoureBuildingDraftAction,
  startTheLifeYoureBuildingExperimentAction,
  submitTheLifeYoureBuildingAction,
} from '@/app/actions/theLifeYoureBuilding';
import { IntroReveal } from '@/components/IntroReveal';
import {
  AmbientDrift,
  ChapterCard,
  ClosingCenterpiece,
  ClosingTail,
  FollowUpPrompt,
  PoleMap,
  PoleSlider,
  QuestionStage,
  initialSeenKeys,
  useHappinessSittingMotion,
  type PoleMapLine,
} from '@/components/happiness-deep-dive';
import { hddClosingTailDelayMs } from '@/lib/happiness-deep-dive/motion';
import { TheLifeYoureBuildingResource } from './TheLifeYoureBuildingResource';

const INTRO_STEP = -1;
const FIRST_QUESTION_STEP = 0;
const CLOSING_STEP = TLYB_QUESTIONS.length;
const EXPERIMENT_STEP = CLOSING_STEP + 1;
const DONE_STEP = CLOSING_STEP + 2;

/**
 * The picture of her three lines arrives in one beat of the shared staged
 * reveal, because it arrives whole: nothing on it moves and nothing on it
 * is revealed after anything else on it.
 */
const CLOSING_VISUAL_BEATS = 1;

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40';
const SECONDARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl border border-[#F5F0E4]/25 px-6 py-3 text-sm font-semibold text-[#F5F0E4] transition hover:bg-[#F5F0E4]/10 disabled:opacity-40';
const WRITING_BOX =
  'w-full min-h-[240px] resize-y rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4 text-[16px] leading-relaxed text-[#F5F0E4] placeholder:text-[#F5F0E4]/35 focus:border-[#C4A050] focus:outline-none';

type Finished = {
  sessionId: string;
  answers: TlybAnswers;
  sliders: TlybSliderState;
  /** Her Owning Your Value sentence, only when this sitting ran as a follow-up. */
  followUpSourceAnswer: string | null;
};

/**
 * The key the written half of a question is remembered under.
 *
 * SEPARATE FROM THE QUESTION'S OWN KEY, because the two halves arrive
 * separately and are seen separately: she can have watched the lead prompt
 * type and not yet have placed her mark, so the written half has not been
 * asked yet.
 */
function followUpKey(question: TlybQuestion): string {
  return `${question.key}#written`;
}

export function TheLifeYoureBuildingExperience({
  status,
  draft: initialDraft,
  sliders: initialSliders,
  followUp,
  completed,
}: {
  status: 'pending' | 'completed';
  /** Whatever she had already written, from the stored draft. Empty when she has not started. */
  draft: TlybDraft;
  /** Wherever she had already put her marks. Empty when she has not started. */
  sliders: TlybSliderState;
  /** Null is standalone mode, and a null means this screen cannot name any other experience. */
  followUp: TlybFollowUp | null;
  /** Her most recent finished sitting, when she is opening a route she has already answered. */
  completed: Finished | null;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState<TlybDraft>(initialDraft);
  const [sliders, setSliders] = useState<TlybSliderState>(initialSliders);

  // Where she stopped. A member with nothing done starts at the invitation;
  // a member coming back lands on the first question she has not finished,
  // and never past the last one.
  const done = firstUnfinishedIndex(initialDraft, initialSliders);
  const landingStep = done === 0 ? INTRO_STEP : Math.min(done, TLYB_QUESTIONS.length - 1);
  const [step, setStep] = useState<number>(landingStep);

  // The shared treatment's own state: which prompts she has already watched
  // arrive this sitting, and whether a chapter beat is holding the screen.
  // Seeded with everything she has already finished, both halves, plus the
  // question a resume lands her on, so coming back picks the pen up rather
  // than reading her the question again.
  const motion = useHappinessSittingMotion(
    initialSeenKeys(
      TLYB_QUESTIONS.flatMap((entry) => {
        const seen: string[] = [];
        if (tlybQuestionDone(entry, initialDraft, initialSliders)) seen.push(entry.key);
        // The written half counts as seen the moment its mark is placed,
        // because that is exactly when she was shown it.
        if (tlybInteractionDone(entry, initialSliders)) seen.push(followUpKey(entry));
        return seen;
      }),
      landingStep >= FIRST_QUESTION_STEP ? (TLYB_QUESTIONS[landingStep]?.key ?? null) : null
    )
  );
  const [finished, setFinished] = useState<Finished | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True once a save has actually landed. It survives the move to the next
  // question on purpose: the note it drives is a fact about her sitting
  // ("this is stored"), not about the screen she is on.
  const [hasSaved, setHasSaved] = useState(() => done > 0);
  const [experimentNote, setExperimentNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const question: TlybQuestion | null =
    step >= FIRST_QUESTION_STEP && step < CLOSING_STEP ? (TLYB_QUESTIONS[step] ?? null) : null;
  const answered = question ? tlybQuestionDone(question, draft, sliders) : true;
  const blockedReason = question ? tlybBlockedReasonFor(question, draft, sliders) : null;
  const isLastQuestion = step === CLOSING_STEP - 1;
  const experimentOffer = useMemo(() => buildTlybExperiment(), []);

  // The invitation's lines. The follow-up line is APPENDED rather than
  // swapped in, as its own typed beat, and a standalone member is never
  // handed it at all.
  const introLines = useMemo(
    () =>
      followUp
        ? [...TLYB_INTRO_BODY_LINES, TLYB_INTRO_FOLLOW_UP_LINE]
        : [...TLYB_INTRO_BODY_LINES],
    [followUp]
  );

  function leave() {
    router.push('/dashboard');
  }

  function setAnswer(key: string, value: string) {
    setError(null);
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function place(questionKey: string, value: number) {
    setError(null);
    setSliders((previous) => tlybWithPosition(previous, questionKey, value));
  }

  function advance() {
    if (!question || !answered) return;
    setError(null);

    if (!isLastQuestion) {
      startTransition(async () => {
        const result = await saveTheLifeYoureBuildingDraftAction(draft, sliders);
        if (!result.ok) {
          // Deliberately does NOT advance. Her words and her marks are
          // still in this component's state and on the screen, and the next
          // Continue sends both again.
          setError(TLYB_COPY.saveFailedNote);
          return;
        }
        setHasSaved(true);
        // The chapter beat, when this Continue crosses into a new screen.
        // AFTER the save has landed, so the beat is never covering a write
        // that might still fail.
        const next = TLYB_QUESTIONS[step + 1];
        if (next && next.screen !== question.screen) {
          motion.playChapter(sectionFor(next.screen).title);
        }
        setStep((previous) => previous + 1);
      });
      return;
    }

    startTransition(async () => {
      const result = await submitTheLifeYoureBuildingAction(draft, sliders);
      if (!result.ok) {
        setError(result.error || TLYB_COPY.submitError);
        return;
      }
      setFinished({
        sessionId: result.sessionId,
        answers: result.answers,
        sliders: result.sliders,
        followUpSourceAnswer: result.followUpSourceAnswer,
      });
      setStep(CLOSING_STEP);
    });
  }

  function acceptExperiment() {
    if (!finished) return;
    setError(null);
    startTransition(async () => {
      const result = await startTheLifeYoureBuildingExperimentAction(finished.sessionId);
      setExperimentNote(result.ok ? TLYB_COPY.experimentStarted : result.error);
      setStep(DONE_STEP);
    });
  }

  function declineExperiment() {
    setExperimentNote(TLYB_COPY.experimentDeclined);
    setStep(DONE_STEP);
  }

  /** The writing box, identical on all nine questions. */
  function writingBox(current: TlybQuestion, label: string) {
    return (
      <textarea
        value={draft[current.key] ?? ''}
        onChange={(event) => setAnswer(current.key, event.target.value)}
        rows={9}
        placeholder={TLYB_COPY.writingPlaceholder}
        aria-label={label}
        className={WRITING_BOX}
      />
    );
  }

  /** The written half of a question that opened with a line. */
  function writtenHalf(current: TlybQuestion) {
    const key = followUpKey(current);
    const prompt = tlybPromptFor(current, followUp);
    return (
      <FollowUpPrompt
        prompt={prompt}
        revealKey={key}
        instant={motion.hasSeen(key)}
        onRevealed={() => motion.markSeen(key)}
      >
        {writingBox(current, prompt)}
      </FollowUpPrompt>
    );
  }

  // A sitting she finished on an earlier visit, or one she opened again
  // from a link. She has not just finished (nothing is in `finished`), so
  // this is the honest answer rather than a silent redirect.
  if (status === 'completed' && !finished) {
    return (
      <div className={PANEL}>
        <Glow />
        <p className="relative text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
          {TLYB_LABEL}
        </p>
        <h1 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
          {TLYB_COPY.alreadyDoneHeading}
        </h1>
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
          {TLYB_COPY.alreadyDoneBody}
        </p>
        {completed && (
          <div className="relative mt-6">
            <TheClosing finished={completed} instant />
          </div>
        )}
        <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
          {TLYB_COPY.closingDone}
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
            {TLYB_COPY.introEyebrow}
          </p>
          <button
            type="button"
            onClick={leave}
            aria-label={TLYB_COPY.exitLabel}
            className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="relative mt-4">
          <IntroReveal
            title={TLYB_COPY.introTitle}
            titleTag="h1"
            titleClassName="font-[family-name:var(--font-cormorant-garamond)] text-[34px] leading-tight text-[#F5F0E4]"
            lines={introLines}
            lineClassName="text-[16px] leading-relaxed text-[#F5F0E4]/85"
            // The two modes are two different intros, so they get two
            // different keys: a member who saw the standalone intro and is
            // later sent this again as a follow-up watches the new line
            // arrive rather than having it appear already read.
            storageKey={
              followUp
                ? 'the-life-youre-building-intro-follow-up'
                : 'the-life-youre-building-intro'
            }
            button={{
              label: TLYB_COPY.introButton,
              onClick: () => {
                motion.playChapter(sectionFor(1).title);
                setStep(FIRST_QUESTION_STEP);
              },
              className: `${PRIMARY} mt-8`,
            }}
          />
        </div>
      </div>
    );
  }

  // THE CHAPTER BEAT HOLDS THE WHOLE PANEL, with nothing on it but the
  // section title. It ends on its own timer (ChapterCard), and her draft
  // was already saved before it started.
  if (motion.chapterTitle) {
    return (
      <div className={PANEL}>
        <Glow />
        <AmbientDrift />
        <ChapterCard title={motion.chapterTitle} onDone={motion.endChapter} />
      </div>
    );
  }

  // The screen she is on is named ONCE, in the eyebrow, on every question
  // of that screen rather than only on its first.
  const section = question ? sectionFor(question.screen) : null;

  return (
    <div className={PANEL}>
      <Glow />
      {question && <AmbientDrift />}

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {step > FIRST_QUESTION_STEP && step < CLOSING_STEP && (
            <button
              type="button"
              onClick={() => setStep((previous) => previous - 1)}
              disabled={isPending}
              aria-label={TLYB_COPY.questionBack}
              className="mef-focus-ring mef-press -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/70 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {step === CLOSING_STEP
              ? TLYB_COPY.closingEyebrow
              : step === EXPERIMENT_STEP
                ? TLYB_COPY.experimentEyebrow
                : step === DONE_STEP
                  ? TLYB_COPY.closingEyebrow
                  : (section?.title ?? TLYB_LABEL)}
          </p>
        </div>

        <button
          type="button"
          onClick={leave}
          disabled={isPending}
          aria-label={TLYB_COPY.exitLabel}
          className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {question && (
        <QuestionStage
          counter={`Question ${step + 1} of ${TLYB_QUESTIONS.length}`}
          // What Root says first: the half-finished statement her mark
          // completes, or, on a plain written question, the whole question.
          // The follow-up is handed in because question nine is a plain
          // written question AND the one that adapts, so the prompt this
          // stage types is the one this sitting is actually asking.
          prompt={tlybLeadPromptFor(question, followUp)}
          revealKey={question.key}
          instant={motion.hasSeen(question.key)}
          onRevealed={() => motion.markSeen(question.key)}
        >
          <div className="mt-5">
            {question.kind === 'written' && writingBox(question, question.prompt)}

            {question.kind === 'slider' && question.poles && (
              <div>
                {tlybPositionFor(sliders, question.key) === null && (
                  <p className="mb-4 text-sm text-[#F5F0E4]/55">{TLYB_SLIDER_COPY.hint}</p>
                )}
                <PoleSlider
                  value={tlybPositionFor(sliders, question.key)}
                  onChange={(value) => place(question.key, value)}
                  poles={question.poles}
                  label={tlybLeadPromptFor(question)}
                  unsetLabel={TLYB_SLIDER_COPY.unset}
                  still={reducedMotion}
                />
                {tlybPositionFor(sliders, question.key) !== null && (
                  <div className="mt-7">{writtenHalf(question)}</div>
                )}
              </div>
            )}
          </div>

          {/* The sentence that makes a disabled Continue explainable. */}
          {blockedReason && <p className="mt-5 text-sm text-[#C4A050]">{blockedReason}</p>}
          {hasSaved && !error && (
            <p className="mt-4 text-sm text-[#F5F0E4]/55">{TLYB_COPY.saveNote}</p>
          )}
          {error && <p className="mt-3 text-sm text-[#F5B7A0]">{error}</p>}

          <button
            type="button"
            onClick={advance}
            disabled={!answered || isPending}
            className={`${PRIMARY} ${blockedReason || hasSaved || error ? 'mt-3' : 'mt-5'}`}
          >
            {isLastQuestion ? TLYB_COPY.questionSubmit : TLYB_COPY.questionContinue}
          </button>
        </QuestionStage>
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
          <TheClosing finished={finished} />
          <ClosingTail
            delayMs={hddClosingTailDelayMs(
              closingLineCount(finished) + CLOSING_VISUAL_BEATS,
              true
            )}
          >
            <h2 className="mt-8 font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-snug text-[#F5F0E4]">
              {TLYB_COPY.closingHeading}
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-[#F5F0E4]/85">
              {TLYB_COPY.closingBody}
            </p>
            <button
              type="button"
              onClick={() => setStep(EXPERIMENT_STEP)}
              className={`${PRIMARY} mt-8`}
            >
              {TLYB_COPY.closingContinue}
            </button>
          </ClosingTail>
        </div>
      )}

      {step === EXPERIMENT_STEP && (
        <div className="relative mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-tight text-[#F5F0E4]">
            {experimentOffer.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#F5F0E4]/60">
            {TLYB_COPY.experimentIntro}
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
            {experimentOffer.action}
          </p>
          <div className="mt-4 rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
              {TLYB_COPY.experimentHardDayLabel}
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
            {TLYB_COPY.experimentAccept}
          </button>
          <button
            type="button"
            onClick={declineExperiment}
            disabled={isPending}
            className={`${SECONDARY} mt-3`}
          >
            {TLYB_COPY.experimentDecline}
          </button>
        </div>
      )}

      {step === DONE_STEP && (
        <div className="relative mt-4">
          {finished && <TheClosing finished={finished} instant />}
          {experimentNote && (
            <p className="mt-6 text-[15px] leading-relaxed text-[#C4A050]">{experimentNote}</p>
          )}
          <div className="mt-6">
            <TheLifeYoureBuildingResource />
          </div>
          <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
            {TLYB_COPY.closingDone}
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
 * The three lines she placed herself on, in the order she was asked, with
 * the words she was asked in.
 *
 * DERIVED FROM THE QUESTION LIST, never from a second copy of it, so a line
 * on this picture can only ever be a line she was actually shown, labelled
 * with the actual statement her mark completed.
 */
function mapLines(sliders: TlybSliderState): PoleMapLine[] {
  return TLYB_QUESTIONS.filter((question) => question.kind === 'slider' && question.poles).map(
    (question) => ({
      key: question.key,
      label: tlybLeadPromptFor(question),
      poles: question.poles ?? { near: '', far: '' },
      value: tlybPositionFor(sliders, question.key),
    })
  );
}

/**
 * How many of her own lines the closing prints, so the fixed line beneath
 * waits for the last of them.
 *
 * A follow-up closing prints two sentences (Then, then Now), a standalone
 * one prints one. The picture's own beat is added by the caller.
 */
function closingLineCount(finished: Finished): number {
  const now = finished.answers[TLYB_CLOSING_KEY] ?? '';
  const then = finished.followUpSourceAnswer ?? '';
  const lines = (text: string) => (text.length === 0 ? 1 : text.split('\n').length);
  return finished.followUpSourceAnswer ? lines(then) + lines(now) : lines(now);
}

/**
 * The closing: her own three marks as one picture, then her sentence, then
 * one fixed line.
 *
 * WHAT IS HERS AND WHAT IS ROOT'S, kept visibly apart. The picture prints
 * only positions she placed, under the statements she was asked, and each
 * one is put back into words by the same function her live slider used and
 * her coach's card uses. Her sentence is reproduced exactly: no quotation
 * marks added, no capitalisation or punctuation corrected, nothing trimmed
 * to fit and nothing clamped.
 *
 * TWO SHAPES, ONE TREATMENT. In follow-up mode the sentence she left in
 * Owning Your Value is labelled Then and arrives first, and what she wrote
 * today is labelled Now and arrives after it, with the shared pause between
 * them. In standalone mode there is one sentence, unlabelled, and the
 * earlier template is not named, gestured at, or left a gap for.
 *
 * THE LINE BENEATH IS FIXED AND CLAIMS NOTHING ABOUT HER. Both versions are
 * statements about sentences printed directly above them, and
 * lib/the-life-youre-building/copy.ts sets out exactly why each one is true
 * by construction.
 *
 * THE ARRIVAL IS THE SHARED ONE (ClosingCenterpiece): quiet first, then the
 * picture, then her words, then the fixed line last after a real pause.
 */
function TheClosing({ finished, instant = false }: { finished: Finished; instant?: boolean }) {
  const now = finished.answers[TLYB_CLOSING_KEY] ?? '';
  const then = finished.followUpSourceAnswer;

  return (
    <ClosingCenterpiece
      entries={
        then
          ? [
              { caption: TLYB_CLOSING_THEN_LABEL, captionTone: 'label', text: then },
              { caption: TLYB_CLOSING_NOW_LABEL, captionTone: 'label', text: now },
            ]
          : [{ text: now }]
      }
      fixedLine={then ? TLYB_CLOSING_FOLLOW_UP_LINE : TLYB_CLOSING_STANDALONE_LINE}
      instant={instant}
      visualBeats={CLOSING_VISUAL_BEATS}
      visual={
        <PoleMap
          lines={mapLines(finished.sliders)}
          heading={TLYB_SLIDER_COPY.mapHeading}
          label={TLYB_SLIDER_COPY.mapLabel}
          unsetLabel={TLYB_SLIDER_COPY.unset}
        />
      }
    />
  );
}
