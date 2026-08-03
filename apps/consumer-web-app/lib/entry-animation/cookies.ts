/**
 * Cookie names shared between middleware.ts (writes mef_entry_play/
 * mef_entry_last_active, consumes mef_entry_login) and app/actions/auth.ts
 * (sets mef_entry_login on sign-in, clears everything on sign-out) — kept
 * in one place so the two files can't silently drift on a name.
 */
export const ENTRY_ANIMATION_PLAY_COOKIE = 'mef_entry_play';
export const ENTRY_ANIMATION_LAST_ACTIVE_COOKIE = 'mef_entry_last_active';
export const ENTRY_ANIMATION_LOGIN_COOKIE = 'mef_entry_login';

/** mef_entry_last_active persists across tab closes on purpose — it's what lets a brand-new tab still recognize "this account was last active 3 days ago." */
export const ENTRY_ANIMATION_LAST_ACTIVE_MAX_AGE_S = 60 * 60 * 24 * 30;
/** mef_entry_play only needs to survive the one response it's set on; overwritten every request regardless. */
export const ENTRY_ANIMATION_PLAY_MAX_AGE_S = 30;
/** mef_entry_login only needs to survive the redirect from signIn() to the next request. */
export const ENTRY_ANIMATION_LOGIN_MAX_AGE_S = 120;
