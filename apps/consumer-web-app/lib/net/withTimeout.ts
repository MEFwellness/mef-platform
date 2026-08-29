/**
 * Bounding work that runs inside Vercel middleware.
 *
 * WHY THIS EXISTS. Middleware runs before every page in this app, and it
 * awaited three kinds of network call that had no upper bound on how long
 * they could take: the Supabase auth check, the role RPCs, and the
 * entitlement read. `fetch` does not time out on its own. So a single slow
 * or stalled upstream did not make one page slow, it made the middleware
 * invocation never return, and Vercel answered every request in the app
 * (including /login, which needs no session at all) with a 504
 * MIDDLEWARE_INVOCATION_TIMEOUT. One slow dependency took the whole site
 * down.
 *
 * The rule now: nothing awaited in middleware may be unbounded. Two layers
 * enforce it, because one is not enough.
 *
 *  - `timeoutFetch` bounds the actual socket. That covers a request that
 *    connects and then stalls, which is the common shape of the failure.
 *
 *  - `withTimeout` bounds the *promise*, which the fetch bound alone does
 *    not. supabase-js retries a token refresh internally with backoff and
 *    serialises it behind a lock, so a call can outlive any single fetch by
 *    a wide margin while every individual fetch respects its own deadline.
 *
 * Neither one throws at the call site. Both resolve to a caller-supplied
 * fallback, because a middleware that fails is only useful if it fails
 * towards letting the request continue.
 */

/** Resolves to `fallback` if `promise` has not settled within `ms`. Never rejects. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });

  try {
    // A rejection is the same outcome as a timeout as far as routing is
    // concerned: we did not get an answer, so take the fallback.
    return await Promise.race([promise.catch(() => fallback), expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * A `fetch` that aborts after `ms` instead of waiting forever.
 *
 * `cache: 'no-store'` for the same reason lib/supabase/server.ts sets it:
 * Next.js patches fetch in this runtime and supabase-js issues its reads as
 * plain GETs whose URL is the entire query, so identical reads are
 * cache-eligible. Caching who is signed in, or which roles they hold, is
 * never right.
 */
export function timeoutFetch(ms: number): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    // Honour a signal the caller already supplied (supabase-js passes one
    // for its own cancellation) rather than silently replacing it.
    const callerSignal = init?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    return fetch(input, { ...init, cache: 'no-store', signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );
  };
}
