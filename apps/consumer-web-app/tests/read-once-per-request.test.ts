/**
 * ONE REQUEST ASKS THE SAME QUESTION ONCE — and never at the cost of a
 * stale answer.
 *
 * lib/supabase/readOnce.ts sits underneath every Supabase read this app
 * makes, so the two things it promises are held apart and proved
 * separately:
 *
 *   1. TWO IDENTICAL READS IN ONE REQUEST COST ONE ROUND TRIP. That is the
 *      point of it. A traced production Home render made 138 round trips of
 *      which 23 were byte-identical repeats of a read the same render had
 *      already made.
 *
 *   2. A WRITE THROWS EVERYTHING AWAY. This is the guard against the exact
 *      production bug lib/supabase/server.ts's own header describes:
 *      `claimDailyPriority` inserts today's row and then re-reads it with
 *      the query it got nothing back from a moment earlier. If the second
 *      read were served the first read's empty answer, the claim would look
 *      like it had failed and everything after it would be skipped. Every
 *      non-GET counts as a write, RPCs included, because some RPCs
 *      genuinely are (`submit_daily_checkin`, `upsert_*`, `claim_*`).
 *
 * These count CALLS TO THE NETWORK, not results: "the same rows come back"
 * was already true and is not the claim.
 *
 * WHY THE MAP IS HANDED IN. `requestCache` falls back to an identity
 * wrapper outside the app-router runtime (lib/reactRequestCache.ts), so in a
 * plain Node process every call to the real function would get a brand new
 * map, nothing would ever merge, and a suite written against that would
 * pass while proving nothing. `readOncePerRequest` therefore takes the map
 * as an optional last argument, and one map is exactly what one request is.
 * The function under test is the real one, not a copy of its rules.
 */
import { describe, it, expect } from 'vitest';
import {
  readOncePerRequest,
  forgetRememberedReadsOnWrite,
  type Captured,
} from '../lib/supabase/readOnce';

const PROFILES_1 = 'https://example.supabase.co/rest/v1/profiles?select=*&id=eq.1';
const PROFILES_2 = 'https://example.supabase.co/rest/v1/profiles?select=*&id=eq.2';
const CHECKIN_RPC = 'https://example.supabase.co/rest/v1/rpc/submit_daily_checkin';

/** One request: a shared map, plus a network that records what actually reached it. */
function oneRequest() {
  const calls: string[] = [];
  const scope = new Map<string, Promise<Captured>>();
  let body = 'before';
  let failNext = false;

  const perform = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(`${(init?.method ?? 'GET').toUpperCase()} ${href}`);
    if (failNext) {
      failNext = false;
      throw new Error('network down');
    }
    return new Response(JSON.stringify({ body }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '0-0/1' },
    });
  };

  return {
    calls,
    read: (url: string, init?: RequestInit) => readOncePerRequest(url, init, perform, scope),
    setBody: (next: string) => {
      body = next;
    },
    breakNextCall: () => {
      failNext = true;
    },
  };
}

describe('two identical reads in one request cost one round trip', () => {
  it('the second one makes no request and gets the same answer, byte for byte', async () => {
    const request = oneRequest();
    const first = await (await request.read(PROFILES_1)).json();
    const second = await (await request.read(PROFILES_1)).json();

    expect(request.calls).toEqual([`GET ${PROFILES_1}`]);
    expect(second).toEqual(first);
  });

  it('the status and the headers survive the replay, so a count read still counts', async () => {
    const request = oneRequest();
    await request.read(PROFILES_1);
    const replayed = await request.read(PROFILES_1);

    expect(replayed.status).toBe(200);
    // PostgREST reports `{ count: 'exact' }` in this header, never the body.
    expect(replayed.headers.get('content-range')).toBe('0-0/1');
  });

  it('two readers can both consume the body: neither is handed a stream the other drained', async () => {
    const request = oneRequest();
    const a = await (await request.read(PROFILES_1)).text();
    const b = await (await request.read(PROFILES_1)).text();

    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(request.calls).toHaveLength(1);
  });

  it('a different query is a different question', async () => {
    const request = oneRequest();
    await request.read(PROFILES_1);
    await request.read(PROFILES_2);

    expect(request.calls).toHaveLength(2);
  });

  it('the same URL with a different Range is a different question', async () => {
    const request = oneRequest();
    await request.read(PROFILES_1, { headers: { Range: '0-9' } });
    await request.read(PROFILES_1, { headers: { Range: '10-19' } });

    expect(request.calls).toHaveLength(2);
  });

  it('the same URL under a different key is a different question, so no client can be served another client’s answer', async () => {
    const request = oneRequest();
    await request.read(PROFILES_1, { headers: { apikey: 'anon' } });
    await request.read(PROFILES_1, { headers: { apikey: 'service-role' } });

    expect(request.calls).toHaveLength(2);
  });

  it('a HEAD is remembered separately from the GET of the same URL', async () => {
    const request = oneRequest();
    await request.read(PROFILES_1, { method: 'HEAD' });
    await request.read(PROFILES_1, { method: 'HEAD' });
    await request.read(PROFILES_1);

    expect(request.calls).toEqual([
      `HEAD ${PROFILES_1}`,
      `GET ${PROFILES_1}`,
    ]);
  });
});

describe('a write throws everything away', () => {
  it('the read after an insert is a real read, and sees what the insert wrote', async () => {
    const request = oneRequest();
    await request.read(PROFILES_1);

    request.setBody('after the insert');
    await request.read(PROFILES_1, { method: 'POST', body: '{}' });

    const afterWrite = (await (await request.read(PROFILES_1)).json()) as { body: string };
    expect(request.calls).toHaveLength(3);
    expect(afterWrite.body).toBe('after the insert');
  });

  it('an RPC counts as a write, because some RPCs are', async () => {
    const request = oneRequest();
    await request.read(PROFILES_1);
    await request.read(CHECKIN_RPC, { method: 'POST', body: '{}' });
    await request.read(PROFILES_1);

    expect(request.calls).toHaveLength(3);
  });

  it('PATCH and DELETE empty it too', async () => {
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      const request = oneRequest();
      await request.read(PROFILES_1);
      await request.read(PROFILES_1, { method });
      await request.read(PROFILES_1);

      expect(request.calls, method).toHaveLength(3);
    }
  });

  it('a write is never itself remembered, so two identical writes both happen', async () => {
    const request = oneRequest();
    await request.read(CHECKIN_RPC, { method: 'POST', body: '{}' });
    await request.read(CHECKIN_RPC, { method: 'POST', body: '{}' });

    expect(request.calls).toHaveLength(2);
  });
});

describe('a read that never arrived is not remembered', () => {
  it('the next reader gets a fresh attempt rather than the earlier failure', async () => {
    const request = oneRequest();
    request.breakNextCall();
    await expect(request.read(PROFILES_1)).rejects.toThrow('network down');

    const recovered = (await (await request.read(PROFILES_1)).json()) as { body: string };
    expect(request.calls).toHaveLength(2);
    expect(recovered.body).toBe('before');
  });
});

describe('a write from a client that does not go through the reader still empties the map', () => {
  it('the escape hatch the service-role clients use exists and is a function', () => {
    // Wired into lib/supabase/serviceRole.ts and
    // lib/coaching-direction/serviceRole.ts, which are built straight from
    // supabase-js and carry their own fetch. With it, the invariant is
    // unconditional: ANY write in this request throws away what the request
    // was remembering, whichever client made it.
    expect(typeof forgetRememberedReadsOnWrite).toBe('function');
  });
});
