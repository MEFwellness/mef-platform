import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './env';
import { requestCache } from '../reactRequestCache';
import { TRACE_ON, recordQuery } from '../dev/queryTrace';

/** "rest:profiles", "rpc:has_active_role", "auth:user" — enough to count repeats by target. */
function traceLabel(input: RequestInfo | URL): string {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(href).pathname;
  const rest = path.match(/\/rest\/v1\/rpc\/([^/?]+)/);
  if (rest) return `rpc:${rest[1]}`;
  const table = path.match(/\/rest\/v1\/([^/?]+)/);
  if (table) return `rest:${table[1]}`;
  const auth = path.match(/\/auth\/v1\/(.+)$/);
  if (auth) return `auth:${auth[1]}`;
  return path;
}

/** The whole read, so two byte-identical reads in one request can be counted as one duplicate. */
function traceExact(input: RequestInfo | URL, init?: RequestInit): string {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(href);
  return `${init?.method ?? 'GET'} ${traceLabel(input)} ${u.search}`;
}

/**
 * Server-side Supabase client, used in Server Components and Server
 * Actions. Always uses the anon key — RLS is the actual authorization
 * boundary, never a client-side or trusted-server assumption. There is no
 * service-role client used anywhere in the request path this sprint; the
 * service role is reserved for the seed script and future background jobs.
 *
 * ONE CLIENT PER REQUEST (Home speed build, 2026-08-28). This used to
 * construct a fresh client on every call, and `getRequestClient` below
 * existed as the memoized variant for the handful of call sites that
 * needed the dedupe. That split was the reason most of this app's
 * request-memoized readers never actually deduped: React's `cache()` keys
 * on argument identity, so `memberTimezone(clientA, id)` and
 * `memberTimezone(clientB, id)` are two different cache entries and
 * therefore two round trips for one answer. Home paid that twenty-four
 * times over on `profiles` alone.
 *
 * Memoizing construction changes nothing about what any query does or who
 * may read what: the client carries no per-caller state, every read still
 * goes to Postgres, and RLS is still the boundary. It only makes one
 * request's callers agree on which client object they are holding, which
 * is what the memoized readers key on. Both names are kept so the hundreds
 * of existing call sites need no edit; they now return the same instance.
 */
function buildRequestClient() {
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
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const request = fetch(input, { ...init, cache: 'no-store' });
        if (!TRACE_ON) return request;
        // Development-only measurement (MEF_TRACE_QUERIES=1). See
        // lib/dev/queryTrace.ts — a no-op branch otherwise.
        return request.finally(() => recordQuery(traceLabel(input), traceExact(input, init)));
      },
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

export const createClient = requestCache(buildRequestClient);

/**
 * Historical alias for `createClient`, kept because a few dozen call sites
 * name it explicitly to say "I want the shared one". Since the Home speed
 * build there is only one, so these are the same function.
 */
export const getRequestClient = createClient;
