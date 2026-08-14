/**
 * Password-recovery landing detection and the "you must set a new password
 * before you do anything else" gate.
 *
 * Why this exists, precisely. A recovery link is not a sign-in link, but by
 * the time the browser lands back on this app it looks exactly like one: a
 * real session has been established, and nothing in the URL that the server
 * can rely on says "this session came from a reset email". Before this
 * module, the app had no way to tell the two apart, so a member who clicked
 * the reset link was simply signed in and dropped on their dashboard, and
 * the set-a-new-password screen that already existed was never reached.
 *
 * Two facts about GoTrue drive the whole design, both confirmed directly
 * against this project's own production and local instances (v2.193.1):
 *
 *  1. The FAILURE case is reported in the URL *fragment*, never the query
 *     string: an expired or already-used link comes back as
 *     `...#error=access_denied&error_code=otp_expired&...`. A server route
 *     cannot see a fragment. That is why the old callback saw a request
 *     with no `code`, concluded nothing at all had happened, and sent the
 *     member to a generic `/login?error=auth_callback_failed` instead of an
 *     honest "this link has expired" screen.
 *
 *  2. The SUCCESS case can arrive in more than one shape depending on how
 *     the reset was initiated and which template sent it: `?code=` (PKCE),
 *     `?token_hash=&type=recovery` (verify-OTP), or
 *     `#access_token=&refresh_token=&type=recovery` (implicit). Only the
 *     first two are visible to a server.
 *
 * So detection is deliberately split: the server handles what it can see
 * (lib is shared by app/api/auth/recovery/route.ts), the browser handles the
 * fragment, and both funnel into the same cookie. The cookie is what the
 * gate below reads, so once a recovery is recognised by *any* of those
 * paths, every route in the app agrees that this member owes us a new
 * password. Nothing here depends on a query parameter surviving the round
 * trip, which is the fragility the previous `?next=/reset-password/confirm`
 * approach carried.
 */

/** Random opaque token, never anything sensitive. httpOnly, short-lived. */
export const PASSWORD_RECOVERY_COOKIE = 'mef_password_recovery';

/**
 * Long enough for someone to choose a password without being rushed, short
 * enough that an abandoned recovery does not leave a browser gated forever.
 * A member who lets it lapse is not locked out of anything: the gate simply
 * stops firing and they are an ordinary signed-in member again.
 */
export const PASSWORD_RECOVERY_MAX_AGE_S = 30 * 60;

export const RESET_CONFIRM_PATH = '/reset-password/confirm';
export const RESET_REQUEST_PATH = '/reset-password';

/** Appended to RESET_REQUEST_PATH when a link turned out to be dead. */
export const EXPIRED_LINK_QUERY = 'reason=expired';

/**
 * The only paths a member mid-recovery may still reach. Everything else
 * redirects to the set-new-password screen.
 *
 * `/api/` is exempt as a whole because the recovery routes themselves live
 * there, and because gating a data endpoint would break the very screen we
 * are forcing the member onto rather than protect anything: the gate is a
 * routing rule, not an authorization boundary. RLS is still the only thing
 * that decides what this session may read or write.
 *
 * `/login` is exempt so that signing out mid-recovery lands somewhere
 * sensible rather than bouncing; signOut() clears the cookie anyway.
 */
const RECOVERY_EXEMPT_PREFIXES = [RESET_CONFIRM_PATH, '/api/', '/login'];

