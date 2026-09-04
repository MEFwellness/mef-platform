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
 * The visitor token for this browser: one opaque random value, minted the
 * first time somebody starts the quiz, and the whole of what lets the
 * fenced server-side copy of her answers be recognised as hers if she goes
 * on to create an account. Never derived from an IP, a fingerprint or any
 * auth id. It identifies a browser, and a browser is not a person. Mirrors
 * lib/public-entry/storage.ts deliberately rather than inventing a second
 * convention for the same job.
 */
const TOKEN_KEY = 'mef.guestPreview.token.v1';

/**
 * Deliberately a separate key from STORAGE_KEY, and deliberately not a
 * field inside it: it has to outlive the answers themselves, so a browser
 * that has already been bound to an account never asks again for the rest
 * of its life.
 */
const CLAIMED_KEY = 'mef.guestPreview.claimed.v1';

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

/**
 * The token for this browser, minting one on first call. Returns null only
 * when storage is entirely unavailable, in which case the run is simply not
 * resumable and nothing is fenced server side either, which is the correct
 * outcome: there would be no way to recognise it as hers later.
 */
export function getOrCreateGuestVisitorToken(): string | null {
  if (!hasStorage()) return null;
  try {
    const existing = window.localStorage.getItem(TOKEN_KEY);
    if (existing && existing.length >= 8 && existing.length <= 64) return existing;
    const minted =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(TOKEN_KEY, minted);
    return minted;
  } catch {
    return null;
  }
}

/**
 * The token if one already exists, never minting. This is what the claim
 * reads: a browser that never took the quiz must not create a run by
 * signing up.
 */
export function readGuestVisitorToken(): string | null {
  if (!hasStorage()) return null;
  try {
    const existing = window.localStorage.getItem(TOKEN_KEY);
    return existing && existing.length >= 8 && existing.length <= 64 ? existing : null;
  } catch {
    return null;
  }
}

/**
 * Kept separately from the token itself, and the token is deliberately NOT
 * cleared once claimed. This flag only stops the claim being attempted
 * again on every page load for the rest of that browser's life.
 */
export function isGuestPreviewClaimed(): boolean {
  if (!hasStorage()) return false;
  try {
    return window.localStorage.getItem(CLAIMED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markGuestPreviewClaimed(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(CLAIMED_KEY, 'true');
  } catch {
    // Best effort. The claim route is idempotent, so a repeated attempt
    // writes nothing twice.
  }
}
