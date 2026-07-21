'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseFilters, EMPTY_EXERCISE_FILTERS, type ExerciseFilterState } from './ExerciseFilters';
import { StateBanner, ErrorBanner, type ExerciseApiErrorShape } from './StateBanners';
import { RecentExerciseRails } from './RecentExerciseRails';

const QUICK_SEARCHES = [
  'Squat',
  'Push-up',
  'Deadlift',
  'Plank',
  'Lunge',
  'Shoulder mobility',
  'Hip flexor stretch',
  'Rowing',
];

const SEARCH_DEBOUNCE_MS = 350;

function extractNameList(raw: unknown): string[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  return arr
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.name === 'string') return obj.name;
        if (typeof obj.label === 'string') return obj.label;
      }
      return null;
    })
    .filter((v): v is string => Boolean(v));
}

async function fetchJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  return { ok: response.ok, body };
}

export function ExerciseLibraryBrowser({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ExerciseFilterState>(EMPTY_EXERCISE_FILTERS);
  const [muscleOptions, setMuscleOptions] = useState<string[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);

  const [results, setResults] = useState<ExerciseLibraryExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ExerciseApiErrorShape | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchJson('/api/exercises?resource=muscles')
      .then(({ ok, body }) => ok && setMuscleOptions(extractNameList(body)))
      .catch(() => undefined);
    fetchJson('/api/exercises?resource=equipment')
      .then(({ ok, body }) => ok && setEquipmentOptions(extractNameList(body)))
      .catch(() => undefined);
  }, []);

  const searchParamsKey = useMemo(
    () => JSON.stringify({ query, filters }),
    [query, filters]
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const handle = setTimeout(async () => {
      if (!query.trim() && Object.values(filters).every((v) => v === '' || v === false)) {
        setResults([]);
        setHasSearched(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      setHasSearched(true);

      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (filters.category) params.set('category', filters.category);
      if (filters.muscle) params.set('muscle', filters.muscle);
      if (filters.bodyRegion) params.set('bodyRegion', filters.bodyRegion);
      if (filters.equipment) params.set('equipment', filters.equipment);
      if (filters.level) params.set('level', filters.level);
      if (filters.force) params.set('force', filters.force);
      if (filters.mechanic) params.set('mechanic', filters.mechanic);
      if (filters.hasVideo) params.set('hasVideo', 'true');

      try {
        const { ok, body } = await fetchJson(`/api/exercises?${params.toString()}`);
        if (requestId !== requestIdRef.current) return;
        if (!ok) {
          setError((body as { error: ExerciseApiErrorShape }).error);
          setResults([]);
          return;
        }
        setResults((body as { data: ExerciseLibraryExercise[] }).data);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setError({ code: 'NETWORK_ERROR', message: 'Network error', retryAfterSeconds: null });
        setResults([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParamsKey is the intentional dependency proxy for {query, filters}
  }, [searchParamsKey]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises (e.g. squat, plank, shoulder mobility)"
          className="w-full flex-1 rounded-full border border-[#1B3A2D]/15 bg-white px-5 py-3 text-sm text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_SEARCHES.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => setQuery(term)}
            className="rounded-full border border-[#1B3A2D]/15 bg-white px-3 py-1.5 text-xs font-medium text-[#6B7A72] hover:border-[#1B3A2D]/40 hover:text-[#1B3A2D]"
          >
            {term}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <ExerciseFilters
          filters={filters}
          onChange={setFilters}
          muscleOptions={muscleOptions}
          equipmentOptions={equipmentOptions}
        />
      </div>

      <div className="mt-6">
        {loading && <StateBanner tone="loading">Searching the Exercise Library…</StateBanner>}

        {error && <ErrorBanner error={error} />}

        {!loading && !error && hasSearched && results.length === 0 && (
          <StateBanner tone="empty">
            No exercises matched this search and filter combination. Try a broader term or fewer
            filters.
          </StateBanner>
        )}

        {!loading && !hasSearched && (
          <>
            <StateBanner tone="empty">
              Search by name, or tap a quick-search term above, to browse the Exercise Library.
            </StateBanner>
            <RecentExerciseRails />
          </>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {results.map((exercise) => (
              <ExerciseCard key={exercise.externalId} exercise={exercise} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
