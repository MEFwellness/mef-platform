import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './env';
import { requestCache } from '../reactRequestCache';

/**
 * Server-side Supabase client, used in Server Components and Server
 * Actions. Always uses the anon key — RLS is the actual authorization
 * boundary, never a client-side or trusted-server assumption. There is no
 * service-role client used anywhere in the request path this sprint; the
 * service role is reserved for the seed script and future background jobs.
 */
export function createClient() {
  const cookieStore = cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    /**
     * Every request this client makes opts OUT of Next.js's fetch cache.
     *
     * Next.js patches global fetch in the App Router and, in a PRODUCTION
     * build, will both memoize identical GETs within one render and cache
     * them in the Data Cache. supabase-js issues its reads as plain GETs
     * whose URL is the whole query, so two reads of the same row in one
     * render are byte-identical requests and the second one can be served
     * from the first one's response.
     *
     * That is wrong for every read in this app (a member's own data must
     * never come from a cache), and it caused a real production bug that
     * never reproduced in `next dev`, because dev does not have the Data
     * Cache: `claimDailyPriority` inserts today's priority row and then
     * re-reads it, using the same query the caller had already issued and
     * got nothing back from moments earlier. The re-read was served the
     * earlier empty response, the claim looked like it had failed, and
     * everything after it in `buildPriorityView` was skipped, including
     * the write of the coaching decision ledger row. The card still
     * appeared, because the NEXT request found the row that had genuinely
     * been inserted, so the symptom was silent and one-sided.
     *
     * There is nothing to gain from caching here and a whole class of
     * stale-data bugs to lose, so it is switched off at the client rather
     * than remembered at each of the hundreds of call sites.
     */
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component during render — the middleware
          // is what actually persists the refreshed session cookie in
          // that case. Safe to ignore here.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // See note above.
        }
      },
    },
  });
}

/**
 * Request-memoized variant of createClient(), for the handful of call
 * sites (the Dashboard's carousel of independently-fetching cards —
 * WhatWereNoticingCard/RootMapCard/CoachingMessageCard/RecommendationsCard
 * — and the actions they call into) where reusing one client instance is
 * what makes the *downstream* request-memoized engine entry points
 * (getCoachingFocusDecision, computeMemberIntelligence, decideNextAction,
 * gatherRootMapInputs) actually dedupe: React's cache() keys on argument
 * identity, so two calls with the same memberId/localDate but two
 * separately-constructed SupabaseClient objects are two different cache
 * entries. A brand-new client per call was never expensive on its own
 * (cookies() is synchronous, local) — the cost this avoids is entirely in
 * what it unblocks downstream, which is why plain createClient() (above)
 * stays the default for every other call site in the app.
 */
export const getRequestClient = requestCache(() => createClient());
