'use client';

/**
 * Root Movement, Level 1 — the session player.
 *
 * The SCREEN lives in GuidedSessionPlayer, which an assigned program
 * workout now walks as well. This file is what makes that screen a Root
 * Movement session and nothing else:
 *
 *   - the view event, fired exactly once per real visit
 *   - the run row: started on Begin, skips appended as they happen,
 *     completed at the end
 *   - this feature's own copy and its way back to the session list
 *
 * Nothing about the member's experience changed when the screen was
 * extracted: same three states, same tap-to-play video, same prescription
 * line, same skip, same completion. tests/movement-session-privacy.test.ts
 * and tests/guided-session-player.test.tsx both read this file and that
 * one, so the copy rules and the no-free-text rule still hold across the
 * split.
 *
 * The prescription and rest lines are formatted by
 * lib/movement-sessions/duration.ts exactly as before. A session slot
 * carries its own prescription shape (time or reps), which is not the
 * coach-program prescription shape, and the two are deliberately not
 * merged: they are different things that happen to read similarly.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Activity, Clock } from 'lucide-react';
import type { MovementSessionDetail } from '@mef/shared-types-contracts';
import {
  GuidedSessionPlayer,
  type GuidedExercise,
} from '@/components/movement-sessions/GuidedSessionPlayer';
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

  const [runId, setRunId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  const exercises: GuidedExercise[] = slots.map((slot) => ({
    key: slot.id,
    externalId: slot.external_id,
    name: slot.name,
    primaryMuscle: slot.primaryMuscle,
    category: slot.category,
    posterUrl: slot.posterUrl,
    cues: slot.cues,
    prescription: formatPrescription(slot),
    prescriptionSummary: formatPrescription(slot),
    rest: formatRest(slot),
  }));

  function handleBegin() {
    // If the insert fails, runId stays null, the session still plays, and
    // nothing is recorded.
    startTransition(async () => {
      const id = await startMovementSessionAction(template.session_key);
      setRunId(id);
    });
  }

  function handleSkip(exercise: GuidedExercise) {
    const id = runId;
    if (!id) return;
    startTransition(async () => {
      await skipMovementExerciseAction(id, exercise.externalId);
    });
  }

  function handleDone() {
    const id = runId;
    if (!id) return;
    startTransition(async () => {
      await completeMovementSessionAction(id);
    });
  }

  return (
    <GuidedSessionPlayer
      exercises={exercises}
      kicker={
        <>
          <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Root Movement</p>
        </>
      }
      title={template.name}
      description={template.description}
      meta={
        <>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {formatTargetDuration(
              template.target_duration_min_minutes,
              template.target_duration_max_minutes
            )}
          </span>
          <span>{slots.length} exercises</span>
        </>
      }
      exitLabel="Sessions"
      onExit={() => router.push('/movement/sessions' as Route)}
      onBegin={handleBegin}
      onSkip={handleSkip}
      onDone={handleDone}
      renderDoneActions={(restart) => (
        <>
          <Link
            href={'/movement/sessions' as Route}
            className="mef-press inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
          >
            Back to sessions
          </Link>
          <button
            type="button"
            onClick={() => {
              setRunId(null);
              restart();
            }}
            className="mef-press inline-flex items-center gap-2 rounded-full border border-[#1B3A2D]/15 px-7 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:border-[#1B3A2D]/40"
          >
            Do it again
          </button>
        </>
      )}
    />
  );
}
