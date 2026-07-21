'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createProgramTemplateAction } from '@/app/actions/coach-programs';

const INPUT =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';
const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** Just enough to create the template row — the full builder (sections, exercises, tags) opens immediately after, at /coach/programs/[id]. */
export function NewProgramForm({ forClientId }: { forClientId?: string | undefined }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [difficulty, setDifficulty] = useState<'' | 'beginner' | 'intermediate' | 'advanced'>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give this program a name.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createProgramTemplateAction({
        name: name.trim(),
        description: null,
        goal: goal.trim() || null,
        difficulty: difficulty || null,
        estimatedDurationMinutes: null,
        equipment: [],
        programTags: [],
        correctiveTags: [],
        movementTags: [],
        targetMuscles: [],
        coachNotes: null,
        internalNotes: null,
        memberInstructions: null,
      });
      if (!('id' in result)) {
        setError(result.error ?? 'Could not create this program.');
        return;
      }
      const query = forClientId ? `?forClient=${encodeURIComponent(forClientId)}` : '';
      router.push(`/coach/programs/${result.id}${query}` as Route);
    });
  }

  return (
    <form onSubmit={handleSubmit} className={`${CARD} space-y-3 p-6`}>
      <label className="flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
        Program Name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lower Back Recovery — Phase 1"
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
        Goal
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Reduce low back pain, rebuild core stability"
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
        Difficulty
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
          className={INPUT}
        >
          <option value="">—</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Creating…' : 'Create Program & Continue'}
        </button>
      </div>
    </form>
  );
}
