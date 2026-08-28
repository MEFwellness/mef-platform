/**
 * HOME SPEED BUILD (2026-08-28) — the shared load, counted.
 *
 * The claim this build makes is not "the same data comes back", which was
 * always true. It is "the same data comes back from ONE round trip", and
 * the only way to hold that is to count the round trips rather than compare
 * the results. Every test in this file therefore asserts a QUERY COUNT
 * against a fake Supabase client that records every table it is asked for.
 *
 * It also asserts the other half, which matters more: that this is a
 * deduplicated read and not a cache. Two request scopes read twice. A write
 * inside one scope makes the next read in that scope real again.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { forgetReads, readOnce } from '../lib/data/readOnce';
import { withReadScope } from './setup/readScope';
import { memberProfileCore } from '../lib/member/profileCore';
import { memberTimezone } from '../lib/time/memberToday';
import { getMemberAssessmentFacts } from '../lib/assessment-registry/facts';
import { fetchHydrationFocus, isHydrationTracked } from '../lib/hydration/data';
import { getMemberRestrictedTopics } from '../lib/feed/data';
import { listRegistryEntriesForMember } from '../lib/registry/data';
import { listNarrativeItems } from '../lib/narrative/data';
import { getUnifiedAssessmentDefinitionByKey } from '../lib/assessment-foundation/repository';

const MEMBER = '11111111-1111-4111-8111-111111111111';

/** Everything the fake client was asked to read, in order. One entry per real round trip. */
let asked: string[] = [];

/**
 * A Supabase stand-in that answers every builder chain with an empty result
 * and records the table it was asked for. Deliberately dumb: what is being
 * tested is how many times it is called, never what it returns.
 */
