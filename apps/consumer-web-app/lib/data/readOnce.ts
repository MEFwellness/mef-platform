/**
 * One read per request, and a way to forget it when a write in the same
 * request makes it wrong.
 *
 * WHY THIS EXISTS. Home issued 331 server round trips to draw one screen,
 * and a third of them were the same read asked for again by a different
 * module: her plan and her assignments seven times, her water answer nine
 * times, her restricted topics seven times. None of those can change
 * between two lines of one render, but nothing told the second caller that
 * the first had already asked.
 *
 * React's `cache()` already solves this for a function whose arguments are
 * stable identities. It does not solve it for the many readers in this app
 * that take an options literal (`{ statusFilter: ['active'] }`), because a
 * fresh object at each call site is a fresh cache key and therefore a fresh
 * round trip. This keys on a string the caller writes out instead.
 *
 * WHAT THIS IS NOT. It is not a cache. Nothing here outlives the request
 * that created it: the Map is itself request-scoped, so a different
 * member's request cannot see it, tomorrow cannot see it, and there is no
 * expiry to get wrong. It cannot serve her yesterday's truth, because it
 * cannot survive until tomorrow.
 *
 * THE ONE RULE. A read wrapped here must be forgotten by every write in
 * this app that changes its answer, through `forgetReads` with the same
 * prefix. That is the whole safety argument: the app already contains
 * read-then-write-then-read sequences (`getOrCreateTodaysFeed` is one),
 * and a memoized read with no invalidation would hand the second read the
 * answer from before the write. Each `readOnce` key below therefore names
 * its writer in a comment, and the writer calls `forgetReads`.
 *
 * KEYS are `<fact>:<memberId>[:<qualifier>]`. `forgetReads` takes a prefix,
 * so a writer forgets every variant of one fact for one member with
 * `forgetReads('narrative:' + memberId)`.
 */
import { requestCache } from '../reactRequestCache';

export type RequestReads = Map<string, Promise<unknown>>;

/** One map per request, in the app runtime. */
const readsForThisRequest = requestCache((): RequestReads => new Map());

/**
 * How the current request's map is found.
 *
 * In the app this is React's `cache`, which is request-scoped by
 * construction and is the only resolver ever used. The vitest suite
 * resolves the real `react` package, which has no `cache` export, so
 * `requestCache` degrades there to an identity wrapper and every call
 * would get a fresh map: the tests install their own scope through this
 * seam (tests/setup/readScope.ts) so what they assert is the same code
 * path the app runs, rather than a memoization that is switched off.
 *
 * Deliberately a plain function reference and not AsyncLocalStorage: this
 * module is reachable from the client bundle, and a `node:` import here
 * breaks the production build outright.
 */
let resolveReads: () => RequestReads = readsForThisRequest;

/** Installs a scope resolver. Passing null restores the app's own. For tests. */
export function installReadScopeResolver(resolver: (() => RequestReads) | null): void {
  resolveReads = resolver ?? readsForThisRequest;
}

function currentReads(): RequestReads {
  return resolveReads();
}

export function readOnce<T>(key: string, read: () => Promise<T>): Promise<T> {
  const reads = currentReads();
  const inFlight = reads.get(key);
  if (inFlight) return inFlight as Promise<T>;
  // The PROMISE is stored, not the resolved value, so two callers that ask
  // at the same moment share one round trip rather than racing into two.
  const started = read();
  reads.set(key, started);
  // A read that throws must not be remembered as the answer: drop it so the
  // next caller retries rather than inheriting a rejection.
  started.catch(() => reads.delete(key));
  return started;
}

/** Forget every remembered read whose key starts with `prefix`. Called by the writes that change those answers. */
export function forgetReads(prefix: string): void {
  const reads = currentReads();
  for (const key of reads.keys()) {
    if (key.startsWith(prefix)) reads.delete(key);
  }
}
