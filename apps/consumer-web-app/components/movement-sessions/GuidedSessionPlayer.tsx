'use client';

/**
 * ONE guided player, for every kind of session.
 *
 * This is the screen Root Movement Level 1 shipped with, lifted out of
 * MovementSessionPlayer so a coach-assigned program workout can be walked
 * the same way. There is no second player: MovementSessionPlayer is now a
 * thin adapter that maps a Root session onto this, and
 * AssignedWorkoutGuidedSession does the same for an assigned workout. If
 * this screen changes, both change, which is the whole reason it was
 * extracted rather than copied.
 *
 * Three states, in one component because they are one continuous
 * experience and a member should never watch a page reload mid-session:
 *
 *   overview   the lineup, and one button to begin
 *   playing    one exercise at a time, with video, prescription, skip
 *   done       a short acknowledgment
 *
 * The video is the SAME component the Exercise Library detail screen uses
 * (components/exercise-library/TapToPlayVideo), so tap-to-play, the ~10min
 * URL cache, and the poster and cues fallbacks behave here exactly as they
 * do there, and there is still exactly one component in the product that
 * can spend Your Move quota.
 *
 * STRICTLY TAP TO PLAY. Reaching an exercise never fetches its video.
 * Advancing remounts the player with a React key, which puts it back in
 * its idle, poster-only state and cannot start a request. Quota is spent
 * by a member's taps and by nothing else.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *   - No timer counts down and no clock runs. The prescription is stated
 *     and the member decides when she is done with it. A running timer
 *     turns a session into something you can fall behind.
 *   - No streak, no badge, no score, no "you did it" celebration. The
 *     completion state says what happened and offers the way out.
 *   - Nothing at all happens if she leaves part way through. There is no
 *     "are you sure", no saved-progress nag, and no message waiting for
 *     her the next time.
 *   - No free text and no rating. A skip is a skip, and she is never
 *     asked to justify one.
 *   - No copy on this screen uses an em dash or an exclamation mark.
 */

import { useState, type ReactNode } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { TapToPlayVideo } from '@/components/exercise-library/TapToPlayVideo';
import { WhenNotEmpty } from '@/components/layout';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** One exercise, already resolved and already formatted. The player renders strings; it does not know where they came from. */
export interface GuidedExercise {
  /** Stable list key. An assigned workout can legitimately contain the same exercise twice, so this is not the external id. */
  key: string;
  externalId: string;
  name: string;
  primaryMuscle: string | null;
  category: string | null;
  posterUrl: string | null;
  cues: string[];
  /** The full prescription line, e.g. "2 sets of 10 reps · Tempo 3-1-3 · 45 seconds rest". Null when the program carries none. */
  prescription: string | null;
  /** The short form under a lineup row, e.g. "2 sets of 10 reps". */
  prescriptionSummary: string | null;
  /** The rest sentence shown under the prescription, e.g. "45 seconds rest". Null when there is no rest. */
  rest: string | null;
}

export interface GuidedSessionPlayerProps {
  exercises: GuidedExercise[];
  /** Small label above the title, e.g. "Root Movement". */
  kicker: ReactNode;
  title: string;
  description?: string | null;
  /** The row of small facts under the description (duration, count). */
  meta?: ReactNode;
  /** Overview's way out, top left. */
  exitLabel: string;
  onExit: () => void;
  beginLabel?: string;
  /** The primary button while playing. "Next" for a Root session, "Mark done" for a program workout that records each exercise. */
  nextLabel?: string;
  finishLabel?: string;
  skipLabel?: string;
  lineupHeading?: string;
  doneTitle?: string;
  doneBodyComplete?: string;
  doneBodyWithSkips?: string;
  /** The buttons on the completion screen. `restart` puts the player back to its overview. */
  renderDoneActions: (restart: () => void) => ReactNode;
  onBegin?: () => void;
  /** Moving on from an exercise without skipping it. A Root session records nothing here; a program workout marks that exercise done. */
  onAdvance?: (exercise: GuidedExercise) => void;
  onSkip?: (exercise: GuidedExercise) => void;
  onDone?: (skippedCount: number) => void;
  /**
   * Anything the CALLER wants under the exercise it is walking. A Root
   * Movement session passes nothing and looks exactly as it always has; a
   * coach-assigned workout passes the weight field and the "Need another
   * option?" control, so the walk-through offers a member the same two
   * things the full list view does. Kept as a slot rather than as props on
   * this component because this player deliberately knows nothing about
   * programs, statuses or server actions.
   */
  renderExerciseExtras?: (exercise: GuidedExercise) => ReactNode;
}

