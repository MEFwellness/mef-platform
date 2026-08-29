/**
 * A FILTERED LIST SAYS SO (2026-08-29).
 *
 * Measured on production the day this was written: 19 accounts exist, 6
 * carry `profiles.is_test = true`, and the /admin Users list rendered 11
 * rows with no count, no toggle and no label. An administrator went
 * looking for an account he knew had signed up, did not find it, and had
 * nothing on the screen to tell him whether it had been filtered or had
 * never existed. Those are very different facts and the screen gave the
 * same picture for both.
 *
 * The exclusion itself was correct and is unchanged. What is new is that
 * both admin reads now return what they removed alongside what they kept,
 * and the screen prints it.
 *
 * Two halves, because either alone would let the bug back:
 *
 *   1. THE DATA LAYER, driven through the real listUsers and
 *      listAssignmentHistory against a fake Postgres, so the filter is
 *      actually exercised and the count is checked to agree with the rows.
 *   2. THE SCREEN, rendered for real, so a count that exists in the props
 *      and never reaches a member of staff's eyes still fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------------------------------------------------------------------
// The fake Postgres. It honours exactly the three shapes these two
// functions issue, and it records errors per table so the failure paths
// are testable rather than assumed.
// ---------------------------------------------------------------------

const COACH = 'c0000000-0000-4000-8000-000000000001';
const REAL_ONE = 'm0000000-0000-4000-8000-000000000001';
const REAL_TWO = 'm0000000-0000-4000-8000-000000000002';
const FIXTURE_A = 'f0000000-0000-4000-8000-000000000001';
const FIXTURE_B = 'f0000000-0000-4000-8000-000000000002';

type ProfileRow = { id: string; display_name: string | null; is_test: boolean; timezone: string; created_at: string };

const PROFILES: ProfileRow[] = [
  { id: COACH, display_name: 'Real Coach', is_test: false, timezone: 'America/New_York', created_at: '2026-01-01T00:00:00Z' },
  { id: REAL_ONE, display_name: 'Priscilla', is_test: false, timezone: 'America/New_York', created_at: '2026-02-01T00:00:00Z' },
  { id: REAL_TWO, display_name: 'Frank', is_test: false, timezone: 'America/Chicago', created_at: '2026-03-01T00:00:00Z' },
  { id: FIXTURE_A, display_name: 'Heather', is_test: true, timezone: 'America/New_York', created_at: '2026-04-01T00:00:00Z' },
  { id: FIXTURE_B, display_name: 'Ebony', is_test: true, timezone: 'America/New_York', created_at: '2026-05-01T00:00:00Z' },
];

const ASSIGNMENTS = [
  { id: 'a1', coach_id: COACH, client_id: REAL_ONE, status: 'active', created_at: '2026-06-01T00:00:00Z' },
  { id: 'a2', coach_id: COACH, client_id: REAL_TWO, status: 'active', created_at: '2026-06-02T00:00:00Z' },
  { id: 'a3', coach_id: COACH, client_id: FIXTURE_A, status: 'active', created_at: '2026-06-03T00:00:00Z' },
  { id: 'a4', coach_id: COACH, client_id: FIXTURE_B, status: 'revoked', created_at: '2026-06-04T00:00:00Z' },
];

const errors: { profiles: string | null; assignments: string | null } = { profiles: null, assignments: null };

function builder(table: string) {
  let rows: Record<string, unknown>[] =
    table === 'profiles' ? [...PROFILES] : [...ASSIGNMENTS];
  const api = {
    select() {
      return api;
    },
    order() {
      return api;
    },
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return api;
    },
    then(resolve: (r: { data: unknown; error: unknown }) => unknown) {
      const failure = table === 'profiles' ? errors.profiles : errors.assignments;
      if (failure) return resolve({ data: null, error: { message: failure } });
      return resolve({ data: rows, error: null });
    },
  };
  return api;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}));

// AdminPanel is a client component and calls useRouter for its own
// refresh after a role change. Nothing under test here touches it.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { listUsers, listAssignmentHistory } = await import('@/app/actions/admin');

beforeEach(() => {
  errors.profiles = null;
  errors.assignments = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------
// 1. The data layer
// ---------------------------------------------------------------------

describe('listUsers reports what it hid', () => {
  it('hides fixtures by default and says how many it hid', async () => {
    const { users, hiddenTestCount } = await listUsers();
    expect(users.map((u) => u.id)).toEqual([COACH, REAL_ONE, REAL_TWO]);
    expect(hiddenTestCount).toBe(2);
  });

  it('the rows shown and the rows hidden always add up to every account', async () => {
    const hidden = await listUsers();
    const everything = await listUsers(true);
    expect(hidden.users.length + hidden.hiddenTestCount).toBe(everything.users.length);
  });

  it('shows fixtures when asked, and then has nothing left to hide', async () => {
    const { users, hiddenTestCount } = await listUsers(true);
    expect(users.map((u) => u.id)).toContain(FIXTURE_B);
    expect(users).toHaveLength(PROFILES.length);
    expect(hiddenTestCount).toBe(0);
  });

  it('carries is_test through, so the screen can label a fixture rather than pass it off as a member', async () => {
    const { users } = await listUsers(true);
    expect(users.find((u) => u.id === FIXTURE_B)!.is_test).toBe(true);
    expect(users.find((u) => u.id === REAL_ONE)!.is_test).toBe(false);
  });

  it('never claims to have hidden somebody when the read itself failed', async () => {
    errors.profiles = 'permission denied';
    const { users, hiddenTestCount } = await listUsers();
    expect(users).toEqual([]);
    // An empty list with a hidden count would read as "everyone is a test
    // account", which is a different and worse lie than "nothing loaded".
    expect(hiddenTestCount).toBe(0);
  });
});

describe('listAssignmentHistory reports what it hid', () => {
  it('drops a pairing whose client is a fixture, and counts it', async () => {
    const { assignments, hiddenTestCount } = await listAssignmentHistory();
    expect(assignments.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(hiddenTestCount).toBe(2);
  });

  it('keeps every pairing when asked', async () => {
    const { assignments, hiddenTestCount } = await listAssignmentHistory(true);
    expect(assignments).toHaveLength(ASSIGNMENTS.length);
    expect(hiddenTestCount).toBe(0);
  });

  it('fails towards showing: an unreadable profile list hides nobody', async () => {
    errors.profiles = 'permission denied';
    const { assignments, hiddenTestCount } = await listAssignmentHistory();
    expect(assignments).toHaveLength(ASSIGNMENTS.length);
    expect(hiddenTestCount).toBe(0);
  });

  it('an unreadable assignment table returns nothing and hides nothing', async () => {
    errors.assignments = 'permission denied';
    const { assignments, hiddenTestCount } = await listAssignmentHistory();
    expect(assignments).toEqual([]);
    expect(hiddenTestCount).toBe(0);
  });
});

// ---------------------------------------------------------------------
// 2. The screen
// ---------------------------------------------------------------------

const { AdminPanel } = await import('@/app/admin/AdminPanel');

function render(props: Partial<Parameters<typeof AdminPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    <AdminPanel
      users={PROFILES.slice(0, 3) as never}
      hiddenUserCount={2}
      coachIds={[COACH]}
      assignments={ASSIGNMENTS.slice(0, 2) as never}
      hiddenAssignmentCount={2}
      includeTest={false}
      {...props}
    />
  );
}

describe('the Users list on /admin names what it hid', () => {
  it('prints how many accounts are shown and how many were hidden', () => {
    const html = render();
    expect(html).toContain('3 accounts shown.');
    expect(html).toContain('2 test accounts hidden.');
  });

  it('says so plainly when nothing was hidden, rather than staying silent', () => {
    const html = render({ hiddenUserCount: 0 });
    expect(html).toContain('No test accounts hidden.');
  });

  it('counts one hidden account in the singular', () => {
    expect(render({ hiddenUserCount: 1 })).toContain('1 test account hidden.');
  });

  it('offers the way to look, pointing at the same query string /admin/access uses', () => {
    expect(render()).toContain('/admin?includeTest=1');
    expect(render()).toContain('Show test accounts');
  });

  it('offers the way back once fixtures are shown', () => {
    const html = render({ includeTest: true });
    expect(html).toContain('Hide test accounts');
    expect(html).toMatch(/href="\/admin"/);
  });

  it('labels a fixture in the list so it is never mistaken for a member', () => {
    const html = render({ users: PROFILES as never, hiddenUserCount: 0, includeTest: true });
    expect(html).toContain('Test account');
    expect(html).toContain('Ebony');
  });

  it('does not label a real member as a test account', () => {
    const html = render({ users: [PROFILES[1]] as never, hiddenUserCount: 0 });
    expect(html).toContain('Priscilla');
    expect(html).not.toContain('Test account');
  });
});

describe('assignment history names what it hid too', () => {
  it('prints the hidden pairing count', () => {
    expect(render()).toContain('2 pairings involving a test account hidden.');
  });

  it('says so when none were hidden', () => {
    expect(render({ hiddenAssignmentCount: 0 })).toContain('No test pairings hidden.');
  });
});

/**
 * The regression this whole file exists for. Whatever else changes on the
 * screen, a non-zero hidden count must appear in the rendered HTML as a
 * number a person can read. A count that lives only in the props is the
 * same silence that caused the report.
 */
describe('the guard: a hidden account is never silent', () => {
  it('every non-zero hidden count reaches the rendered page', () => {
    for (const hidden of [1, 2, 6, 17]) {
      const html = render({ hiddenUserCount: hidden, hiddenAssignmentCount: hidden });
      expect(html).toContain(`${hidden} test account`);
      expect(html).toContain(`${hidden} pairing`);
    }
  });
});
