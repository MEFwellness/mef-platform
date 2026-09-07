'use client';

/**
 * Your Own Company, whole, on one route.
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
 * one at a time, then the two sentences on a screen of their own, then the
 * one small thing, then the piece of reading and the way out.
 *
 * THE SIGNATURE IS THE INSTINCT PICK, AND NOT THE SHELF. What You Put Down
 * used a shelf, a drag and a line with a mark on it, and NONE of those
 * appears here: the standing rotation rule is at the top of
 * lib/happiness-deep-dive/interactive.ts. Five of these nine open with a
 * this-or-that answered from the gut, and every one of those is followed by
 * the writing it was there to set up, which is the other standing rule in
 * that same file. Nothing here collects a choice instead of a sentence: all
 * nine questions carry a writing box.
 *
 * SAVE AND RESUME COVERS BOTH HALVES. Every Continue writes her writing AND
 * her picks through a server action she reached by tapping. Nothing is
 * written by opening the screen. A save that fails does NOT advance her,
 * because advancing past a failed save is how a member loses forty minutes
 * of writing, and on this template it is also how she loses a rapid round
 * she has just answered.
 *
 * EVERY LINE SHE CHOOSES BETWEEN IS ONE SHE WROTE. The list at question
 * eight is derived from her question three answer, here and on the server
 * (lib/your-own-company/instinct.ts), so nothing on this screen is ever a
 * sentence Root made up. If she goes back and edits question three, the
 * list is re-hung by text, so a line she kept keeps her pick and a line she
 * deleted takes it with it.
 *
 * ROOT SAYS NOTHING ABOUT HER. There is no scoring here, no pattern, no
 * observation and no summary. The one number anywhere in the sitting is her
 * own count of her own taps in the rapid round, computed in one place from
 * the five answers she gave. The closing prints two sentences she wrote and
 * one fixed line that claims nothing specific about her.
 *
 * THE MOTION IS NOT THIS TEMPLATE'S. The question typing itself, the
 * writing box arriving only once it has, the follow-up prompt after a pick,
 * the chapter beat between the three screens, the ambient layer, the staged
 * closing, the cards, the pair, the round and the sentence that takes
 * another's place are all components/happiness-deep-dive/, shared with the
 * six templates beside it and with whatever comes next. Nothing about the
 * treatment is authored here.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import {
  YOC_CLOSING_KEY,
  YOC_LINES_KEY,
  YOC_QUESTIONS,
  YOC_RAPID_PAIR,
  YOC_RAPID_PHRASES,
  yocBlockedReasonFor,
  yocInteractionDone,
  yocLeadPromptFor,
  yocPromptFor,
  yocQuestionDone,
  yocTallySentence,
  firstUnfinishedIndex,
  type YocAnswers,
  type YocDraft,
  type YocQuestion,
} from '@/lib/your-own-company/questions';
import {
  yocLineText,
  yocReconcileInstinct,
  type YocInstinctState,
} from '@/lib/your-own-company/instinct';
import type { HddInstinctSide } from '@/lib/happiness-deep-dive/interactive';
import {
  YOC_CLOSING_FIRST_LABEL,
  YOC_CLOSING_LINE,
  YOC_CLOSING_SECOND_LABEL,
  YOC_COPY,
  YOC_INTRO_BODY_LINES,
  YOC_LABEL,
  YOC_PICK_COPY,
  sectionFor,
} from '@/lib/your-own-company/copy';
import { buildYocExperiment } from '@/lib/your-own-company/experiment';
import {
  saveYourOwnCompanyDraftAction,
  startYourOwnCompanyExperimentAction,
  submitYourOwnCompanyAction,
} from '@/app/actions/yourOwnCompany';
import { IntroReveal } from '@/components/IntroReveal';
import {
  AmbientDrift,
  ChapterCard,
  ClosingCenterpiece,
  ClosingTail,
  FollowUpPrompt,
  InstinctPair,
  QuestionStage,
  RapidRound,
  SupersededPair,
  WordCard,
  initialSeenKeys,
  useHappinessSittingMotion,
} from '@/components/happiness-deep-dive';
import { hddClosingTailDelayMs } from '@/lib/happiness-deep-dive/motion';
import { YourOwnCompanyResource } from './YourOwnCompanyResource';

const INTRO_STEP = -1;
const FIRST_QUESTION_STEP = 0;
const CLOSING_STEP = YOC_QUESTIONS.length;
const EXPERIMENT_STEP = CLOSING_STEP + 1;
const DONE_STEP = CLOSING_STEP + 2;

/**
 * The two sentences of the closing arrive one after the other, so the
 * picture is worth two beats of the shared staged reveal rather than one.
 * Without that the fixed line beneath would land while the rewrite was
 * still arriving.
 */
