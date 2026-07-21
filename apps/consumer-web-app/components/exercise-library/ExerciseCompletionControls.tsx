'use client';

/**
 * Mark an exercise completed/partial/skipped, with optional notes and
 * difficulty/comfort/enjoyment feedback — the Exercise Library's
 * completion + notes + feedback experience (Prompt 2). Every submit is its
 * own immutable member_exercise_completions row (migration 81); nothing
 * here ever edits a past entry. Observations only ("Felt easy", "Tight
 * today") — never a diagnosis, per the milestone's own instruction.
 */

import { useState, useTransition } from 'react';
import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { recordExerciseCompletion } from '@/app/actions/exercise-library';
import type {
  ExerciseComfortRating,
  ExerciseCompletionStatus,
  ExerciseDifficultyRating,
  ExerciseEnjoymentRating,
} from '@mef/shared-types-contracts';

const STATUS_OPTIONS: {
  value: ExerciseCompletionStatus;
  label: string;
  Icon: typeof CheckCircle2;
}[] = [
  { value: 'completed', label: 'Completed', Icon: CheckCircle2 },
  { value: 'partial', label: 'Partial', Icon: MinusCircle },
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

const ENJOYMENT_OPTIONS: { value: ExerciseEnjoymentRating; label: string }[] = [
  { value: 'liked', label: 'Liked' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'did_not_enjoy', label: 'Did Not Enjoy' },
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
    <div className="flex flex-wrap gap-2">
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

export function ExerciseCompletionControls({
  externalId,
  exerciseName,
}: {
  externalId: string;
  exerciseName: string;
}) {
  const [status, setStatus] = useState<ExerciseCompletionStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [difficulty, setDifficulty] = useState<ExerciseDifficultyRating | null>(null);
  const [comfort, setComfort] = useState<ExerciseComfortRating | null>(null);
  const [enjoyment, setEnjoyment] = useState<ExerciseEnjoymentRating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!status) {
      setError('Choose completed, partial, or skipped first.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordExerciseCompletion({
        externalId,
        exerciseName,
        status,
        memberNotes: notes.trim() ? notes.trim() : null,
        difficultyRating: difficulty,
        comfortRating: comfort,
        enjoymentRating: enjoyment,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      setStatus(null);
      setNotes('');
      setDifficulty(null);
      setComfort(null);
      setEnjoyment(null);
    });
  }

  return (
    <div className="rounded-2xl border border-[#1B3A2D]/10 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        Log this exercise
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map(({ value, label, Icon }) => {
          const active = status === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
                active
                  ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                  : 'border-[#1B3A2D]/15 bg-white text-[#1B3A2D] hover:border-[#1B3A2D]/40'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {status && (
        <div className="mt-5 space-y-4">
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

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Enjoyment
            </p>
            <div className="mt-1.5">
              <ChipGroup options={ENJOYMENT_OPTIONS} value={enjoyment} onChange={setEnjoyment} />
            </div>
          </div>

          <div>
            <label
              htmlFor="exercise-notes"
              className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]"
            >
              Notes (optional)
            </label>
            <textarea
              id="exercise-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Felt unstable on the left side, need lighter resistance…"
              rows={2}
              className="mt-1.5 w-full resize-none rounded-xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full rounded-full bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {savedAt && !status && (
        <p className="mt-3 text-sm font-medium text-[#1B3A2D]">Saved — added to your history.</p>
      )}
    </div>
  );
}
