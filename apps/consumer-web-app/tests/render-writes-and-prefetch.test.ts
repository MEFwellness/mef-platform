/**
 * HOME FOLLOW-UP (2026-08-28): the render stopped writing, and Home stopped
 * asking the server for screens nobody tapped.
 *
 * TWO CLAIMS, HELD SEPARATELY.
 *
 * 1. A RENDER ONLY READS. `readLongitudinalSignals` is what a screen calls,
 *    and it must make zero writes. Before this build, opening Home ran
 *    `computeLongitudinalSignals`, which upserted fourteen
 *    `member_pattern_states` rows every single time, and did it from inside
 *    a server component. That is the standing rule's exact prohibition, and
 *    it had a second cost besides: those states count a state surviving
 *    from one recompute run to the next as evidence a pattern is real, so
 *    counting every open of Home as a run let three visits in a morning
 *    promote one of her metrics a tier.
 *
 *    The tests here count WRITES against a fake client, not results, for the
 *    same reason the speed build's tests count reads: "the same signals come
 *    back" was already true and is not the claim.
 *
 * 2. THE ANSWER DID NOT CHANGE. The reading path and the writing path share
 *    one classifier, so for the same stored rows they return identical
 *    signals. A test drives both against the same fixture and compares.
 *
 * 3. THE EXPENSIVE LINKS NO LONGER PREFETCH ON VIEW. Next prefetches a
 *    `<Link>` when it scrolls into view; that is a server render request per
 *    link, and Home carries nineteen links. These are source-shape checks,
 *    because prefetching is a property of the markup rather than of a
 *    result: what is asserted is that the expensive destinations render
 *    through `QuietLink` and the cheap daily-tapped ones do not.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { withReadScope } from './setup/readScope';
import {
  readLongitudinalSignals,
  refreshLongitudinalSignals,
} from '../lib/longitudinal-intelligence/service';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MEMBER = '11111111-1111-4111-8111-111111111111';

/** Every write the fake client was asked to make, as `verb:table`. */
let writes: string[] = [];
/** Every read, as `table:name`, so a "writes nothing" test cannot pass by doing nothing at all. */
let reads: string[] = [];

/**
 * A Supabase stand-in that records reads and writes separately. It answers
 * `member_pattern_states` with a real prior row so the classifier has
 * something to classify against, and everything else with nothing.
 */
