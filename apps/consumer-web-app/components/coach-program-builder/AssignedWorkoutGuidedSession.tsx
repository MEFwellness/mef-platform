'use client';

/**
 * Walking an assigned program workout, one exercise at a time.
 *
 * This is the SAME screen Root Movement uses
 * (components/movement-sessions/GuidedSessionPlayer). There is no second
 * player. This file is only what makes the walk a coach-assigned program:
 *
 *   - its copy and its way back to the plain list view
 *   - marking each exercise done or skipped as she goes, through the
 *     server action the list view already uses
 *   - closing the workout out at the end
 *
 * WHAT IS RECORDED, AND WHAT IS NOT. Mark done writes `completed` and skip
 * writes `skipped` on that exercise row, which is exactly what the list
 * view's own status buttons write. Nothing here asks for a rating, a note
 * or a reason: the difficulty, comfort and notes controls stay on the list
 * view where a member can fill them in if she wants to, and the walk never
 * interrupts her for them.
 *
 * VIDEO IS STRICTLY ON TAP. Entering the walk and moving through it makes
 * no video request at all: the player shows a stored poster frame until a
 * member taps it. See GuidedSessionPlayer's header and
 * tests/program-screens-no-video-requests.test.ts.
 */

import { useState, useTransition } from 'react';
import { ClipboardList } from 'lucide-react';
import type { CoachAssignedWorkoutWithContent } from '@mef/shared-types-contracts';
import {
  GuidedSessionPlayer,
  type GuidedExercise,
} from '@/components/movement-sessions/GuidedSessionPlayer';
import type { AssignedExerciseMediaMap } from '@/lib/coach-program-builder/assignedWorkoutMedia';
import {
  memberSafeText,
  memberSessionBlurb,
  memberWorkoutTitle,
} from '@/lib/programs/memberPresentation';
import {
  toGuidedWorkoutExercises,
  type GuidedWorkoutExercise,
} from '@/lib/coach-program-builder/guidedWorkout';
import {
  updateMyAssignedWorkoutExerciseAction,
  updateMyAssignedWorkoutStatusAction,
} from '@/app/actions/coach-programs';

export function AssignedWorkoutGuidedSession({
  workout,
  media,
  onExitToList,
}: {
  workout: CoachAssignedWorkoutWithContent;
  media: AssignedExerciseMediaMap;
  onExitToList: () => void;
}) {
  const [, startTransition] = useTransition();
  const [completedCount, setCompletedCount] = useState(0);

  // Same rule as the list view: the member-facing name and copy, never the
  // internal clinical title or the engine's own description.
  const naming = {
    templateName: workout.template_name,
    correctiveTags: workout.corrective_tags,
    programTags: workout.program_tags,
  };

  const exercises = toGuidedWorkoutExercises(workout, media);
  const byKey = new Map<string, GuidedWorkoutExercise>(exercises.map((e) => [e.key, e]));

  function record(exercise: GuidedExercise, status: 'completed' | 'skipped') {
    const row = byKey.get(exercise.key);
    if (!row) return;
    startTransition(async () => {
      await updateMyAssignedWorkoutExerciseAction(row.exerciseRowId, { status });
    });
  }

  function handleAdvance(exercise: GuidedExercise) {
    setCompletedCount((count) => count + 1);
    record(exercise, 'completed');
  }

  function handleSkip(exercise: GuidedExercise) {
    record(exercise, 'skipped');
  }

  function handleDone(skippedCount: number) {
    // Honest close-out rather than a blanket "completed": a member who
    // skipped every exercise did not do the workout, and saying she did
    // would put something untrue in front of her coach.
    const status = completedCount > 0 ? 'completed' : skippedCount > 0 ? 'skipped' : 'completed';
    startTransition(async () => {
      await updateMyAssignedWorkoutStatusAction(workout.id, status);
    });
  }

  return (
    <GuidedSessionPlayer
      exercises={exercises}
      kicker={
        <>
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">From your coach</p>
        </>
      }
      title={memberWorkoutTitle(naming)}
      description={
        memberSafeText(workout.member_instructions) ??
        memberSafeText(workout.description) ??
        memberSessionBlurb(naming)
      }
      meta={<span>{exercises.length} exercises</span>}
      exitLabel="Back to the full list"
      onExit={onExitToList}
      beginLabel="Start the walk-through"
      nextLabel="Mark done"
      finishLabel="Mark done and finish"
      skipLabel="Skip this one"
      lineupHeading="What is in it"
      doneTitle="That is the workout."
      doneBodyComplete="You went through all of it. Your coach can see it is done."
      doneBodyWithSkips="You went through it. Skipping what did not suit you today is part of using this well."
      onAdvance={handleAdvance}
      onSkip={handleSkip}
      onDone={handleDone}
      renderDoneActions={(restart) => (
        <>
          <button
            type="button"
            onClick={onExitToList}
            className="mef-press inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
          >
            Back to the full list
          </button>
          <button
            type="button"
            onClick={() => {
              setCompletedCount(0);
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
