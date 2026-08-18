'use client';

/**
 * The two things a member can now say about one exercise, in one place, so
 * the full list view and the walk-through offer exactly the same thing in
 * the same words. Two components rendering these separately is two screens
 * that will eventually disagree about what she is allowed to say.
 *
 *   the weight she used   only where the prescription is a set of reps.
 *                         A hold gets no field at all: see
 *                         lib/programs/weightLogging.ts.
 *
 *   "Need another option?" always. A LOCKED exercise still opens the
 *                         sheet, because she should always be able to
 *                         tell her coach something, and the sheet says in
 *                         words that this one was chosen for her rather
 *                         than hiding the control.
 *
 * NO EM DASHES, per the house rule.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircleQuestion } from 'lucide-react';
import type { CoachAssignedWorkoutExercise } from '@mef/shared-types-contracts';
import { acceptsWeightLog } from '@/lib/programs/weightLogging';
import { FEEDBACK_TRIGGER_LABEL } from '@/lib/programs/feedback/copy';
import { ExerciseWeightField } from './ExerciseWeightField';
import { ExerciseFeedbackSheet } from './ExerciseFeedbackSheet';

export function MemberExerciseControls({
  exercise,
  compact = false,
}: {
  exercise: CoachAssignedWorkoutExercise;
  compact?: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className={compact ? 'mt-5 border-t border-[#1B3A2D]/10 pt-4' : ''}>
      {acceptsWeightLog(exercise) && (
        <ExerciseWeightField exercise={exercise} compact={compact} />
      )}

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7A72] underline underline-offset-4 transition hover:text-[#1B3A2D]"
      >
        <MessageCircleQuestion className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        {FEEDBACK_TRIGGER_LABEL}
      </button>

      {sheetOpen && (
        <ExerciseFeedbackSheet
          exerciseRowId={exercise.id}
          exerciseName={exercise.exercise_name}
          isLocked={exercise.is_locked === true}
          onClose={() => setSheetOpen(false)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
