/**
 * ONE RULE: A TEST ACCOUNT NEVER APPEARS ON A STAFF SURFACE (A3, Build 4,
 * 2026-08-28).
 *
 * The Safety Review Queue read `safety_review_queue` with no exclusion at
 * all, so a coach opening the single screen whose job is "who needs a
 * human, urgently" was shown 27 open cases, every one of them belonging to
 * a seeded QA fixture. A genuinely flagged member would have arrived as
 * case 28 in a list of 27 fakes. The coach's client list next door was
 * correct, because it carried its own copy of the filter; the pending
 * protein queue was not, because it carried none.
 *
 * The lesson is not "add the filter to the queue too". It is that the
 * exclusion was a per-screen decision at all. This file is the single
 * place the rule is stated, so a new coach screen inherits it instead of
 * having to remember it, and `staff-surfaces-exclude-test-accounts.test.ts`
 * fails the build if a coach-facing read is written without it.
 *
 * TWO DELIBERATE EXCEPTIONS, and only these two.
 *
 *   1. A viewer who is themself a seeded `is_test` account DOES still see
 *      test members. That pairing is the whole point of the production QA
 *      fixture, and hiding it would leave nothing to verify with.
 *
 *   2. A MEMBER THIS COACH IS ACTIVELY ASSIGNED TO is never hidden from
 *      that coach (2026-08-29). "Hide every fixture from every real coach"
 *      was too wide a rule: it also hid the one flagged member a real coach
 *      had deliberately been paired with, so the coach platform had a
 *      client who could not be opened, coached or reviewed, on an
 *      assignment somebody made on purpose. An active row in
 *      `coach_client_assignments` IS the decision that this person is this
 *      coach's client. The flag decides what analytics counts, not who a
 *      coach may work with, and analytics never reads this file: it passes
 *      `p_include_test` to its own RPCs and is untouched by any of this.
 *
 * The exception is scoped to the viewer's OWN caseload, which is why the
 * 27 seeded safety cases that motivated this file stay hidden: they belong
 * to members assigned to `test.coach@example.test`, not to a real coach.
 *
 * WHY IT EXCLUDES KNOWN TEST IDS RATHER THAN KEEPING KNOWN REAL ONES.
 * Only an id this file can positively read as `is_test = true` is dropped.
 * A profile row a staff read cannot see is kept, not hidden. On the safety
 * surface the two failure modes are not symmetrical: showing one fixture
 * case is untidy, and silently hiding one real flagged member is the
 * failure this whole layer exists to prevent. Fail towards showing.
 *
 * This is not the security boundary. RLS is (migrations 16 and 28): a
 * coach cannot read a member they are not assigned to, whatever this file
 * does. This decides what a coach is *shown* among the rows RLS already
 * allows.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type TestAccountExclusion = {
  /**
   * True when nothing should be hidden: the viewer is themself a seeded
   * test account, so the fixture pairing stays visible to them.
   */
  readonly disabled: boolean;
  /** Ids the viewer must not be shown. Empty when `disabled`. */
  readonly hiddenMemberIds: readonly string[];
  /** True only for an id positively read as `profiles.is_test = true`. */
  isHidden(memberId: string | null | undefined): boolean;
};

const ALLOW_EVERYTHING: TestAccountExclusion = {
  disabled: true,
  hiddenMemberIds: [],
  isHidden: () => false,
};

function exclusionOf(ids: string[]): TestAccountExclusion {
  if (ids.length === 0) return { disabled: false, hiddenMemberIds: [], isHidden: () => false };
  const set = new Set(ids);
  return {
    disabled: false,
    hiddenMemberIds: ids,
    isHidden: (memberId) => (memberId ? set.has(memberId) : false),
  };
}

/**
 * Whether this viewer is themself a seeded test account. Read once per
 * call site; there is no cache, for the same reason the coach's client
 * list has none — every read goes through Postgres and its policies.
 */
export async function viewerSeesTestAccounts(
  supabase: SupabaseClient,
  viewerId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_test')
    .eq('id', viewerId)
    .maybeSingle();
  if (error) {
    // Fail towards hiding fixtures from a real coach: an unreadable
    // viewer profile is not evidence that they are a fixture themself.
    console.error('viewerSeesTestAccounts failed', error);
    return false;
  }
  return Boolean(data?.is_test);
}

/**
 * The members this viewer is actively assigned to as their coach. An
 * active row here is a deliberate pairing, so a flagged member in this set
 * is this coach's client and is shown to them in full.
 *
 * A read that fails returns the empty set, which leaves the old
 * hide-every-fixture behaviour in place for that request. That is the
 * conservative direction for this particular question: an unreadable
 * assignment list is not evidence that a pairing exists.
 */
