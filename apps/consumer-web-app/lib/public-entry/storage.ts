/**
 * The visitor token, browser side.
 *
 * WHAT IT IS. One opaque random value, minted the first time somebody opens
 * the public entry experience, kept in localStorage, and sent with every
 * later request from that browser. It is what lets a visitor refresh, close
 * the tab and come back to their own result, and it is what lets a member
 * who signs up be recognised afterwards as the person who took the
 * experience.
 *
 * WHAT IT IS NOT. Not a fingerprint, not derived from an IP, not derived
 * from anything about the person, and not linked to any auth.users id until
 * they create an account and their own browser hands it over. It identifies
 * a browser, and a browser is not a person.
 *
 * Mirrors lib/guest-preview/storage.ts's shape deliberately (its own
 * versioned key, silent failure when storage is unavailable, a corrupt
 * value treated as absent) rather than inventing a second convention for
 * the same job.
 */

const TOKEN_KEY = 'mef.publicEntry.token.v1';
const CLAIMED_KEY = 'mef.publicEntry.claimed.v1';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function mintToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Private-mode browsers without crypto.randomUUID still get a usable,
  // non-colliding token. It is not a security value, so this is fine.
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** The token for this browser, minting one on first call. Returns null only when storage is entirely unavailable, in which case the visit is simply not resumable. */
export function getOrCreateVisitorToken(): string | null {
  if (!hasStorage()) return null;
  try {
    const existing = window.localStorage.getItem(TOKEN_KEY);
    if (existing && existing.length >= 8 && existing.length <= 64) return existing;
    const minted = mintToken();
    window.localStorage.setItem(TOKEN_KEY, minted);
    return minted;
  } catch {
    return null;
  }
}

/** The token if one already exists, never minting. This is what the claim reads: a browser that never took the experience must not create a session by signing up. */
export function readVisitorToken(): string | null {
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
 * cleared once claimed: a member who comes back to their own result link
 * should still find it. This flag only stops the claim being attempted
 * again on every page load for the rest of that browser's life.
 */
export function isClaimed(): boolean {
  if (!hasStorage()) return false;
  try {
    return window.localStorage.getItem(CLAIMED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markClaimed(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(CLAIMED_KEY, 'true');
  } catch {
    // Best effort. The claim route is idempotent (member_public_entry_origin
    // has a primary key on member_id), so a repeated attempt writes nothing
    // twice.
  }
}
