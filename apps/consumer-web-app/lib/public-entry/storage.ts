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

import { isSignupRefShape, PUBLIC_ENTRY_REF_QUERY } from './signupField';

const TOKEN_KEY = 'mef.publicEntry.token.v1';
const CLAIMED_KEY = 'mef.publicEntry.claimed.v1';
/**
 * The one-time signup reference, while it is crossing from the result
 * screen's button to the signup form's hidden field.
 *
 * sessionStorage AND NOT localStorage, deliberately. This value is meant to
 * live for the length of one signup and then be gone: it should not survive
 * the tab, should not be readable by a later visit, and should not sit in a
 * browser for a day the way the visitor token does. It is also the reason
 * the query parameter is stripped out of the address bar the moment it is
 * read, so it stops being in the URL a screenshot or a shared link would
 * carry.
 */
const SIGNUP_REF_KEY = 'mef.publicEntry.signupRef.v1';

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


function hasSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

/**
 * The reference this signup is carrying, taken from the URL the
 * create-account button navigated to, and then kept for the length of the
 * tab so it survives the ordinary things a form does.
 *
 * WHAT IT HAS TO SURVIVE, WHICH IS WHY IT IS NOT JUST A QUERY READ.
 * Turnstile solving in place (no navigation, so the URL is untouched
 * anyway), a failed submit and a retry, and a visitor who taps "Already
 * have an account?", looks at the login screen, and comes back. It does NOT
 * need to survive the confirmation email, because the bind happens inside
 * the signup request itself. That is the whole point of this route.
 *
 * THE URL IS CLEANED AS SOON AS IT IS READ. A one-time reference has no
 * business staying in the address bar once the page has it.
 *
 * Returns null when there is nothing to carry, which is every signup that
 * did not come from a finished result screen.
 */
export function captureSignupRef(): string | null {
  if (typeof window === 'undefined') return null;

  let fromUrl: string | null = null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(PUBLIC_ENTRY_REF_QUERY);
    if (raw && isSignupRefShape(raw.trim())) fromUrl = raw.trim();
    if (raw !== null) {
      url.searchParams.delete(PUBLIC_ENTRY_REF_QUERY);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    // A URL that cannot be parsed carries nothing. Nothing to clean either.
  }

  if (!hasSessionStorage()) return fromUrl;
  try {
    if (fromUrl) {
      window.sessionStorage.setItem(SIGNUP_REF_KEY, fromUrl);
      return fromUrl;
    }
    const stashed = window.sessionStorage.getItem(SIGNUP_REF_KEY);
    return stashed && isSignupRefShape(stashed) ? stashed : null;
  } catch {
    return fromUrl;
  }
}

/** Drops the stash once the signup that carried it has gone through. The server has already spent it by then; this only stops a second form picking it up. */
export function clearSignupRef(): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(SIGNUP_REF_KEY);
  } catch {
    // Best effort. The reference is single use on the server, so a stash
    // that outlives its signup can bind nothing.
  }
}