const CLOSING_VISUAL_BEATS = 2;

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40';
const SECONDARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl border border-[#F5F0E4]/25 px-6 py-3 text-sm font-semibold text-[#F5F0E4] transition hover:bg-[#F5F0E4]/10 disabled:opacity-40';
const WRITING_BOX =
  'w-full min-h-[240px] resize-y rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4 text-[16px] leading-relaxed text-[#F5F0E4] placeholder:text-[#F5F0E4]/35 focus:border-[#C4A050] focus:outline-none';

type Finished = { sessionId: string; answers: YocAnswers; instinct: YocInstinctState };

/**
 * The key the written half of a question is remembered under.
 *
 * SEPARATE FROM THE QUESTION'S OWN KEY, because the two halves arrive
 * separately and are seen separately: she can have watched the lead prompt
 * type and not yet have made a pick, so the written half has not been asked
 * yet.
 *
 * QUESTION EIGHT'S KEY CARRIES HER PICK, because its prompt quotes the line
 * she named. Changing her mind about which line cuts deepest asks a
 * genuinely different question, and it should arrive typed in Root's voice
 * rather than being the previous question edited in place.
 */
function followUpKey(question: YocQuestion, state: YocInstinctState): string {
  return question.kind === 'choose'
    ? `${question.key}#written:${state.deepestCutLineId ?? 'none'}`
    : `${question.key}#written`;
}

export function YourOwnCompanyExperience({
  status,
  draft: initialDraft,
  instinct: initialInstinct,
  completed,
}: {
  status: 'pending' | 'completed';
  /** Whatever she had already written, from the stored draft. Empty when she has not started. */
  draft: YocDraft;
  /** Whatever she had already picked. Empty when she has not started. */
  instinct: YocInstinctState;
  /** Her most recent finished sitting, when she is opening a route she has already answered. */
  completed: Finished | null;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState<YocDraft>(initialDraft);
  const [storedInstinct, setStoredInstinct] = useState<YocInstinctState>(initialInstinct);

  // HER LINES ARE ALWAYS CONSISTENT WITH HER QUESTION THREE ANSWER. Derived
  // during render rather than kept in step by an effect, so there is no
  // frame in which the cards on screen belong to a line she has just
  // deleted. Reconciling is by text and is idempotent, so doing it on every
  // render costs nothing and can never drift.
  const linesText = draft[YOC_LINES_KEY] ?? '';
  const instinct = useMemo(
    () => yocReconcileInstinct(storedInstinct, linesText),
    [storedInstinct, linesText]
  );

  // Where she stopped. A member with nothing done starts at the invitation;
  // a member coming back lands on the first question she has not finished,
  // and never past the last one.
  const done = firstUnfinishedIndex(initialDraft, initialInstinct);
  const landingStep = done === 0 ? INTRO_STEP : Math.min(done, YOC_QUESTIONS.length - 1);
  const [step, setStep] = useState<number>(landingStep);

  // The shared treatment's own state: which prompts she has already watched
  // arrive this sitting, and whether a chapter beat is holding the screen.
  // Seeded with everything she has already finished, both halves, plus the
  // question a resume lands her on, so coming back picks the pen up rather
  // than reading her the question again.
  const motion = useHappinessSittingMotion(
    initialSeenKeys(
      YOC_QUESTIONS.flatMap((entry) => {
        const seen: string[] = [];
        if (yocQuestionDone(entry, initialDraft, initialInstinct)) seen.push(entry.key);
        // The written half counts as seen the moment its interactive half is
        // finished, because that is exactly when she was shown it.
        if (yocInteractionDone(entry, initialInstinct)) {
          seen.push(followUpKey(entry, initialInstinct));
        }
        return seen;
      }),
      landingStep >= FIRST_QUESTION_STEP ? (YOC_QUESTIONS[landingStep]?.key ?? null) : null
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

  const question: YocQuestion | null =
    step >= FIRST_QUESTION_STEP && step < CLOSING_STEP ? (YOC_QUESTIONS[step] ?? null) : null;
  const answered = question ? yocQuestionDone(question, draft, instinct) : true;
  const blockedReason = question ? yocBlockedReasonFor(question, draft, instinct) : null;
  const isLastQuestion = step === CLOSING_STEP - 1;
  const experimentOffer = useMemo(() => buildYocExperiment(), []);

  function leave() {
    router.push('/dashboard');
  }

  function setAnswer(key: string, value: string) {
    setError(null);
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  /** Every change goes through the reconciled state, never the raw stored one. */
  function updateInstinct(patch: Partial<YocInstinctState>) {
    setError(null);
    setStoredInstinct({ ...instinct, ...patch });
  }

  function pick(questionKey: string, side: HddInstinctSide) {
    updateInstinct({ picks: { ...instinct.picks, [questionKey]: side } });
  }

  function answerRapid(phraseId: string, side: HddInstinctSide) {
    updateInstinct({ rapid: { ...instinct.rapid, [phraseId]: side } });
  }

  function advance() {
    if (!question || !answered) return;
    setError(null);

    if (!isLastQuestion) {
      startTransition(async () => {
        const result = await saveYourOwnCompanyDraftAction(draft, instinct);
        if (!result.ok) {
          // Deliberately does NOT advance. Her words and her picks are still
          // in this component's state and on the screen, and the next
          // Continue sends both again.
          setError(YOC_COPY.saveFailedNote);
          return;
        }
        setHasSaved(true);
        // The chapter beat, when this Continue crosses into a new screen.
        // AFTER the save has landed, so the beat is never covering a write
        // that might still fail.
        const next = YOC_QUESTIONS[step + 1];
        if (next && next.screen !== question.screen) {
          motion.playChapter(sectionFor(next.screen).title);
        }
        setStep((previous) => previous + 1);
      });
      return;
    }

    startTransition(async () => {
      const result = await submitYourOwnCompanyAction(draft, instinct);
      if (!result.ok) {
        setError(result.error || YOC_COPY.submitError);
        return;
      }
      setFinished({
        sessionId: result.sessionId,
        answers: result.answers,
        instinct: result.instinct,
      });
      setStep(CLOSING_STEP);
    });
  }

  function acceptExperiment() {
    if (!finished) return;
    setError(null);
    startTransition(async () => {
      const result = await startYourOwnCompanyExperimentAction(finished.sessionId);
      setExperimentNote(result.ok ? YOC_COPY.experimentStarted : result.error);
      setStep(DONE_STEP);
    });
  }

  function declineExperiment() {
    setExperimentNote(YOC_COPY.experimentDeclined);
    setStep(DONE_STEP);
  }

  /** The writing box, identical on all nine questions except for its placeholder. */
  function writingBox(current: YocQuestion, label: string) {
    return (
      <textarea
        value={draft[current.key] ?? ''}
        onChange={(event) => setAnswer(current.key, event.target.value)}
        rows={current.key === YOC_LINES_KEY ? 10 : 9}
        placeholder={
          current.key === YOC_LINES_KEY ? YOC_COPY.listPlaceholder : YOC_COPY.writingPlaceholder
        }
        aria-label={label}
        className={WRITING_BOX}
      />
    );
  }

  /** The written half of a question that opened with something she did. */
  function followUp(current: YocQuestion) {
    const key = followUpKey(current, instinct);
    const prompt = yocPromptFor(current, instinct);
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
          {YOC_LABEL}
        </p>
        <h1 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
          {YOC_COPY.alreadyDoneHeading}
        </h1>
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
          {YOC_COPY.alreadyDoneBody}
        </p>
        {completed && (
          <div className="relative mt-6">
            <TheClosing finished={completed} instant />
          </div>
        )}
        <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
          {YOC_COPY.closingDone}
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
            {YOC_COPY.introEyebrow}
          </p>
          <button
            type="button"
            onClick={leave}
            aria-label={YOC_COPY.exitLabel}
            className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="relative mt-4">
          <IntroReveal
            title={YOC_COPY.introTitle}
            titleTag="h1"
            titleClassName="font-[family-name:var(--font-cormorant-garamond)] text-[34px] leading-tight text-[#F5F0E4]"
            lines={[...YOC_INTRO_BODY_LINES]}
            lineClassName="text-[16px] leading-relaxed text-[#F5F0E4]/85"
            storageKey="your-own-company-intro"
            button={{
              label: YOC_COPY.introButton,
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
              aria-label={YOC_COPY.questionBack}
              className="mef-focus-ring mef-press -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/70 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {step === CLOSING_STEP
              ? YOC_COPY.closingEyebrow
              : step === EXPERIMENT_STEP
                ? YOC_COPY.experimentEyebrow
                : step === DONE_STEP
                  ? YOC_COPY.closingEyebrow
                  : (section?.title ?? YOC_LABEL)}
          </p>
        </div>

        <button
          type="button"
          onClick={leave}
          disabled={isPending}
          aria-label={YOC_COPY.exitLabel}
          className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {question && (
        <QuestionStage
          counter={`Question ${step + 1} of ${YOC_QUESTIONS.length}`}
          // What Root asks first: the statement the two cards complete, the
          // round's standing question, the instruction to tap one of her own
          // lines, or, on a plain written question, the whole question.
          prompt={yocLeadPromptFor(question)}
          revealKey={question.key}
          instant={motion.hasSeen(question.key)}
          onRevealed={() => motion.markSeen(question.key)}
        >
          <div className="mt-5">
            {question.kind === 'written' && writingBox(question, question.prompt)}

            {question.kind === 'instinct' && question.pair && (
              <div>
                {!instinct.picks[question.key] && (
                  <p className="mb-4 text-sm text-[#F5F0E4]/55">{YOC_PICK_COPY.pickHint}</p>
                )}
                <InstinctPair
                  question={yocLeadPromptFor(question)}
                  a={question.pair.a}
                  b={question.pair.b}
                  value={instinct.picks[question.key] ?? null}
                  onPick={(side) => pick(question.key, side)}
                  still={reducedMotion}
                />
                {instinct.picks[question.key] && <div className="mt-7">{followUp(question)}</div>}
              </div>
            )}

            {question.kind === 'rapid' && (
              <div>
                <p className="mb-5 text-sm text-[#F5F0E4]/55">{YOC_PICK_COPY.roundIntro}</p>
                <RapidRound
                  question={yocLeadPromptFor(question)}
                  items={YOC_RAPID_PHRASES}
                  labels={YOC_RAPID_PAIR}
                  answers={instinct.rapid}
                  onAnswer={answerRapid}
                  tallySentence={yocTallySentence(instinct)}
                  counterFor={(index, total) => `${index} of ${total}`}
                >
                  {followUp(question)}
                </RapidRound>
              </div>
            )}

            {question.kind === 'choose' && (
              <div>
                <HerLines
                  instinct={instinct}
                  still={reducedMotion}
                  onChoose={(id) => updateInstinct({ deepestCutLineId: id })}
                />
                {instinct.deepestCutLineId && <div className="mt-7">{followUp(question)}</div>}
              </div>
            )}
          </div>

          {/* The sentence that makes a disabled Continue explainable. */}
          {blockedReason && <p className="mt-5 text-sm text-[#C4A050]">{blockedReason}</p>}
          {hasSaved && !error && (
            <p className="mt-4 text-sm text-[#F5F0E4]/55">{YOC_COPY.saveNote}</p>
          )}
          {error && <p className="mt-3 text-sm text-[#F5B7A0]">{error}</p>}

          <button
            type="button"
            onClick={advance}
            disabled={!answered || isPending}
            className={`${PRIMARY} ${blockedReason || hasSaved || error ? 'mt-3' : 'mt-5'}`}
          >
            {isLastQuestion ? YOC_COPY.questionSubmit : YOC_COPY.questionContinue}
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
          <ClosingTail delayMs={hddClosingTailDelayMs(CLOSING_VISUAL_BEATS, true)}>
            <h2 className="mt-8 font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-snug text-[#F5F0E4]">
              {YOC_COPY.closingHeading}
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-[#F5F0E4]/85">
              {YOC_COPY.closingBody}
            </p>
            <button
              type="button"
              onClick={() => setStep(EXPERIMENT_STEP)}
              className={`${PRIMARY} mt-8`}
            >
              {YOC_COPY.closingContinue}
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
            {YOC_COPY.experimentIntro}
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
            {experimentOffer.action}
          </p>
          <div className="mt-4 rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
              {YOC_COPY.experimentHardDayLabel}
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
            {YOC_COPY.experimentAccept}
          </button>
          <button
            type="button"
            onClick={declineExperiment}
            disabled={isPending}
            className={`${SECONDARY} mt-3`}
          >
            {YOC_COPY.experimentDecline}
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
            <YourOwnCompanyResource />
          </div>
          <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
            {YOC_COPY.closingDone}
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
 * Question eight's first half: the three things she said the voice repeats,
 * handed back to her as cards, and she taps the one that cuts deepest.
 *
 * NOT A SHELF. Nothing is placed, nothing is dragged and nothing is put
 * anywhere. They are her own sentences in a list, and one of them is
 * chosen. The card itself is the shared WordCard, because a card carrying
 * her own words is not the shelf that template six put them on.
 *
 * SHE MAY CHANGE IT. Tapping a different one moves the mark, and question
 * eight's written prompt re-arrives quoting the new sentence, because it is
 * genuinely a different question.
 *
 * IF SHE WROTE NOTHING USABLE at question three, this says so plainly
 * rather than showing an empty list she cannot get past. Back reaches
 * question three, which is where the lines come from.
 */
function HerLines({
  instinct,
  still,
  onChoose,
}: {
  instinct: YocInstinctState;
  still: boolean;
  onChoose: (id: string) => void;
}) {
  if (instinct.lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#F5F0E4]/20 px-4 py-6 text-center text-[14px] leading-relaxed text-[#F5F0E4]/50">
        {YOC_PICK_COPY.linesEmpty}
      </div>
    );
  }

  return (
    <ul aria-label={YOC_PICK_COPY.linesLabel} className="space-y-3">
      {instinct.lines.map((line) => {
        const chosen = line.id === instinct.deepestCutLineId;
        return (
          <li key={line.id}>
            <WordCard
              text={line.text}
              tone={chosen ? 'marked' : 'resting'}
              note={chosen ? YOC_PICK_COPY.deepestNote : undefined}
              onSelect={() => onChoose(line.id)}
              actionLabel={YOC_PICK_COPY.chooseDeepest}
              pressed={chosen}
              still={still}
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The closing: the sentence she named, the rewrite that takes its place,
 * and one fixed line.
 *
 * WHAT IS HERS AND WHAT IS ROOT'S, kept visibly apart. Both sentences are
 * reproduced exactly: no quotation marks added around either, no
 * capitalisation or punctuation corrected, nothing trimmed to fit. Above
 * each is a small label naming what it is, and nothing else.
 *
 * THE OLD SENTENCE IS NOT REMOVED, IT FADES BACK. She wrote it, it is still
 * true that she wrote it, and it stays legible under the rewrite. What the
 * motion says is which one is in front of her now, and nothing else. Under
 * reduced motion both are simply present, with the rewrite visually
 * primary by the same means: the same order, the same sizes, the same
 * colours.
 *
 * THE ONE LINE BENEATH IS FIXED AND CLAIMS NOTHING ABOUT HER. "You wrote
 * both. Only one of them is true." is a statement about two sentences
 * printed directly above it, both of which she wrote in this sitting and
 * both of which her coach's card also shows. It names no attribute of hers,
 * predicts nothing, and does not say which of the two it means.
 *
 * THE ARRIVAL IS THE SHARED ONE (ClosingCenterpiece): quiet first, then the
 * pair, then the fixed line last after a real pause.
 */
function TheClosing({ finished, instant = false }: { finished: Finished; instant?: boolean }) {
  const original = yocLineText(finished.instinct, finished.instinct.deepestCutLineId) ?? '';
  const rewrite = finished.answers[YOC_CLOSING_KEY] ?? '';

  return (
    <ClosingCenterpiece
      entries={[]}
      fixedLine={YOC_CLOSING_LINE}
      instant={instant}
      visualBeats={CLOSING_VISUAL_BEATS}
      visual={
        <SupersededPair
          firstCaption={YOC_CLOSING_FIRST_LABEL}
          first={original}
          secondCaption={YOC_CLOSING_SECOND_LABEL}
          second={rewrite}
          instant={instant}
        />
      }
    />
  );
}
