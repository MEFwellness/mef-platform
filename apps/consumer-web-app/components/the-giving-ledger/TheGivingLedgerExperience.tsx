'use client';

/**
 * The Giving Ledger, whole, on one route.
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
 * observation and no summary. The closing prints the sentence she wrote at
 * question nine and one fixed line that claims nothing specific about her.
 *
 * THE MOTION IS NOT THIS TEMPLATE'S. Every question typing itself out, the
 * writing box arriving only once it has, the chapter beat between the three
 * screens, the ambient layer behind the writing and the staged closing are
 * all components/happiness-deep-dive/, shared with the four templates
 * beside it. Nothing about the treatment is authored here and nothing here
 * can drift from it.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import {
  TGL_CLOSING_KEY,
  TGL_QUESTIONS,
  blockedReasonFor,
  firstUnansweredIndex,
  isAnswered,
  type TglAnswers,
  type TglDraft,
} from '@/lib/the-giving-ledger/questions';
import {
  TGL_CLOSING_LABEL,
  TGL_CLOSING_LINE,
  TGL_COPY,
  TGL_INTRO_BODY_LINES,
  TGL_LABEL,
  sectionFor,
} from '@/lib/the-giving-ledger/copy';
import { buildTglExperiment } from '@/lib/the-giving-ledger/experiment';
import {
  saveTheGivingLedgerDraftAction,
  startTheGivingLedgerExperimentAction,
  submitTheGivingLedgerAction,
} from '@/app/actions/theGivingLedger';
import { IntroReveal } from '@/components/IntroReveal';
import {
  AmbientDrift,
  ChapterCard,
  ClosingCenterpiece,
  ClosingTail,
  initialSeenKeys,
  QuestionStage,
  useHappinessSittingMotion,
} from '@/components/happiness-deep-dive';
import { hddClosingLines, hddClosingTailDelayMs } from '@/lib/happiness-deep-dive/motion';
import { TheGivingLedgerResource } from './TheGivingLedgerResource';

const INTRO_STEP = -1;
const FIRST_QUESTION_STEP = 0;
const CLOSING_STEP = TGL_QUESTIONS.length;
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

type Finished = { sessionId: string; answers: TglAnswers };

export function TheGivingLedgerExperience({
  status,
  draft: initialDraft,
  completed,
}: {
  status: 'pending' | 'completed';
  /** Whatever she had already written, from the stored draft. Empty when she has not started. */
  draft: TglDraft;
  /** Her most recent finished sitting, when she is opening a route she has already answered. */
  completed: Finished | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<TglDraft>(initialDraft);
  // Where she stopped. A member with nothing written starts at the
  // invitation; a member coming back lands on the first question she has
  // not answered, and never past the last one.
  const written = firstUnansweredIndex(initialDraft);
  const landingStep = written === 0 ? INTRO_STEP : Math.min(written, TGL_QUESTIONS.length - 1);
  const [step, setStep] = useState<number>(landingStep);

  // The shared treatment's own state: which questions she has already
  // watched arrive, and whether a chapter beat is holding the screen. Seeded
  // with everything she has written plus the question a resume lands her on,
  // so coming back picks the pen up rather than reading her the question
  // again.
  const motion = useHappinessSittingMotion(
    initialSeenKeys(
      TGL_QUESTIONS.filter((entry) => isAnswered(initialDraft[entry.key])).map(
        (entry) => entry.key
      ),
      landingStep >= FIRST_QUESTION_STEP ? (TGL_QUESTIONS[landingStep]?.key ?? null) : null
    )
  );
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
    step >= FIRST_QUESTION_STEP && step < CLOSING_STEP ? (TGL_QUESTIONS[step] ?? null) : null;
  const answered = question ? isAnswered(draft[question.key]) : true;
  const blockedReason = question ? blockedReasonFor(draft[question.key]) : null;
  const isLastQuestion = step === CLOSING_STEP - 1;
  const experimentOffer = useMemo(() => buildTglExperiment(), []);

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
        const result = await saveTheGivingLedgerDraftAction(draft);
        if (!result.ok) {
          // Deliberately does NOT advance. Her words are still in this
          // component's state and on the screen, and the next Continue
          // sends the whole draft again.
          setError(TGL_COPY.saveFailedNote);
          return;
        }
        setHasSaved(true);
        // The chapter beat, when this Continue crosses into a new screen.
        // AFTER the save has landed, so the beat is never covering a write
        // that might still fail.
        const next = TGL_QUESTIONS[step + 1];
        if (next && next.screen !== question.screen) {
          motion.playChapter(sectionFor(next.screen).title);
        }
        setStep((previous) => previous + 1);
      });
      return;
    }

    startTransition(async () => {
      const result = await submitTheGivingLedgerAction(draft);
      if (!result.ok) {
        setError(result.error || TGL_COPY.submitError);
        return;
      }
      setFinished({ sessionId: result.sessionId, answers: result.answers });
      setStep(CLOSING_STEP);
    });
  }

  function acceptExperiment() {
    if (!finished) return;
    setError(null);
    startTransition(async () => {
      const result = await startTheGivingLedgerExperimentAction(finished.sessionId);
      setExperimentNote(result.ok ? TGL_COPY.experimentStarted : result.error);
      setStep(DONE_STEP);
    });
  }

  function declineExperiment() {
    setExperimentNote(TGL_COPY.experimentDeclined);
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
          {TGL_LABEL}
        </p>
        <h1 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
          {TGL_COPY.alreadyDoneHeading}
        </h1>
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
          {TGL_COPY.alreadyDoneBody}
        </p>
        {completed && (
          <div className="relative mt-6">
            <LedgerSentence answers={completed.answers} instant />
          </div>
        )}
        <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
          {TGL_COPY.closingDone}
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
            {TGL_COPY.introEyebrow}
          </p>
          <button
            type="button"
            onClick={leave}
            aria-label={TGL_COPY.exitLabel}
            className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="relative mt-4">
          <IntroReveal
            title={TGL_COPY.introTitle}
            titleTag="h1"
            titleClassName="font-[family-name:var(--font-cormorant-garamond)] text-[34px] leading-tight text-[#F5F0E4]"
            lines={[...TGL_INTRO_BODY_LINES]}
            lineClassName="text-[16px] leading-relaxed text-[#F5F0E4]/85"
            storageKey="the-giving-ledger-intro"
            button={{
              label: TGL_COPY.introButton,
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

  // The screen she is on is named ONCE, in the eyebrow, on every question
  // of that screen rather than only on its first. Printing it a second time
  // as a heading put the section name directly above itself on questions
  // one, four and seven of Owning Your Value, which read as a mistake
  // rather than as emphasis. Same three titles and nothing else here, so
  // there is one slot for them.
  // THE CHAPTER BEAT HOLDS THE WHOLE PANEL, with nothing on it but the
  // section title. Only the title, deliberately: the eyebrow, the Back
  // control and the Close are all part of the question screen, and a
  // chapter card with chrome on it is a header, not a beat. It ends on its
  // own timer (ChapterCard), and her draft was already saved before it
  // started.
  if (motion.chapterTitle) {
    return (
      <div className={PANEL}>
        <Glow />
        <AmbientDrift />
        <ChapterCard title={motion.chapterTitle} onDone={motion.endChapter} />
      </div>
    );
  }

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
              aria-label={TGL_COPY.questionBack}
              className="mef-focus-ring mef-press -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/70 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {step === CLOSING_STEP
              ? TGL_COPY.closingEyebrow
              : step === EXPERIMENT_STEP
                ? TGL_COPY.experimentEyebrow
                : step === DONE_STEP
                  ? TGL_COPY.closingEyebrow
                  : (section?.title ?? TGL_LABEL)}
          </p>
        </div>

        <button
          type="button"
          onClick={leave}
          disabled={isPending}
          aria-label={TGL_COPY.exitLabel}
          className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {question && (
        <QuestionStage
          counter={`Question ${step + 1} of ${TGL_QUESTIONS.length}`}
          prompt={question.prompt}
          revealKey={question.key}
          instant={motion.hasSeen(question.key)}
          onRevealed={() => motion.markSeen(question.key)}
        >
          <div className="mt-5">
            <textarea
              value={draft[question.key] ?? ''}
              onChange={(event) => setAnswer(question.key, event.target.value)}
              rows={9}
              placeholder={TGL_COPY.writingPlaceholder}
              aria-label={question.prompt}
              className={WRITING_BOX}
            />
          </div>

          {/* The sentence that makes a disabled Continue explainable. */}
          {blockedReason && <p className="mt-5 text-sm text-[#C4A050]">{blockedReason}</p>}
          {hasSaved && !error && (
            <p className="mt-4 text-sm text-[#F5F0E4]/55">{TGL_COPY.saveNote}</p>
          )}
          {error && <p className="mt-3 text-sm text-[#F5B7A0]">{error}</p>}

          <button
            type="button"
            onClick={advance}
            disabled={!answered || isPending}
            className={`${PRIMARY} ${blockedReason || hasSaved || error ? 'mt-3' : 'mt-5'}`}
          >
            {isLastQuestion ? TGL_COPY.questionSubmit : TGL_COPY.questionContinue}
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
          <LedgerSentence answers={finished.answers} />
          <ClosingTail
            delayMs={hddClosingTailDelayMs(
              hddClosingLines(finished.answers[TGL_CLOSING_KEY] ?? '').length,
              true
            )}
          >
            <h2 className="mt-8 font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-snug text-[#F5F0E4]">
              {TGL_COPY.closingHeading}
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-[#F5F0E4]/85">
              {TGL_COPY.closingBody}
            </p>
            <button
              type="button"
              onClick={() => setStep(EXPERIMENT_STEP)}
              className={`${PRIMARY} mt-8`}
            >
              {TGL_COPY.closingContinue}
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
            {TGL_COPY.experimentIntro}
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
            {experimentOffer.action}
          </p>
          <div className="mt-4 rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
              {TGL_COPY.experimentHardDayLabel}
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
            {TGL_COPY.experimentAccept}
          </button>
          <button
            type="button"
            onClick={declineExperiment}
            disabled={isPending}
            className={`${SECONDARY} mt-3`}
          >
            {TGL_COPY.experimentDecline}
          </button>
        </div>
      )}

      {step === DONE_STEP && (
        <div className="relative mt-4">
          {finished && <LedgerSentence answers={finished.answers} instant />}
          {experimentNote && (
            <p className="mt-6 text-[15px] leading-relaxed text-[#C4A050]">{experimentNote}</p>
          )}
          <div className="mt-6">
            <TheGivingLedgerResource />
          </div>
          <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
            {TGL_COPY.closingDone}
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
 * The closing centerpiece: the sentence she wrote at question nine, in the
 * serif face, under one fixed line.
 *
 * WHAT IS HERS AND WHAT IS ROOT'S, kept visibly apart. The sentence is her
 * own words, reproduced exactly: no quotation marks added around it, no
 * capitalisation or punctuation corrected, nothing trimmed to fit. Above it
 * is a small label naming whose words those are, and nothing else.
 *
 * THE ONE LINE BENEATH IS FIXED AND CLAIMS NOTHING ABOUT HER. It says who
 * the ledger belongs to and that it can be changed, which is true of anyone
 * who answered these nine questions. It does not tell her what her ledger
 * says, because the line directly above it is her own sentence saying
 * exactly that. That is the whole of what Root writes on this screen.
 *
 * A long sentence is allowed to be long: nothing here truncates, clamps or
 * scrolls her writing away.
 */
function LedgerSentence({ answers, instant = false }: { answers: TglAnswers; instant?: boolean }) {
  const sentence = answers[TGL_CLOSING_KEY] ?? '';

  return (
    <ClosingCenterpiece
      eyebrow={TGL_CLOSING_LABEL}
      entries={[{ text: sentence }]}
      fixedLine={TGL_CLOSING_LINE}
      instant={instant}
    />
  );
}
