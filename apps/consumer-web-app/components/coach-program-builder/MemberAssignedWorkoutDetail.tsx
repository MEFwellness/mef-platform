'use client';

/**
 * A member's own view of a workout her coach assigned her.
 *
 * TWO WAYS TO USE IT, both real:
 *   the full list    every block and every exercise on one screen, with
 *                    her own status, difficulty, comfort and notes
 *                    controls, for a member who wants to see the shape of
 *                    the whole thing
 *   the walk-through one exercise at a time, the same guided screen Root
 *                    Movement uses (AssignedWorkoutGuidedSession)
 *
 * WHAT EACH EXERCISE NOW SHOWS. The video, on tap. The full prescription
 * (sets, reps or hold, tempo, rest). The coaching cues. And why this
 * exercise was chosen for her. Before this build it showed a name and an
 * empty line, because every one of those numbers was stored as null.
 *
 * VIDEO IS STRICTLY ON TAP. Opening this screen and scrolling it makes
 * ZERO video requests: every exercise renders a stored poster frame and a
 * play button, and only a tap resolves a URL. TapToPlayVideo is the single
 * component in the product allowed to spend the metered video allowance,
 * and nothing here asks it to preload. Asserted by
 * tests/program-screens-no-video-requests.test.ts.
 *
 * The difficulty, comfort, notes and per-exercise status controls are
 * exactly as they were. Nothing new reads them.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MinusCircle, XCircle, PlayCircle, Footprints } from 'lucide-react';
import type {
  AssignedWorkoutStatus,
  CoachAssignedWorkoutExercise,
  CoachAssignedWorkoutWithContent,
  ExerciseComfortRating,
  ExerciseDifficultyRating,
} from '@mef/shared-types-contracts';
import { TapToPlayVideo } from '@/components/exercise-library/TapToPlayVideo';
import type { AssignedExerciseMediaMap } from '@/lib/coach-program-builder/assignedWorkoutMedia';
import { formatPrescriptionLine } from '@/lib/coach-program-builder/prescription';
import {
  updateMyAssignedWorkoutStatusAction,
  updateMyAssignedWorkoutExerciseAction,
} from '@/app/actions/coach-programs';
import { AssignedWorkoutGuidedSession } from './AssignedWorkoutGuidedSession';
import { MemberExerciseControls } from './MemberExerciseControls';
import {
  memberSafeText,
  memberSessionBlurb,
  memberWorkoutTitle,
} from '@/lib/programs/memberPresentation';

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

/**
 * What she reads under "Why this exercise", or null when there is nothing
 * she may be shown. Her own line wins; the coach's reasoning is the
 * fallback and is still suppressed when it is written in coach vocabulary,
 * which on every program assigned before migration 176 it is.
 */
function memberExerciseLine(exercise: CoachAssignedWorkoutExercise): string | null {
  return memberSafeText(exercise.member_reasoning) ?? memberSafeText(exercise.selection_reasoning);
}