/**
 * ONE exercise, mid-session: the video, the prescription, the cues, and
 * the two ways forward.
 *
 * Kept as its own component and exported so it can be rendered on its own
 * for any exercise in a lineup, rather than only through whatever state
 * the player happens to be in. That is what lets
 * tests/program-screens-no-video-requests.test.tsx assert, on real
 * rendered HTML, that reaching an exercise shows a poster and a play
 * button and makes no request.
 */
export function GuidedExerciseStage({
  exercise,
  index,
  total,
  nextLabel,
  finishLabel,
  skipLabel,
  onNext,
  onSkip,
  onLeave,
  extras,
}: {
  exercise: GuidedExercise;
  index: number;
  total: number;
  nextLabel: string;
  finishLabel: string;
  skipLabel: string;
  onNext: () => void;
  onSkip: () => void;
  onLeave: () => void;
  /** Caller-supplied controls under the exercise. See renderExerciseExtras. */
  extras?: ReactNode;
}) {
  const isLast = index + 1 === total;

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave this session"
          className="mef-focus-ring flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#6B7A72] shadow-sm transition hover:text-[#1B3A2D]"
        >
          <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          {index + 1} of {total}
        </p>
      </div>

      {/* A plain proportion of the session, not a performance bar. */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#1B3A2D]/10">
        <div
          className="h-full rounded-full bg-[#1B3A2D]/40 transition-[width] duration-500"
          style={{ width: `${((index + 1) / total) * 100}%` }}
          aria-hidden="true"
        />
      </div>

      <div className={`${CARD} mt-5 overflow-hidden`}>
        {/* The key is the whole tap-to-play guarantee: advancing mounts a
            fresh, idle player showing a poster, which cannot have
            requested a video URL. */}
        <TapToPlayVideo
          key={exercise.key}
          externalId={exercise.externalId}
          name={exercise.name}
          primaryMuscle={exercise.primaryMuscle}
          category={exercise.category}
          posterUrl={exercise.posterUrl}
          cues={exercise.cues}
          heightClassName="h-64"
        />

        <div className="p-6">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
            {exercise.name}
          </h1>
          {exercise.prescription && (
            <p className="mt-2 text-[15px] font-medium text-[#1B3A2D]">{exercise.prescription}</p>
          )}
          {exercise.primaryMuscle && (
            <p className="mt-1 text-xs uppercase tracking-wider text-[#6B7A72]">
              {exercise.primaryMuscle.replace(/_/g, ' ')}
            </p>
          )}
          {exercise.rest && <p className="mt-3 text-[13px] text-[#6B7A72]">Then {exercise.rest}.</p>}

          {exercise.cues.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-[#6B7A72]">
              {exercise.cues.slice(0, 3).map((cue, i) => (
                <li key={i}>{cue}</li>
              ))}
            </ul>
          )}

          {extras}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onNext}
          className="mef-press inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
        >
          {isLast ? finishLabel : nextLabel}
          {!isLast && <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="mef-press inline-flex items-center rounded-full border border-[#1B3A2D]/15 px-6 py-3.5 text-sm font-semibold text-[#6B7A72] transition hover:border-[#1B3A2D]/40 hover:text-[#1B3A2D]"
        >
          {skipLabel}
        </button>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-[#6B7A72]">
        Leave whenever you need to. Nothing is lost.
      </p>
    </div>
  );
}

export function GuidedSessionPlayer({
  exercises,
  kicker,
  title,
  description,
  meta,
  exitLabel,
  onExit,
  beginLabel = 'Begin',
  nextLabel = 'Next',
  finishLabel = 'Finish',
  skipLabel = 'Skip this one',
  lineupHeading = 'What is in it',
  doneTitle = 'That is the session.',
  doneBodyComplete = 'You went through all of it. Come back to this one whenever it fits.',
  doneBodyWithSkips = 'You went through it. Skipping what did not suit you today is part of using this well.',
  renderDoneActions,
  onBegin,
  onAdvance,
  onSkip,
  onDone,
  renderExerciseExtras,
}: GuidedSessionPlayerProps) {
  const [phase, setPhase] = useState<'overview' | 'playing' | 'done'>('overview');
  const [index, setIndex] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const current = exercises[index];

  function restart() {
    setPhase('overview');
    setIndex(0);
    setSkippedCount(0);
  }

  function handleBegin() {
    // The screen advances immediately and any recording happens behind
    // it. A slow or failed write must never leave a member staring at a
    // button that did nothing.
    setPhase('playing');
    setIndex(0);
    onBegin?.();
  }

  function advance(skipsSoFar: number) {
    if (index + 1 < exercises.length) {
      setIndex(index + 1);
      return;
    }
    setPhase('done');
    onDone?.(skipsSoFar);
  }

  function handleAdvance() {
    if (current) onAdvance?.(current);
    advance(skippedCount);
  }

  function handleSkip() {
    if (current) onSkip?.(current);
    const next = skippedCount + 1;
    setSkippedCount(next);
    advance(next);
  }

  // -------------------------------------------------------------- done
  if (phase === 'done') {
    return (
      <div className="pt-4">
        <div className={`${CARD} mef-animate-in p-8 sm:p-10`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">{title}</p>
          <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
            {doneTitle}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#4F645A]">
            {skippedCount === 0 ? doneBodyComplete : doneBodyWithSkips}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">{renderDoneActions(restart)}</div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------- playing
  if (phase === 'playing' && current) {
    return (
      <GuidedExerciseStage
        exercise={current}
        index={index}
        total={exercises.length}
        nextLabel={nextLabel}
        finishLabel={finishLabel}
        skipLabel={skipLabel}
        onNext={handleAdvance}
        onSkip={handleSkip}
        onLeave={() => setPhase('overview')}
        extras={renderExerciseExtras?.(current)}
      />
    );
  }

  // ---------------------------------------------------------- overview
  return (
    <div className="pt-4">
      <button
        type="button"
        onClick={onExit}
        className="mef-focus-ring -ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {exitLabel}
      </button>

      <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">{kicker}</div>

      <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
        {title}
      </h1>
      {description && <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">{description}</p>}

      {meta && <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#6B7A72]">{meta}</div>}

      <button
        type="button"
        onClick={handleBegin}
        disabled={exercises.length === 0}
        className="mef-press mt-6 inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110 disabled:opacity-50"
      >
        {beginLabel}
      </button>

      {/* Honesty guard: no "WHAT IS IN IT" heading over an empty list. */}
      <WhenNotEmpty items={exercises}>
        {(items) => (
          <div className={`${CARD} mt-7 p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              {lineupHeading}
            </p>
            <ol className="mt-3 space-y-3">
              {items.map((exercise, i) => (
                <li key={exercise.key} className="flex items-baseline gap-3">
                  <span className="w-5 shrink-0 text-xs tabular-nums text-[#1B3A2D]/35">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#1B3A2D]">{exercise.name}</span>
                    <span className="mt-0.5 block text-xs text-[#6B7A72]">
                      {[
                        exercise.prescriptionSummary,
                        exercise.primaryMuscle ? exercise.primaryMuscle.replace(/_/g, ' ') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </WhenNotEmpty>
    </div>
  );
}
