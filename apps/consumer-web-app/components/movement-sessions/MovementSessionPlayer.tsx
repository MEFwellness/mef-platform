'use client';

/**
 * Root Movement, Level 1 — the session player.
 *
 * Three states, in one component because they are one continuous
 * experience and a member should never watch a page reload mid-session:
 *
 *   overview   the lineup, and one button to begin
 *   playing    one exercise at a time, with video, prescription, skip
 *   done       a short acknowledgment
 *
 * The video is the SAME component the Exercise Library detail screen
 * uses (components/exercise-library/TapToPlayVideo). It was extracted
 * from that file rather than reimplemented, so tap-to-play, the ~10min
 * URL cache, and the poster and cues fallbacks all behave here exactly
 * as they do there, and there is still exactly one component in the
 * product that can spend Your Move quota.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *   - No timer counts down and no clock runs. The prescription is stated
 *     and the member decides when she is done with it. A running timer
 *     turns a session into something you can fall behind.
 *   - No streak, no badge, no score, no "you did it" celebration. The
 *     completion state says what happened and offers the way out.
 *   - Nothing at all happens if she leaves part way through. There is no
 *     "are you sure", no saved-progress nag, and no message waiting for
 *     her the next time. Her run row simply has no completed_at, which is
 *     an ordinary fact and not a judgment.
 *   - No copy on this screen uses an em dash or an exclamation mark.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Activity, ChevronRight, Clock, X } from 'lucide-react';
import type { MovementSessionDetail } from '@mef/shared-types-contracts';
import { TapToPlayVideo } from '@/components/exercise-library/TapToPlayVideo';
import { WhenNotEmpty } from '@/components/layout';
import {
  formatPrescription,
  formatRest,
  formatTargetDuration,
} from '@/lib/movement-sessions/duration';
import {
  completeMovementSessionAction,
  skipMovementExerciseAction,
  startMovementSessionAction,
  trackMovementSessionViewedAction,
} from '@/app/actions/movement-sessions';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Fires movement_session_viewed once per real visit to this session's
 * screen. Same exactly-once discipline as
 * components/analytics/TrackSurfaceView: a module-level dedupe window
 * keyed by session, so React's development double-mount and a quick
 * client-router remount both collapse into one event, while a genuine
 * revisit later still records a second, real view.
 */
const VIEW_DEDUPE_WINDOW_MS = 3000;
const lastViewedAt = new Map<string, number>();

function shouldRecordView(sessionKey: string): boolean {
  const now = Date.now();
  const previous = lastViewedAt.get(sessionKey);
  if (previous !== undefined && now - previous < VIEW_DEDUPE_WINDOW_MS) return false;
  lastViewedAt.set(sessionKey, now);
  return true;
}

