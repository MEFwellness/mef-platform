/**
 * THE STANDING LIVE TEST MEMBER IS A TEST MEMBER (2026-08-27).
 *
 * `8weeks2fab@gmail.com` is the account every live verification run and
 * every bug sweep signs in as, and it carried `profiles.is_test = false`,
 * so all of that traffic landed in the funnel, the engagement report, the
 * drop-off numbers and the coach's caseload as a real member. Migration
 * 187 flags it.
 *
 * This file is about the OTHER half of that decision: what the flag
 * actually buys. Each surface below is checked for whether it really does
 * exclude a flagged account, so the answer is a measured one rather than
 * an assumption. Where a surface does not filter, that is recorded here
 * rather than quietly assumed away, because a decision that only half
 * works is worse than one that visibly does not.
 *
 * ONE OF THOSE HALF-WORKING SURFACES IS NOW FIXED (Build 4, 2026-08-28).
 * The last block here recorded that the Safety Review Queue had no filter
 * to reach. It has one now, and the rule the coach's client list used to
 * keep privately is shared by every staff read. The behaviour lives in
 * tests/staff-surfaces-exclude-test-accounts.test.ts; this file keeps the
 * per-surface ledger.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';

function read(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}

const memberId = TEST_USERS.memberOne.id;

afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('profiles').update({ is_test: false }).eq('id', memberId);
});

describe('the migration flags exactly one account, by email, and nothing else', () => {
  const migration = read('../../supabase/migrations/00000000000187_plan_gate_and_phantom_reassessments.sql');

  it('sets is_test true for 8weeks2fab@gmail.com and no other address', () => {
    expect(migration).toContain("u.email = '8weeks2fab@gmail.com'");
    const emailMatches = migration.match(/u\.email = '[^']+'/g) ?? [];
    expect(emailMatches).toEqual(["u.email = '8weeks2fab@gmail.com'"]);
  });

  it('never sets is_test false for anybody, so no other account can be un-flagged by it', () => {
    expect(migration).not.toMatch(/is_test\s*=\s*false/);
  });

  it('is idempotent: re-running it finds nothing to change', () => {
    expect(migration).toContain('p.is_test is distinct from true');
  });
});

describe('what the flag actually excludes her from', () => {
  it('the admin funnel and engagement numbers: the analytics RPCs gate on p_include_test, defaulting to false', async () => {
    const service = serviceRoleClient();
    await service.from('profiles').update({ is_test: true }).eq('id', memberId);

    // analytics_member_scope is the one function every funnel, engagement
    // and drop-off query in the analytics service builds on, so asking it
    // directly is asking all of them at once.
    const { data: withoutTest, error: e1 } = await service.rpc('analytics_member_scope', {
      p_include_test: false,
    });
    expect(e1).toBeNull();

    const { data: withTest, error: e2 } = await service.rpc('analytics_member_scope', {
      p_include_test: true,
    });
    expect(e2).toBeNull();

    const idsWithout = (withoutTest as { member_id: string }[]).map((r) => r.member_id);
    const idsWith = (withTest as { member_id: string }[]).map((r) => r.member_id);

    // The flagged account is in one and not the other. Measured, not read
    // off the source.
    expect(idsWithout).not.toContain(memberId);
    expect(idsWith).toContain(memberId);
  });

  /**
   * 2026-08-29: the filter is unchanged, but it is no longer a WHERE
   * clause, so this stopped being a string worth grepping for. listUsers
   * reads every profile and partitions in one place, because the screen
   * now has to print how many it hid as well as which it kept, and two
   * queries could disagree about the same instant. The behaviour is
   * driven for real in tests/admin-lists-name-what-they-hide.test.tsx;
   * this only records that the decision still reaches this file.
   */
  it("the admin's member list", () => {
    const source = read('app/actions/admin.ts');
    expect(source).toContain('export async function listUsers(includeTest = false)');
    expect(source).toContain('all.filter((profile) => !profile.is_test)');
  });

  it("the coach's client list, with its deliberate exception for a coach who is herself a test account", () => {
    // A3 (2026-08-28): the exception used to be a private is_test read
    // inside this function. It is the shared rule now, and the exception
    // is unchanged. tests/staff-surfaces-exclude-test-accounts.test.ts
    // drives the behaviour; this only records that the list still asks.
    const source = read('app/actions/coach.ts');
    expect(source).toContain('viewerSeesTestAccounts');
    expect(source).toContain('if (!seesTestAccounts)');
    expect(source).toContain(".eq('is_test', false)");
  });

  /**
   * The one place the flag ADDS something rather than removing it, and it
   * is deliberate. The /api/test-only/* routes are gated on the CALLER's
   * own is_test, so flagging this account is what lets a verification run
   * reset the weekly review, the visibility state and the priority and
   * watch them arrive again. Recorded here because "flagged as a test
   * account" is not purely a subtraction.
   */
  it('the test-only reset routes, which are gated on the caller being a test account, now work for her', () => {
    const source = read('app/api/test-only/weekly-review-reset/route.ts');
    expect(source).toContain('is_test');
  });
});

describe('the Safety Review Queue, which this flag could not reach until Build 4', () => {
  /**
   * A3 in docs/BUG_SWEEP_2026-08-27.md. This block used to record the
   * opposite: `listReviewQueueForCoach` selected the whole table with no
   * is_test filter at all, so flagging an account could not remove it
   * from the queue, because there was nothing there to do the removing.
   * On 2026-08-28 the queue held 27 open cases, 27 of them fixtures and 0
   * real. Build 4 closed it, and this test is now the record of that
   * rather than of the gap.
   *
   * The behaviour is proved against a fake Postgres that honours the
   * filter in tests/staff-surfaces-exclude-test-accounts.test.ts. What is
   * checked here is only that the decision reaches this file at all.
   */
  it('the Safety Review Queue now applies the shared exclusion', () => {
    const source = read('lib/safety/data.ts');
    const start = source.indexOf('export async function listReviewQueueForCoach');
    expect(start).toBeGreaterThan(-1);
    const fn = source.slice(start, source.indexOf('\n}\n', start));
    expect(fn).toContain('applyTestAccountExclusion');
  });

  it('and so does the case detail a coach can reach by typing a URL', () => {
    const source = read('lib/safety/data.ts');
    const start = source.indexOf('export async function getReviewQueueEntry');
    expect(start).toBeGreaterThan(-1);
    const fn = source.slice(start, source.indexOf('\n}\n', start));
    expect(fn).toContain('rejectTestMemberRow');
  });
});
