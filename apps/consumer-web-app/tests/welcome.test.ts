import { describe, it, expect, afterEach } from 'vitest';
import { anonClient, signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { isEligibleForWelcomeFlow, WELCOME_FLOW_ENABLED } from '../lib/welcome/eligibility';

/**
 * These mutate memberOne/memberTwo/coachOne/adminOne's welcome_flow_*
 * columns via the service-role client (bypasses RLS, same convention as
 * every other integration test's fixture setup) to exercise each state.
 * Every test restores the row it touched so later tests and other files
 * still see the seed's default state.
 */
async function setWelcomeState(
  userId: string,
  values: { welcome_flow_eligible?: boolean; welcome_flow_completed_at?: string | null }
) {
  const { error } = await serviceRoleClient().from('profiles').update(values).eq('id', userId);
  if (error) throw new Error(`Failed to set welcome state for ${userId}: ${error.message}`);
}

describe('welcome flow foundation', () => {
  it('the future welcome route stays disabled until a later prompt activates it', () => {
    expect(WELCOME_FLOW_ENABLED).toBe(false);
  });

  describe('isEligibleForWelcomeFlow', () => {
    afterEach(async () => {
      // Restore every touched row to a known baseline so other tests (and
      // other files sharing this database) aren't affected by leftovers.
      await setWelcomeState(TEST_USERS.memberOne.id, {
        welcome_flow_eligible: false,
        welcome_flow_completed_at: null,
      });
      await setWelcomeState(TEST_USERS.memberTwo.id, {
        welcome_flow_eligible: false,
        welcome_flow_completed_at: null,
      });
      await setWelcomeState(TEST_USERS.coachOne.id, {
        welcome_flow_eligible: false,
        welcome_flow_completed_at: null,
      });
      await setWelcomeState(TEST_USERS.adminOne.id, {
        welcome_flow_eligible: false,
        welcome_flow_completed_at: null,
      });
    });

    it('an existing member (welcome_flow_eligible = false, the column default) is not eligible', async () => {
      // This is what every member who existed before this migration looks
      // like: the column default applied with no data write touching their
      // row. Never eligible, regardless of onboarding/consent state.
      await setWelcomeState(TEST_USERS.memberOne.id, { welcome_flow_eligible: false });
      const client = await signInAs(TEST_USERS.memberOne);
      const eligible = await isEligibleForWelcomeFlow(client, TEST_USERS.memberOne.id);
      expect(eligible).toBe(false);
    });

    it('a brand-new member (eligible = true, not yet completed) is eligible', async () => {
      await setWelcomeState(TEST_USERS.memberOne.id, {
        welcome_flow_eligible: true,
        welcome_flow_completed_at: null,
      });
      const client = await signInAs(TEST_USERS.memberOne);
      const eligible = await isEligibleForWelcomeFlow(client, TEST_USERS.memberOne.id);
      expect(eligible).toBe(true);
    });

    it('a member who already completed the flow is not eligible again', async () => {
      await setWelcomeState(TEST_USERS.memberOne.id, {
        welcome_flow_eligible: true,
        welcome_flow_completed_at: new Date().toISOString(),
      });
      const client = await signInAs(TEST_USERS.memberOne);
      const eligible = await isEligibleForWelcomeFlow(client, TEST_USERS.memberOne.id);
      expect(eligible).toBe(false);
    });

    it('a coach is never eligible, even if the flag is set true on their profile', async () => {
      await setWelcomeState(TEST_USERS.coachOne.id, {
        welcome_flow_eligible: true,
        welcome_flow_completed_at: null,
      });
      const client = await signInAs(TEST_USERS.coachOne);
      const eligible = await isEligibleForWelcomeFlow(client, TEST_USERS.coachOne.id);
      expect(eligible).toBe(false);
    });

    it('an administrator is never eligible, even if the flag is set true on their profile', async () => {
      await setWelcomeState(TEST_USERS.adminOne.id, {
        welcome_flow_eligible: true,
        welcome_flow_completed_at: null,
      });
      const client = await signInAs(TEST_USERS.adminOne);
      const eligible = await isEligibleForWelcomeFlow(client, TEST_USERS.adminOne.id);
      expect(eligible).toBe(false);
    });

    it('fails closed (not eligible) when the profile row cannot be read, instead of throwing', async () => {
      // memberOne's own client querying memberTwo's id: RLS silently filters
      // the row to null rather than erroring, the same "missing profile"
      // shape this function must treat as "not eligible", not a crash.
      const client = await signInAs(TEST_USERS.memberOne);
      const eligible = await isEligibleForWelcomeFlow(client, TEST_USERS.memberTwo.id);
      expect(eligible).toBe(false);
    });
  });

  describe('row level security on welcome_flow_* columns', () => {
    afterEach(async () => {
      await setWelcomeState(TEST_USERS.memberTwo.id, {
        welcome_flow_eligible: false,
        welcome_flow_completed_at: null,
      });
    });

    it("member A cannot read member B's welcome status", async () => {
      await setWelcomeState(TEST_USERS.memberTwo.id, { welcome_flow_eligible: true });
      const client = await signInAs(TEST_USERS.memberOne);
      const { data, error } = await client
        .from('profiles')
        .select('welcome_flow_eligible, welcome_flow_completed_at')
        .eq('id', TEST_USERS.memberTwo.id)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("member A cannot update member B's welcome status", async () => {
      const client = await signInAs(TEST_USERS.memberOne);
      const { data } = await client
        .from('profiles')
        .update({ welcome_flow_eligible: true })
        .eq('id', TEST_USERS.memberTwo.id)
        .select();

      // RLS's using() clause on the update filters out the target row
      // entirely rather than raising an error: zero rows affected.
      expect(data ?? []).toHaveLength(0);

      const check = serviceRoleClient();
      const { data: actual } = await check
        .from('profiles')
        .select('welcome_flow_eligible')
        .eq('id', TEST_USERS.memberTwo.id)
        .single();
      expect(actual?.welcome_flow_eligible).toBe(false);
    });

    it('an unauthenticated (anon) client cannot read any welcome status', async () => {
      const client = anonClient();
      const { data, error } = await client
        .from('profiles')
        .select('welcome_flow_eligible, welcome_flow_completed_at')
        .eq('id', TEST_USERS.memberOne.id)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data).toBeNull();
    });
  });
});
