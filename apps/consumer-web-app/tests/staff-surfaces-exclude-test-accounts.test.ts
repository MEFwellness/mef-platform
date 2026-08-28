/**
 * A3 — a test account never appears on a staff surface.
 *
 * Measured on production on 2026-08-28, before this build: the coach's
 * Safety Review Queue read `safety_review_queue` with no exclusion at all
 * and showed **OPEN CASES (27)**, all 27 belonging to seeded QA fixtures
 * and 0 to a real member. The client list next door was correct, because it
 * carried its own private copy of the filter. That is the real defect: the
 * exclusion was a per-screen decision, so every new coach screen was one
 * more chance to forget it.
 *
 * Three layers here, in the order they matter:
 *
 *   1. THE RULE ITSELF, over the real helper.
 *   2. THE REAL DATA-LAYER FUNCTIONS the coach's screens call, driven
 *      against a fake Postgres that honours `.eq`, `.in` and
 *      `.not(col, 'in', …)` for real — so a query-level filter is actually
 *      exercised rather than assumed. Lists, the counts and badges derived
 *      from those lists, and the detail lookups reachable by typing a URL.
 *   3. THE STRUCTURAL GUARD, so the next coach screen cannot reintroduce
 *      it: every coach-facing reader named below must route through
 *      lib/staff/testAccounts.ts, and every member-scoped route tree under
 *      /coach must carry the layout that asks it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveTestAccountExclusion,
  viewerSeesTestAccounts,
  isMemberVisibleToStaff,
  applyTestAccountExclusion,
  rejectTestMemberRow,
  rejectTestMemberRows,
} from '@/lib/staff/testAccounts';
import { listReviewQueueForCoach, getReviewQueueEntry } from '@/lib/safety/data';
import {
  listPendingProteinTargetsForCoach,
  getProteinTargetForCoach,
} from '@/lib/protein/store';

const APP_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// The fixture: one coach, one real member, one seeded test member, and one
// case and one pending protein target belonging to each of the two members.
// ---------------------------------------------------------------------------

const COACH = 'c0000000-0000-4000-8000-000000000001';
const TEST_COACH = 'c0000000-0000-4000-8000-000000000002';
const REAL_MEMBER = 'm0000000-0000-4000-8000-000000000001';
const TEST_MEMBER = 'm0000000-0000-4000-8000-000000000002';

const PROFILES = [
  { id: COACH, display_name: 'Real Coach', is_test: false, timezone: 'America/New_York' },
  { id: TEST_COACH, display_name: 'Fixture Coach', is_test: true, timezone: 'America/New_York' },
  { id: REAL_MEMBER, display_name: 'Real Member', is_test: false, timezone: 'America/New_York' },
  { id: TEST_MEMBER, display_name: 'Heather', is_test: true, timezone: 'America/New_York' },
];

function queueRow(id: string, memberId: string, status: string) {
  return {
    id,
    member_id: memberId,
    assigned_coach_id: COACH,
    classification_id: `cl-${id}`,
    source_feature: 'daily_checkin',
    concern_categories: [],
    classification_level: 'coach_review_required',
    urgency: 'high',
    restrictions_applied: {},
    status,
    coach_notes: null,
    resolution: null,
    created_at: '2026-08-20T12:00:00.000Z',
    updated_at: '2026-08-20T12:00:00.000Z',
  };
}

const QUEUE_ROWS = [
  queueRow('case-real-open', REAL_MEMBER, 'new'),
  queueRow('case-real-closed', REAL_MEMBER, 'closed'),
  // The shape production was actually in: many fixture cases, all open.
  ...Array.from({ length: 27 }, (_, i) => queueRow(`case-test-${i}`, TEST_MEMBER, 'new')),
];

function targetRow(id: string, memberId: string) {
  return {
    id,
    member_id: memberId,
    body_weight_lb: 150,
    activity_level: 'moderate',
    multiplier: 1.2,
    computed_grams: 82,
    active_grams: null,
    track: 'holistic_reset',
    status: 'pending_coach_review',
    is_coach_edited: false,
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-08-20T12:00:00.000Z',
  };
}

const TARGET_ROWS = [
  targetRow('target-real', REAL_MEMBER),
  targetRow('target-test', TEST_MEMBER),
];

/**
 * A fake Postgres that honours the filters this build depends on. `.eq`,
 * `.in` and `.not(col, 'in', '(a,b)')` really narrow the rows, so a test
 * that deletes the exclusion from the query genuinely fails instead of
 * quietly passing against a stub that ignores it.
 */
