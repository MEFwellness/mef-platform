'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Plus, Search, ShieldCheck, X } from 'lucide-react';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import {
  checkSlotSwapAction,
  getSlotSwapOptionsAction,
  type SlotSwapOptions,
} from '@/app/actions/program-blueprints';
import { NotAssignableRow } from '@/components/exercise-library/NotAssignableRow';

export type SwapPick = {
  provider: string;
  externalId: string;
  name: string;
  isCoachOverride: boolean;
};

/**
 * The swap picker for a blueprint slot.
 *
 * It defaults to what the SLOT will take, not to what the library has:
 * same block, same equipment, whatever else the slot's replacement
 * criteria say, and every candidate client assignable. The rules are
 * evaluated on the server (lib/programs/blueprints/swap.ts), so this
 * screen never decides eligibility for itself.
 *
 * The full library toggle is the deliberate way out, kept from the
 * corrective picker for the same reason it exists there: a coach with a
 * reason should not be stopped by a rule that cannot see her reason.
 * Anything picked that way is flagged as a coach override, and it is still
 * checked against the slot before it is accepted, so the toggle widens the
 * list and never silences the rules. An exercise with no video cannot be
 * picked from either list.
 *
 * Portalled to document.body: a modal inside a transformed ancestor stops
 * being fixed to the viewport and starts being fixed to that ancestor.
 */
export function SlotSwapModal({
  slotId,
  exerciseName,
  excludeExternalIds,
  unlockedByCoach,
  onPick,
  onClose,
}: {
  slotId: string;
  exerciseName: string;
  excludeExternalIds: string[];
  /** The coach unlocked this slot on her own screen. Relaxes the lock and nothing else. */
  unlockedByCoach: boolean;
  onPick: (pick: SwapPick) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<SlotSwapOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFullLibrary, setShowFullLibrary] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExerciseLibraryExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSlotSwapOptionsAction(slotId, excludeExternalIds, unlockedByCoach).then((result) => {
      if (cancelled) return;
      setOptions(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // excludeExternalIds is rebuilt on every render by the parent, so it is
    // joined into a string rather than depended on by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotId, excludeExternalIds.join('|'), unlockedByCoach]);

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

  async function pickFromFullLibrary(exercise: ExerciseLibraryExercise) {
    setOverrideError(null);
    const { blockedReason } = await checkSlotSwapAction(
      slotId,
      {
        provider: exercise.provider,
        externalId: exercise.externalId,
        name: exercise.name,
      },
      unlockedByCoach
    );
    if (blockedReason) {
      setOverrideError(blockedReason);
      return;
    }
    onPick({
      provider: exercise.provider,
      externalId: exercise.externalId,
      name: exercise.name,
      isCoachOverride: true,
    });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="mef-modal-viewport fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-t-[28px] bg-white shadow-2xl sm:h-[80vh] sm:rounded-[28px]">
        <div className="flex items-center justify-between gap-3 border-b border-[#1B3A2D]/10 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              Replace {exerciseName}
            </p>
            {options && (
              <p className="mt-0.5 text-xs text-[#6B7A72]">{options.criteria}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/5 hover:text-[#1B3A2D]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {options?.blockedReason ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="flex max-w-sm items-start gap-2 text-center text-sm leading-relaxed text-[#6B7A72]">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{options.blockedReason}</span>
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-[#1B3A2D]/10 px-5 py-3">
              <span className="text-xs text-[#6B7A72]">
                {showFullLibrary
                  ? 'Anything you pick here is marked as a coach override, and is still checked against this slot.'
                  : 'Only showing exercises this slot will take.'}
              </span>
              <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[#1B3A2D]">
                <input
                  type="checkbox"
                  checked={showFullLibrary}
                  onChange={(e) => {
                    setShowFullLibrary(e.target.checked);
                    setOverrideError(null);
                  }}
                  className="h-4 w-4 rounded border-[#1B3A2D]/20"
                />
                Show full library
              </label>
            </div>

            {showFullLibrary && (
              <div className="p-5 pb-0">
                <div className="flex items-center gap-2 rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-3">
                  <Search
                    className="h-4 w-4 text-[#6B7A72]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search exercises…"
                    aria-label="Search exercises"
                    className="flex-1 bg-transparent text-sm text-[#1B3A2D] focus:outline-none"
                  />
                </div>
                {overrideError && (
                  <p className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
                    {overrideError}
                  </p>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
              {!showFullLibrary ? (
                <>
                  {loading && (
                    <p className="py-6 text-center text-sm text-[#6B7A72]">Loading…</p>
                  )}
                  {!loading && (options?.candidates.length ?? 0) === 0 && (
                    <p className="py-6 text-center text-sm text-[#6B7A72]">
                      Nothing left that fits this slot. Try &quot;Show full library&quot; to pick
                      manually.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {(options?.candidates ?? []).map((candidate) => (
                      <button
                        key={candidate.externalId}
                        type="button"
                        onClick={() =>
                          onPick({
                            provider: candidate.provider,
                            externalId: candidate.externalId,
                            name: candidate.name,
                            isCoachOverride: false,
                          })
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/10 px-4 py-3 text-left transition hover:border-[#1B3A2D]/30 hover:bg-[#EFF6F1]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ShieldCheck
                            className="h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#1B3A2D]">
                              {candidate.name}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[#6B7A72]">
                              {[candidate.equipment, candidate.difficulty]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                        </div>
                        <Plus
                          className="h-4 w-4 shrink-0 text-[#1B3A2D]"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {searching && (
                    <p className="py-6 text-center text-sm text-[#6B7A72]">Searching…</p>
                  )}
                  {!searching && searchResults.length === 0 && (
                    <p className="py-6 text-center text-sm text-[#6B7A72]">
                      {query
                        ? 'No exercises found.'
                        : 'Start typing to search the full Exercise Library.'}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {searchResults.map((exercise) =>
                      exercise.isClientAssignable ? (
                        <button
                          key={exercise.externalId}
                          type="button"
                          onClick={() => pickFromFullLibrary(exercise)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#F5B700]/40 bg-[#F5B700]/[0.06] px-4 py-3 text-left transition hover:bg-[#F5B700]/[0.12]"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#1B3A2D]">
                              {exercise.name}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[#6B7A72]">
                              {[
                                exercise.primaryMuscle?.replace(/_/g, ' '),
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
                      ) : (
                        <NotAssignableRow
                          key={exercise.externalId}
                          name={exercise.name}
                          subtitle={[
                            exercise.primaryMuscle?.replace(/_/g, ' '),
                            exercise.equipment,
                            exercise.level,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