export async function activelyAssignedMemberIds(
  supabase: SupabaseClient,
  coachId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('coach_client_assignments')
    .select('client_id')
    .eq('coach_id', coachId)
    .eq('status', 'active');
  if (error) {
    console.error('activelyAssignedMemberIds failed', error);
    return new Set();
  }
  return new Set((data ?? []).map((row: { client_id: string }) => row.client_id));
}

/**
 * The exclusion to apply to a staff read. Resolves the viewer from the
 * session when no id is passed, so a data-layer function that only holds a
 * client can still ask for it.
 */
export async function resolveTestAccountExclusion(
  supabase: SupabaseClient,
  viewerId?: string | null
): Promise<TestAccountExclusion> {
  let viewer = viewerId ?? null;
  if (!viewer) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    viewer = user?.id ?? null;
  }
  // No viewer means no staff surface is being rendered. Nothing to hide,
  // and RLS has already returned nothing to hide it from.
  if (!viewer) return ALLOW_EVERYTHING;

  if (await viewerSeesTestAccounts(supabase, viewer)) return ALLOW_EVERYTHING;

  const [assigned, { data, error }] = await Promise.all([
    activelyAssignedMemberIds(supabase, viewer),
    supabase.from('profiles').select('id').eq('is_test', true),
  ]);
  if (error) {
    console.error('resolveTestAccountExclusion failed', error);
    return exclusionOf([]);
  }
  // Exception 2: a flagged member this coach is actively assigned to is
  // their client, so they are never in the hidden set.
  const ids = (data ?? [])
    .map((row: { id: string }) => row.id)
    .filter((id: string) => !assigned.has(id));
  return exclusionOf(ids);
}

/**
 * Applies the exclusion to a PostgREST query builder, at the query, so the
 * rows never leave the database. `column` is whichever column on that
 * table holds the member's id.
 */
export function applyTestAccountExclusion<Q extends { not: (c: string, o: string, v: string) => Q }>(
  query: Q,
  exclusion: TestAccountExclusion,
  column = 'member_id'
): Q {
  if (exclusion.disabled || exclusion.hiddenMemberIds.length === 0) return query;
  return query.not(column, 'in', `(${exclusion.hiddenMemberIds.join(',')})`);
}

/**
 * The same rule for rows already in hand — a detail lookup reached by
 * typing a URL, or a list assembled from more than one query.
 */
export function rejectTestMemberRows<T>(
  rows: readonly T[],
  exclusion: TestAccountExclusion,
  memberIdOf: (row: T) => string | null | undefined
): T[] {
  if (exclusion.disabled) return [...rows];
  return rows.filter((row) => !exclusion.isHidden(memberIdOf(row)));
}

/**
 * A single row, for a detail screen. Returns null when the member behind
 * it must not be shown to this viewer, which is what turns a typed URL
 * into the same "not found" a member outside the coach's caseload gets.
 */
export function rejectTestMemberRow<T>(
  row: T | null,
  exclusion: TestAccountExclusion,
  memberIdOf: (row: T) => string | null | undefined
): T | null {
  if (!row) return null;
  return rejectTestMemberRows([row], exclusion, memberIdOf)[0] ?? null;
}

/**
 * The same rule for a member-scoped staff ROUTE rather than a row: may
 * this viewer be shown anything at all about this member?
 *
 * Used by the member-scoped layouts under /coach, so every screen in one
 * of those trees answers the question once, in one place, and a screen
 * added tomorrow inherits the answer instead of having to repeat it.
 *
 * Fails towards showing, for the reason stated at the top of this file: a
 * profile row this read cannot see is not evidence of a fixture, and RLS
 * has already decided whether this viewer may be here at all.
 */
export async function isMemberVisibleToStaff(
  supabase: SupabaseClient,
  memberId: string,
  viewerId?: string | null
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_test')
    .eq('id', memberId)
    .maybeSingle();
  if (error) {
    console.error('isMemberVisibleToStaff failed', error);
    return true;
  }
  if (!data?.is_test) return true;

  let viewer = viewerId ?? null;
  if (!viewer) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    viewer = user?.id ?? null;
  }
  if (!viewer) return false;
  if (await viewerSeesTestAccounts(supabase, viewer)) return true;
  // Exception 2, the route-tree half: a flagged member this coach is
  // actively assigned to opens normally, every screen in the tree.
  return (await activelyAssignedMemberIds(supabase, viewer)).has(memberId);
}
