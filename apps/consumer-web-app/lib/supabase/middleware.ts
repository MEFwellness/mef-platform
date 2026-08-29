import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from './env';
import { timeoutFetch, withTimeout } from '../net/withTimeout';

/**
 * How long any single network call made from middleware may take, and how
 * long the whole session lookup may take including supabase-js's internal
 * refresh retries. Both are deliberately short: this runs ahead of every
 * page in the app, so the budget here is paid by every request, and the
 * only thing waiting longer buys is a slower failure.
 *
 * The second number is larger than the first because one session lookup can
 * legitimately be more than one request (fetch the user, refresh an expired
 * token, fetch again).
 */
export const MIDDLEWARE_FETCH_TIMEOUT_MS = 2500;
export const SESSION_LOOKUP_TIMEOUT_MS = 4000;

export interface SessionResult {
  response: NextResponse;
  user: User | null;
  supabase: SupabaseClient | null;
  /**
   * True when we could not get a verified answer from Supabase Auth and are
   * routing on the session cookie alone (or on nothing at all). The caller
   * uses this only to avoid punishing a member for our own outage; it never
   * grants anything.
   */
  degraded: boolean;
}

/**
 * Refreshes the Supabase session on every request and returns both the
 * response (with refreshed cookies attached) and the session, so the
 * calling middleware can make redirect decisions. This is UX routing only —
 * see the note in middleware.ts: the real access-control boundary is RLS,
 * not this function.
 *
 * NOTHING HERE IS UNBOUNDED (fix for the MIDDLEWARE_INVOCATION_TIMEOUT
 * outage). Every Supabase call this client makes, from any caller, goes
 * through a fetch that aborts on a deadline, and the auth check on top of
 * that is raced against its own deadline because a refresh can retry
 * internally. Middleware now always returns, whatever Supabase is doing.
 *
 * WHEN THE AUTH CHECK DOES NOT ANSWER, we fall back to the unexpired access
 * token already in the request's own cookies, read locally with no network
 * call, and mark the result degraded. That direction is the right one and
 * it is worth being explicit about why: the alternative is treating a
 * member with a perfectly valid session as signed out and bouncing her to
 * /login the moment Supabase Auth has a slow minute, which is the same
 * outage wearing a different error message. Nothing is granted by this
 * fallback. RLS still decides every row, and every page in this app
 * re-verifies the user itself through getCachedUser() before it renders, so
 * a session that is genuinely dead gets no further than the page it lands
 * on.
 *
 * Wrapped in try/catch: this runs on *every* request the matcher covers,
 * including the public /login and /signup pages themselves. Before this
 * fix, a missing/invalid Supabase URL never threw here at all — getUser()
 * returns { user: null, error } rather than throwing, so the site kept
 * rendering with everyone treated as signed-out. getSupabaseEnv() above now
 * throws eagerly for a clearer error, which would otherwise turn that same
 * misconfiguration into a hard 500 on every single page (including /login)
 * instead of the login page loading and only the submit failing. Catching
 * it here and falling back to "treat as signed out" preserves that
 * pre-existing, safer degradation — real authorization still comes from
 * RLS, never from this middleware.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request: { headers: request.headers } });

  let supabase: SupabaseClient;
  try {
    const { url, anonKey } = getSupabaseEnv();
    supabase = createServerClient(url, anonKey, {
      global: { fetch: timeoutFetch(MIDDLEWARE_FETCH_TIMEOUT_MS) },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    });
  } catch (err) {
    console.error('updateSession: Supabase misconfigured, treating request as signed-out —', err);
    return { response, user: null, supabase: null, degraded: false };
  }

  // The sentinel distinguishes "Supabase answered, nobody is signed in"
  // from "Supabase did not answer at all". They are the same value (null
  // user) but they call for opposite handling, and conflating them is what
  // would sign valid members out during an upstream wobble.
  const TIMED_OUT = Symbol('auth-timeout');
  const verified = await withTimeout<{ user: User | null } | typeof TIMED_OUT>(
    supabase.auth.getUser().then(({ data }) => ({ user: data.user })),
    SESSION_LOOKUP_TIMEOUT_MS,
    TIMED_OUT
  );

  if (verified !== TIMED_OUT) {
    return { response, user: verified.user, supabase, degraded: false };
  }

  console.error(
    `updateSession: Supabase Auth did not answer within ${SESSION_LOOKUP_TIMEOUT_MS}ms — ` +
      'routing on the session cookie for this request'
  );

  // Local read of the cookie this client already holds. getSession() does
  // not call the network while the access token is unexpired, and the
  // deadline above still applies to it if it decides to refresh.
  const cached = await withTimeout<{ user: User | null } | typeof TIMED_OUT>(
    supabase.auth.getSession().then(({ data }) => ({ user: data.session?.user ?? null })),
    MIDDLEWARE_FETCH_TIMEOUT_MS,
    TIMED_OUT
  );

  return {
    response,
    user: cached === TIMED_OUT ? null : cached.user,
    supabase,
    degraded: true,
  };
}
