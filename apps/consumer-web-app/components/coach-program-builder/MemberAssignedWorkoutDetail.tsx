'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MinusCircle, XCircle, PlayCircle } from 'lucide-react';
import type {
  AssignedWorkoutStatus,
  CoachAssignedWorkoutExercise,
  CoachAssignedWorkoutWithContent,
  ExerciseComfortRating,
  ExerciseDifficultyRating,
} from '@mef/shared-types-contracts';
import {
  updateMyAssignedWorkoutStatusAction,
  updateMyAssignedWorkoutExerciseAction,
} from '@/app/actions/coach-programs';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const EXERCISE_STATUS_OPTIONS: {
  value: AssignedWorkoutStatus;
  label: string;
  Icon: typeof CheckCircle2;
}[] = [
  { value: 'completed', label: 'Completed', Icon: CheckCircle2 },
  { value: 'partially_completed', label: 'Partial', Icon: MinusCircle },
  { value: 'skipped', label: 'Skipped', Icon: XCircle },
];

const DIFFICULTY_OPTIONS: { value: ExerciseDifficultyRating; label: string }[] = [
  { value: 'very_easy', label: 'Very Easy' },
  { value: 'easy', label: 'Easy' },
  { value: 'appropriate', label: 'Appropriate' },
  { value: 'difficult', label: 'Difficult' },
  { value: 'very_difficult', label: 'Very Difficult' },
];

const COMFORT_OPTIONS: { value: ExerciseComfortRating; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'slight_discomfort', label: 'Slight Discomfort' },
  { value: 'moderate_discomfort', label: 'Moderate Discomfort' },
  { value: 'pain', label: 'Pain' },
];

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (next: T | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(active ? null : option.value)}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                : 'border-[#1B3A2D]/15 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/40'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ExerciseRow({ exercise }: { exercise: CoachAssignedWorkoutExercise }) {
  const [expanded, setExpanded] = useState(exercise.status === 'not_started');
  const [status, setStatus] = useState<AssignedWorkoutStatus | null>(
    exercise.status === 'not_started' ? null : exercise.status
  );
  const [notes, setNotes] = useState(exercise.member_notes ?? '');
  const [difficulty, setDifficulty] = useState<ExerciseDifficultyRating | null>(
    exercise.difficulty_rating
  );
  const [comfort, setComfort] = useState<ExerciseComfortRating | null>(exercise.comfort_rating);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave(nextStatus: AssignedWorkoutStatus) {
    setStatus(nextStatus);
    startTransition(async () => {
      await updateMyAssignedWorkoutExerciseAction(exercise.id, {
        status: nextStatus,
        memberNotes: notes,
        difficultyRating: difficulty ?? undefined,
        comfortRating: comfort ?? undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1B3A2D]">{exercise.exercise_name}</p>
          <p className="mt-0.5 truncate text-xs text-[#6B7A72]">
            {[
              exercise.sets ? `${exercise.sets} sets` : null,
              exercise.reps ? `${exercise.reps} reps` : null,
              exercise.rest_seconds ? `${exercise.rest_seconds}s rest` : null,
              exercise.tempo ? `Tempo ${exercise.tempo}` : null,
              exercise.hold_duration_seconds ? `Hold ${exercise.hold_duration_seconds}s` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {status && (
          <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase text-[#1B3A2D]">
            {status.replace('_', ' ')}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[#1B3A2D]/5 pt-3">
          {exercise.coaching_cues && (
            <p className="rounded-xl bg-white p-3 text-xs text-[#1B3A2D]">
              <span className="font-semibold">Coaching Cue: </span>
              {exercise.coaching_cues}
            </p>
          )}
          {exercise.pain_modification_notes && (
            <p className="rounded-xl bg-white p-3 text-xs text-[#1B3A2D]">
              <span className="font-semibold">If it hurts: </span>
              {exercise.pain_modification_notes}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {EXERCISE_STATUS_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleSave(value)}
                disabled={isPending}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  status === value
                    ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                    : 'border-[#1B3A2D]/15 bg-white text-[#1B3A2D] hover:border-[#1B3A2D]/40'
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Difficulty
            </p>
            <div className="mt-1.5">
              <ChipGroup options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Comfort</p>
            <div className="mt-1.5">
              <ChipGroup options={COMFORT_OPTIONS} value={comfort} onChange={setComfort} />
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)…"
            rows={2}
            className="w-full resize-none rounded-xl border border-[#1B3A2D]/10 bg-white p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          {saved && <p className="text-xs font-medium text-[#1B3A2D]">Saved</p>}
        </div>
      )}
    </div>
  );
}

export function MemberAssignedWorkoutDetail({
  workout,
}: {
  workout: CoachAssignedWorkoutWithContent;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(workout.status);
  const [feedback, setFeedback] = useState(workout.member_feedback ?? '');
  const [isPending, startTransition] = useTransition();

  function handleWorkoutStatus(nextStatus: AssignedWorkoutStatus) {
    setStatus(nextStatus);
    startTransition(async () => {
      await updateMyAssignedWorkoutStatusAction(workout.id, nextStatus, feedback);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className={`${CARD} p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
          {workout.template_name}
        </p>
        {workout.description && (
          <p className="mt-2 text-sm text-[#6B7A72]">{workout.description}</p>
        )}
        {workout.member_instructions && (
          <p className="mt-3 rounded-2xl bg-[#EFF6F1] p-3 text-sm text-[#1B3A2D]">
            {workout.member_instructions}
          </p>
        )}
        {workout.coach_notes && (
          <p className="mt-3 rounded-2xl bg-[#F5B700]/[0.12] p-3 text-sm text-[#1B3A2D]">
            <span className="font-semibold">From your coach: </span>
            {workout.coach_notes}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {status === 'not_started' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleWorkoutStatus('in_progress')}
              className="flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Start Workout
            </button>
          )}
          {status !== 'completed' && status !== 'skipped' && (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleWorkoutStatus('completed')}
                className="rounded-full border border-[#1B3A2D] px-5 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D] hover:text-white disabled:opacity-50"
              >
                Mark Complete
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleWorkoutStatus('skipped')}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-[#6B7A72] hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                Skip
              </button>
            </>
          )}
          {(status === 'completed' || status === 'skipped') && (
            <span className="rounded-full bg-[#1B3A2D]/[0.06] px-4 py-2 text-sm font-medium text-[#1B3A2D]">
              {status === 'completed' ? 'Completed' : 'Skipped'}
            </span>
          )}
        </div>

        {status !== 'not_started' && (
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onBlur={() => updateMyAssignedWorkoutStatusAction(workout.id, status, feedback)}
            placeholder="Feedback for your coach (optional)…"
            rows={2}
            className="mt-3 w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        )}
      </section>

      {workout.sections.map((section) => (
        <section key={section.id} className={`${CARD} p-5`}>
          <p className="text-sm font-semibold text-[#1B3A2D]">{section.name}</p>
          <div className="mt-3 space-y-2">
            {section.exercises.map((exercise) => (
              <ExerciseRow key={exercise.id} exercise={exercise} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
