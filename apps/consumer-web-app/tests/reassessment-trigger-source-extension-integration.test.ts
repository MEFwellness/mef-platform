/**
 * End-to-end tests for the Prompt 12, Part 7 reassessment_schedules
 * extensions against real local Supabase: the new trigger_source values
 * (migration 95) and the new insert functions
 * (lib/reassessment-intelligence/data.ts) that write them, including the
 * coach-requested trigger going through the assigned-coach RLS insert
 * policy migration 72 already established.
 *
 * reassessment_schedules has no member-insert policy at all (migration 72
 * only ever gave members read/update-own) — the experiment-outcome and
 * recommendation-sequence triggers are written by the daily cron
 * (app/api/cron/daily-coaching-scan/route.ts), which always uses a
 * service-role client, so these two are exercised the same way here.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  insertCoachRequestedReassessmentSchedule,
  insertExperimentOutcomeReassessmentSchedule,
  insertRecommendationSequenceReassessmentSchedule,
} from '../lib/reassessment-intelligence/data';

const memberId = TEST_USERS.memberOne.id;

async function cleanup() {
  const service = serviceRoleClient();
  await service.from('reassessment_schedules').delete().eq('member_id', memberId);
}

afterEach(cleanup);

async function latestTriggerSource(): Promise<string | null> {
  const service = serviceRoleClient();
  const { data } = await service
    .from('reassessment_schedules')
    .select('trigger_source, trigger_context, stage')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.trigger_source ?? null;
}

describe('reassessment_schedules — Prompt 12 trigger_source extension (migration 95)', () => {
  it('accepts experiment_outcome, written by insertExperimentOutcomeReassessmentSchedule', async () => {
    const service = serviceRoleClient();
    await insertExperimentOutcomeReassessmentSchedule(service, memberId, {
      assessmentKey: 'body-assessment',
      triggerSource: 'experiment_outcome',
      reason: 'x',
      triggerContext: { outcome: 'didnt_work', sourceDomain: 'movement' },
    });
    expect(await latestTriggerSource()).toBe('experiment_outcome');
  });

  it('accepts recommendation_sequence, written by insertRecommendationSequenceReassessmentSchedule', async () => {
    const service = serviceRoleClient();
    await insertRecommendationSequenceReassessmentSchedule(service, memberId, {
      assessmentKey: 'four-doctors',
      triggerSource: 'recommendation_sequence',
      reason: 'x',
      triggerContext: { completedCount: 3, sourceDomain: 'stress' },
    });
    expect(await latestTriggerSource()).toBe('recommendation_sequence');
  });

  it('an assigned coach can request a reassessment (coach_action), a member cannot', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    await insertCoachRequestedReassessmentSchedule(
      coachClient,
      memberId,
      'body-assessment',
      'Worth a fresh look given recent conversation.'
    );
    expect(await latestTriggerSource()).toBe('coach_action');

    await cleanup();

    const memberClient = await signInAs(TEST_USERS.memberOne);
    await insertCoachRequestedReassessmentSchedule(memberClient, memberId, 'body-assessment', 'x');
    // reassessment_schedules has no member-insert policy at all (migration
    // 72 only ever gave members read/update-own — insert is coach/admin
    // only), so this INSERT is rejected by RLS outright; the function
    // logs and swallows the error rather than throwing (same posture as
    // every other insert*ReassessmentSchedule function here), so nothing
    // new was written.
    expect(await latestTriggerSource()).toBeNull();
  });
});