export function MovementSessionPlayer({ detail }: { detail: MovementSessionDetail }) {
  const { template, slots } = detail;
  const router = useRouter();

  const [phase, setPhase] = useState<'overview' | 'playing' | 'done'>('overview');
  const [index, setIndex] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  // From a mounted effect, never during render: a server action called
  // mid-render updates the Router while this component is still
  // rendering, which React warns about and which was caught by driving
  // the real app rather than by any test. Same discipline as
  // components/analytics/TrackSurfaceView, and it also means the write
  // happens after the screen has painted rather than in front of it.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    if (!shouldRecordView(template.session_key)) return;
    void trackMovementSessionViewedAction(template.session_key, slots.length);
  }, [template.session_key, slots.length]);

  const current = slots[index];

  function handleBegin() {
    // The screen advances immediately and the run row is written behind
    // it. A slow or failed write must never leave a member staring at a
    // button that did nothing: if the insert fails, runId stays null,
    // the session still plays, and nothing is recorded.
    setPhase('playing');
    setIndex(0);
    startTransition(async () => {
      const id = await startMovementSessionAction(template.session_key);
      setRunId(id);
    });
  }

  function advance() {
    if (index + 1 < slots.length) {
      setIndex(index + 1);
      return;
    }
    setPhase('done');
    const id = runId;
    if (id) {
      startTransition(async () => {
        await completeMovementSessionAction(id);
      });
    }
  }

  function handleSkip() {
    const slot = current;
    const id = runId;
    setSkippedCount((count) => count + 1);
    if (id && slot) {
      startTransition(async () => {
        await skipMovementExerciseAction(id, slot.external_id);
      });
    }
    advance();
  }

  // -------------------------------------------------------------- done
  if (phase === 'done') {
    return (
      <div className="pt-4">
        <div className={`${CARD} mef-animate-in p-8 sm:p-10`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            {template.name}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
            That is the session.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#4F645A]">
            {skippedCount === 0
              ? 'You went through all of it. Come back to this one whenever it fits.'
              : 'You went through it. Skipping what did not suit you today is part of using this well.'}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={'/movement/sessions' as Route}
              className="mef-press inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
            >
              Back to sessions
            </Link>
            <button
              type="button"
              onClick={() => {
                setPhase('overview');
                setIndex(0);
                setRunId(null);
                setSkippedCount(0);
              }}
              className="mef-press inline-flex items-center gap-2 rounded-full border border-[#1B3A2D]/15 px-7 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:border-[#1B3A2D]/40"
            >
              Do it again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------- playing
  if (phase === 'playing' && current) {
    const rest = formatRest(current);
    const isLast = index + 1 === slots.length;

    return (
      <div className="pt-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPhase('overview')}
            aria-label="Leave this session"
            className="mef-focus-ring flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#6B7A72] shadow-sm transition hover:text-[#1B3A2D]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            {index + 1} of {slots.length}
          </p>
        </div>

        {/* A plain proportion of the session, not a performance bar. */}
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#1B3A2D]/10">
          <div
            className="h-full rounded-full bg-[#1B3A2D]/40 transition-[width] duration-500"
            style={{ width: `${((index + 1) / slots.length) * 100}%` }}
            aria-hidden="true"
          />
        </div>

        <div className={`${CARD} mt-5 overflow-hidden`}>
          <TapToPlayVideo
            externalId={current.external_id}
            name={current.name}
            primaryMuscle={current.primaryMuscle}
            category={current.category}
            posterUrl={current.posterUrl}
            cues={current.cues}
            heightClassName="h-64"
            autoPlayKey={current.external_id}
          />

          <div className="p-6">
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
              {current.name}
            </h1>
            <p className="mt-2 text-[15px] font-medium text-[#1B3A2D]">
              {formatPrescription(current)}
            </p>
            {current.primaryMuscle && (
              <p className="mt-1 text-xs uppercase tracking-wider text-[#6B7A72]">
                {current.primaryMuscle.replace(/_/g, ' ')}
              </p>
            )}
            {rest && <p className="mt-3 text-[13px] text-[#6B7A72]">Then {rest}.</p>}

            {current.cues.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-[#6B7A72]">
                {current.cues.slice(0, 3).map((cue, i) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={advance}
            className="mef-press inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
          >
            {isLast ? 'Finish' : 'Next'}
            {!isLast && <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="mef-press inline-flex items-center rounded-full border border-[#1B3A2D]/15 px-6 py-3.5 text-sm font-semibold text-[#6B7A72] transition hover:border-[#1B3A2D]/40 hover:text-[#1B3A2D]"
          >
            Skip this one
          </button>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-[#6B7A72]">
          Leave whenever you need to. Nothing is lost.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------- overview
  return (
    <div className="pt-4">
      <button
        type="button"
        onClick={() => router.push('/movement/sessions' as Route)}
        className="mef-focus-ring -ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Sessions
      </button>

      <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
        <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Root Movement</p>
      </div>

      <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
        {template.name}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">{template.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#6B7A72]">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          {formatTargetDuration(
            template.target_duration_min_minutes,
            template.target_duration_max_minutes
          )}
        </span>
        <span>{slots.length} exercises</span>
      </div>

      <button
        type="button"
        onClick={handleBegin}
        disabled={isPending && phase !== 'overview'}
        className="mef-press mt-6 inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
      >
        Begin
      </button>

      {/* Honesty guard: no "WHAT IS IN IT" heading over an empty list. */}
      <WhenNotEmpty items={slots}>
        {(slots) => (
          <div className={`${CARD} mt-7 p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              What is in it
            </p>
            <ol className="mt-3 space-y-3">
              {slots.map((slot, i) => (
                <li key={slot.id} className="flex items-baseline gap-3">
                  <span className="w-5 shrink-0 text-xs tabular-nums text-[#1B3A2D]/35">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#1B3A2D]">{slot.name}</span>
                    <span className="mt-0.5 block text-xs text-[#6B7A72]">
                      {formatPrescription(slot)}
                      {slot.primaryMuscle ? ` · ${slot.primaryMuscle.replace(/_/g, ' ')}` : ''}
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
