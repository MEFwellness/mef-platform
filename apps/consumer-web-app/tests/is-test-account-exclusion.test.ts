/**
 * Production test accounts (Part 1) must never be confused with real
 * members: excluded from the admin's user list, from admin assignment
 * history, and from a real coach's caseload. Same testing philosophy as
 * the rest of this suite (see tests/setup/test-clients.ts's own header
 * comment) — server actions use `cookies()` and can't be called directly
 * here, so these tests issue the exact same Supabase queries
 * app/actions/admin.ts and app/actions/coach.ts issue, authenticated as
 * the real seeded users, proving the database-level behavior the actions
 * depend on.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

async function setIsTest(memberId: string, value: boolean) {
  const service = serviceRoleClient();
  const { error } = await service.from('profiles').update({ is_test: value }).eq('id', memberId);
  if (error) throw new Error(`setIsTest(${memberId}, ${value}) failed: ${error.message}`);
}

afterEach(async () => {
  // Always leave the shared seeded fixtures back in their real (non-test) state.
  await setIsTest(TEST_USERS.memberOne.id, false);
  await setIsTest(TEST_USERS.coachOne.id, false);
});

describe('profiles.is_test — the flag itself', () => {
  it('defaults to false for every existing/newly-created profile', async () => {
    const service = serviceRoleClient();
    const { data } = await service.from('profiles').select('is_test').eq('id', TEST_USERS.memberTwo.id).single();
    expect(data!.is_test).toBe(false);
  });
});

describe("the admin's user list excludes is_test accounts (mirrors app/actions/admin.ts listUsers)", () => {
  it('a real admin never sees a test-flagged member in the full user list', async () => {
    await setIsTest(TEST_USERS.memberOne.id, true);

    const admin = await signInAs(TEST_USERS.adminOne);
    const { data, error } = await admin.from('profiles').select('*').eq('is_test', false).order('created_at');
    expect(error).toBeNull();
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).not.toContain(TEST_USERS.memberOne.id);
    expect(ids).toContain(TEST_USERS.memberTwo.id); // a real, non-test member is still listed
  });
});

describe('assignment history excludes any pairing touching an is_test account (mirrors listAssignmentHistory)', () => {
  it('drops rows where either side is flagged is_test', async () => {
    await setIsTest(TEST_USERS.memberOne.id, true);

    const admin = await signInAs(TEST_USERS.adminOne);
    const { data: testProfiles } = await admin.from('profiles').select('id').eq('is_test', true);
    const testIds = (testProfiles ?? []).map((p) => p.id as string);
    expect(testIds).toContain(TEST_USERS.memberOne.id);

    let query = admin.from('coach_client_assignments').select('*').order('created_at', { ascending: false });
    if (testIds.length > 0) {
      const literalList = `(${testIds.join(',')})`;
      query = query.not('coach_id', 'in', literalList).not('client_id', 'in', literalList);
    }
    const { data, error } = await query;
    expect(error).toBeNull();
    const clientIds = (data ?? []).map((a) => a.client_id);
    expect(clientIds).not.toContain(TEST_USERS.memberOne.id);
  });
});

describe("a real coach's caseload excludes is_test clients (mirrors listAssignedClients)", () => {
  it('a real coach never sees a test-flagged assigned client', async () => {
    await setIsTest(TEST_USERS.memberOne.id, true);

    const coach = await signInAs(TEST_USERS.coachOne);
    const { data: assignments } = await coach
      .from('coach_client_assignments')
      .select('client_id')
      .eq('coach_id', TEST_USERS.coachOne.id)
      .eq('status', 'active');
    const clientIds = (assignments ?? []).map((a) => a.client_id as string);
    expect(clientIds).toContain(TEST_USERS.memberOne.id); // the assignment itself is real/unchanged

    const { data: viewerProfile } = await coach
      .from('profiles')
      .select('is_test')
      .eq('id', TEST_USERS.coachOne.id)
      .single();
    expect(viewerProfile!.is_test).toBe(false);

    let query = coach.from('profiles').select('*').in('id', clientIds);
    if (!viewerProfile?.is_test) query = query.eq('is_test', false);
    const { data: profiles, error } = await query;
    expect(error).toBeNull();
    const visibleIds = (profiles ?? []).map((p) => p.id);
    expect(visibleIds).not.toContain(TEST_USERS.memberOne.id);
  });

  it('a test coach still sees their own assigned test client — the one deliberate exception', async () => {
    await setIsTest(TEST_USERS.memberOne.id, true);
    await setIsTest(TEST_USERS.coachOne.id, true);

    const coach = await signInAs(TEST_USERS.coachOne);
    const { data: assignments } = await coach
      .from('coach_client_assignments')
      .select('client_id')
      .eq('coach_id', TEST_USERS.coachOne.id)
      .eq('status', 'active');
    const clientIds = (assignments ?? []).map((a) => a.client_id as string);

    const { data: viewerProfile } = await coach
      .from('profiles')
      .select('is_test')
      .eq('id', TEST_USERS.coachOne.id)
      .single();
    expect(viewerProfile!.is_test).toBe(true);

    let query = coach.from('profiles').select('*').in('id', clientIds);
    if (!viewerProfile?.is_test) query = query.eq('is_test', false);
    const { data: profiles, error } = await query;
    expect(error).toBeNull();
    const visibleIds = (profiles ?? []).map((p) => p.id);
    expect(visibleIds).toContain(TEST_USERS.memberOne.id);
  });
});
