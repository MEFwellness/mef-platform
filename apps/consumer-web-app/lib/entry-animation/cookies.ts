/**
 * Cookie names shared between middleware.ts (mints/reuses mef_entry_play's
 * token, refreshes mef_entry_last_active, reads mef_entry_login) and
 * app/actions/auth.ts (sets mef_entry_login on sign-in, clears everything
 * on sign-out) — kept in one place so the files can't silently drift on a
 * name.
 */
export const ENTRY_ANIMATION_PLAY_COOKIE = 'mef_entry_play';
export const ENTRY_ANIMATION_LAST_ACTIVE_COOKIE = 'mef_entry_last_active';
export const ENTRY_ANIMATION_LOGIN_COOKIE = 'mef_entry_login';

/** mef_entry_last_active persists across tab closes on purpose — it's what lets a brand-new tab still recognize "this account was last active 3 days ago." */
export const ENTRY_ANIMATION_LAST_ACTIVE_MAX_AGE_S = 60 * 60 * 24 * 30;
/** mef_entry_login only needs to survive the redirect from signIn() to the next request, but see ENTRY_ANIMATION_PLAY_MAX_AGE_S's own comment for why it's given a longer window than that alone would need. */
export const ENTRY_ANIMATION_LOGIN_MAX_AGE_S = 120;
/**
 * mef_entry_play holds a one-shot token (see middleware.ts's own comment),
 * reused verbatim for as long as it's valid rather than re-minted. Must
 * stay >= ENTRY_ANIMATION_LOGIN_MAX_AGE_S: if the token expired before
 * mef_entry_login does, an ordinary navigation late in that window would
 * mint a *new* token — indistinguishable from a genuine new trigger to
 * the client's sessionStorage comparison — for what's still really the
 * same login. The 30s margin is just headroom, not load-bearing.
 */
export const ENTRY_ANIMATION_PLAY_MAX_AGE_S = ENTRY_ANIMATION_LOGIN_MAX_AGE_S + 30;
