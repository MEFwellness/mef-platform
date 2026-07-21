/**
 * Recent-search memory for the Exercise Library browse experience —
 * client-only, localStorage-backed. Deliberately not a new Supabase table:
 * "which terms did I type recently" is per-device browsing convenience
 * (same category as a browser's own search-bar history), not member
 * health/program data worth persisting server-side or syncing across
 * devices, so this stays local rather than adding new backend infra for
 * it.
 */

const STORAGE_KEY = 'mef.exerciseLibrary.recentSearches';
const MAX_ENTRIES = 8;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getRecentSearches(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Moves `term` to the front, de-duplicated case-insensitively, capped at MAX_ENTRIES. Blank/whitespace-only terms are ignored — never worth remembering. */
export function recordRecentSearch(term: string): string[] {
  if (!isBrowser()) return [];
  const trimmed = term.trim();
  if (!trimmed) return getRecentSearches();

  const existing = getRecentSearches().filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...existing].slice(0, MAX_ENTRIES);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private browsing, quota) — recent
    // searches are a convenience, never worth failing the search over.
  }
  return next;
}

export function clearRecentSearches(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See recordRecentSearch — best-effort only.
  }
}
