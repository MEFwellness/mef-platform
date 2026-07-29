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
