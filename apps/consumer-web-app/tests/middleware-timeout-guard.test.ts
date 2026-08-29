/**
 * The middleware timeout guard: what turned a slow Supabase into a 504 for
 * the entire site, and what stops it doing that again.
 *
 * The outage these cover: middleware awaited `supabase.auth.getUser()` (and,
 * on a member screen, two role RPCs and an entitlement read) with no upper
 * bound of any kind. `fetch` waits forever by default, so one stalled
 * upstream meant the middleware invocation never returned and Vercel
 * answered every request in the app with MIDDLEWARE_INVOCATION_TIMEOUT,
 * /login included.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout, timeoutFetch } from '../lib/net/withTimeout';

/** A promise that never settles. This is the failure being defended against. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

describe('withTimeout', () => {
  it('returns the real answer when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('answered'), 1000, 'fallback')).resolves.toBe(
      'answered'
    );
  });

  it('gives up on work that never settles, instead of hanging', async () => {
    const started = Date.now();
    await expect(withTimeout(never<string>(), 40, 'fallback')).resolves.toBe('fallback');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('treats a rejection as a non-answer rather than throwing at the call site', async () => {
    await expect(withTimeout(Promise.reject(new Error('upstream 503')), 1000, 'fallback'))
      .resolves.toBe('fallback');
  });

  it('does not leave the timer running once the work has finished', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeout(Promise.resolve(1), 5000, 0);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe('timeoutFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aborts a request that stalls, so no Supabase call can outlive its budget', async () => {
    vi.stubGlobal(
      'fetch',
      (_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const bounded = timeoutFetch(30);
    await expect(bounded('https://example.test/auth/v1/user')).rejects.toThrow('aborted');
  });

  it('opts every call out of the Next.js fetch cache', async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal('fetch', (_input: unknown, init?: RequestInit) => {
      seen.push(init as RequestInit);
      return Promise.resolve(new Response('{}'));
    });

    await timeoutFetch(1000)('https://example.test/rest/v1/member_access_facts');
    expect(seen[0]?.cache).toBe('no-store');
  });

  it('still honours an abort signal the caller supplied itself', async () => {
    vi.stubGlobal(
      'fetch',
      (_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const caller = new AbortController();
    const pending = timeoutFetch(60_000)('https://example.test/auth/v1/user', {
      signal: caller.signal,
    });
    caller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });
});
