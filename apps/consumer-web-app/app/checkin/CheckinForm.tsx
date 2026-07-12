'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { submitDailyCheckin, logHabitCompletion } from '@/app/actions/checkin';
import type { DailyCheckin, DailyCheckinInput, Habit } from '@mef/shared-types-contracts';

type Props = {
  localDate: string;
  timezone: string;
  existingCheckin: DailyCheckin | null;
  habits: Habit[];
  initialHabitLogs: Record<string, boolean>;
  cardClassName: string;
};

const SLEEP_DURATIONS = ['<5h', '5-6h', '6-7h', '7-8h', '8h+'] as const;
const MOVEMENT_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'full_session', label: 'Full session' }
] as const;

function ScaleInput({
  label,
  value,
  onChange,
  min = 1,
  max = 5
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">{label}</p>
      <div className="mt-2 flex gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
              value === option
                ? 'border-[#F5B700] bg-[#F5B700] text-[#1B3A2D]'
                : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/30'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CheckinForm({
  localDate,
  timezone,
  existingCheckin,
  habits,
  initialHabitLogs,
  cardClassName
}: Props) {
  const router = useRouter();
  const [moodLevel, setMoodLevel] = useState<number | null>(existingCheckin?.mood_level ?? null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(existingCheckin?.sleep_quality ?? null);
  const [sleepDuration, setSleepDuration] = useState<(typeof SLEEP_DURATIONS)[number] | null>(
    existingCheckin?.sleep_duration ?? null
  );
  const [energyLevel, setEnergyLevel] = useState<number | null>(existingCheckin?.energy_level ?? null);
  const [stressLevel, setStressLevel] = useState<number | null>(existingCheckin?.stress_level ?? null);
  const [waterCups, setWaterCups] = useState<number>(existingCheckin?.water_cups ?? 0);
  const [digestionRating, setDigestionRating] = useState<number | null>(
    existingCheckin?.digestion_rating ?? null
  );
  const [painLevel, setPainLevel] = useState<number | null>(
    existingCheckin?.pain_discomfort_level ?? null
  );
  const [movementToday, setMovementToday] = useState<(typeof MOVEMENT_LEVELS)[number]['value'] | null>(
    existingCheckin?.movement_today ?? null
  );
  const [concern, setConcern] = useState(existingCheckin?.new_or_worsening_concern ?? false);
  const [notes, setNotes] = useState(existingCheckin?.optional_notes ?? '');
  const [habitStatus, setHabitStatus] = useState<Record<string, boolean>>(initialHabitLogs);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (moodLevel === null || sleepQuality === null || energyLevel === null || stressLevel === null) {
      setError('Please rate mood, sleep quality, energy, and stress before saving.');
      return;
    }

    setSubmitting(true);

    const input: DailyCheckinInput = {
      timezone,
      local_date: localDate,
      mood_level: moodLevel,
      sleep_quality: sleepQuality,
      sleep_duration: sleepDuration,
      energy_level: energyLevel,
      stress_level: stressLevel,
      water_cups: waterCups,
      digestion_rating: digestionRating,
      pain_discomfort_level: painLevel,
      movement_today: movementToday,
      new_or_worsening_concern: concern,
      optional_notes: notes.trim() ? notes.trim() : null
    };

    const result = await submitDailyCheckin(input);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  async function toggleHabit(habitId: string, completed: boolean) {
    setHabitStatus((current) => ({ ...current, [habitId]: completed }));
    const result = await logHabitCompletion(habitId, localDate, timezone, completed);
    if (result.error) {
      // Revert on failure so the checkbox never lies about what's saved.
      setHabitStatus((current) => ({ ...current, [habitId]: !completed }));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div className={`${cardClassName} space-y-5 p-6`}>
        <ScaleInput label="Mood" value={moodLevel} onChange={setMoodLevel} />
        <ScaleInput label="Energy" value={energyLevel} onChange={setEnergyLevel} />
        <ScaleInput label="Stress" value={stressLevel} onChange={setStressLevel} />
      </div>

      <div className={`${cardClassName} p-6`}>
        <ScaleInput label="Sleep quality" value={sleepQuality} onChange={setSleepQuality} />
        <div className="mt-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Sleep duration</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SLEEP_DURATIONS.map((duration) => (
              <button
                key={duration}
                type="button"
                onClick={() => setSleepDuration(duration)}
                aria-pressed={sleepDuration === duration}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  sleepDuration === duration
                    ? 'border-[#F5B700] bg-[#F5B700] text-[#1B3A2D]'
                    : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/30'
                }`}
              >
                {duration}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`${cardClassName} p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Water</p>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setWaterCups((cups) => Math.max(0, cups - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1B3A2D]/10 text-lg text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
            aria-label="Remove a cup"
          >
            −
          </button>
          <p className="text-2xl font-semibold text-[#1B3A2D]">
            {waterCups} <span className="text-sm font-normal text-[#6B7A72]">of 8 cups</span>
          </p>
          <button
            type="button"
            onClick={() => setWaterCups((cups) => cups + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1B3A2D]/10 text-lg text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
            aria-label="Add a cup"
          >
            +
          </button>
        </div>
      </div>

      <div className={`${cardClassName} space-y-5 p-6`}>
        <ScaleInput label="Digestion" value={digestionRating} onChange={setDigestionRating} />
        <ScaleInput label="Pain / discomfort" value={painLevel} onChange={setPainLevel} min={0} max={5} />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Movement today</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOVEMENT_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => setMovementToday(level.value)}
                aria-pressed={movementToday === level.value}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  movementToday === level.value
                    ? 'border-[#F5B700] bg-[#F5B700] text-[#1B3A2D]'
                    : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/30'
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {habits.length > 0 && (
        <div className={`${cardClassName} p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Today&apos;s habits</p>
          <div className="mt-3 space-y-2">
            {habits.map((habit) => (
              <label
                key={habit.id}
                className="flex items-center gap-3 rounded-2xl border border-[#1B3A2D]/10 px-4 py-3 text-sm text-[#1B3A2D]"
              >
                <input
                  type="checkbox"
                  checked={habitStatus[habit.id] ?? false}
                  onChange={(event) => toggleHabit(habit.id, event.target.checked)}
                  className="h-4 w-4 accent-[#F5B700]"
                />
                {habit.title}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={`${cardClassName} p-6`}>
        <label className="flex items-start gap-3 text-sm text-[#1B3A2D]">
          <input
            type="checkbox"
            checked={concern}
            onChange={(event) => setConcern(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#F5B700]"
          />
          I have a new or worsening concern I want my coach to know about
        </label>
        <div className="mt-4">
          <label className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]" htmlFor="notes">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes ?? ''}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            placeholder="Anything else worth noting today?"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-full bg-[#F5B700] px-6 py-3.5 text-base font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-60"
      >
        {submitting ? 'Saving…' : existingCheckin ? 'Update check-in' : 'Save check-in'}
      </button>
    </form>
  );
}