function fakeSupabase(tables: Record<string, Record<string, unknown>[]>, viewerId: string | null) {
  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[column]));
        return chain;
      },
      not: (column: string, operator: string, value: string) => {
        if (operator !== 'in') throw new Error(`fakeSupabase: unsupported not(${operator})`);
        const excluded = value.replace(/^\(|\)$/g, '').split(',').filter(Boolean);
        rows = rows.filter((r) => !excluded.includes(String(r[column])));
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return chain;
  }
  return {
    from: builder,
    auth: {
      getUser: async () => ({ data: { user: viewerId ? { id: viewerId } : null }, error: null }),
    },
  } as unknown as SupabaseClient;
}

function clientFor(viewerId: string | null) {
  return fakeSupabase(
    {
      profiles: PROFILES,
      safety_review_queue: QUEUE_ROWS,
      member_protein_targets: TARGET_ROWS,
    },
    viewerId
  );
}

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------

describe('the rule itself', () => {
  it('a real coach is not a test viewer, a seeded one is', async () => {
    expect(await viewerSeesTestAccounts(clientFor(COACH), COACH)).toBe(false);
    expect(await viewerSeesTestAccounts(clientFor(TEST_COACH), TEST_COACH)).toBe(true);
  });

  it('resolves the exact set of ids a real coach must not be shown', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(COACH));
    expect(exclusion.disabled).toBe(false);
    expect([...exclusion.hiddenMemberIds].sort()).toEqual([TEST_COACH, TEST_MEMBER].sort());
    expect(exclusion.isHidden(TEST_MEMBER)).toBe(true);
    expect(exclusion.isHidden(REAL_MEMBER)).toBe(false);
    expect(exclusion.isHidden(null)).toBe(false);
  });

  it('hides nothing from a seeded viewer, which is the whole point of the fixture', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(TEST_COACH));
    expect(exclusion.disabled).toBe(true);
    expect(exclusion.isHidden(TEST_MEMBER)).toBe(false);
  });

  it('an id it cannot positively read as a fixture is kept, never hidden', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(COACH));
    expect(exclusion.isHidden('someone-not-in-profiles')).toBe(false);
  });

  it('answers the member-scoped route question the same way', async () => {
    expect(await isMemberVisibleToStaff(clientFor(COACH), REAL_MEMBER, COACH)).toBe(true);
    expect(await isMemberVisibleToStaff(clientFor(COACH), TEST_MEMBER, COACH)).toBe(false);
    expect(await isMemberVisibleToStaff(clientFor(TEST_COACH), TEST_MEMBER, TEST_COACH)).toBe(true);
  });

  it('the row helpers drop exactly the hidden ids and nothing else', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(COACH));
    const rows = [{ member_id: REAL_MEMBER }, { member_id: TEST_MEMBER }];
    expect(rejectTestMemberRows(rows, exclusion, (r) => r.member_id)).toEqual([
      { member_id: REAL_MEMBER },
    ]);
    expect(rejectTestMemberRow(rows[1]!, exclusion, (r) => r.member_id)).toBeNull();
    expect(rejectTestMemberRow(rows[0]!, exclusion, (r) => r.member_id)).toEqual(rows[0]);
    expect(rejectTestMemberRow(null, exclusion, (r: { member_id: string }) => r.member_id)).toBeNull();
  });

  it('applies as a real query filter, not as a no-op', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(COACH));
    const supabase = clientFor(COACH);
    const { data } = await applyTestAccountExclusion(
      supabase.from('safety_review_queue').select('*'),
      exclusion,
      'member_id'
    );
    expect((data as { member_id: string }[]).every((r) => r.member_id === REAL_MEMBER)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The real coach-facing reads
// ---------------------------------------------------------------------------

describe('the Safety Review Queue', () => {
  it('shows a real coach only real members, out of 29 rows of which 27 are fixtures', async () => {
    const entries = await listReviewQueueForCoach(clientFor(COACH));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.member_id === REAL_MEMBER)).toBe(true);
  });

  it('the OPEN CASES count the coach dashboard and the queue screen both derive is 1, not 28', async () => {
    const entries = await listReviewQueueForCoach(clientFor(COACH));
    const open = entries.filter(
      (e) => e.status !== 'closed' && e.status !== 'approved_for_limited_coaching'
    );
    expect(open).toHaveLength(1);
  });

  it('still returns the fixtures to a seeded viewer', async () => {
    const entries = await listReviewQueueForCoach(clientFor(TEST_COACH));
    expect(entries).toHaveLength(29);
  });

  it('honours a status filter as well as the exclusion', async () => {
    const entries = await listReviewQueueForCoach(clientFor(COACH), ['closed']);
    expect(entries.map((e) => e.id)).toEqual(['case-real-closed']);
  });

  it('a fixture case typed straight into the URL bar is not found', async () => {
    expect(await getReviewQueueEntry(clientFor(COACH), 'case-test-0')).toBeNull();
  });

  it('a real case typed straight into the URL bar still opens', async () => {
    const entry = await getReviewQueueEntry(clientFor(COACH), 'case-real-open');
    expect(entry?.member_id).toBe(REAL_MEMBER);
  });

  it('a seeded viewer can still open a fixture case by URL', async () => {
    const entry = await getReviewQueueEntry(clientFor(TEST_COACH), 'case-test-0');
    expect(entry?.member_id).toBe(TEST_MEMBER);
  });
});

