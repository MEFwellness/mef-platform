/**
 * A FLAGGED MEMBER A COACH WAS DELIBERATELY PAIRED WITH IS THAT COACH'S
 * CLIENT (2026-08-29).
 *
 * Measured on production before this build: `8weeks2fab@gmail.com` carries
 * `profiles.is_test = true` (migration 187) and has an ACTIVE row in
 * `coach_client_assignments` naming `oakomah66@gmail.com` as her coach.
 * The pairing was fine. What was wrong is that the coach platform read the
 * flag as "hide completely", so that assignment produced a client who did
 * not appear in the caseload, whose every screen 404'd through the
 * member-scoped layouts, and who could not be assigned a program, reviewed
 * or messaged. The one pairing that exists so a coach can experience both
 * sides of the product was the one pairing the product hid.
 *
 * The rule now has a second exception, stated once in
 * lib/staff/testAccounts.ts: a member with an ACTIVE assignment to this
 * viewer is never hidden from this viewer. Scoped to the viewer's own
 * caseload, which is what keeps the 27 seeded safety cases that motivated
 * the exclusion out of a real coach's queue: they belong to members
 * assigned to a different, seeded coach.
 *
 * Four things are proved here, because any one of them alone would let the
 * bug back:
 *
 *   1. THE RULE, against a fake Postgres that honours the filters.
 *   2. THE PAIRING, through the real member-scoped route guard.
 *   3. THE LABEL, by rendering the real panels and reading the HTML.
 *   4. THE ANALYTICS BOUNDARY IS UNTOUCHED: the analytics path never
 *      reads this file, and the coach path never reaches an analytics RPC.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveTestAccountExclusion,
  isMemberVisibleToStaff,
  activelyAssignedMemberIds,
} from '@/lib/staff/testAccounts';
import { ClientListPanel, type ClientListEntry } from '@/app/coach/ClientListPanel';
import { MemberPickerPanel } from '@/components/coach/MemberPickerPanel';
import { TestAccountChip } from '@/components/staff/TestAccountChip';

const APP_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// The production shape, in miniature. One real coach with two clients, one
// of whom is flagged. One seeded coach with a flagged client of her own,
// who the real coach must still never see.
// ---------------------------------------------------------------------------

const REAL_COACH = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_COACH = 'c0000000-0000-4000-8000-000000000002';
const REAL_MEMBER = 'm0000000-0000-4000-8000-000000000001';
/** The paired fixture. `8weeks2fab@gmail.com` in production. */
const PAIRED_TEST_MEMBER = 'm0000000-0000-4000-8000-000000000002';
/** A fixture belonging to somebody else's caseload. */
const OTHER_TEST_MEMBER = 'm0000000-0000-4000-8000-000000000003';

const PROFILES = [
  { id: REAL_COACH, display_name: 'Osei', is_test: false },
  { id: SEEDED_COACH, display_name: 'Fixture Coach', is_test: true },
  { id: REAL_MEMBER, display_name: 'Real Member', is_test: false },
  { id: PAIRED_TEST_MEMBER, display_name: 'Ebony', is_test: true },
  { id: OTHER_TEST_MEMBER, display_name: 'Heather', is_test: true },
];

const ASSIGNMENTS = [
  { coach_id: REAL_COACH, client_id: REAL_MEMBER, status: 'active' },
  { coach_id: REAL_COACH, client_id: PAIRED_TEST_MEMBER, status: 'active' },
  { coach_id: SEEDED_COACH, client_id: OTHER_TEST_MEMBER, status: 'active' },
  // A revoked pairing is not a pairing. This one must not un-hide anybody.
  { coach_id: REAL_COACH, client_id: OTHER_TEST_MEMBER, status: 'revoked' },
];

/** Honours `.eq` and `.in` for real, so a filter that is deleted genuinely fails. */
function fakeSupabase(
  tables: Record<string, Record<string, unknown>[]>,
  viewerId: string | null,
  failing: string[] = []
) {
  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const failed = failing.includes(table);
    const result = () =>
      failed
        ? { data: null, error: { message: `${table} unreadable` } }
        : { data: rows, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[column]));
        return chain;
      },
      not: (column: string, operator: string, value: string) => {
        if (operator !== 'in') throw new Error(`unsupported not(${operator})`);
        const excluded = value.replace(/^\(|\)$/g, '').split(',').filter(Boolean);
        rows = rows.filter((r) => !excluded.includes(String(r[column])));
        return chain;
      },
      maybeSingle: () =>
        Promise.resolve(
          failed ? { data: null, error: { message: 'unreadable' } } : { data: rows[0] ?? null, error: null }
        ),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => Promise.resolve(result()).then(resolve),
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

function clientFor(viewerId: string | null, failing: string[] = []) {
  return fakeSupabase(
    { profiles: PROFILES, coach_client_assignments: ASSIGNMENTS },
    viewerId,
    failing
  );
}

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------

