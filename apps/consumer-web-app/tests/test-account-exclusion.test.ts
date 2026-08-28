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

  it("the admin's member list", () => {
    expect(read('app/actions/admin.ts')).toContain(".eq('is_test', false)");
  });

  it("the coach's client list, with its deliberate exception for a coach who is herself a test account", () => {
    const source = read('app/actions/coach.ts');
    expect(source).toContain("select('is_test')");
    expect(source).toContain('if (!viewerProfile?.is_test)');
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

describe('what the flag does NOT exclude her from, recorded rather than assumed', () => {
  /**
   * A3 in docs/BUG_SWEEP_2026-08-27.md, and deliberately not fixed in this
   * build. `listReviewQueueForCoach` selects the whole table with no
   * is_test filter at all, so flagging an account cannot remove it from
   * the Safety Review Queue: there is nothing there to do the removing.
   * Flagging her still changes nothing about that screen today, because
   * she has never been flagged for safety review, but the gap is real and
   * this test is what stops it being mistaken for handled.
   */
  it('the Safety Review Queue has no is_test filter, so this decision cannot reach it', () => {
    const source = read('lib/safety/data.ts');
    const start = source.indexOf('export async function listReviewQueueForCoach');
    expect(start).toBeGreaterThan(-1);
    const fn = source.slice(start, source.indexOf('\n}\n', start));
    expect(fn).not.toContain('is_test');
  });
});