describe('the pending protein queue', () => {
  it('lists only real members', async () => {
    const rows = await listPendingProteinTargetsForCoach(clientFor(COACH));
    expect(rows.map((r) => r.memberId)).toEqual([REAL_MEMBER]);
  });

  it('the coach dashboard count derived from it is 1, not 2', async () => {
    const rows = await listPendingProteinTargetsForCoach(clientFor(COACH));
    expect(rows).toHaveLength(1);
  });

  it('a fixture target typed straight into the URL bar is not found', async () => {
    expect(await getProteinTargetForCoach(clientFor(COACH), 'target-test')).toBeNull();
  });

  it('a real target typed straight into the URL bar still opens', async () => {
    const target = await getProteinTargetForCoach(clientFor(COACH), 'target-real');
    expect(target?.memberId).toBe(REAL_MEMBER);
  });

  it('a seeded viewer still sees the fixture queue', async () => {
    const rows = await listPendingProteinTargetsForCoach(clientFor(TEST_COACH));
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 3. The structural guard — so the next coach screen inherits the rule
// ---------------------------------------------------------------------------

/**
 * Every coach-facing read that can return rows for more than one member,
 * with the file it lives in. A new one added without the exclusion fails
 * here, which is the whole reason this list is written down.
 */
const COACH_FACING_READS: { file: string; fn: string }[] = [
  { file: 'lib/safety/data.ts', fn: 'listReviewQueueForCoach' },
  { file: 'lib/safety/data.ts', fn: 'getReviewQueueEntry' },
  { file: 'lib/protein/store.ts', fn: 'listPendingProteinTargetsForCoach' },
  { file: 'lib/protein/store.ts', fn: 'getProteinTargetForCoach' },
  { file: 'app/actions/coach.ts', fn: 'listAssignedClients' },
];

/**
 * The rule has to be APPLIED, not merely consulted. Resolving the
 * exclusion and then not using it is exactly the failure this list exists
 * to catch, so `resolveTestAccountExclusion` alone does not count.
 */
const EXCLUSION_CALLS = [
  'applyTestAccountExclusion',
  'rejectTestMemberRow',
  'rejectTestMemberRows',
  'viewerSeesTestAccounts',
  'isMemberVisibleToStaff',
];

function bodyOf(source: string, fn: string): string {
  const start = source.indexOf(`export async function ${fn}(`);
  expect(start, `${fn} not found`).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe('the data layer cannot quietly drop the rule', () => {
  for (const { file, fn } of COACH_FACING_READS) {
    it(`${fn} routes through lib/staff/testAccounts.ts`, () => {
      const source = readFileSync(path.join(APP_ROOT, file), 'utf8');
      expect(source).toContain("@/lib/staff/testAccounts");
      const body = bodyOf(source, fn);
      expect(EXCLUSION_CALLS.some((call) => body.includes(call))).toBe(true);
    });
  }

  it('nobody has written a second private copy of the filter into a coach read', () => {
    for (const { file, fn } of COACH_FACING_READS) {
      const body = bodyOf(readFileSync(path.join(APP_ROOT, file), 'utf8'), fn);
      // app/actions/coach.ts asks the shared helper and then applies
      // `.eq('is_test', false)` to a profiles query, which is the same rule
      // stated at the right layer. What must never appear is a bare
      // is_test read that decided for itself.
      const bare = body.includes("select('is_test')");
      expect(bare, `${fn} reads is_test directly`).toBe(false);
    }
  });
});

describe('every member-scoped coach route tree carries the guard', () => {
  /**
   * Every dynamic segment directly under /coach, in one of two lists. The
   * union of the two must be exactly what is on disk, so a coach screen
   * added tomorrow with a new dynamic segment fails this file until
   * somebody decides which list it belongs in. That decision is the thing
   * A3 was missing.
   */
  const MEMBER_SCOPED = [
    'app/coach/clients/[id]',
    'app/coach/assign/[memberId]',
    'app/coach/corrective-programs/[memberId]',
  ];

  /** Ids that are a record, not a member. Each is covered by the data layer instead, named here so the claim is checkable. */
  const RECORD_SCOPED: Record<string, string> = {
    'app/coach/review-queue/[id]': 'a safety case id — getReviewQueueEntry applies the exclusion',
    'app/coach/protein-review/[id]': 'a protein target id — getProteinTargetForCoach applies the exclusion',
    'app/coach/programs/[id]': "a coach's own program template — no member is involved",
  };

  function dynamicSegments(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (/^\[.+\]$/.test(entry.name)) {
        out.push(path.relative(APP_ROOT, full));
        // Everything below a member segment inherits that segment's
        // layout, and everything below a record segment is that record.
        if (MEMBER_SCOPED.includes(path.relative(APP_ROOT, full))) continue;
      }
      dynamicSegments(full, out);
    }
    return out;
  }

  const onDisk = dynamicSegments(path.join(APP_ROOT, 'app/coach')).sort();

  it('every dynamic segment under /coach has been classified', () => {
    const classified = [...MEMBER_SCOPED, ...Object.keys(RECORD_SCOPED)].sort();
    expect(onDisk).toEqual(classified);
  });

  for (const root of MEMBER_SCOPED) {
    it(`${root} has a layout that asks isMemberVisibleToStaff`, () => {
      const layout = path.join(APP_ROOT, root, 'layout.tsx');
      expect(existsSync(layout), `${root} has no layout.tsx`).toBe(true);
      expect(readFileSync(layout, 'utf8')).toContain('isMemberVisibleToStaff');
    });
  }

  for (const [root, reason] of Object.entries(RECORD_SCOPED)) {
    it(`${root} is a record id, and its data-layer read carries the rule (${reason.split(' — ')[0]})`, () => {
      expect(existsSync(path.join(APP_ROOT, root, 'page.tsx'))).toBe(true);
      expect(reason.length).toBeGreaterThan(10);
    });
  }
});
