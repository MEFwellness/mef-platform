import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';

/**
 * Client-only, isolated from every authenticated data path — mirrors
 * lib/guest-preview/storage.ts's pattern (a separate, unrelated guest
 * flow) but with its own key namespace, since this stores a guest's
 * answers to the real 12-question onboarding assessment, not the
 * wellness-check quiz. Kept in its own versioned key (bump the suffix if
 * the shape ever changes) so a stale older shape is simply treated as
 * absent rather than crashing the flow.
 */
const STORAGE_KEY = 'mef.onboardingGuest.v1';

/**
 * Deliberately a separate key from STORAGE_KEY, not a field bundled into
 * the same object: OnboardingFlow's member-mode migration clears
 * STORAGE_KEY once submitOnboarding() succeeds, but still needs to
 * remember "already migrated" afterward so a later mount never
 * re-submits.
 */
const MIGRATED_KEY = 'mef.onboardingGuest.migrated.v1';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveGuestOnboardingAnswers(payload: OnboardingAnswerInput[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable (private browsing quota, etc.) — the guest can
    // still see their observation this session, they just won't survive
    // a refresh or make it into their account after signup.
  }
}

export function getGuestOnboardingAnswers(): OnboardingAnswerInput[] | null {
  if (!hasStorage()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed as OnboardingAnswerInput[];
  } catch {
    // Corrupt or old-shape JSON — treat as if nothing were ever saved.
    return null;
  }
}

export function hasPendingGuestOnboardingData(): boolean {
  return getGuestOnboardingAnswers() !== null;
}

export function clearGuestOnboardingAnswers(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — best-effort cleanup only.
  }
}

export function isGuestOnboardingMigrated(): boolean {
  if (!hasStorage()) return false;
  try {
    return window.localStorage.getItem(MIGRATED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markGuestOnboardingMigrated(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(MIGRATED_KEY, 'true');
  } catch {
    // Best-effort — worst case OnboardingFlow's mount check runs once
    // more on a later page load, which is safe since it only ever fires
    // when hasPendingGuestOnboardingData() is still true (i.e. the
    // preceding clearGuestOnboardingAnswers() call also failed).
  }
}