function fakeClient(patternRows: unknown[] = []) {
  const builder = (table: string): Record<string, unknown> => {
    const rowsFor = table === 'member_pattern_states' ? patternRows : [];
    const result = { data: rowsFor, error: null, count: rowsFor.length };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'neq', 'gte', 'lte', 'order', 'limit', 'not']) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = async () => ({ data: rowsFor[0] ?? null, error: null });
    chain.single = async () => ({ data: rowsFor[0] ?? null, error: null });
    chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return {
    from(table: string) {
      reads.push(`table:${table}`);
      return {
        ...builder(table),
        upsert: async () => {
          writes.push(`upsert:${table}`);
          return { error: null };
        },
        insert: () => {
          writes.push(`insert:${table}`);
          return { ...builder(table), select: () => builder(table) };
        },
        update: () => {
          writes.push(`update:${table}`);
          return builder(table);
        },
        delete: () => {
          writes.push(`delete:${table}`);
          return builder(table);
        },
      };
    },
    async rpc(name: string) {
      reads.push(`rpc:${name}`);
      return { data: [], error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** A stored state for one metric, in the row shape lib/longitudinal-intelligence/data.ts maps from. */
function storedPatternRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    member_id: MEMBER,
    signal_key: 'checkin_metric::energy',
    signal_kind: 'checkin_metric',
    signal_label: 'energy',
    state: 'improving',
    tier: 2,
    occurrence_count: 2,
    confidence: 0.7,
    first_observed_at: '2026-08-01',
    last_observed_at: '2026-08-20',
    evidence_summary: { area: 'energy' },
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  writes = [];
  reads = [];
});

describe('the reading path writes nothing', () => {
  it('readLongitudinalSignals makes zero writes of any kind', async () => {
    await withReadScope(() => readLongitudinalSignals(fakeClient(), MEMBER, '2026-08-28'));

    expect(writes).toEqual([]);
  });

  it('and is not passing vacuously: it really did read', async () => {
    await withReadScope(() => readLongitudinalSignals(fakeClient(), MEMBER, '2026-08-28'));

    expect(reads.length).toBeGreaterThan(0);
    expect(reads).toContain('table:member_pattern_states');
  });

  it('reads nothing into member_pattern_states even when a prior state exists to update', async () => {
    await withReadScope(() =>
      readLongitudinalSignals(fakeClient([storedPatternRow()]), MEMBER, '2026-08-28')
    );

    expect(writes.filter((w) => w.endsWith(':member_pattern_states'))).toEqual([]);
  });
});

describe('the writing path still writes, and is the only one that does', () => {
  it('refreshLongitudinalSignals upserts one row per signal', async () => {
    const signals = await withReadScope(() =>
      refreshLongitudinalSignals(fakeClient(), MEMBER, '2026-08-28')
    );

    const upserts = writes.filter((w) => w === 'upsert:member_pattern_states');
    expect(upserts.length).toBe(signals.length);
    expect(upserts.length).toBeGreaterThan(0);
  });

  it('writes nowhere except member_pattern_states', async () => {
    await withReadScope(() => refreshLongitudinalSignals(fakeClient(), MEMBER, '2026-08-28'));

    expect([...new Set(writes)]).toEqual(['upsert:member_pattern_states']);
  });
});

describe('the two paths give the same answer for the same stored data', () => {
  it('signals are identical, field for field, with a prior state on file', async () => {
    const rows = [storedPatternRow()];
    const fromRead = await withReadScope(() =>
      readLongitudinalSignals(fakeClient(rows), MEMBER, '2026-08-28')
    );
    const fromRefresh = await withReadScope(() =>
      refreshLongitudinalSignals(fakeClient(rows), MEMBER, '2026-08-28')
    );

    expect(fromRead).toEqual(fromRefresh);
    expect(fromRead.length).toBeGreaterThan(0);
  });

  it('and with no prior state on file', async () => {
    const fromRead = await withReadScope(() =>
      readLongitudinalSignals(fakeClient(), MEMBER, '2026-08-28')
    );
    const fromRefresh = await withReadScope(() =>
      refreshLongitudinalSignals(fakeClient(), MEMBER, '2026-08-28')
    );

    expect(fromRead).toEqual(fromRefresh);
  });
});

describe('no render calls the writing path', () => {
  const RENDER_CALLERS = [
    'app/actions/rootCoaching.ts',
    'app/actions/longitudinalIntelligence.ts',
  ];

  it.each(RENDER_CALLERS)('%s reads the signals and never refreshes them', (file) => {
    const source = read(file);

    expect(source).toContain('readLongitudinalSignals');
    expect(source).not.toContain('refreshLongitudinalSignals');
  });

  it('Home reaches the signals only through the coaching message, which reads', () => {
    const card = read('components/dashboard/CoachingMessageCard.tsx');

    expect(card).toContain('getMyCoachingMessage');
    expect(card).not.toContain('refreshLongitudinalSignals');
  });

  it('the old ambiguous name is gone, so no caller can pick the writing one by accident', () => {
    for (const file of [
      'lib/longitudinal-intelligence/service.ts',
      'app/actions/rootCoaching.ts',
      'app/actions/longitudinalIntelligence.ts',
      'app/api/cron/daily-coaching-scan/route.ts',
    ]) {
      expect(read(file)).not.toContain('computeLongitudinalSignals');
    }
  });
});

describe('the refresh happens where the data underneath it changes', () => {
  it('a completed check-in refreshes her pattern states', () => {
    const source = read('app/actions/checkin.ts');

    expect(source).toContain('refreshLongitudinalSignals');
    // Inside submitDailyCheckin, which is a real completion, and not inside
    // saveDailyCheckinDraft, which is an exit rather than a check-in.
    const submitStart = source.indexOf('export async function submitDailyCheckin');
    const draftStart = source.indexOf('export async function saveDailyCheckinDraft');
    const refreshAt = source.indexOf('refreshLongitudinalSignals(supabase');
    expect(submitStart).toBeGreaterThan(-1);
    expect(refreshAt).toBeGreaterThan(submitStart);
    expect(refreshAt).toBeLessThan(draftStart);
  });

  it('the nightly scan still refreshes them for everybody', () => {
    expect(read('app/api/cron/daily-coaching-scan/route.ts')).toContain('refreshLongitudinalSignals');
  });

  it('a check-in refresh can never fail her check-in', () => {
    const source = read('app/actions/checkin.ts');
    const at = source.indexOf('refreshLongitudinalSignals(supabase');
    const window = source.slice(at - 200, at + 200);

    expect(window).toContain('try {');
    expect(window).toContain('catch');
  });
});

describe("Home's expensive links no longer ask the server on the way past", () => {
  /**
   * Measured on production before this change, median of three, warm: the
   * Home tab's own destination costs 1.06s per prefetch against 0.29s to
   * 0.32s for every other tab in the bar. The bar is on every member screen,
   * so that one tab was the single most expensive prefetch in the app.
   */
  const QUIET: Array<[string, string]> = [
    ['components/dashboard/HomeHero.tsx', '/root-score'],
    ['components/AssignedProgramsCard.tsx', 'her program'],
    ['components/dashboard/NoticingTile.tsx', 'the carousel tiles'],
    ['components/dashboard/QuickActionsGrid.tsx', 'Case and Movement'],
    ['components/weekly-reflection/WeeklyReflectionEntry.tsx', '/weekly-reflection'],
    ['components/questionnaires/QuestionnairesHomeCard.tsx', '/questionnaires'],
    ['components/ComprehensiveAssessmentCard.tsx', '/profile/baseline'],
    ['components/MovementAssessmentCard.tsx', '/assessment'],
    ['components/wearables/ConnectWearableCard.tsx', '/connections'],
    ['components/MorningBriefCard.tsx', '/root-score again'],
  ];

  it.each(QUIET)('%s links quietly (%s)', (file) => {
    const source = read(file);

    expect(source).toContain('QuietLink');
    // The plain Link is what prefetches on view, so its absence is the check.
    expect(source).not.toMatch(/<Link[\s>]/);
    expect(source).not.toContain("import Link from 'next/link'");
  });

  it('QuietLink is the only thing that turns prefetch off, so there is one place this decision lives', () => {
    const source = read('components/nav/QuietLink.tsx');

    expect(source).toContain('prefetch={false}');
  });

  it('the Home tab in the bottom bar is quiet, and only the Home tab', () => {
    const source = read('components/BottomNav.tsx');

    expect(source).toMatch(/label: 'Home',\s*href: '\/dashboard',\s*Icon: Home,\s*quiet: true/);
    // The cheap, daily-tapped tabs keep their prefetch: that is what a
    // prefetch is for, and each of them costs about a third of Home's.
    for (const tab of ['/food-lens', '/progress', '/today']) {
      const line = source.split('\n').find((l) => l.includes(`href: '${tab}'`)) ?? '';
      expect(line).not.toContain('quiet');
    }
    expect(source).toContain("const MORNING_HREF = '/checkin'");
  });

  it('the day priority button still prefetches, because it is the one thing she is asked to tap', () => {
    const source = read('components/priority/PriorityCard.tsx');

    expect(source).toContain("from 'next/link'");
    expect(source).not.toContain('QuietLink');
  });
});