function ExerciseRow({
  exercise,
  media,
}: {
  exercise: CoachAssignedWorkoutExercise;
  media: AssignedExerciseMediaMap;
}) {
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

  const assets = media[exercise.external_id];
  const prescription = formatPrescriptionLine(exercise);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8]">
      <div className="p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#1B3A2D]">{exercise.exercise_name}</p>
            {prescription && (
              <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">{prescription}</p>
            )}
          </div>
          {status && (
            <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase text-[#1B3A2D]">
              {status.replace('_', ' ')}
            </span>
          )}
        </button>
      </div>

      {expanded && (
        <>
          {/* The poster and a play button. No video URL is requested until
              she taps it. */}
          <TapToPlayVideo
            externalId={exercise.external_id}
            name={exercise.exercise_name}
            primaryMuscle={assets?.primaryMuscle ?? null}
            category={assets?.category ?? null}
            posterUrl={assets?.posterUrl ?? null}
            cues={assets?.cues ?? []}
            heightClassName="h-52"
          />

          <div className="space-y-3 p-4">
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
          {/* Her line first (migration 176): composed by rule from the
              slot's own block, movement pattern and rank, and rewritable by
              her coach before it was frozen.

              selection_reasoning is the fallback and stays behind the same
              guard it always had, because the engine writes THAT one for
              the coach: "long/underactive in Lower Cross", "Myofascial
              release for this member's tight muscles". memberSafeText
              suppresses anything carrying that vocabulary, so a program
              assigned before this existed reads exactly as it read
              yesterday: nothing here at all.

              The member line goes through the same guard, which is not
              belt and braces: a coach can rewrite it in the review screen,
              and the guard is what stops a coach's own shorthand reaching
              her phone. */}
          {memberExerciseLine(exercise) && (
            <p className="rounded-xl bg-white p-3 text-xs text-[#1B3A2D]">
              <span className="font-semibold">Why this exercise: </span>
              {memberExerciseLine(exercise)}
            </p>
          )}

          {/* What she used, and a way to say it is not working. The same
              two controls the walk-through offers, from the same file, so
              the two screens cannot drift apart about what she may say. */}
          <MemberExerciseControls exercise={exercise} />

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
        </>
      )}
    </div>
  );
}

export function MemberAssignedWorkoutDetail({
  workout,
  media = {},
}: {
  workout: CoachAssignedWorkoutWithContent;
  /** Poster and cues per exercise, loaded server-side. Absent media renders the placeholder poster, never a broken image. */
  media?: AssignedExerciseMediaMap;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(workout.status);
  const [feedback, setFeedback] = useState(workout.member_feedback ?? '');
  const [view, setView] = useState<'list' | 'guided'>('list');
  const [isPending, startTransition] = useTransition();

  const naming = {
    templateName: workout.template_name,
    correctiveTags: workout.corrective_tags,
    programTags: workout.program_tags,
  };

  const exerciseCount = workout.sections.reduce(
    (total, section) => total + section.exercises.length,
    0
  );

  if (view === 'guided') {
    return (
      <AssignedWorkoutGuidedSession
        workout={workout}
        media={media}
        onExitToList={() => {
          setView('list');
          router.refresh();
        }}
      />
    );
  }

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
        {/* Every string in this block goes through
            lib/programs/memberPresentation.ts. The stored title, the stored
            description and the engine's own coach note all carry internal
            vocabulary a member must never meet, and a frozen snapshot
            cannot be rewritten, so they are replaced on the way out rather
            than edited in place. A coach's OWN note passes through
            untouched. */}
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
          {memberWorkoutTitle(naming)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          {memberSafeText(workout.description) ?? memberSessionBlurb(naming)}
        </p>
        {memberSafeText(workout.member_instructions) && (
          <p className="mt-3 rounded-2xl bg-[#EFF6F1] p-3 text-sm text-[#1B3A2D]">
            {memberSafeText(workout.member_instructions)}
          </p>
        )}
        {memberSafeText(workout.coach_notes) && (
          <p className="mt-3 rounded-2xl bg-[#F5B700]/[0.12] p-3 text-sm text-[#1B3A2D]">
            <span className="font-semibold">From your coach: </span>
            {memberSafeText(workout.coach_notes)}
          </p>
        )}

        {exerciseCount > 0 && (
          <button
            type="button"
            onClick={() => setView('guided')}
            className="mef-press mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1B3A2D] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
          >
            <Footprints className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Walk me through it
          </button>
        )}
        <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
          One exercise at a time, with the video and what to do. Or read the whole thing below.
        </p>

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
          {memberSafeText(section.block_reasoning) && (
            <p className="mt-2 rounded-xl bg-[#EFF6F1] p-3 text-xs text-[#1B3A2D]">
              {memberSafeText(section.block_reasoning)}
            </p>
          )}
          <div className="mt-3 space-y-2">
            {section.exercises.map((exercise) => (
              <ExerciseRow key={exercise.id} exercise={exercise} media={media} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
