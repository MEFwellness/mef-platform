/**
 * DELETING AN ACCOUNT MUST SUCCEED, AND MUST TAKE THAT ACCOUNT'S DATA
 * WITH IT (migration 239).
 *
 * Before that migration, Authentication > Users > Delete returned
 * "Failed to delete user: Database error deleting user" for every member
 * who had ever been assigned a coach and for every coach and admin who
 * had ever signed their name to a row, because 41 references to
 * auth.users said `no action`.
 *
 * This is a behaviour test, not a schema test, and it is deliberately so:
 * it calls the same admin endpoint the Supabase dashboard calls, on a
 * throwaway account it creates itself, so it fails the way the dashboard
 * failed rather than the way a constraint listing would.
 *
 * It creates and deletes only its own accounts. It never touches a seeded
 * fixture.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';

const created: string[] = [];

async function makeThrowawayAccount(label: string): Promise<string> {
  const service = serviceRoleClient();
  const email = `deletion-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: `Throwaway${Math.random().toString(36).slice(2, 10)}!`,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const id = data!.user!.id;
  created.push(id);
  return id;
}

afterAll(async () => {
  const service = serviceRoleClient();
  for (const id of created) {
    await service.auth.admin.deleteUser(id);
  }
});

describe('account deletion', () => {
  it('deletes a member who has a coach, and leaves none of her rows behind', async () => {
    const service = serviceRoleClient();
    const coachId = await makeThrowawayAccount('coach');
    const memberId = await makeThrowawayAccount('member');

    // The one row that used to make every assigned member undeletable.
    const assignment = await service
      .from('coach_client_assignments')
      .insert({ coach_id: coachId, client_id: memberId, assigned_by: coachId })
      .select('id')
      .single();
    expect(assignment.error).toBeNull();

    const checkin = await service
      .from('daily_checkins')
      .insert({ user_id: memberId, local_date: '2026-09-14', timezone: 'America/New_York' })
      .select('id')
      .single();
    expect(checkin.error).toBeNull();

    const { error: deleteError } = await service.auth.admin.deleteUser(memberId);
    expect(deleteError).toBeNull();

    for (const [table, column] of [
      ['coach_client_assignments', 'client_id'],
      ['daily_checkins', 'user_id'],
      ['profiles', 'id'],
    ] as const) {
      const { count, error } = await service
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, memberId);
      expect(error, `${table} read`).toBeNull();
      expect(count, `${table}.${column} rows left behind`).toBe(0);
    }
  });

  it('deletes a coach without deleting the member rows that carried their name', async () => {
    const service = serviceRoleClient();
    const coachId = await makeThrowawayAccount('coach-signed');
    const memberId = await makeThrowawayAccount('member-kept');

    const plan = await service
      .from('member_reset_plans')
      .insert({ member_id: memberId })
      .select('id')
      .single();
    expect(plan.error).toBeNull();

    // A member's row that the coach signed. It must survive the coach and
    // simply stop naming them.
    const version = await service
      .from('member_reset_plan_versions')
      .insert({
        member_id: memberId,
        plan_id: plan.data!.id,
        change_type: 'created',
        changed_by: coachId,
      })
      .select('id')
      .single();
    expect(version.error).toBeNull();

    const { error: deleteError } = await service.auth.admin.deleteUser(coachId);
    expect(deleteError).toBeNull();

    const kept = await service
      .from('member_reset_plan_versions')
      .select('id, changed_by')
      .eq('id', version.data!.id)
      .single();
    expect(kept.error).toBeNull();
    expect(kept.data!.changed_by).toBeNull();
  });
});