function fakeClient() {
  const result = { data: null, error: null, count: 0 };
  const builder = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'in',
      'is',
      'neq',
      'gte',
      'lte',
      'order',
      'limit',
      'not',
    ]) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = async () => result;
    chain.single = async () => result;
    chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return {
    from(table: string) {
      asked.push(`table:${table}`);
      return builder();
    },
    async rpc(name: string) {
      asked.push(`rpc:${name}`);
      return { data: [], error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function countOf(target: string): number {
  return asked.filter((entry) => entry === target).length;
}

beforeEach(() => {
  asked = [];
});

describe('the read-once scope is a deduplicated read, not a cache', () => {
  it('two callers in one request share one round trip', async () => {
    let ran = 0;
    await withReadScope(async () => {
      const read = () => readOnce('thing', async () => ++ran);
      await Promise.all([read(), read(), read()]);
    });
    expect(ran).toBe(1);
  });

  it('two requests do not share anything at all', async () => {
    let ran = 0;
    const read = () => readOnce('thing', async () => ++ran);
    await withReadScope(async () => {
      await read();
      await read();
    });
    await withReadScope(async () => {
      await read();
      await read();
    });
    // Two requests, two reads. This is what makes "she cannot be shown
    // yesterday's truth after she acted today" structural rather than a
    // promise: nothing here survives the request that made it.
    expect(ran).toBe(2);
  });

  it('a write that forgets makes the next read in the same request real again', async () => {
    let ran = 0;
    await withReadScope(async () => {
      const read = () => readOnce('checkins:me:today', async () => ++ran);
      await read();
      await read();
      expect(ran).toBe(1);
      forgetReads('checkins:me');
      await read();
      expect(ran).toBe(2);
    });
  });

  it('forgetting is by prefix, so one write clears every variant of that fact', async () => {
    let ran = 0;
    await withReadScope(async () => {
      const a = () => readOnce('checkins:me:today', async () => ++ran);
      const b = () => readOnce('checkins:me:recent:30', async () => ++ran);
      await a();
      await b();
      expect(ran).toBe(2);
      forgetReads('checkins:me');
      await a();
      await b();
      expect(ran).toBe(4);
    });
  });

  it('a read that fails is not remembered as the answer', async () => {
    let attempts = 0;
    await withReadScope(async () => {
      const read = () =>
        readOnce('flaky', async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('network');
          return 'ok';
        });
      await expect(read()).rejects.toThrow('network');
      await expect(read()).resolves.toBe('ok');
    });
    expect(attempts).toBe(2);
  });

  it('a read is keyed by its own key, so two different facts are two reads', async () => {
    let ran = 0;
    await withReadScope(async () => {
      await readOnce('a', async () => ++ran);
      await readOnce('b', async () => ++ran);
    });
    expect(ran).toBe(2);
  });
});

describe('the facts Home reads more than once are read once', () => {
  it('her profile row: five askers, one round trip', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await Promise.all([
        memberProfileCore(supabase, MEMBER),
        memberProfileCore(supabase, MEMBER),
        memberTimezone(supabase, MEMBER),
        memberTimezone(supabase, MEMBER),
        memberProfileCore(supabase, MEMBER),
      ]);
    });
    expect(countOf('table:profiles')).toBe(1);
  });

  it('her profile row: a DIFFERENT member is a different read, never the first one reused', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    await withReadScope(async () => {
      const supabase = fakeClient();
      await memberProfileCore(supabase, MEMBER);
      await memberProfileCore(supabase, other);
    });
    expect(countOf('table:profiles')).toBe(2);
  });

  it('her plan and her assignments: seven askers, six round trips between them', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await Promise.all(
        Array.from({ length: 7 }, () => getMemberAssessmentFacts(supabase, MEMBER))
      );
    });
    // The six tables getMemberAssessmentFacts reads in one batch, once.
    // Seven independent calls used to be forty-two round trips.
    expect(countOf('table:profiles')).toBe(1);
    expect(countOf('table:member_subscriptions')).toBe(1);
    expect(countOf('table:program_enrollments')).toBe(1);
    expect(countOf('table:assessment_status_by_member')).toBe(1);
    expect(countOf('table:assessment_assignments')).toBe(1);
    expect(countOf('table:reassessment_schedules')).toBe(1);
    expect(asked.length).toBe(6);
  });

  it('her water answer: nine askers, one round trip', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await Promise.all([
        fetchHydrationFocus(supabase, MEMBER),
        fetchHydrationFocus(supabase, MEMBER),
        isHydrationTracked(supabase, MEMBER),
        isHydrationTracked(supabase, MEMBER),
        isHydrationTracked(supabase, MEMBER),
        isHydrationTracked(supabase, MEMBER),
        isHydrationTracked(supabase, MEMBER),
        isHydrationTracked(supabase, MEMBER),
        isHydrationTracked(supabase, MEMBER),
      ]);
    });
    expect(countOf('table:profiles')).toBe(1);
  });

  it('her restricted topics: seven askers, one round trip', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await Promise.all(
        Array.from({ length: 7 }, () => getMemberRestrictedTopics(supabase, MEMBER))
      );
    });
    expect(countOf('rpc:get_member_restricted_topics')).toBe(1);
  });

  it('her registry and her narrative: many askers, one round trip each', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await Promise.all([
        ...Array.from({ length: 8 }, () =>
          listRegistryEntriesForMember(supabase, MEMBER, { statusFilter: ['active'] })
        ),
        ...Array.from({ length: 6 }, () =>
          listNarrativeItems(supabase, MEMBER, { statusFilter: ['active'] })
        ),
      ]);
    });
    expect(countOf('table:registry_entries')).toBe(1);
    expect(countOf('table:narrative_items')).toBe(1);
  });

  it('two different status filters are two different questions, and stay two reads', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await listRegistryEntriesForMember(supabase, MEMBER, { statusFilter: ['active'] });
      await listRegistryEntriesForMember(supabase, MEMBER, { statusFilter: ['superseded'] });
    });
    expect(countOf('table:registry_entries')).toBe(2);
  });

  it('a published assessment definition: eleven askers, one round trip per key', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await Promise.all([
        ...Array.from({ length: 4 }, () =>
          getUnifiedAssessmentDefinitionByKey(supabase, 'core-values-snapshot')
        ),
        ...Array.from({ length: 4 }, () =>
          getUnifiedAssessmentDefinitionByKey(supabase, 'life-signal-check')
        ),
        ...Array.from({ length: 3 }, () =>
          getUnifiedAssessmentDefinitionByKey(supabase, 'readiness-pulse')
        ),
      ]);
    });
    expect(countOf('table:unified_assessment_definitions')).toBe(3);
  });
});
