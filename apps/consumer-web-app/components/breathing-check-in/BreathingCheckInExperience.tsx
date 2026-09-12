'use client';

/**
 * The Breathing Pattern Check-In, whole, on one route.
 *
 * THE COMPLETED PANEL LIVES HERE, NOT ON THE PAGE. Submitting calls a
 * Server Action, and a Server Action re-renders the route it was called
 * from. With the branch inside this component the re-render hands it a new
 * `status` prop while it stays MOUNTED, so its own step survives and her
 * results stand until she leaves.
 *
 * =====================================================================
 * THE CARD IS THE SCREEN, AND IT IS CENTRED IN WHAT IS LEFT OF THE
 * VIEWPORT.
 * =====================================================================
 *
 * The composition is fixed chrome at the top and one card in the middle of
 * everything below it: progress, breathing room, THE CARD, breathing room.
 * The outer element is a `100dvh` flex column, the header is `shrink-0`,
 * and the stage between them is `flex-1` with the card centred inside it.
 *
 * That is three utility classes rather than the shared `CenterStage`
 * deliberately: CenterStage centres a WHOLE column in the viewport, which
 * is right for a sparse screen with no chrome and wrong here, because it
 * would float the progress header down into the middle of the screen with
 * the card. The dynamic viewport unit is the same one CenterStage uses,
 * for the same reason: mobile browser chrome appearing and disappearing
 * must not move the card.
 *
 * THE CARD HAS A FLOOR HEIGHT AND IT IS THE SAME ON ALL SIXTEEN. "Chest
 * pain" is three syllables and "Does it tend to appear during stress" is
 * not, and a card that shrank to fit the short ones would make the screen
 * jump between every question. It is one height, and short questions are
 * given the room rather than squeezed out of it.
 *
 * ONE QUESTION PER SCREEN, AND A TAP IS THE ANSWER AND THE ADVANCE. Asking
 * for a Continue under each of the sixteen would be thirty two taps for
 * sixteen answers. The correction path is Back, which keeps the answer on
 * screen so changing it is one tap rather than a restart. The screens that
 * are NOT a question, the three pauses, carry a real Continue, because
 * there is nothing on them to tap instead.
 *
 * THE TRANSITION IS TWO ANIMATIONS, NOT ONE. Her selected state stays on
 * the answered card while that card fades and lifts, then the next one
 * comes up from below. Most takers in this app animate only the arriving
 * screen, which reads as the old one being cut. Under reduced motion both
 * become plain fades (app/globals.css), because the brief asks for the
 * slide to be REPLACED rather than removed: the continuity is the point of
 * the transition, and a member who asked for less motion still needs it.
 *
 * SAVE AND RESUME AFTER EVERY ANSWER. Each tap writes the whole draft a
 * moment later through a route handler rather than a Server Action, for
 * the reason that route's own header gives. A waiting save is flushed on
 * `pagehide` and on `visibilitychange`, so a member who taps and switches
 * to her mail app has already been saved.
 *
 * SHE IS SHOWN NO NUMBER WHILE SHE IS ANSWERING. Not a running total, not
 * a per answer point, not the maximum and not the reference threshold: an
 * instrument that told her where she stood partway through would change
 * what she answered next. This file imports the instrument for its prompts
 * and its five labels and never for a point value, and the walk test
 * checks all twenty screens rather than a sample.
 *
 * HER SCORE APPEARS ONCE THE SITTING IS OVER, on the results screen, which
 * is a separate component handed a finished view. That is a deliberate
 * reversal of how this shipped, and BreathingCheckInResults.tsx's own
 * header says so.
 *
 * IT CANNOT REACH THE COACH LAYER AT ALL:
 * tests/breathing-check-in-layers.test.tsx walks this file's import graph
 * and fails if any path reaches lib/breathing-check-in/coachCopy.ts or
 * ./coachView.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ArrowRight, X } from 'lucide-react';
import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';
import { useScreenTop } from '@/lib/questionnaire/useScreenTop';
import { prefersReducedMotionNow } from '@/lib/motion/useReducedMotion';
import { BPC_SCALE, type BpcAnswers } from '@/lib/breathing-check-in/instrument';
import { BPC_COPY } from '@/lib/breathing-check-in/copy';
import {
  bpcCompletionIndex,
  bpcProgressPercent,
  buildBpcSteps,
  resumeBpcStepIndex,
  type BpcStep,
} from '@/lib/breathing-check-in/steps';
import type { BpcMemberView } from '@/lib/breathing-check-in/signals';
import { submitBreathingCheckInAction } from '@/app/actions/breathingCheckIn';
import { BreathRipple } from './BreathRipple';
import { BreathingCheckInResults } from './BreathingCheckInResults';

/**
 * The card. Warm off-white on the cream page, a soft radius inside the 20
 * to 28px brief, a hairline rather than a border, and one ambient shadow.
 *
 * `justify-center` with the floor height is what stops a three word
 * question sitting at the top of a tall box with dead space under it.
 */
