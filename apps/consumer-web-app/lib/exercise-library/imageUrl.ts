/**
 * Split out from apiClient.ts on purpose: this file has no process.env
 * access and no fetch/API-key logic, so it's safe for client components
 * (the Exercise Library browse/detail pages) to import directly.
 * Importing anything from apiClient.ts itself would pull the server-only
 * client class into the browser bundle.
 */

const EXERCISE_API_CDN_BASE_URL = 'https://cdn.exerciseapi.dev';

/** Prepends the CDN base to a relative image path returned by the API; leaves already-absolute URLs untouched. */
export function resolveExerciseImageUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${EXERCISE_API_CDN_BASE_URL}/${path.replace(/^\//, '')}`;
}
