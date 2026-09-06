/**
 * ONE REQUEST ASKS THE SAME QUESTION ONCE.
 *
 * WHY IT EXISTS. Home is built out of about twenty cards, each of which
 * reads what it needs for itself. That is the right shape for the screen,
 * and the codebase already memoizes the readers that were worth memoizing
 * by hand. But memoization by hand only helps where somebody remembered to
 * do it: a trace of one real production Home render (MEF_TRACE_QUERIES=1,
 * lib/dev/queryTrace.ts) counted 138 round trips of which 23 were
 * BYTE-IDENTICAL repeats of a read the same render had already made and
 * already had the answer to. `daily_feed_items` was fetched four times.
 * `daily_checkins_current` three. Every one of those is a real network
 * round trip to Supabase, and on a phone on a real connection they are the
 * bulk of what "the screen is still settling" means.
 *
 * So this sits at the one place every one of those reads passes through:
 * the Supabase client's own `fetch`. Two identical reads in one request
 * become one request and one answer, with no call site changed and no
 * reader having to know that another reader exists.
 *
 * =====================================================================
 * WHY THIS IS NOT THE CACHE THAT WAS DELIBERATELY SWITCHED OFF
 * =====================================================================
 *
 * lib/supabase/server.ts passes `cache: 'no-store'` on every read, on
 * purpose, and its own comment explains the production bug that came from
 * Next's Data Cache serving a stale answer. This is a different thing and
 * the difference is the whole point:
 *
 *   - IT NEVER CROSSES A REQUEST. The map lives in React's per-request
 *     `cache()` (AsyncLocalStorage underneath), so a different member's
 *     request, or the same member's next request, shares nothing. Next's
 *     Data Cache is a persistent, cross-request store; this is a scratch
 *     pad that is thrown away when the render ends.
 *
 *   - A WRITE EMPTIES IT. Anything that is not a GET or a HEAD clears the
 *     whole map before it runs. That is the exact bug the Data Cache
 *     caused: `claimDailyPriority` inserts today's row and then re-reads
 *     it with the same query it got nothing back from a moment earlier. A
 *     write here throws away every remembered answer, so that re-read is a
 *     real read again. RPCs (`.rpc()`, which supabase-js sends as a POST)
 *     count as writes for this purpose, because some of them genuinely are
 *     (`submit_daily_checkin`, `upsert_*`, `claim_*`) and no allowlist of
 *     the read-only ones would stay true.
 *
 *   - IT ONLY EVER MERGES READS THE SAME REQUEST WAS ALREADY MAKING. Two
 *     identical GETs issued microseconds apart by two cards on one screen
 *     cannot see different data anyway: they run in one render, against one
 *     snapshot of intent, with the same session. Merging them changes the
 *     number of round trips and nothing else.
 *
 * A FAILED READ IS NOT REMEMBERED. If the fetch rejects, the entry is
 * dropped, so a later reader gets a fresh attempt rather than the earlier
 * failure. A read that comes back as an HTTP error IS remembered, because
 * that is a real answer from PostgREST (a 406, an RLS refusal) and asking
 * again in the same render would get the same one.
 */
import { requestCache } from '../reactRequestCache';

/** Enough of a response to hand out again, byte for byte. */
export type Captured = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string | null;
};

/** One map per request. Two concurrent members never share one. */
const readsForThisRequest = requestCache(() => new Map<string, Promise<Captured>>());

function hrefOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * The key is the whole read, not just its URL.
 *
 * PostgREST answers the same path differently depending on headers: `Range`
 * is how supabase-js expresses `.range()` and `.limit()` in some paths,
 * `Prefer` carries `count=exact`, `Accept` distinguishes `.single()` from a
 * list, and `Accept-Profile` names the schema. Two reads that differ in any
 * of those are two different questions.
 *
 * `Authorization` and `apikey` are in the key too. Nothing in the request
 * path builds a second client with a different key today, but if one ever
 * does, a service-role read must never be handed to an anon reader, and a
 * key is the cheapest way to make that impossible rather than merely
 * unlikely.
 */
const KEYED_HEADERS = [
  'accept',
  'accept-profile',
  'range',
  'prefer',
  'authorization',
  'apikey',
  'content-profile',
];

function keyFor(method: string, href: string, init?: RequestInit): string {
  const headers = new Headers(init?.headers ?? {});
  const parts = KEYED_HEADERS.map((name) => `${name}=${headers.get(name) ?? ''}`);
  return `${method} ${href} ${parts.join('|')}`;
}

async function capture(response: Response): Promise<Captured> {
  // 204/205/304 carry no body, and constructing a Response with one throws.
  const bodyless = response.status === 204 || response.status === 205 || response.status === 304;
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body: bodyless ? null : await response.text(),
  };
}

function replay(captured: Captured): Response {
  return new Response(captured.body, {
    status: captured.status,
    statusText: captured.statusText,
    headers: captured.headers,
  });
}

/**
 * Wraps one Supabase fetch. `perform` is what actually goes to the network,
 * kept as a callback so the tracing in lib/supabase/server.ts stays in one
 * place and a deduped read is not counted as a second round trip.
 */
export function readOncePerRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  perform: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  /**
   * The map to remember in. Production never passes one: it is this
   * request's own, from React's per-request cache.
   *
   * A test does pass one, and has to. `requestCache` falls back to an
   * identity wrapper outside the app-router runtime
   * (lib/reactRequestCache.ts), so in a plain Node process every call would
   * get a brand new map and nothing would ever merge — a suite written
   * against that would prove nothing and pass. Handing in one map is
   * exactly what one request looks like, so the rules below are tested as
   * they are written rather than as a second copy of them.
   */
  scope?: Map<string, Promise<Captured>>
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const reads = scope ?? readsForThisRequest();

  if (method !== 'GET' && method !== 'HEAD') {
    // A write, or an RPC that might be one. Everything remembered is now
    // suspect, so none of it is kept.
    reads.clear();
    return perform(input, init);
  }

  const key = keyFor(method, hrefOf(input), init);
  const already = reads.get(key);
  if (already) return already.then(replay);

  const pending = perform(input, init).then(capture);
  reads.set(key, pending);
  // A read that never arrived must not stand in for the next reader's.
  pending.catch(() => {
    if (reads.get(key) === pending) reads.delete(key);
  });
  return pending.then(replay);
}

/**
 * The same "a write empties the map" rule, for a client that does NOT go
 * through readOncePerRequest.
 *
 * The service-role clients (lib/supabase/serviceRole.ts,
 * lib/coaching-direction/serviceRole.ts) are built straight from
 * supabase-js and carry their own fetch, so their writes would otherwise be
 * invisible here. Almost all of them run in a job or a route that makes no
 * session reads at all, but "almost" is not the guarantee this file is
 * making. With this, the invariant is unconditional: ANY write, from ANY
 * client, in this request, throws away every answer this request was
 * remembering.
 *
 * It only ever clears. It never remembers anything itself, because a
 * service-role read and a member's own read are not the same question and
 * must never stand in for one another.
 */
export function forgetRememberedReadsOnWrite(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') readsForThisRequest().clear();
  return fetch(input, init);
}
