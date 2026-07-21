import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentSearches,
  getRecentSearches,
  recordRecentSearch,
} from '../lib/exercise-library/searchHistory';

/**
 * The vitest config for this workspace runs in the `node` environment (no
 * jsdom), so `window`/`localStorage` don't exist by default — this stubs a
 * minimal in-memory localStorage as `window` to exercise the real
 * browser-only code path in searchHistory.ts rather than only its
 * `typeof window === 'undefined'` fallback branch.
 */
function stubBrowserLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
}

describe('exercise library search history (localStorage-backed)', () => {
  beforeEach(() => {
    stubBrowserLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty list when nothing has been recorded', () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it('records a search and returns it most-recent-first', () => {
    recordRecentSearch('squat');
    recordRecentSearch('plank');
    expect(getRecentSearches()).toEqual(['plank', 'squat']);
  });

  it('de-duplicates case-insensitively, moving the repeated term back to the front', () => {
    recordRecentSearch('Squat');
    recordRecentSearch('plank');
    recordRecentSearch('squat');
    expect(getRecentSearches()).toEqual(['squat', 'plank']);
  });

  it('ignores blank/whitespace-only terms', () => {
    recordRecentSearch('   ');
    expect(getRecentSearches()).toEqual([]);
  });

  it('caps history at 8 entries, dropping the oldest', () => {
    for (let i = 0; i < 10; i++) recordRecentSearch(`term-${i}`);
    const recent = getRecentSearches();
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe('term-9');
    expect(recent).not.toContain('term-0');
    expect(recent).not.toContain('term-1');
  });

  it('clearRecentSearches empties the list', () => {
    recordRecentSearch('squat');
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });

  it('is a no-op (never throws) when window is unavailable', () => {
    vi.unstubAllGlobals();
    expect(() => recordRecentSearch('squat')).not.toThrow();
    expect(getRecentSearches()).toEqual([]);
  });
});
