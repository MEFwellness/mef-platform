/**
 * HOME SPEED BUILD (2026-08-28) — every deduplicated read names its writer.
 *
 * `lib/data/readOnce.ts` states one rule: a read wrapped there must be
 * forgotten by every write in this app that changes its answer. It is not a
 * style preference. This codebase already contains read-then-write-then-read
 * sequences inside a single request (`computeLongitudinalSignals` reads a
 * member's pattern states, reclassifies them against the prior row and
 * upserts the result; `getOrCreateTodaysFeed` reads today's feed and then
 * creates it), and a memoized read with no invalidation hands the second
 * read the answer from before the write. That exact failure, in the Data
 * Cache rather than here, is what lib/supabase/server.ts's own header
 * comment documents.
 *
 * So this file walks the real source and fails if a `readOnce` key exists
 * whose writer does not forget it. It also proves the mechanism end to end
 * against the real readers, by count.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { forgetReads, readOnce } from '../lib/data/readOnce';
import { withReadScope } from './setup/readScope';
import { fetchHydrationFocus, setHydrationFocus } from '../lib/hydration/data';
import { listMemberPatternStates, upsertMemberPatternState } from '../lib/longitudinal-intelligence/data';
import { listNarrativeItems, insertNarrativeItem } from '../lib/narrative/data';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');

const MEMBER = '11111111-1111-4111-8111-111111111111';

let asked: string[] = [];

function fakeClient() {
  // `data: []` rather than null, because two of the readers below map over
  // what they get back. What is being counted is the number of calls.
  const result = { data: [] as unknown[], error: null };
  const builder = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'not']) chain[m] = () => chain;
    chain.maybeSingle = async () => result;
    chain.single = async () => result;
    chain.then = (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return {
    from(table: string) {
      asked.push(`table:${table}`);
      return {
        ...builder(),
        upsert: async () => ({ error: null }),
        insert: () => ({ ...builder(), select: () => builder() }),
        update: () => builder(),
      };
    },
    async rpc(name: string) {
      asked.push(`rpc:${name}`);
      return { data: null, error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const countOf = (target: string) => asked.filter((e) => e === target).length;

beforeEach(() => {
  asked = [];
});

// ---------------------------------------------------------------------
// Every key has a writer that forgets it.
// ---------------------------------------------------------------------

/** Where each `readOnce` key prefix lives, and which file must forget it. */
const KEYS_AND_THEIR_WRITERS: { key: string; readIn: string; forgottenIn: string[] }[] = [
  { key: 'assessmentFacts:', readIn: 'lib/assessment-registry/facts.ts', forgottenIn: [
    'lib/assessment-registry/facts.ts',
    'lib/assessments/store.ts',
    'lib/primal-pattern/store.ts',
    'lib/assessment-runtime/data.ts',
    'app/actions/assessmentAssignments.ts',
    'app/actions/memberAccess.ts',
    'lib/reassessment-intelligence/data.ts',
  ] },
  { key: 'hydrationFocus:', readIn: 'lib/hydration/data.ts', forgottenIn: ['lib/hydration/data.ts'] },
  { key: 'restrictedTopics:', readIn: 'lib/feed/data.ts', forgottenIn: ['lib/safety/service.ts'] },
  { key: 'checkins:', readIn: 'app/actions/checkin.ts', forgottenIn: ['app/actions/checkin.ts'] },
  { key: 'patternStates:', readIn: 'lib/longitudinal-intelligence/data.ts', forgottenIn: ['lib/longitudinal-intelligence/data.ts'] },
  { key: 'registryEntries:', readIn: 'lib/registry/data.ts', forgottenIn: ['lib/registry/data.ts'] },
  { key: 'narrativeItems:', readIn: 'lib/narrative/data.ts', forgottenIn: ['lib/narrative/data.ts'] },
  { key: 'wellnessInsights:', readIn: 'lib/intelligence/data.ts', forgottenIn: ['lib/intelligence/data.ts'] },
];

