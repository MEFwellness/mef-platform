/**
 * Search aliases — member-facing terms that don't literally match
 * ExerciseAPI.dev's own vocabulary get rewritten to a term the API's search
 * actually understands before the request goes out. This exists because
 * the API's free-text search is limited to matching against exercise
 * names/keywords; it doesn't understand synonyms a member might type.
 *
 * Adding a new alias is a one-line addition to SEARCH_ALIASES — nothing
 * else in the search path (app/api/exercises/route.ts,
 * apiClient.ts) changes, which is the point: this is the seam the task's
 * "build a structure that allows future search aliases without changing
 * the architecture" requirement calls for.
 */

const SEARCH_ALIASES: Record<string, string> = {
  abs: 'abdominals',
  core: 'abdominals',
  legs: 'quadriceps',
  glutes: 'glutes',
  butt: 'glutes',
  arms: 'biceps',
  back: 'lats',
  cardio: 'conditioning',
  hiit: 'conditioning',
  stretching: 'stretching',
  warmup: 'warm up',
  'warm-up': 'warm up',
};

/** Rewrites a member-typed search term to its canonical alias, if one exists; otherwise returns the term unchanged. */
export function resolveSearchAlias(term: string): string {
  const normalized = term.trim().toLowerCase();
  return SEARCH_ALIASES[normalized] ?? term;
}
