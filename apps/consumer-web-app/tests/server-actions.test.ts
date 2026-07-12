import { describe, it, expect, afterAll } from 'vitest';
import { CONSENT_ITEMS } from '@/lib/consent/copy';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

const TEST_HABIT_DATE = '2018-05-05';

describe('coach access (coach_read_assigned_* RLS + is_active_coach_for)', () => {
  it("a coach can read their actively-assigned client's check-ins", async () => {
    // Seed data: coach.one is actively assigned to member.one.
    const coach = await signInAs(TEST_USERS.coachOne);
    const { data, error } = await coach
      .from('daily_checkins_current')
      .select('id')
      .eq('user_id', TEST_USERS.memberOne.id);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('a coach cannot read a client whose assignment was revoked', async () => {
    // Seed data: coach.one's assignment to member.two was explicitly revoked.
    const coach = await signInAs(TEST_USERS.coachOne);
    const { data, error } = await coach
      .from('profiles')
      .select('id')
      .eq('id', TEST_USERS.memberTwo.id);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('a coach can see their own assignment history (active + revoked)', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const { data, error } = await coach
      .from('coach_client_assignments')
      .select('client_id, status')
      .eq('coach_id', TEST_USERS.coachOne.id);

    expect(error).toBeNull();
    const statuses = (data ?? []).map((a) => a.status);
    expect(statuses).toContain('active');
    expect(statuses).toContain('revoked');
  });
});

describe('admin access (platform_admin_all_* RLS)', () => {
  it('an admin can list all user profiles', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { data, error } = await admin.from('profiles').select('id, display_name');

    expect(error).toBeNull();
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        TEST_USERS.memberOne.id,
        TEST_USERS.memberTwo.id,
        TEST_USERS.coachOne.id,
      ])
    );
  });

  it('a non-admin cannot grant a coach role (RPC insert blocked by RLS, not a client-side check)', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { error } = await member.rpc('grant_coach_role', {
      p_target_user: TEST_USERS.memberTwo.id,
    });

    expect(error).not.toBeNull();

    // Defensively confirm no grant actually landed, regardless of what the
    // RPC call reported.
    const service = serviceRoleClient();
    const { data } = await service
      .from('user_roles')
      .select('id')
      .eq('user_id', TEST_USERS.memberTwo.id)
      .eq('role', 'coach')
      .is('revoked_at', null);
    expect(data ?? []).toHaveLength(0);
  });

  it('assign_client_to_coach rejects a coach being assigned as their own client', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { error } = await admin.rpc('assign_client_to_coach', {
      p_coach_id: TEST_USERS.coachOne.id,
      p_client_id: TEST_USERS.coachOne.id,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/cannot be assigned as their own client/i);
  });
});

describe('consent completeness (hasCompletedConsent query pattern)', () => {
  async function isFullyConsented(userId: string): Promise<boolean> {
    const service = serviceRoleClient();
    const { data } = await service
      .from('consent_records')
      .select('consent_type')
      .eq('user_id', userId)
      .is('revoked_at', null);

    const granted = new Set((data ?? []).map((r) => r.consent_type));
    return CONSENT_ITEMS.every((item) => granted.has(item.type));
  }

  it('member.one has completed all required consents (seeded fully consented)', async () => {
    expect(await isFullyConsented(TEST_USERS.memberOne.id)).toBe(true);
  });

  it('member.two has only partially consented (seeded on purpose to exercise the gate)', async () => {
    expect(await isFullyConsented(TEST_USERS.memberTwo.id)).toBe(false);
  });

  it('a member can insert their own consent records but not for another user', async () => {
    const member = await signInAs(TEST_USERS.memberTwo);
    const { error } = await member.from('consent_records').insert({
      user_id: TEST_USERS.memberOne.id, // not themselves
      consent_type: 'terms_of_use',
      version: 'v1-placeholder',
      granted_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });
});

describe('habit log upsert (onConflict habit_id,local_date)', () => {
  afterAll(async () => {
    const service = serviceRoleClient();
    await service
      .from('habit_logs')
      .delete()
      .eq('user_id', TEST_USERS.memberOne.id)
      .eq('local_date', TEST_HABIT_DATE);
  });

  it('completing a habit twice for the same day updates in place rather than duplicating', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: habits } = await client
      .from('habits')
      .select('id')
      .eq('user_id', TEST_USERS.memberOne.id)
      .eq('active', true)
      .limit(1);

    expect(habits?.length ?? 0).toBeGreaterThan(0);
    const habitId = habits![0]!.id;

    await client.from('habit_logs').upsert(
      {
        habit_id: habitId,
        user_id: TEST_USERS.memberOne.id,
        local_date: TEST_HABIT_DATE,
        timezone: 'America/New_York',
        completed: true,
      },
      { onConflict: 'habit_id,local_date' }
    );
    await client.from('habit_logs').upsert(
      {
        habit_id: habitId,
        user_id: TEST_USERS.memberOne.id,
        local_date: TEST_HABIT_DATE,
        timezone: 'America/New_York',
        completed: false,
      },
      { onConflict: 'habit_id,local_date' }
    );

    const { data: logs, error } = await client
      .from('habit_logs')
      .select('completed')
      .eq('habit_id', habitId)
      .eq('local_date', TEST_HABIT_DATE);

    expect(error).toBeNull();
    expect(logs).toHaveLength(1); // upsert, not insert — no duplicate row
    expect(logs?.[0]?.completed).toBe(false); // reflects the second call
  });
});
