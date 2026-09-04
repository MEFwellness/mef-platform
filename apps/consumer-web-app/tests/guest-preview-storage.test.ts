import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * vitest.config.ts runs this suite under environment: 'node', so there is
 * no window/localStorage global by default — exactly the SSR condition
 * lib/guest-preview/storage.ts is meant to guard against. Each test that
 * exercises real read/write behavior installs a minimal in-memory
 * localStorage stand-in first; the "no window" tests rely on the node
 * environment's real absence of window, not a stub.
 */
class MemoryLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

function installWindow() {
  (globalThis as { window?: unknown }).window = {
    localStorage: new MemoryLocalStorage(),
  };
}

function uninstallWindow() {
  delete (globalThis as { window?: unknown }).window;
}

describe('guest preview storage', () => {
  afterEach(() => {
    uninstallWindow();
  });

  describe('without a window (SSR)', () => {
    it('getGuestPreviewState returns null instead of throwing', async () => {
      const { getGuestPreviewState } = await import('@/lib/guest-preview/storage');
      expect(getGuestPreviewState()).toBeNull();
    });

    it('readGuestVisitorToken returns null and getOrCreate mints nothing', async () => {
      const { readGuestVisitorToken, getOrCreateGuestVisitorToken } =
        await import('@/lib/guest-preview/storage');
      expect(readGuestVisitorToken()).toBeNull();
      expect(getOrCreateGuestVisitorToken()).toBeNull();
    });

    it('clearGuestPreview and markGuestPreviewClaimed do not throw', async () => {
      const { clearGuestPreview, markGuestPreviewClaimed } =
        await import('@/lib/guest-preview/storage');
      expect(() => clearGuestPreview()).not.toThrow();
      expect(() => markGuestPreviewClaimed()).not.toThrow();
    });
  });

  describe('with a window', () => {
    beforeEach(() => {
      installWindow();
    });

    it('round-trips an answer through setGuestAnswer/getGuestPreviewState', async () => {
      const { setGuestAnswer, getGuestPreviewState } = await import('@/lib/guest-preview/storage');
      setGuestAnswer('energy_level', 4);
      const state = getGuestPreviewState();
      expect(state?.answers.energy_level).toBe(4);
      expect(state?.quizComplete).toBe(false);
    });

    it('getOrCreateGuestVisitorToken mints once and then returns the same token', async () => {
      const { getOrCreateGuestVisitorToken, readGuestVisitorToken } =
        await import('@/lib/guest-preview/storage');
      // readGuestVisitorToken deliberately never mints: a browser that
      // never took the quiz must not create a run by signing up.
      expect(readGuestVisitorToken()).toBeNull();
      const first = getOrCreateGuestVisitorToken();
      expect(first).toBeTruthy();
      expect(getOrCreateGuestVisitorToken()).toBe(first);
      expect(readGuestVisitorToken()).toBe(first);
    });

    it('clearGuestPreview leaves the visitor token alone', async () => {
      const { getOrCreateGuestVisitorToken, clearGuestPreview, readGuestVisitorToken } =
        await import('@/lib/guest-preview/storage');
      const token = getOrCreateGuestVisitorToken();
      clearGuestPreview();
      // The answers are fenced server side under this token. Dropping the
      // local copy must not orphan them.
      expect(readGuestVisitorToken()).toBe(token);
    });

    it('markGuestQuizComplete sets quizComplete without dropping existing answers', async () => {
      const { setGuestAnswer, markGuestQuizComplete, getGuestPreviewState } =
        await import('@/lib/guest-preview/storage');
      setGuestAnswer('stress_level', 2);
      markGuestQuizComplete();
      const state = getGuestPreviewState();
      expect(state?.quizComplete).toBe(true);
      expect(state?.answers.stress_level).toBe(2);
    });

    it('clearGuestPreview removes the saved state entirely', async () => {
      const { setGuestAnswer, clearGuestPreview, getGuestPreviewState } =
        await import('@/lib/guest-preview/storage');
      setGuestAnswer('sleep_quality', 5);
      clearGuestPreview();
      expect(getGuestPreviewState()).toBeNull();
    });

    it('treats corrupt JSON as absent instead of throwing', async () => {
      const { getGuestPreviewState } = await import('@/lib/guest-preview/storage');
      (
        globalThis as unknown as { window: { localStorage: MemoryLocalStorage } }
      ).window.localStorage.setItem('mef.guestPreview.v1', '{not valid json');
      expect(getGuestPreviewState()).toBeNull();
    });

    it('isGuestPreviewClaimed reflects markGuestPreviewClaimed', async () => {
      const { isGuestPreviewClaimed, markGuestPreviewClaimed } =
        await import('@/lib/guest-preview/storage');
      expect(isGuestPreviewClaimed()).toBe(false);
      markGuestPreviewClaimed();
      expect(isGuestPreviewClaimed()).toBe(true);
    });
  });
});
