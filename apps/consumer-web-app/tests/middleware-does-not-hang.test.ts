/**
 * The outage itself, reproduced against the real updateSession().
 *
 * The unit tests next door prove the two timeout primitives work. This one
 * proves the thing that actually broke: that when Supabase Auth never
 * answers, `updateSession` still returns, in bounded time, with a usable
 * answer. Before the fix this test would never have finished.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authState = {
  getUser: vi.fn(),
  getSession: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: authState }),
}));

vi.mock('next/server', () => ({
  NextResponse: { next: () => ({ cookies: { set: vi.fn(), getAll: () => [] } }) },
}));

/** The failure mode: a call that connects and then never comes back. */
function neverAnswers() {
  return new Promise<never>(() => {});
}

const SESSION_USER = { id: 'user-1', email: 'member@example.test' };

function requestWithCookies() {
  return { cookies: { get: () => undefined, set: vi.fn() }, headers: new Headers() } as never;
}

describe('updateSession under a Supabase that does not answer', () => {
  beforeEach(() => {
    vi.resetModules();
    authState.getUser.mockReset();
    authState.getSession.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('returns instead of hanging, and keeps the member signed in from her own cookie', async () => {
    const { updateSession, SESSION_LOOKUP_TIMEOUT_MS } = await import('../lib/supabase/middleware');

    authState.getUser.mockImplementation(neverAnswers);
    authState.getSession.mockResolvedValue({
      data: { session: { user: SESSION_USER } },
    });

    const started = Date.now();
    const result = await updateSession(requestWithCookies());
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(SESSION_LOOKUP_TIMEOUT_MS + 2000);
    expect(result.degraded).toBe(true);
    // The whole point: a valid session is NOT thrown away because the auth
    // server was slow. That would be the same outage with a nicer error.
    expect(result.user).toEqual(SESSION_USER);
  }, 20000);

  it('reports signed-out when neither the auth check nor the cookie yields anyone', async () => {
    const { updateSession } = await import('../lib/supabase/middleware');

    authState.getUser.mockImplementation(neverAnswers);
    authState.getSession.mockResolvedValue({ data: { session: null } });

    const result = await updateSession(requestWithCookies());
    expect(result.degraded).toBe(true);
    expect(result.user).toBeNull();
  }, 20000);

  it('is not marked degraded, and does no cookie fallback, when Supabase answers normally', async () => {
    const { updateSession } = await import('../lib/supabase/middleware');

    authState.getUser.mockResolvedValue({ data: { user: SESSION_USER } });

    const result = await updateSession(requestWithCookies());
    expect(result.degraded).toBe(false);
    expect(result.user).toEqual(SESSION_USER);
    expect(authState.getSession).not.toHaveBeenCalled();
  });

  it('treats a signed-out visitor as signed out, not as a failure', async () => {
    const { updateSession } = await import('../lib/supabase/middleware');

    authState.getUser.mockResolvedValue({ data: { user: null } });

    const result = await updateSession(requestWithCookies());
    expect(result.degraded).toBe(false);
    expect(result.user).toBeNull();
  });
});