const CARD =
  'mef-bpc-card flex w-full max-w-[680px] flex-col justify-center rounded-[24px] border border-[#1B3A2D]/[0.07] bg-[#FCFAF4] px-6 py-8 shadow-[0_28px_70px_-34px_rgba(27,58,45,0.32)] sm:px-9 sm:py-10';
/** The floor height, one value for every screen in the walk. */
const CARD_MIN_H = 'min-h-[430px] sm:min-h-[460px]';

const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-3.5 text-sm font-semibold text-[#F5F0E4] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45';
const QUIET =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl border border-[#1B3A2D]/14 px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.05]';

/**
 * How long her selected answer stays on screen before the card swaps.
 *
 * 260ms, inside the brief's 200 to 300. The exit animation is 200ms and
 * runs inside this window, so what she sees is: the row fills, the card
 * lifts away, the next one rises. It fires sixteen times in one sitting,
 * which is why it is at the quiet end rather than the expressive one.
 */
const ADVANCE_MS = 260;
/** A run of taps is one write. Her own Continue cancels the timer and writes immediately. */
const AUTOSAVE_DELAY_MS = 600;
/** A pause moves on by itself after this, unless she has asked for less motion or presses Continue. */
const MILESTONE_AUTO_MS = 2600;
/** The completion moment. Inside the brief's one to two seconds. */
const COMPLETION_MS = 1600;

type Phase = 'intro' | 'resume' | 'walk' | 'results';

export function BreathingCheckInExperience({
  status,
  resumeAnswers,
  completedView,
}: {
  status: 'pending' | 'in_progress' | 'completed';
  resumeAnswers: BpcAnswers;
  /** Her stored reading, when she is opening a route she has already answered. */
  completedView: BpcMemberView | null;
}) {
  const router = useRouter();

  const steps = useMemo(() => buildBpcSteps(), []);
  const lastIndex = bpcCompletionIndex(steps);

  const [answers, setAnswers] = useState<BpcAnswers>(resumeAnswers);
  const [stepIndex, setStepIndex] = useState(() => resumeBpcStepIndex(steps, resumeAnswers));

  const hasStarted = Object.keys(resumeAnswers).length > 0;
  const [phase, setPhase] = useState<Phase>(() => {
    if (status === 'completed') return 'results';
    if (status === 'in_progress' && hasStarted) return 'resume';
    return 'pending' === status && !hasStarted ? 'intro' : 'walk';
  });

  /** Her freshly submitted reading. Distinct from `completedView`, which is a stored one. */
  const [finished, setFinished] = useState<BpcMemberView | null>(null);
  /** The completion beat has had its full run. Results wait for this AND for the submit. */
  const [revealDone, setRevealDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  const step: BpcStep = steps[Math.min(stepIndex, lastIndex)] ?? steps[0]!;
  const percent = bpcProgressPercent(answers);

  useScreenTop(
    phase === 'intro'
      ? 'intro'
      : phase === 'resume'
        ? 'resume'
        : phase === 'results' || finished
          ? 'results'
          : `step-${stepIndex}`
  );

  // ------------------------------------------------------------------
  // Saving.
  // ------------------------------------------------------------------

  const draftRef = useRef({ answers, stepIndex });
  draftRef.current = { answers, stepIndex };
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const milestoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Fired once per mount, so a re-render of the completion screen cannot submit twice. */
  const submitFired = useRef(false);
  /**
   * Writes go one at a time, in the order they were asked for. Two in
   * flight at once can land in either order, and the older one landing
   * last would store a position she has already left.
   */
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  const chainSave = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
    const next = saveChain.current.catch(() => undefined).then(run);
    saveChain.current = next.catch(() => undefined);
    return next;
  }, []);

  const postDraft = useCallback(
    async (draft: { answers: BpcAnswers; stepIndex: number }): Promise<void> => {
      try {
        await fetch('/api/breathing-check-in/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(draft),
        });
      } catch {
        // A failed autosave is not something to interrupt her with. The
        // next one writes the same draft, and the submit reports its own
        // failure with a button she can press again.
      }
    },
    []
  );

  function cancelAutosave() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }

  const queueAutosave = useCallback(() => {
    cancelAutosave();
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      void chainSave(() => postDraft(draftRef.current));
    }, AUTOSAVE_DELAY_MS);
  }, [chainSave, postDraft]);

  useEffect(() => {
    return () => {
      // The CURRENT value is the point: whichever timer is outstanding when
      // she leaves is the one that has to be cleared.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, []);

  /*
    A WAITING SAVE IS SENT THE MOMENT THE PAGE GOES AWAY.

    The autosave waits about six tenths of a second so that a run of taps
    is one write, and that is a window: a member who taps and reloads
    inside it had nothing sent at all. `pagehide` covers a reload, a back
    and a closed tab, and `visibilitychange` covers switching apps on a
    phone, which is the case that never fires pagehide on iOS.
  */
  useEffect(() => {
    const flush = () => {
      if (!autosaveTimer.current) return;
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      void postDraft(draftRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [postDraft]);

  // ------------------------------------------------------------------
  // Moving.
  // ------------------------------------------------------------------

  function goHome() {
    router.push('/dashboard');
  }

  function clearMovement() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (milestoneTimer.current) {
      clearTimeout(milestoneTimer.current);
      milestoneTimer.current = null;
    }
    setLeaving(false);
  }

  function goTo(next: number) {
    clearMovement();
    setStepIndex(Math.max(0, Math.min(next, lastIndex)));
  }

  /**
   * Back, and it always lands on a QUESTION.
   *
   * The step behind a question is sometimes one of the three pauses, and
   * pressing Back onto an encouragement screen with nothing on it to
   * correct is not what she asked for. Her previously selected answer is
   * still there when she arrives, so changing it is one tap.
   */
  function goBack() {
    if (submitting) return;
    setError(null);
    for (let index = stepIndex - 1; index >= 0; index -= 1) {
      if (steps[index]?.kind === 'question') {
        goTo(index);
        return;
      }
    }
  }

  /** Her answer to one question. It is also the advance. */
  function chooseAnswer(itemId: string, valueKey: string) {
    if (submitting || leaving) return;
    setError(null);
    setAnswers((current) => ({ ...current, [itemId]: valueKey }));
    queueAutosave();

    clearMovement();
    // The answered card leaves while her selection is still on it. The
    // next one mounts with its own entry animation when the index moves.
    setLeaving(true);
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      setLeaving(false);
      setStepIndex((current) => Math.min(current + 1, lastIndex));
    }, ADVANCE_MS);
  }

  /**
   * A pause moves on by itself, unless she has asked for less motion.
   *
   * REDUCED MOTION KEEPS THE CONTINUE AND DROPS THE TIMER, rather than
   * playing the same thing slowly. A screen that advances on its own is
   * motion she did not ask for; the button under it is the way through
   * either way, and it is drawn on both paths.
   */
  useEffect(() => {
    if (phase !== 'walk') return;
    if (step.kind !== 'milestone') return;
    if (prefersReducedMotionNow()) return;
    if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
    milestoneTimer.current = setTimeout(() => {
      milestoneTimer.current = null;
      setStepIndex((current) => Math.min(current + 1, lastIndex));
    }, MILESTONE_AUTO_MS);
    return () => {
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
      milestoneTimer.current = null;
    };
  }, [phase, step, stepIndex, lastIndex]);

  /**
   * The completion beat, and the submit it genuinely covers.
   *
   * IT IS FIRED FROM THE SCREEN SHE REACHED, not from the tap, so the one
   * path also covers a member who answered all sixteen, closed the tab and
   * came back: she lands on this screen and it finishes for her. It is
   * guarded by a ref, so a re-render cannot submit twice, and the write
   * itself is idempotent in the database anyway.
   *
   * THE BEAT AND THE SUBMIT ARE TIMED SEPARATELY AND THE RESULTS WAIT FOR
   * BOTH. A submit that lands in 300ms does not cut the moment short, and
   * a slow one does not leave her looking at a finished animation with
   * nothing behind it: the ring keeps breathing until there is something
   * to show.
   */
  useEffect(() => {
    if (phase !== 'walk') return;
    if (step.kind !== 'completion') return;

    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => {
      revealTimer.current = null;
      setRevealDone(true);
    }, COMPLETION_MS);

    if (!submitFired.current) {
      submitFired.current = true;
      submit();
    }

    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = null;
    };
    // `submit` closes over the answers ref rather than state it needs to
    // re-bind to, and this must run once per arrival on the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step.kind]);

  /**
   * Finishes the sitting.
   *
   * IT CAN NEVER LEAVE HER ON A DEAD SCREEN. The finally is the point: a
   * call that REJECTS rather than returning an error (a dropped connection
   * on a phone looks exactly like that) still clears `submitting`, so the
   * retry button below comes back and she is told what to do with it.
   */
  function submit() {
    cancelAutosave();
    setSubmitting(true);
    setError(null);
    const finalAnswers = draftRef.current.answers;
    startTransition(async () => {
      try {
        const result = await chainSave(() => submitBreathingCheckInAction(finalAnswers));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setFinished(result.view);
      } catch {
        setError(BPC_COPY.saveError);
      } finally {
        setSubmitting(false);
      }
    });
  }

  function retrySubmit() {
    if (submitting) return;
    submit();
  }

  // ------------------------------------------------------------------
  // Screens.
  // ------------------------------------------------------------------

  const view = finished ?? (phase === 'results' ? completedView : null);
  const showResults = view !== null && (finished === null || revealDone);

  if (showResults && view) {
    return (
      <Stage header={null}>
        <div className={`${CARD} ${CARD_MIN_H}`}>
          {/*
            A sitting she finished on an earlier visit is told so, in one
            line, above the same reading. She is not silently bounced to
            Home, and she is not shown a fresh completion moment for
            something she did days ago.
          */}
          {!finished && (
            <p className="mb-6 text-[13px] leading-relaxed text-[#7C8F84]">
              {BPC_COPY.alreadyDoneBody}
            </p>
          )}
          <BreathingCheckInResults view={view} onHome={goHome} />
        </div>
      </Stage>
    );
  }

  if (phase === 'intro') {
    return (
      <Stage header={<Chrome onHome={goHome} />}>
        <div className={`mef-bpc-card-in ${CARD} ${CARD_MIN_H} text-center`}>
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[32px] leading-[1.15] text-[#1B3A2D] sm:text-[38px]">
            {BPC_COPY.introTitle}
          </h1>

          <p className="mx-auto mt-6 max-w-[30rem] text-[16px] leading-relaxed text-[#4F645A]">
            {BPC_COPY.introLineOne}
          </p>
          <p className="mx-auto mt-4 max-w-[30rem] text-[16px] leading-relaxed text-[#4F645A]">
            {BPC_COPY.introLineTwo}
          </p>

          <p className="mt-8 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#7C8F84]">
            {BPC_COPY.introMeta}
          </p>

          <button
            type="button"
            onClick={() => setPhase('walk')}
            className={`${PRIMARY} mt-8`}
          >
            {BPC_COPY.introCta}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </Stage>
    );
  }

  if (phase === 'resume') {
    return (
      <Stage header={<Chrome onHome={goHome} />}>
        <div className={`mef-bpc-card-in ${CARD} ${CARD_MIN_H} text-center`}>
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[32px] leading-[1.15] text-[#1B3A2D] sm:text-[36px]">
            {BPC_COPY.resumeTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-[28rem] text-[16px] leading-relaxed text-[#4F645A]">
            {BPC_COPY.resumeBody}
          </p>
          <button type="button" onClick={() => setPhase('walk')} className={`${PRIMARY} mt-8`}>
            {BPC_COPY.resumeCta}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </Stage>
    );
  }

  if (step.kind === 'completion') {
    return (
      <Stage
        header={
          <Header
            percent={100}
            label={null}
            onBack={null}
            onHome={goHome}
          />
        }
      >
        <div className={`mef-bpc-card-in ${CARD} ${CARD_MIN_H} text-center`}>
          <div role="status" aria-live="polite">
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-[1.2] text-[#1B3A2D] sm:text-[34px]">
              {BPC_COPY.completionTitle}
            </h1>
          </div>

          <div className="mt-9">
            <BreathRipple />
          </div>

          {error && (
            <>
              <p role="alert" className="mt-8 text-[14px] leading-relaxed text-[#8A3B2A]">
                {error}
              </p>
              <button
                type="button"
                onClick={retrySubmit}
                disabled={submitting}
                className={`${PRIMARY} mt-5`}
              >
                {BPC_COPY.continueLabel}
              </button>
            </>
          )}
        </div>
      </Stage>
    );
  }

  if (step.kind === 'milestone') {
    return (
      <Stage
        header={
          <Header
            percent={percent}
            label={`Question ${step.questionsDone} of ${step.questionCount}`}
            onBack={goBack}
            onHome={goHome}
          />
        }
      >
        <div
          key={`milestone-${stepIndex}`}
          className={`mef-bpc-card-in ${CARD} ${CARD_MIN_H} text-center`}
        >
          {/*
            Everything is in its final box in the first frame and the whole
            group fades once, which is the rule the section beat learned on
            a real phone: a screen that assembles itself part by part
            cannot be told apart from one that has not finished loading.
          */}
          <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-[1.2] text-[#1B3A2D] sm:text-[34px]">
            {step.milestone.heading}
          </h2>
          <p className="mx-auto mt-5 max-w-[28rem] text-[16px] leading-relaxed text-[#4F645A]">
            {step.milestone.line}
          </p>

          <div className="mx-auto mt-8 h-px w-32 bg-gradient-to-r from-transparent via-[#C4A050]/45 to-transparent" />

          <button
            type="button"
            onClick={() => goTo(stepIndex + 1)}
            className={`${QUIET} mx-auto mt-8 max-w-[20rem]`}
          >
            {BPC_COPY.continueLabel}
          </button>
        </div>
      </Stage>
    );
  }

  // A question.
  const chosen = answers[step.item.itemId];
  const promptId = `bpc-prompt-${step.item.itemId}`;

  return (
    <Stage
      header={
        <Header
          percent={percent}
          label={`Question ${step.questionNumber} of ${step.questionCount}`}
          onBack={stepIndex > 0 ? goBack : null}
          onHome={goHome}
        />
      }
    >
      <div
        key={`q-${step.item.itemId}`}
        className={`${leaving ? 'mef-bpc-card-out' : 'mef-bpc-card-in'} ${CARD} ${CARD_MIN_H}`}
      >
        {/*
          THE SMALL LINE, THEN THE QUESTION, THEN THE ANSWERS. The window
          the instrument asks about is said once, quietly, above a question
          that is the biggest thing on the screen. It is the same sentence
          on all sixteen screens, because a window that changed wording
          partway through would be a different question.
        */}
        <p className="text-[13px] leading-relaxed text-[#7C8F84]">
          {BPC_COPY.questionContextLine}
        </p>

        <h1
          id={promptId}
          className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-[1.18] text-[#1B3A2D] sm:text-[34px]"
        >
          {step.item.prompt}
        </h1>

        <div role="radiogroup" aria-labelledby={promptId} className="mt-8 space-y-2.5">
          {BPC_SCALE.map((option) => (
            <QuestionOptionButton
              key={option.valueKey}
              tone="gold-on-light"
              label={option.label}
              selected={chosen === option.valueKey}
              onSelect={() => chooseAnswer(step.item.itemId, option.valueKey)}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-5 text-[14px] text-[#8A3B2A]">
            {error}
          </p>
        )}
      </div>
    </Stage>
  );
}

// ---------------------------------------------------------------------

/**
 * The composition: chrome at the top, one card centred in what is left.
 *
 * `100dvh` rather than `100vh` so mobile browser chrome appearing and
 * disappearing does not move the card, which is the same unit the shared
 * `.mef-center-viewport` uses and for the same reason.
 */
function Stage({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-7rem)] w-full flex-col">
      {header !== null && <div className="shrink-0 pt-2">{header}</div>}
      {/*
        The card sits in the middle of everything below the header, with
        equal room above and below it. `py-8` is the floor on that room, so
        a short viewport still keeps the card off the chrome rather than
        collapsing the gap to nothing.
      */}
      <div className="flex flex-1 items-center justify-center py-8">{children}</div>
    </div>
  );
}

/** The header on the screens with no progress of their own. */
function Chrome({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B89340]">
        {BPC_COPY.progressLabel}
      </p>
      <CloseButton onHome={onHome} />
    </div>
  );
}

function CloseButton({ onHome }: { onHome: () => void }) {
  return (
    <button
      type="button"
      onClick={onHome}
      aria-label={BPC_COPY.homeLabel}
      className="mef-focus-ring mef-press -mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-[#7C8F84] transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
    >
      <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

/**
 * The name, the position, and one hairline that moves.
 *
 * THE LINE COUNTS ANSWERED QUESTIONS, NOT SCREENS. A pause is not progress
 * through the instrument, and a line that jumped on an encouragement
 * screen would be claiming she had answered something she had not.
 *
 * IT IS A HAIRLINE, DELIBERATELY. The brief asked for an elegant line
 * rather than a gamified bar, so it is one pixel of muted gold on a very
 * quiet track, and the only thing it ever does is grow.
 */
function Header({
  percent,
  label,
  onBack,
  onHome,
}: {
  percent: number;
  /** Null on the completion screen, where there is no question to number. */
  label: string | null;
  /** Null when there is nothing behind her. */
  onBack: (() => void) | null;
  onHome: () => void;
}) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={BPC_COPY.backLabel}
              className="mef-focus-ring mef-press -ml-2.5 inline-flex h-10 w-10 items-center justify-center rounded-full text-[#7C8F84] transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : (
            <span aria-hidden="true" className="h-10 w-1" />
          )}
          <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B89340]">
            {BPC_COPY.progressLabel}
          </p>
        </div>
        <CloseButton onHome={onHome} />
      </div>

      {label && (
        <p className="mt-3 text-[13px] text-[#7C8F84]">{label}</p>
      )}

      <div
        className={`${label ? 'mt-2.5' : 'mt-4'} h-px w-full overflow-hidden rounded-full bg-[#1B3A2D]/10`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={BPC_COPY.progressLabel}
      >
        <div
          className="h-full rounded-full bg-[#C4A050] transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