describe('the rule now has a second exception, and only for the viewer own caseload', () => {
  it('reads the active pairings, and only the active ones', async () => {
    const ids = await activelyAssignedMemberIds(clientFor(REAL_COACH), REAL_COACH);
    expect([...ids].sort()).toEqual([REAL_MEMBER, PAIRED_TEST_MEMBER].sort());
    expect(ids.has(OTHER_TEST_MEMBER)).toBe(false);
  });

  it('a flagged member this coach is assigned to is NOT in the hidden set', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(REAL_COACH), REAL_COACH);
    expect(exclusion.isHidden(PAIRED_TEST_MEMBER)).toBe(false);
    expect(exclusion.hiddenMemberIds).not.toContain(PAIRED_TEST_MEMBER);
  });

  it('a flagged member on somebody else caseload is still hidden, which is what keeps the seeded cases out', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(REAL_COACH), REAL_COACH);
    expect(exclusion.isHidden(OTHER_TEST_MEMBER)).toBe(true);
    expect(exclusion.isHidden(SEEDED_COACH)).toBe(true);
  });

  it('a real member is never hidden, before or after this change', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(REAL_COACH), REAL_COACH);
    expect(exclusion.isHidden(REAL_MEMBER)).toBe(false);
  });

  it('an unreadable assignment list falls back to hiding every fixture rather than showing every fixture', async () => {
    const exclusion = await resolveTestAccountExclusion(
      clientFor(REAL_COACH, ['coach_client_assignments']),
      REAL_COACH
    );
    expect(exclusion.isHidden(PAIRED_TEST_MEMBER)).toBe(true);
  });

  it('the seeded coach still sees everything, which is exception one, unchanged', async () => {
    const exclusion = await resolveTestAccountExclusion(clientFor(SEEDED_COACH), SEEDED_COACH);
    expect(exclusion.disabled).toBe(true);
    expect(exclusion.isHidden(OTHER_TEST_MEMBER)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. The pairing, through the guard every member-scoped coach route runs
// ---------------------------------------------------------------------------

describe('the member-scoped coach route trees open for a paired fixture', () => {
  it('the paired fixture is visible to her own coach, so /coach/clients, /coach/assign and /coach/corrective-programs all open', async () => {
    expect(await isMemberVisibleToStaff(clientFor(REAL_COACH), PAIRED_TEST_MEMBER, REAL_COACH)).toBe(
      true
    );
  });

  it('a fixture on another caseload is still a plain not found for this coach', async () => {
    expect(await isMemberVisibleToStaff(clientFor(REAL_COACH), OTHER_TEST_MEMBER, REAL_COACH)).toBe(
      false
    );
  });

  it('a real member is unaffected', async () => {
    expect(await isMemberVisibleToStaff(clientFor(REAL_COACH), REAL_MEMBER, REAL_COACH)).toBe(true);
  });

  it('all three member-scoped layouts run the guard that now says yes', () => {
    for (const root of [
      'app/coach/clients/[id]',
      'app/coach/assign/[memberId]',
      'app/coach/corrective-programs/[memberId]',
    ]) {
      const layout = readFileSync(path.join(APP_ROOT, root, 'layout.tsx'), 'utf8');
      expect(layout).toContain('isMemberVisibleToStaff');
    }
  });

  it('the caseload read no longer carries a private filter of its own', () => {
    const source = readFileSync(path.join(APP_ROOT, 'app/actions/coach.ts'), 'utf8');
    expect(source).toContain('resolveTestAccountExclusion');
    expect(source).not.toMatch(/eq\('is_test', false\)/);
  });
});

// ---------------------------------------------------------------------------
// 3. The label, rendered
// ---------------------------------------------------------------------------

const ENTRY = (over: Partial<ClientListEntry>): ClientListEntry => ({
  id: REAL_MEMBER,
  name: 'Real Member',
  score: 72,
  status: 'good',
  trend: 'stable',
  lastCheckinDate: '2026-08-28',
  hasCheckedInToday: false,
  attentionReasons: [],
  isTest: false,
  ...over,
});

describe('a flagged client that IS shown is never mistaken for a member', () => {
  it('the chip says the same two words the admin screens say', () => {
    expect(renderToStaticMarkup(<TestAccountChip />)).toContain('Test account');
  });

  it('the coach caseload cards label the flagged client and leave the real one alone', () => {
    const html = renderToStaticMarkup(
      <ClientListPanel
        clients={[
          ENTRY({}),
          ENTRY({ id: PAIRED_TEST_MEMBER, name: 'Ebony', isTest: true }),
        ]}
      />
    );
    expect(html).toContain('Ebony');
    expect(html).toContain('Real Member');
    expect(html.match(/Test account/g) ?? []).toHaveLength(1);
  });

  it('the assign and corrective-program pickers label her too', () => {
    const html = renderToStaticMarkup(
      <MemberPickerPanel
        basePath="/coach/assign"
        clients={[
          { id: REAL_MEMBER, name: 'Real Member', isTest: false },
          { id: PAIRED_TEST_MEMBER, name: 'Ebony', isTest: true },
        ]}
      />
    );
    expect(html).toContain('Ebony');
    expect(html.match(/Test account/g) ?? []).toHaveLength(1);
  });

  it('no em dash reached any of it', () => {
    const html =
      renderToStaticMarkup(<ClientListPanel clients={[ENTRY({ isTest: true })]} />) +
      renderToStaticMarkup(
        <MemberPickerPanel basePath="/coach/assign" clients={[{ id: REAL_MEMBER, name: 'A', isTest: true }]} />
      );
    expect(html).not.toContain('—');
  });

  /**
   * Every coach-facing screen that prints a member's name, with the thing
   * in its source that puts the label beside it. A new one added without a
   * label fails here, which is why the list is written down rather than
   * assumed.
   */
  const LABELLED_COACH_SCREENS: [string, string][] = [
    ['app/coach/page.tsx', 'TestAccountChip'],
    ['app/coach/ClientListPanel.tsx', 'TestAccountChip'],
    ['components/coach/MemberPickerPanel.tsx', 'TestAccountChip'],
    ['app/coach/clients/[id]/page.tsx', 'TestAccountChip'],
    ['app/coach/clients/[id]/detail/page.tsx', 'TestAccountChip'],
    ['app/coach/clients/[id]/entries/page.tsx', 'TestAccountChip'],
    ['app/coach/assign/[memberId]/page.tsx', 'MemberTestAccountChip'],
    ['app/coach/corrective-programs/[memberId]/page.tsx', 'MemberTestAccountChip'],
    ['app/coach/review-queue/page.tsx', 'TestAccountChip'],
    ['app/coach/review-queue/[id]/page.tsx', 'TestAccountChip'],
    ['app/coach/protein-review/page.tsx', 'TestAccountChip'],
    ['app/coach/protein-review/[id]/page.tsx', 'TestAccountChip'],
  ];

  for (const [file, marker] of LABELLED_COACH_SCREENS) {
    it(`${file} labels a flagged member`, () => {
      expect(readFileSync(path.join(APP_ROOT, file), 'utf8')).toContain(marker);
    });
  }

  it('there is one chip, not one per screen', () => {
    const chip = readFileSync(
      path.join(APP_ROOT, 'components/staff/TestAccountChip.tsx'),
      'utf8'
    );
    expect(chip).toContain('Test account');
    // The admin screen that grew the label first imports it now rather
    // than keeping a second copy.
    const admin = readFileSync(path.join(APP_ROOT, 'app/admin/AdminPanel.tsx'), 'utf8');
    expect(admin).toContain("@/components/staff/TestAccountChip");
    expect(admin).not.toContain('function TestAccountChip(');
  });
});

// ---------------------------------------------------------------------------
// 4. Analytics is untouched
// ---------------------------------------------------------------------------

describe('nothing here can leak a fixture into an analytics number', () => {
  /**
   * The two paths never meet. Analytics excludes by passing
   * `p_include_test` to its own RPCs, which read `profiles.is_test`
   * directly in SQL. The coach path excludes in TypeScript through
   * lib/staff/testAccounts.ts. Changing the second cannot change the
   * first, and this checks that the separation still holds rather than
   * assuming it.
   */
  const ANALYTICS_FILES = [
    'lib/analytics-service/detections.ts',
    'lib/analytics-service/reports.ts',
    'lib/analytics-service/comparison.ts',
    'lib/analytics-service/timeline.ts',
    'lib/analytics-service/friction.ts',
  ];

  for (const file of ANALYTICS_FILES) {
    it(`${file} never reads the coach-side rule`, () => {
      const source = readFileSync(path.join(APP_ROOT, file), 'utf8');
      expect(source).not.toContain('lib/staff/testAccounts');
      expect(source).not.toContain('activelyAssignedMemberIds');
    });
  }

  it('the analytics service still defaults to excluding test accounts', () => {
    for (const file of ANALYTICS_FILES) {
      const source = readFileSync(path.join(APP_ROOT, file), 'utf8');
      if (!source.includes('p_include_test')) continue;
      // Every call site opts IN explicitly. There is no `p_include_test:
      // true` that is not read off a caller-supplied option.
      const forced = source.match(/p_include_test:\s*true\b/g) ?? [];
      expect(forced, `${file} hardcodes p_include_test: true`).toHaveLength(0);
    }
  });

  it('an assignment cannot widen an analytics scope, because the RPC never sees one', () => {
    const source = readFileSync(path.join(APP_ROOT, 'lib/staff/testAccounts.ts'), 'utf8');
    // It names the analytics parameter in a comment, to say it never
    // touches it. What must not appear is a CALL: no RPC, no argument.
    expect(source).not.toContain('.rpc(');
    expect(source).not.toContain('p_include_test:');
  });
});
