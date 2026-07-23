import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';

/**
 * vitest.config.ts runs this suite under environment: 'node', so there is
 * no window/localStorage global by default — exactly the SSR condition
 * lib/onboarding/guestStorage.ts is meant to guard against. Mirrors
 * tests/guest-preview-storage.test.ts's structure for the analogous
 * (but unrelated — separate storage-key namespace) wellness-check guest
 * flow.
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

const SAMPLE_PAYLOAD: OnboardingAnswerInput[] = [
  { question_key: 'primary_concern', question_version: 1, answer_status: 'answered', value: 'stress' },
  {
    question_key: 'baseline_stress_level',
    question_version: 1,
    answer_status: 'answered',
    value: 4,
  },
];

describe('onboarding guest storage', () => {
  afterEach(() => {
    uninstallWindow();
  });

  describe('without a window (SSR)', () => {
    it('getGuestOnboardingAnswers returns null instead of throwing', async () => {
      const { getGuestOnboardingAnswers } = await import('@/lib/onboarding/guestStorage');
      expect(getGuestOnboardingAnswers()).toBeNull();
    });

    it('hasPendingGuestOnboardingData returns false', async () => {
      const { hasPendingGuestOnboardingData } = await import('@/lib/onboarding/guestStorage');
      expect(hasPendingGuestOnboardingData()).toBe(false);
    });

    it('saveGuestOnboardingAnswers, clearGuestOnboardingAnswers, and markGuestOnboardingMigrated do not throw', async () => {
      const { saveGuestOnboardingAnswers, clearGuestOnboardingAnswers, markGuestOnboardingMigrated } =
        await import('@/lib/onboarding/guestStorage');
      expect(() => saveGuestOnboardingAnswers(SAMPLE_PAYLOAD)).not.toThrow();
      expect(() => clearGuestOnboardingAnswers()).not.toThrow();
      expect(() => markGuestOnboardingMigrated()).not.toThrow();
    });
  });

  describe('with a window', () => {
    beforeEach(() => {
      installWindow();
    });

    it('round-trips a payload through saveGuestOnboardingAnswers/getGuestOnboardingAnswers', async () => {
      const { saveGuestOnboardingAnswers, getGuestOnboardingAnswers } =
        await import('@/lib/onboarding/guestStorage');
      saveGuestOnboardingAnswers(SAMPLE_PAYLOAD);
      expect(getGuestOnboardingAnswers()).toEqual(SAMPLE_PAYLOAD);
    });

    it('hasPendingGuestOnboardingData is false initially, true once saved', async () => {
      const { saveGuestOnboardingAnswers, hasPendingGuestOnboardingData } =
        await import('@/lib/onboarding/guestStorage');
      expect(hasPendingGuestOnboardingData()).toBe(false);
      saveGuestOnboardingAnswers(SAMPLE_PAYLOAD);
      expect(hasPendingGuestOnboardingData()).toBe(true);
    });

    it('clearGuestOnboardingAnswers removes the saved payload entirely', async () => {
      const { saveGuestOnboardingAnswers, clearGuestOnboardingAnswers, getGuestOnboardingAnswers } =
        await import('@/lib/onboarding/guestStorage');
      saveGuestOnboardingAnswers(SAMPLE_PAYLOAD);
      clearGuestOnboardingAnswers();
      expect(getGuestOnboardingAnswers()).toBeNull();
    });

    it('treats corrupt JSON as absent instead of throwing', async () => {
      const { getGuestOnboardingAnswers } = await import('@/lib/onboarding/guestStorage');
      (
        globalThis as unknown as { window: { localStorage: MemoryLocalStorage } }
      ).window.localStorage.setItem('mef.onboardingGuest.v1', '{not valid json');
      expect(getGuestOnboardingAnswers()).toBeNull();
    });

    it('treats an empty array as absent', async () => {
      const { saveGuestOnboardingAnswers, getGuestOnboardingAnswers, hasPendingGuestOnboardingData } =
        await import('@/lib/onboarding/guestStorage');
      saveGuestOnboardingAnswers([]);
      expect(getGuestOnboardingAnswers()).toBeNull();
      expect(hasPendingGuestOnboardingData()).toBe(false);
    });

    it('isGuestOnboardingMigrated reflects markGuestOnboardingMigrated', async () => {
      const { isGuestOnboardingMigrated, markGuestOnboardingMigrated } =
        await import('@/lib/onboarding/guestStorage');
      expect(isGuestOnboardingMigrated()).toBe(false);
      markGuestOnboardingMigrated();
      expect(isGuestOnboardingMigrated()).toBe(true);
    });
  });
});
