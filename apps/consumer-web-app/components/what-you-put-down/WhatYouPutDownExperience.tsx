'use client';

/**
 * What You Put Down, whole, on one route.
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
 * one at a time, then her shelf and her own sentence on a screen of its
 * own, then the one small thing, then the piece of reading and the way out.
 *
 * SIX OF THE NINE ARE WRITING. Three are not, and the standing rule they
 * follow is at the top of lib/happiness-deep-dive/interactive.ts: an
 * interactive element sets up writing rather than replacing it. She shelves
 * her own lines and names the one that stings, and question three asks her
 * about that one by name. She puts a mark on a line, and is then asked why
 * she put it there. She lifts one card back off, and questions eight and
 * nine are both about it.
 *
 * SAVE AND RESUME COVERS BOTH HALVES. Every Continue writes her writing AND
 * her shelf through a server action she reached by tapping. Nothing is
 * written by opening the screen. A save that fails does NOT advance her,
 * because advancing past a failed save is how a member loses forty minutes
 * of writing, and on this template it is also how she loses a shelf she
 * spent two minutes filling.
 *
 * EVERY CARD IS A LINE SHE WROTE. The card list is derived from her
 * question one answer, here and on the server (lib/what-you-put-down/
 * shelf.ts), so nothing on this screen is ever a sentence Root made up. If
 * she goes back and edits question one, the shelf is re-hung by text, so a
 * line she kept keeps its mark and a line she deleted takes its mark with
 * it.
 *
 * ROOT SAYS NOTHING ABOUT HER. There is no scoring here, no pattern, no
 * observation and no summary. The closing prints her shelf, her own
 * question nine sentence, and one fixed line that claims nothing specific
 * about her.
 *
 * THE MOTION IS NOT THIS TEMPLATE'S. The question typing itself, the
 * writing box arriving only once it has, the chapter beat between the three
 * screens, the ambient layer, the staged closing, the cards, the shelf, the
 * placing deck and the two-pole line are all components/happiness-deep-dive/,
 * shared with the five templates beside it and with whatever comes next.
 * Nothing about the treatment is authored here.
 */

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import {
  WYPD_CARDS_KEY,
  WYPD_CLOSING_KEY,
  WYPD_QUESTIONS,
  wypdBlockedReasonFor,
  wypdPromptFor,
  wypdQuestionDone,
  firstUnfinishedIndex,
  type WypdAnswers,
  type WypdDraft,
  type WypdQuestion,
} from '@/lib/what-you-put-down/questions';
import {
  WYPD_POLES,
  wypdAllPlaced,
  wypdCardText,
  wypdNextToPlace,
  wypdPlacedCards,
  wypdReconcileShelf,
  type WypdShelfState,
} from '@/lib/what-you-put-down/shelf';
import {
  WYPD_CLOSING_LABEL,
  WYPD_CLOSING_LINE,
  WYPD_COPY,
  WYPD_INTRO_BODY_LINES,
  WYPD_LABEL,
  WYPD_SHELF_COPY,
  sectionFor,
} from '@/lib/what-you-put-down/copy';
import { buildWypdExperiment } from '@/lib/what-you-put-down/experiment';
import {
  saveWhatYouPutDownDraftAction,
  startWhatYouPutDownExperimentAction,
  submitWhatYouPutDownAction,
} from '@/app/actions/whatYouPutDown';
import { IntroReveal } from '@/components/IntroReveal';
import {
  AmbientDrift,
  CardShelf,
  ChapterCard,
  ClosingCenterpiece,
  ClosingTail,
  PlacingDeck,
  PoleSlider,
  QuestionStage,
  WordCard,
  initialSeenKeys,
  useHappinessSittingMotion,
} from '@/components/happiness-deep-dive';
import { hddClosingLines, hddClosingTailDelayMs } from '@/lib/happiness-deep-dive/motion';
import { WhatYouPutDownResource } from './WhatYouPutDownResource';

const INTRO_STEP = -1;
const FIRST_QUESTION_STEP = 0;
const CLOSING_STEP = WYPD_QUESTIONS.length;
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
const SECOND_PROMPT =
  'font-[family-name:var(--font-cormorant-garamond)] text-[22px] leading-snug text-[#F5F0E4]';

type Finished = { sessionId: string; answers: WypdAnswers; shelf: WypdShelfState };

