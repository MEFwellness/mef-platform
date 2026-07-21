'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseGridSkeleton } from './ExerciseCardSkeleton';
import {
  ExerciseFilters,
  EMPTY_EXERCISE_FILTERS,
  type ExerciseFilterState,
} from './ExerciseFilters';
import { StateBanner, ErrorBanner, type ExerciseApiErrorShape } from './StateBanners';
import { ResumeExperience } from './ResumeExperience';
import {
  getRecentSearches,
  recordRecentSearch,
  clearRecentSearches,
} from '@/lib/exercise-library/searchHistory';

const POPULAR_SEARCHES = [
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
const PAGE_SIZE = 24;

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

function buildSearchParams(
  query: string,
  filters: ExerciseFilterState,
  offset: number
): URLSearchParams {
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
  if (filters.imageOnly) params.set('imageOnly', 'true');
  if (filters.hideNoMedia) params.set('hideNoMedia', 'true');
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  return params;
}

export function ExerciseLibraryBrowser({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ExerciseFilterState>(EMPTY_EXERCISE_FILTERS);
  const [muscleOptions, setMuscleOptions] = useState<string[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);

  const [results, setResults] = useState<ExerciseLibraryExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<ExerciseApiErrorShape | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  useEffect(() => {
    fetchJson('/api/exercises?resource=muscles')
      .then(({ ok, body }) => ok && setMuscleOptions(extractNameList(body)))
      .catch(() => undefined);
    fetchJson('/api/exercises?resource=equipment')
      .then(({ ok, body }) => ok && setEquipmentOptions(extractNameList(body)))
      .catch(() => undefined);
  }, []);

  const searchParamsKey = useMemo(() => JSON.stringify({ query, filters }), [query, filters]);

  const hasAnyCriteria =
    Boolean(query.trim()) || Object.values(filters).some((v) => v !== '' && v !== false);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const handle = setTimeout(async () => {
      if (!hasAnyCriteria) {
        setResults([]);
        setHasSearched(false);
        setError(null);
        setHasMore(false);
        return;
      }

      setLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const params = buildSearchParams(query, filters, 0);
        const { ok, body } = await fetchJson(`/api/exercises?${params.toString()}`);
        if (requestId !== requestIdRef.current) return;
        if (!ok) {
          setError((body as { error: ExerciseApiErrorShape }).error);
          setResults([]);
          setHasMore(false);
          return;
        }
        const data = (body as { data: ExerciseLibraryExercise[] }).data;
        setResults(data);
        setHasMore(data.length === PAGE_SIZE);
        if (query.trim()) setRecentSearches(recordRecentSearch(query));
      } catch {
        if (requestId !== requestIdRef.current) return;
        setError({ code: 'NETWORK_ERROR', message: 'Network error', retryAfterSeconds: null });
        setResults([]);
        setHasMore(false);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParamsKey is the intentional dependency proxy for {query, filters}
  }, [searchParamsKey]);

  async function loadMore() {
    const requestId = ++requestIdRef.current;
    setLoadingMore(true);
    try {
      const params = buildSearchParams(query, filters, results.length);
      const { ok, body } = await fetchJson(`/api/exercises?${params.toString()}`);
      if (requestId !== requestIdRef.current) return;
      if (!ok) return;
      const data = (body as { data: ExerciseLibraryExercise[] }).data;
      setResults((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }
  }

  const trimmedQuery = query.trim().toLowerCase();
  const suggestionPool = Array.from(new Set([...recentSearches, ...POPULAR_SEARCHES]));
  const suggestions = (
    trimmedQuery
      ? suggestionPool.filter(
          (s) => s.toLowerCase() !== trimmedQuery && s.toLowerCase().includes(trimmedQuery)
        )
      : suggestionPool
  ).slice(0, 8);

  function selectSuggestion(term: string) {
    setQuery(term);
    setShowSuggestions(false);
    inputRef.current?.blur();
  }

  return (
    <div>
      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search exercises (e.g. squat, plank, shoulder mobility)"
              aria-label="Search exercises"
              className="mef-focus-ring w-full rounded-full border border-[#1B3A2D]/15 bg-white py-3 pl-11 pr-11 text-base text-[#1B3A2D] outline-none transition focus:border-[#1B3A2D]/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="mef-focus-ring absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#6B7A72] transition hover:bg-[#EFF6F1] hover:text-[#1B3A2D]"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="mef-animate-in absolute z-10 mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 bg-white p-3 shadow-[0_12px_32px_-8px_rgba(27,58,45,0.25)]">
            {!trimmedQuery && recentSearches.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                    Recent Searches
                  </p>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      clearRecentSearches();
                      setRecentSearches([]);
                    }}
                    className="text-xs font-medium text-[#6B7A72] underline-offset-2 hover:text-[#1B3A2D] hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 px-1">
              {suggestions.map((term) => (
                <button
                  key={term}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(term)}
                  className="mef-focus-ring min-h-10 rounded-full border border-[#1B3A2D]/15 bg-white px-3.5 py-2 text-xs font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/40 hover:text-[#1B3A2D]"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Popular Searches
        </p>
        <div className="flex flex-wrap gap-2">
          {POPULAR_SEARCHES.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => setQuery(term)}
              className="mef-focus-ring min-h-10 rounded-full border border-[#1B3A2D]/15 bg-white px-3.5 py-2 text-xs font-medium text-[#6B7A72] hover:border-[#1B3A2D]/40 hover:text-[#1B3A2D]"
            >
              {term}
            </button>
          ))}
        </div>
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
        {loading && <ExerciseGridSkeleton />}

        {!loading && error && <ErrorBanner error={error} />}

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
            <div className="mt-2">
              <ResumeExperience />
            </div>
          </>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {results.map((exercise, i) => (
                <ExerciseCard
                  key={exercise.externalId}
                  exercise={exercise}
                  highlight={query}
                  animationDelayMs={Math.min(i, 11) * 30}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mef-focus-ring rounded-full border border-[#1B3A2D]/15 bg-white px-6 py-2.5 text-sm font-semibold text-[#1B3A2D] transition hover:border-[#1B3A2D]/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
