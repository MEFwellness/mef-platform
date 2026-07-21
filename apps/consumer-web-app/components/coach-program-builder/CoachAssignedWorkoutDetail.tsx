'use client';

import { useState, useTransition } from 'react';
import type { CoachAssignedWorkoutWithContent } from '@mef/shared-types-contracts';
import { updateAssignedWorkoutCoachNotesAction } from '@/app/actions/coach-programs';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
  partially_completed: 'Partially Completed',
};

/** Coach's read-only view of a frozen assigned workout — every prescription field is exactly what the member sees, exactly as it was at assignment time. Only the notes fields at the bottom are editable. */
export function CoachAssignedWorkoutDetail({
  workout,
}: {
  workout: CoachAssignedWorkoutWithContent;
}) {
  const [coachNotes, setCoachNotes] = useState(workout.coach_notes ?? '');
  const [internalNotes, setInternalNotes] = useState(workout.internal_notes ?? '');
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSaveNotes() {
    startTransition(async () => {
      await updateAssignedWorkoutCoachNotesAction(workout.id, coachNotes, internalNotes);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-5">
      <section className={`${CARD} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            {workout.template_name}
          </p>
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-medium text-[#1B3A2D]">
            {STATUS_LABEL[workout.status]}
          </span>
        </div>
        {workout.description && (
          <p className="mt-2 text-sm text-[#6B7A72]">{workout.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[#6B7A72]">
          {workout.goal && (
            <span className="rounded-full bg-[#EFF6F1] px-2.5 py-1">{workout.goal}</span>
          )}
          {workout.difficulty && (
            <span className="rounded-full bg-[#EFF6F1] px-2.5 py-1">{workout.difficulty}</span>
          )}
          {workout.estimated_duration_minutes && (
            <span className="rounded-full bg-[#EFF6F1] px-2.5 py-1">
              {workout.estimated_duration_minutes} min
            </span>
          )}
        </div>
        {workout.member_feedback && (
          <div className="mt-3 rounded-2xl bg-[#EFF6F1] p-3 text-sm text-[#1B3A2D]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7A72]">
              Member Feedback
            </p>
            <p className="mt-1">{workout.member_feedback}</p>
          </div>
        )}
      </section>

      {workout.sections.map((section) => (
        <section key={section.id} className={`${CARD} p-5`}>
          <p className="text-sm font-semibold text-[#1B3A2D]">{section.name}</p>
          {section.block_reasoning && (
            <p className="mt-2 rounded-xl bg-[#EFF6F1] p-3 text-xs text-[#1B3A2D]">
              {section.block_reasoning}
            </p>
          )}
          <div className="mt-3 space-y-2">
            {section.exercises.map((exercise) => (
              <div
                key={exercise.id}
                className="rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#1B3A2D]">{exercise.exercise_name}</p>
                  <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-[10px] font-medium uppercase text-[#6B7A72]">
                    {STATUS_LABEL[exercise.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#6B7A72]">
                  {[
                    exercise.sets ? `${exercise.sets} sets` : null,
                    exercise.reps ? `${exercise.reps} reps` : null,
                    exercise.rest_seconds ? `${exercise.rest_seconds}s rest` : null,
                    exercise.tempo ? `Tempo ${exercise.tempo}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {exercise.selection_reasoning && (
                  <p className="mt-2 text-xs text-[#1B3A2D]">
                    <span className="font-semibold">Why: </span>
                    {exercise.selection_reasoning}
                  </p>
                )}
                {(exercise.member_notes ||
                  exercise.difficulty_rating ||
                  exercise.comfort_rating) && (
                  <p className="mt-2 text-xs text-[#1B3A2D]">
                    {exercise.difficulty_rating && `Difficulty: ${exercise.difficulty_rating}. `}
                    {exercise.comfort_rating && `Comfort: ${exercise.comfort_rating}. `}
                    {exercise.member_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className={`${CARD} space-y-3 p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Coach Notes</p>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
          Visible to Member
          <textarea
            value={coachNotes}
            onChange={(e) => setCoachNotes(e.target.value)}
            rows={2}
            className={`${INPUT} resize-none`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
          Internal (coach-only)
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            className={`${INPUT} resize-none`}
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          {saved && <p className="text-xs text-[#6B7A72]">Saved</p>}
          <button
            type="button"
            disabled={isPending}
            onClick={handleSaveNotes}
            className="rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      </section>
    </div>
  );
}