export function WhatYouPutDownExperience({
  status,
  draft: initialDraft,
  shelf: initialShelf,
  completed,
}: {
  status: 'pending' | 'completed';
  /** Whatever she had already written, from the stored draft. Empty when she has not started. */
  draft: WypdDraft;
  /** Whatever was already on her shelf. Empty when she has not started. */
  shelf: WypdShelfState;
  /** Her most recent finished sitting, when she is opening a route she has already answered. */
  completed: Finished | null;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState<WypdDraft>(initialDraft);
  const [storedShelf, setStoredShelf] = useState<WypdShelfState>(initialShelf);

  // THE SHELF IS ALWAYS CONSISTENT WITH HER QUESTION ONE ANSWER. Derived
  // during render rather than kept in step by an effect, so there is no
  // frame in which the cards on screen belong to a line she has just
  // deleted. Reconciling is by text and is idempotent, so doing it on every
  // render costs nothing and can never drift.
  const cardsText = draft[WYPD_CARDS_KEY] ?? '';
  const shelf = useMemo(
    () => wypdReconcileShelf(storedShelf, cardsText),
    [storedShelf, cardsText]
  );

  // Where she stopped. A member with nothing done starts at the invitation;
  // a member coming back lands on the first question she has not finished,
  // and never past the last one.
  const done = firstUnfinishedIndex(initialDraft, initialShelf);
  const landingStep = done === 0 ? INTRO_STEP : Math.min(done, WYPD_QUESTIONS.length - 1);
  const [step, setStep] = useState<number>(landingStep);

  // The shared treatment's own state: which questions she has already
  // watched arrive this sitting, and whether a chapter beat is holding the
  // screen. Seeded with everything she has already finished plus the
  // question a resume lands her on, so coming back picks the pen up rather
  // than reading her the question again.
  const motion = useHappinessSittingMotion(
    initialSeenKeys(
      WYPD_QUESTIONS.filter((entry) => wypdQuestionDone(entry, initialDraft, initialShelf)).map(
        (entry) => entry.key
      ),
      landingStep >= FIRST_QUESTION_STEP ? (WYPD_QUESTIONS[landingStep]?.key ?? null) : null
    )
  );
  const [finished, setFinished] = useState<Finished | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  // True once a save has actually landed. It survives the move to the next
  // question on purpose: the note it drives is a fact about her sitting
  // ("this is stored"), not about the screen she is on.
  const [hasSaved, setHasSaved] = useState(() => done > 0);
  const [experimentNote, setExperimentNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const question: WypdQuestion | null =
    step >= FIRST_QUESTION_STEP && step < CLOSING_STEP ? (WYPD_QUESTIONS[step] ?? null) : null;
  const answered = question ? wypdQuestionDone(question, draft, shelf) : true;
  const blockedReason = question ? wypdBlockedReasonFor(question, draft, shelf) : null;
  const isLastQuestion = step === CLOSING_STEP - 1;
  const experimentOffer = useMemo(() => buildWypdExperiment(), []);

  function leave() {
    router.push('/dashboard');
  }

  function setAnswer(key: string, value: string) {
    setError(null);
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  /** Every shelf change goes through the reconciled shelf, never the raw stored one. */
  function updateShelf(patch: Partial<WypdShelfState>) {
    setError(null);
    setStoredShelf({ ...shelf, ...patch });
  }

  function advance() {
    if (!question || !answered) return;
    setError(null);

    if (!isLastQuestion) {
      startTransition(async () => {
        const result = await saveWhatYouPutDownDraftAction(draft, shelf);
        if (!result.ok) {
          // Deliberately does NOT advance. Her words and her shelf are
          // still in this component's state and on the screen, and the next
          // Continue sends both again.
          setError(WYPD_COPY.saveFailedNote);
          return;
        }
        setHasSaved(true);
        // The chapter beat, when this Continue crosses into a new screen.
        // AFTER the save has landed, so the beat is never covering a write
        // that might still fail.
        const next = WYPD_QUESTIONS[step + 1];
        if (next && next.screen !== question.screen) {
          motion.playChapter(sectionFor(next.screen).title);
        }
        setStep((previous) => previous + 1);
      });
      return;
    }

    startTransition(async () => {
      const result = await submitWhatYouPutDownAction(draft, shelf);
      if (!result.ok) {
        setError(result.error || WYPD_COPY.submitError);
        return;
      }
      setFinished({ sessionId: result.sessionId, answers: result.answers, shelf: result.shelf });
      setStep(CLOSING_STEP);
    });
  }

  function acceptExperiment() {
    if (!finished) return;
    setError(null);
    startTransition(async () => {
      const result = await startWhatYouPutDownExperimentAction(finished.sessionId);
      setExperimentNote(result.ok ? WYPD_COPY.experimentStarted : result.error);
      setStep(DONE_STEP);
    });
  }

  function declineExperiment() {
    setExperimentNote(WYPD_COPY.experimentDeclined);
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
          {WYPD_LABEL}
        </p>
        <h1 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
          {WYPD_COPY.alreadyDoneHeading}
        </h1>
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
          {WYPD_COPY.alreadyDoneBody}
        </p>
        {completed && (
          <div className="relative mt-6">
            <TheClosing finished={completed} instant />
          </div>
        )}
        <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
          {WYPD_COPY.closingDone}
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
            {WYPD_COPY.introEyebrow}
          </p>
          <button
            type="button"
            onClick={leave}
            aria-label={WYPD_COPY.exitLabel}
            className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="relative mt-4">
          <IntroReveal
            title={WYPD_COPY.introTitle}
            titleTag="h1"
            titleClassName="font-[family-name:var(--font-cormorant-garamond)] text-[34px] leading-tight text-[#F5F0E4]"
            lines={[...WYPD_INTRO_BODY_LINES]}
            lineClassName="text-[16px] leading-relaxed text-[#F5F0E4]/85"
            storageKey="what-you-put-down-intro"
            button={{
              label: WYPD_COPY.introButton,
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
              aria-label={WYPD_COPY.questionBack}
              className="mef-focus-ring mef-press -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/70 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {step === CLOSING_STEP
              ? WYPD_COPY.closingEyebrow
              : step === EXPERIMENT_STEP
                ? WYPD_COPY.experimentEyebrow
                : step === DONE_STEP
                  ? WYPD_COPY.closingEyebrow
                  : (section?.title ?? WYPD_LABEL)}
          </p>
        </div>

        <button
          type="button"
          onClick={leave}
          disabled={isPending}
          aria-label={WYPD_COPY.exitLabel}
          className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {question && (
        <QuestionStage
          counter={`Question ${step + 1} of ${WYPD_QUESTIONS.length}`}
          // Question three quotes the card she named, verbatim, inside its
          // own prompt. Everything else is a fixed string.
          prompt={wypdPromptFor(question, shelf)}
          revealKey={question.key}
          instant={motion.hasSeen(question.key)}
          onRevealed={() => motion.markSeen(question.key)}
        >
          <div className="mt-5">
            {question.kind === 'written' && (
              <textarea
                value={draft[question.key] ?? ''}
                onChange={(event) => setAnswer(question.key, event.target.value)}
                rows={question.key === WYPD_CARDS_KEY ? 10 : 9}
                placeholder={
                  question.key === WYPD_CARDS_KEY
                    ? WYPD_COPY.listPlaceholder
                    : WYPD_COPY.writingPlaceholder
                }
                aria-label={question.prompt}
                className={WRITING_BOX}
              />
            )}

            {question.kind === 'shelf_place' && (
              <ShelfPlacing
                shelf={shelf}
                still={reducedMotion}
                armed={armed}
                onArmedChange={setArmed}
                onPlace={(id) => updateShelf({ placed: [...shelf.placed, id] })}
                onChooseSting={(id) => updateShelf({ stingCardId: id })}
                secondPrompt={question.secondPrompt ?? ''}
              />
            )}

            {question.kind === 'slider' && (
              <div>
                <PoleSlider
                  value={shelf.distance}
                  onChange={(value) => updateShelf({ distance: value })}
                  poles={WYPD_POLES}
                  label={WYPD_SHELF_COPY.lineLabel}
                  unsetLabel={WYPD_SHELF_COPY.lineUnset}
                  still={reducedMotion}
                />
                {shelf.distance !== null && (
                  <div className={reducedMotion ? 'mt-7' : 'mef-fade-in mt-7'}>
                    <p className={SECOND_PROMPT}>{question.secondPrompt}</p>
                    <textarea
                      value={draft[question.key] ?? ''}
                      onChange={(event) => setAnswer(question.key, event.target.value)}
                      rows={8}
                      placeholder={WYPD_COPY.writingPlaceholder}
                      aria-label={question.secondPrompt}
                      className={`${WRITING_BOX} mt-3`}
                    />
                  </div>
                )}
              </div>
            )}

            {question.kind === 'shelf_lift' && (
              <ShelfLifting
                shelf={shelf}
                still={reducedMotion}
                onLift={(id) => updateShelf({ liftedCardId: id })}
                onPutBack={() => updateShelf({ liftedCardId: null })}
              />
            )}
          </div>

          {/* The sentence that makes a disabled Continue explainable. */}
          {blockedReason && <p className="mt-5 text-sm text-[#C4A050]">{blockedReason}</p>}
          {hasSaved && !error && (
            <p className="mt-4 text-sm text-[#F5F0E4]/55">{WYPD_COPY.saveNote}</p>
          )}
          {error && <p className="mt-3 text-sm text-[#F5B7A0]">{error}</p>}

          <button
            type="button"
            onClick={advance}
            disabled={!answered || isPending}
            className={`${PRIMARY} ${blockedReason || hasSaved || error ? 'mt-3' : 'mt-5'}`}
          >
            {isLastQuestion ? WYPD_COPY.questionSubmit : WYPD_COPY.questionContinue}
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
              // The shelf takes the first beat of the closing, so it counts
              // as one more line for everything that waits behind it.
              hddClosingLines(finished.answers[WYPD_CLOSING_KEY] ?? '').length + 1,
              true
            )}
          >
            <h2 className="mt-8 font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-snug text-[#F5F0E4]">
              {WYPD_COPY.closingHeading}
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-[#F5F0E4]/85">
              {WYPD_COPY.closingBody}
            </p>
            <button
              type="button"
              onClick={() => setStep(EXPERIMENT_STEP)}
              className={`${PRIMARY} mt-8`}
            >
              {WYPD_COPY.closingContinue}
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
            {WYPD_COPY.experimentIntro}
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
            {experimentOffer.action}
          </p>
          <div className="mt-4 rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
              {WYPD_COPY.experimentHardDayLabel}
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
            {WYPD_COPY.experimentAccept}
          </button>
          <button
            type="button"
            onClick={declineExperiment}
            disabled={isPending}
            className={`${SECONDARY} mt-3`}
          >
            {WYPD_COPY.experimentDecline}
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
            <WhatYouPutDownResource />
          </div>
          <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
            {WYPD_COPY.closingDone}
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
 * Question two: her own lines, one card at a time, onto the shelf. Then the
 * one that stings.
 *
 * TWO HALVES ON ONE SCREEN, and the second only exists once the first is
 * finished. Placing is the act; naming is what question three is about. The
 * shelf below is one control while a card is waiting (tap it, or drag onto
 * it) and becomes a row of controls once everything is on it, which is what
 * keeps it a legal, reachable target in both halves.
 *
 * TAPS ALONE ARE ENOUGH. The card in her hand is a button, the shelf is a
 * button, and every card on it is a button once she is choosing. Dragging
 * is an enhancement PlacingDeck adds on top and reduced motion removes.
 */
function ShelfPlacing({
  shelf,
  still,
  armed,
  onArmedChange,
  onPlace,
  onChooseSting,
  secondPrompt,
}: {
  shelf: WypdShelfState;
  still: boolean;
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
  onPlace: (id: string) => void;
  onChooseSting: (id: string) => void;
  secondPrompt: string;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const next = wypdNextToPlace(shelf);
  const placed = wypdPlacedCards(shelf);
  const allPlaced = wypdAllPlaced(shelf);

  return (
    <div>
      {next && (
        <div className="mb-5">
          <PlacingDeck
            text={next.text}
            placeLabel={WYPD_SHELF_COPY.placeCard}
            counter={`${shelf.placed.length + 1} of ${shelf.cards.length}`}
            onPlace={() => onPlace(next.id)}
            boardRef={boardRef}
            onOverBoardChange={onArmedChange}
            still={still}
          />
        </div>
      )}

      {allPlaced && (
        <p className={`mb-4 text-sm text-[#F5F0E4]/55 ${still ? '' : 'mef-fade-in'}`}>
          {WYPD_SHELF_COPY.allPlaced}
        </p>
      )}

      {allPlaced && (
        <p className={`mb-4 ${SECOND_PROMPT} ${still ? '' : 'mef-fade-in'}`}>{secondPrompt}</p>
      )}

      <CardShelf
        cards={placed}
        ariaLabel={WYPD_SHELF_COPY.shelfLabel}
        emptyLabel={WYPD_SHELF_COPY.shelfEmpty}
        markedId={shelf.stingCardId}
        markedNote={WYPD_SHELF_COPY.stingNote}
        still={still}
        boardRef={boardRef}
        armed={armed}
        {...(allPlaced
          ? { onChoose: onChooseSting, chooseLabel: WYPD_SHELF_COPY.chooseSting }
          : { onDrop: () => next && onPlace(next.id), dropLabel: WYPD_SHELF_COPY.placeHere })}
      />
    </div>
  );
}

/**
 * Question seven: one card back off the shelf, warm in her hand.
 *
 * THE LIFTED CARD LEAVES THE SHELF, literally. It is removed from the row
 * of planks and stands on its own above them, in gold. That is what the
 * question asked her to do, and a card that stayed in the row with a
 * different colour would be a highlight rather than a lift.
 *
 * SHE MAY PUT IT BACK. One button, no confirmation, and choosing a
 * different one from the shelf simply moves the lift, so there is never a
 * state she cannot get out of.
 */
function ShelfLifting({
  shelf,
  still,
  onLift,
  onPutBack,
}: {
  shelf: WypdShelfState;
  still: boolean;
  onLift: (id: string) => void;
  onPutBack: () => void;
}) {
  const lifted = shelf.liftedCardId;
  const liftedText = wypdCardText(shelf, lifted);
  const onShelf = wypdPlacedCards(shelf).filter((card) => card.id !== lifted);

  return (
    <div>
      {liftedText !== null && (
        <div className={`mb-6 ${still ? '' : 'mef-fade-in'}`}>
          <WordCard
            text={liftedText}
            tone="lifted"
            note={WYPD_SHELF_COPY.liftedNote}
            still={still}
          />
          <button
            type="button"
            onClick={onPutBack}
            className="mef-focus-ring mef-press mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-[#F5F0E4]/20 px-5 py-2.5 text-sm font-semibold text-[#F5F0E4]/85 transition hover:bg-[#F5F0E4]/10"
          >
            Put it back
          </button>
        </div>
      )}

      <CardShelf
        cards={onShelf}
        ariaLabel={WYPD_SHELF_COPY.shelfLabel}
        emptyLabel={WYPD_SHELF_COPY.shelfEmpty}
        onChoose={onLift}
        chooseLabel={WYPD_SHELF_COPY.chooseLift}
        still={still}
      />
    </div>
  );
}

/**
 * The closing: her shelf one last time, her own sentence under it, and one
 * fixed line.
 *
 * WHAT IS HERS AND WHAT IS ROOT'S, kept visibly apart. The shelf is her own
 * lines and nothing else. Her question nine sentence is reproduced exactly:
 * no quotation marks added around it, no capitalisation or punctuation
 * corrected, nothing trimmed to fit. Above it is a small label naming who
 * those words are addressed to, and nothing else.
 *
 * THE LIFTED CARD IS SET APART, above the shelf and in gold, because it is
 * the one she said still has a pulse. That is her statement, restated, not
 * a conclusion Root drew.
 *
 * THE ONE LINE BENEATH IS FIXED AND CLAIMS NOTHING ABOUT HER. "She is still
 * in there. She just read this." is true by construction: question nine
 * asked her to write to the version of herself who put it down, and the
 * person reading that sentence here is her.
 *
 * THE ARRIVAL IS THE SHARED ONE (ClosingCenterpiece): quiet first, then the
 * shelf, then her words a line at a time, then the fixed line last after a
 * real pause.
 */
function TheClosing({ finished, instant = false }: { finished: Finished; instant?: boolean }) {
  // The centerpiece makes the same decision for its own beats. This one is
  // for the pieces inside the picture it is handed: a card that is placed
  // rather than settling, and gold that is simply gold.
  const reducedMotion = useReducedMotion();
  const still = instant || reducedMotion;
  const sentence = finished.answers[WYPD_CLOSING_KEY] ?? '';
  const shelf = finished.shelf;
  const liftedText = wypdCardText(shelf, shelf.liftedCardId);
  const rest = wypdPlacedCards(shelf).filter((card) => card.id !== shelf.liftedCardId);

  return (
    <ClosingCenterpiece
      eyebrow={WYPD_CLOSING_LABEL}
      entries={[{ text: sentence }]}
      fixedLine={WYPD_CLOSING_LINE}
      instant={instant}
      visual={
        <div>
          {liftedText !== null && (
            <div className="mb-5">
              <WordCard
                text={liftedText}
                tone="lifted"
                note={WYPD_SHELF_COPY.liftedNote}
                still={still}
              />
            </div>
          )}
          <CardShelf
            cards={rest}
            ariaLabel={WYPD_SHELF_COPY.shelfLabel}
            emptyLabel={WYPD_SHELF_COPY.shelfEmpty}
            markedId={shelf.stingCardId}
            markedNote={WYPD_SHELF_COPY.stingNote}
            still={still}
            staggered
          />
        </div>
      }
    />
  );
}