export function isRecoveryExemptPath(path: string): boolean {
  return RECOVERY_EXEMPT_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export interface RecoveryGateInput {
  hasUser: boolean;
  recoveryPending: boolean;
  path: string;
}

/**
 * True when this request must be redirected to the set-new-password screen.
 * Requires a real session: a recovery cookie with no session is inert, and
 * redirecting an anonymous visitor into a screen they cannot use would be
 * worse than letting the normal signed-out routing handle them.
 */
export function shouldGateToPasswordReset({
  hasUser,
  recoveryPending,
  path,
}: RecoveryGateInput): boolean {
  if (!hasUser || !recoveryPending) return false;
  return !isRecoveryExemptPath(path);
}

export type RecoveryLanding =
  /** Nothing in this URL indicates a recovery attempt of any kind. */
  | { kind: 'none' }
  /** PKCE: exchangeCodeForSession(code). Server-visible. */
  | { kind: 'code'; code: string }
  /** Verify-OTP style link. Server-visible. */
  | { kind: 'token_hash'; tokenHash: string }
  /** Implicit flow: tokens arrived in the fragment. Browser-only. */
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  /** The link was expired, already used, or otherwise refused by GoTrue. */
  | { kind: 'expired'; description: string };

function readParams(input: string): URLSearchParams {
  // Accepts "?a=b", "#a=b" or "a=b" so callers can pass location.search and
  // location.hash straight through without trimming either sigil first.
  return new URLSearchParams(input.replace(/^[?#]/, ''));
}

/**
 * Recognises every shape a recovery link can land in. `search` and `hash`
 * are checked together because GoTrue is not consistent about which one it
 * uses: the same project answers a valid link in the query string and a
 * dead one in the fragment.
 *
 * An error is reported ahead of any token, so a URL that somehow carries
 * both is treated as the failure it is rather than half-honoured.
 */
export function parseRecoveryLanding(search: string, hash: string): RecoveryLanding {
  const query = readParams(search);
  const fragment = readParams(hash);
  const either = (key: string) => fragment.get(key) ?? query.get(key);

  const errorCode = either('error_code') ?? either('error');
  if (errorCode) {
    return {
      kind: 'expired',
      description: either('error_description')?.replace(/\+/g, ' ') ?? errorCode,
    };
  }

  const accessToken = either('access_token');
  const refreshToken = either('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken };
  }

  const tokenHash = either('token_hash');
  if (tokenHash) return { kind: 'token_hash', tokenHash };

  const code = either('code');
  if (code) return { kind: 'code', code };

  return { kind: 'none' };
}

/**
 * The address a recovery email must point at. Deliberately a bare path with
 * no query string of its own.
 *
 * The previous target encoded its intent in a parameter
 * (`/api/auth/callback?next=/reset-password/confirm`), which put the entire
 * flow at the mercy of that parameter surviving GoTrue's email template,
 * its redirect-allow-list matching and the round trip back. If it was ever
 * dropped, the callback fell back to `next = '/'` and cheerfully redirected
 * the member to the routing hub, which signed them in and never mentioned
 * their password again. That is the silent sign-in this whole build is
 * about. Encoding the intent in the *path* removes that failure mode by
 * construction: there is no parameter left to lose.
 */
export function recoveryRedirectTo(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/api/auth/recovery`;
}

/** Where a dead link sends the member: an honest screen, not a login form. */
export function expiredLinkPath(): string {
  return `${RESET_REQUEST_PATH}?${EXPIRED_LINK_QUERY}`;
}

export type RecoveryScreen = 'checking' | 'ready' | 'expired' | 'done';

/**
 * "done" is terminal. Nothing may walk it back.
 *
 * This exists because of a real defect caught driving the flow in a browser,
 * not a hypothetical. Finishing a reset clears the recovery marker, which is
 * correct: the gate has to come down. But clearing a cookie in a Server
 * Action makes Next.js re-render the route, the confirm screen recomputes
 * "is a recovery in progress" and now correctly answers no, and the screen
 * re-resolved itself from a URL that no longer carries any tokens. The member
 * saw "This link has expired" immediately after successfully setting a new
 * password that had in fact been saved. Success outranks every later
 * reassessment, so the rule lives here where it can be stated and tested
 * rather than buried in an effect.
 */
export function nextRecoveryScreen(
  current: RecoveryScreen,
  proposed: RecoveryScreen
): RecoveryScreen {
  return current === 'done' ? 'done' : proposed;
}
