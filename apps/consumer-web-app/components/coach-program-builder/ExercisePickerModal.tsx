'use client';

import { useEffect, useState } from 'react';
import { Search, X, Plus, Sparkles } from 'lucide-react';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import {
  getRecommendedExercisesForClientAction,
  type RecommendedExercise,
} from '@/app/actions/coach-programs';

export type PickedExercise = {
  provider: string;
  externalId: string;
  name: string;
};

/**
 * Search-and-add modal reused from the Exercise Library's own search route
 * (/api/exercises — see app/api/exercises/route.ts) rather than a
 * duplicate query path, per "Reuse Prompt 3 library." When `clientId` is
 * given (the builder was opened from a specific client's page), also
 * surfaces Movement Profile-informed recommendations above search
 * results — coach still picks, nothing here auto-adds anything.
 */
export function ExercisePickerModal({
  clientId,
  onPick,
  onClose,
}: {
  clientId?: string | undefined;
  onPick: (exercise: PickedExercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ExerciseLibraryExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [recommended, setRecommended] = useState<RecommendedExercise[]>([]);

  useEffect(() => {
    if (!clientId) return;
    getRecommendedExercisesForClientAction(clientId).then(setRecommended);
  }, [clientId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/exercises?q=${encodeURIComponent(query)}&limit=20`)
        .then((res) => res.json())
        .then((json) => setResults(json.data ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-t-[28px] bg-white shadow-2xl sm:h-[80vh] sm:rounded-[28px]">
        <div className="flex items-center justify-between border-b border-[#1B3A2D]/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Add an Exercise
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/5 hover:text-[#1B3A2D]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 pb-0">
          <div className="flex items-center gap-2 rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-3">
            <Search className="h-4 w-4 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              className="flex-1 bg-transparent text-sm text-[#1B3A2D] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {recommended.length > 0 && query === '' && (
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Recommended for this client
              </div>
              <div className="space-y-1.5">
                {recommended.map((exercise) => (
                  <button
                    key={`${exercise.provider}-${exercise.externalId}`}
                    type="button"
                    onClick={() =>
                      onPick({
                        provider: exercise.provider,
                        externalId: exercise.externalId,
                        name: exercise.name,
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#F5B700]/40 bg-[#F5B700]/[0.08] px-4 py-3 text-left transition hover:bg-[#F5B700]/[0.15]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1B3A2D]">{exercise.name}</p>
                      <p className="mt-0.5 truncate text-xs text-[#6B7A72]">
                        {exercise.matchReasons.join(' · ')}
                      </p>
                    </div>
                    <Plus
                      className="h-4 w-4 shrink-0 text-[#1B3A2D]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && <p className="py-6 text-center text-sm text-[#6B7A72]">Searching…</p>}
          {!loading && results.length === 0 && (
            <p className="py-6 text-center text-sm text-[#6B7A72]">
              {query ? 'No exercises found.' : 'Start typing to search the Exercise Library.'}
            </p>
          )}

          <div className="space-y-1.5">
            {results.map((exercise) => (
              <button
                key={exercise.externalId}
                type="button"
                onClick={() =>
                  onPick({
                    provider: exercise.provider,
                    externalId: exercise.externalId,
                    name: exercise.name,
                  })
                }
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/10 px-4 py-3 text-left transition hover:border-[#1B3A2D]/30 hover:bg-[#EFF6F1]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1B3A2D]">{exercise.name}</p>
                  <p className="mt-0.5 truncate text-xs text-[#6B7A72]">
                    {[
                      exercise.primaryMuscles[0]?.replace(/_/g, ' '),
                      exercise.equipment,
                      exercise.level,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Plus
                  className="h-4 w-4 shrink-0 text-[#1B3A2D]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
