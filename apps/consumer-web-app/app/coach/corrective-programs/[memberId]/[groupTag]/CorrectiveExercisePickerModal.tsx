'use client';

import { useEffect, useState } from 'react';
import { Search, X, Plus, ShieldCheck } from 'lucide-react';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import type { BlueprintKey, CorrectiveExercise, SessionBlockType } from '@/lib/corrective-engine/types';
import { getQualifiedCorrectiveCandidatesAction } from '@/app/actions/corrective-programs';

export type CorrectivePickedExercise = {
  provider: string;
  externalId: string;
  name: string;
  coachingCues: string | null;
  isCoachOverride: boolean;
};

const BLOCK_LABEL: Record<SessionBlockType, string> = {
  release: 'Release',
  mobility: 'Mobility',
  stability: 'Stability',
  strength: 'Strength',
  core: 'Core',
};

/**
 * Defaults to only exercises that satisfy this block's engine qualification
 * rules (lib/corrective-engine/blockQualification.ts) — "correct corrective
 * role and muscles, all engine rules respected." A "show full library"
 * toggle switches to the same catalog-wide search the general Program
 * Builder uses (/api/exercises); anything picked through that path is
 * flagged as a coach override, regardless of whether it happens to also
 * qualify, since the coach explicitly stepped outside the guided default.
 */
export function CorrectiveExercisePickerModal({
  blueprintKeys,
  block,
  equipment,
  excludeExternalIds,
  onPick,
  onClose,
}: {
  blueprintKeys: BlueprintKey[];
  block: SessionBlockType;
  equipment: string[];
  excludeExternalIds: string[];
  onPick: (exercise: CorrectivePickedExercise) => void;
  onClose: () => void;
}) {
  const [showFullLibrary, setShowFullLibrary] = useState(false);
  const [qualified, setQualified] = useState<CorrectiveExercise[]>([]);
  const [loadingQualified, setLoadingQualified] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExerciseLibraryExercise[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingQualified(true);
    getQualifiedCorrectiveCandidatesAction(blueprintKeys, block, equipment).then((results) => {
      if (!cancelled) {
        setQualified(results);
        setLoadingQualified(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [blueprintKeys, block, equipment]);

  useEffect(() => {
    if (!showFullLibrary) return;
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/exercises?q=${encodeURIComponent(query)}&limit=20`)
        .then((res) => res.json())
        .then((json) => setSearchResults(json.data ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [showFullLibrary, query]);

  const excluded = new Set(excludeExternalIds);
  const qualifiedVisible = qualified.filter((e) => !excluded.has(e.externalId));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-t-[28px] bg-white shadow-2xl sm:h-[80vh] sm:rounded-[28px]">
        <div className="flex items-center justify-between border-b border-[#1B3A2D]/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            {BLOCK_LABEL[block]}: Choose an Exercise
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

        <div className="flex items-center justify-between gap-3 border-b border-[#1B3A2D]/10 px-5 py-3">
          <span className="text-xs text-[#6B7A72]">
            {showFullLibrary
              ? 'Any exercise you pick here is marked as a coach override.'
              : 'Only showing exercises that fit this block’s corrective rules.'}
          </span>
          <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[#1B3A2D]">
            <input
              type="checkbox"
              checked={showFullLibrary}
              onChange={(e) => setShowFullLibrary(e.target.checked)}
              className="h-4 w-4 rounded border-[#1B3A2D]/20"
            />
            Show full library
          </label>
        </div>

        {showFullLibrary && (
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
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {!showFullLibrary ? (
            <>
              {loadingQualified && <p className="py-6 text-center text-sm text-[#6B7A72]">Loading…</p>}
              {!loadingQualified && qualifiedVisible.length === 0 && (
                <p className="py-6 text-center text-sm text-[#6B7A72]">
                  No qualified exercises left for this block with the current equipment. Try &quot;Show
                  full library&quot; to pick manually.
                </p>
              )}
              <div className="space-y-1.5">
                {qualifiedVisible.map((exercise) => (
                  <button
                    key={exercise.externalId}
                    type="button"
                    onClick={() =>
                      onPick({
                        provider: exercise.provider,
                        externalId: exercise.externalId,
                        name: exercise.name,
                        coachingCues: exercise.coachingCues.length > 0 ? exercise.coachingCues.join(' ') : null,
                        isCoachOverride: false,
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/10 px-4 py-3 text-left transition hover:border-[#1B3A2D]/30 hover:bg-[#EFF6F1]"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-[#1B3A2D]/50" strokeWidth={1.75} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#1B3A2D]">{exercise.name}</p>
                        <p className="mt-0.5 truncate text-xs text-[#6B7A72]">
                          {[...exercise.musclesStretched, ...exercise.musclesStrengthened].join(' · ')}
                        </p>
                      </div>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {searching && <p className="py-6 text-center text-sm text-[#6B7A72]">Searching…</p>}
              {!searching && searchResults.length === 0 && (
                <p className="py-6 text-center text-sm text-[#6B7A72]">
                  {query ? 'No exercises found.' : 'Start typing to search the full Exercise Library.'}
                </p>
              )}
              <div className="space-y-1.5">
                {searchResults.map((exercise) => (
                  <button
                    key={exercise.externalId}
                    type="button"
                    onClick={() =>
                      onPick({
                        provider: exercise.provider,
                        externalId: exercise.externalId,
                        name: exercise.name,
                        coachingCues: null,
                        isCoachOverride: true,
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#F5B700]/40 bg-[#F5B700]/[0.06] px-4 py-3 text-left transition hover:bg-[#F5B700]/[0.12]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1B3A2D]">{exercise.name}</p>
                      <p className="mt-0.5 truncate text-xs text-[#6B7A72]">
                        {[exercise.primaryMuscle?.replace(/_/g, ' '), exercise.equipment, exercise.level]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