describe('every memoized read names the write that clears it', () => {
  it.each(KEYS_AND_THEIR_WRITERS)('$key', ({ key, readIn, forgottenIn }) => {
    expect(read(readIn), `${key} is not read in ${readIn}`).toContain(key);
    for (const file of forgottenIn) {
      const source = read(file);
      expect(
        /forget(Reads|MemberAssessmentFacts|RestrictedTopics|RegistryEntries|NarrativeItems|WellnessInsights)\(/.test(
          source
        ),
        `${file} writes something ${key} answers for, and never forgets it`
      ).toBe(true);
    }
  });

  it('the completion of an assessment forgets her plan and her assignments in all three stores', () => {
    for (const store of [
      'lib/assessments/store.ts',
      'lib/primal-pattern/store.ts',
      'lib/assessment-runtime/data.ts',
    ]) {
      expect(read(store)).toContain('forgetMemberAssessmentFacts(');
    }
  });

  it('a completed check-in forgets every read of her check-in rows', () => {
    const checkin = read('app/actions/checkin.ts');
    expect(checkin).toContain("const CHECKIN_KEY_PREFIX = 'checkins:'");
    // The forget sits in insertCheckinRow, which is the single row writer
    // both the real submit and the exit-triggered draft save land in.
    const writer = checkin.slice(checkin.indexOf('async function insertCheckinRow'));
    expect(writer.slice(0, writer.indexOf('\n}\n'))).toContain(
      'forgetReads(`${CHECKIN_KEY_PREFIX}${memberId}`)'
    );
  });

  it('nothing memoizes the priority row itself, because claiming it re-reads it', () => {
    // buildPriorityView reads member_daily_priorities, claims today's row
    // when it is absent, and reads it back. That is precisely the sequence
    // a memoized read would break, so getDailyPriority stays a plain read.
    expect(read('lib/priority/data.ts')).not.toContain('readOnce');
    expect(read('lib/priority/view.ts')).not.toContain('readOnce');
  });
});

// ---------------------------------------------------------------------
// The mechanism, end to end, against the real readers.
// ---------------------------------------------------------------------

describe('a write inside one request makes the next read real again', () => {
  it('setting her water answer clears the read of it', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await fetchHydrationFocus(supabase, MEMBER);
      await fetchHydrationFocus(supabase, MEMBER);
      expect(countOf('table:profiles')).toBe(1);

      await setHydrationFocus(supabase, MEMBER, true, 'member_popup');
      await fetchHydrationFocus(supabase, MEMBER);
      expect(countOf('table:profiles')).toBe(2);
    });
  });

  it('recomputing a pattern state clears the read of it', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await listMemberPatternStates(supabase, MEMBER);
      await listMemberPatternStates(supabase, MEMBER);
      expect(countOf('table:member_pattern_states')).toBe(1);

      await upsertMemberPatternState(supabase, MEMBER, {
        signalKey: 'checkin_metric::sleep',
        signalKind: 'checkin_metric',
        signalLabel: 'Sleep',
        state: 'steady',
        tier: 1,
        occurrenceCount: 3,
        confidence: 0.5,
        firstObservedAt: '2026-08-01T00:00:00.000Z',
        lastObservedAt: '2026-08-28T00:00:00.000Z',
        evidenceSummary: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await listMemberPatternStates(supabase, MEMBER);
      expect(countOf('table:member_pattern_states')).toBe(3); // the read, the upsert, the re-read
    });
  });

  it('writing a narrative item clears the list of them', async () => {
    await withReadScope(async () => {
      const supabase = fakeClient();
      await listNarrativeItems(supabase, MEMBER, { statusFilter: ['active'] });
      await listNarrativeItems(supabase, MEMBER, { statusFilter: ['active'] });
      expect(countOf('table:narrative_items')).toBe(1);

      await insertNarrativeItem(supabase, MEMBER, 'system', null, {
        category: 'pattern',
        title: 'x',
        body: 'y',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      await listNarrativeItems(supabase, MEMBER, { statusFilter: ['active'] });
      expect(countOf('table:narrative_items')).toBe(3); // the read, the insert, the re-read
    });
  });

  it('and a plain forget of an unrelated prefix changes nothing', async () => {
    let ran = 0;
    await withReadScope(async () => {
      const r = () => readOnce('kept:me', async () => ++ran);
      await r();
      forgetReads('somethingElse:');
      await r();
    });
    expect(ran).toBe(1);
  });
});
