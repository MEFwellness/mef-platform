import {
  EMPTY_GUEST_PREVIEW_ANSWERS,
  type GuestPreviewAnswers,
  type GuestPreviewState,
} from './types';

/**
 * Client-only, isolated from every authenticated data path. Kept in its own
 * versioned key (bump the suffix if the shape ever changes) so a stale
 * older shape is simply treated as absent rather than crashing the flow.
 */
const STORAGE_KEY = 'mef.guestPreview.v1';

/**
 * Deliberately a separate key from STORAGE_KEY, not a field bundled into
 * the same object: the migrator clears STORAGE_KEY once migration
 * succeeds, but still needs to remember "already migrated" afterward so a
 * later mount (e.g. a subsequent page load) never re-submits.
 */
const MIGRATED_KEY = 'mef.guestPreview.migrated.v1';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getGuestPreviewState(): GuestPreviewState | null {
  if (!hasStorage()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<GuestPreviewState>;
    if (!parsed || typeof parsed !== 'object' || !parsed.answers) return null;

    return {
      answers: { ...EMPTY_GUEST_PREVIEW_ANSWERS, ...parsed.answers },
      step: typeof parsed.step === 'number' ? parsed.step : 0,
      quizComplete: parsed.quizComplete === true,
    };
  } catch {
    // Corrupt or old-shape JSON — treat as if nothing were ever saved.
    return null;
  }
}

function writeState(state: GuestPreviewState): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private browsing quota, etc.) — the guest can
    // still finish this session, they just won't survive a refresh.
  }
}

export function setGuestAnswer<K extends keyof GuestPreviewAnswers>(
  field: K,
  value: GuestPreviewAnswers[K]
): GuestPreviewState {
  const current = getGuestPreviewState() ?? {
    answers: { ...EMPTY_GUEST_PREVIEW_ANSWERS },
    step: 0,
    quizComplete: false,
  };
  const next: GuestPreviewState = {
    ...current,
    answers: { ...current.answers, [field]: value },
  };
  writeState(next);
  return next;
}

export function setGuestStep(step: number): void {
  const current = getGuestPreviewState() ?? {
    answers: { ...EMPTY_GUEST_PREVIEW_ANSWERS },
    step: 0,
    quizComplete: false,
  };
  writeState({ ...current, step });
}

export function markGuestQuizComplete(): void {
  const current = getGuestPreviewState() ?? {
    answers: { ...EMPTY_GUEST_PREVIEW_ANSWERS },
    step: 0,
    quizComplete: false,
  };
  writeState({ ...current, quizComplete: true });
}

export function clearGuestPreview(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — best-effort cleanup only.
  }
}

export function hasPendingGuestData(): boolean {
  const state = getGuestPreviewState();
  if (!state) return false;
  return Object.values(state.answers).some((value) => value !== null);
}

export function isGuestPreviewMigrated(): boolean {
  if (!hasStorage()) return false;
  try {
    return window.localStorage.getItem(MIGRATED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markGuestPreviewMigrated(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(MIGRATED_KEY, 'true');
  } catch {
    // Best-effort — worst case the migrator retries once more, which the
    // merge-only-null-fields logic in app/actions/guest-preview.ts already
    // makes safe to repeat.
  }
}
