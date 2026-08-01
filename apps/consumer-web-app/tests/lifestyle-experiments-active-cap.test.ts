/**
 * End-to-end tests for the Prompt 12 two-active-experiment guardrail
 * against real local Supabase — exercises countActiveExperiments and the
 * defensive cap re-check inside startLifestyleExperiment
 * (lib/lifestyle-experiments/data.ts). The user-facing check in
 * app/actions/lifestyleExperiments.ts::startMyExperiment can't be called
 * directly here (server actions use next/headers cookies()), same
 * limitation tests/setup/test-clients.ts documents for every action file —
 * this file proves the data-layer guardrail those actions depend on.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  countActiveExperiments,
  startLifestyleExperiment,
  closeLifestyleExperiment,
  listMyLifestyleExperiments,
  MAX_ACTIVE_EXPERIMENTS,
} from '../lib/lifestyle-experiments';

const memberId = TEST_USERS.memberOne.id;

/** deriveEffectiveStatus reads real wall-clock time, so every "still active" fixture here anchors to today, not a fixed calendar date. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('lifestyle_experiments').delete().eq('member_id', memberId);
});

describe('Lifestyle Experiments — two-active-experiment guardrail (Prompt 12, Part 3)', () => {
  it('MAX_ACTIVE_EXPERIMENTS is 2', () => {
    expect(MAX_ACTIVE_EXPERIMENTS).toBe(2);
  });

  it('allows starting up to the cap, then refuses a third', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const first = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Experiment 1',
      protocol: 'p',
      startDate: today(),
      durationDays: 28,
    });
    const second = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Experiment 2',
      protocol: 'p',
      startDate: today(),
      durationDays: 28,
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(await countActiveExperiments(memberClient, memberId)).toBe(2);

    const third = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Experiment 3',
      protocol: 'p',
      startDate: today(),
      durationDays: 28,
    });
    expect(third).toBeNull();
    expect(await countActiveExperiments(memberClient, memberId)).toBe(2);
  });

  it('closing an experiment frees a slot for a new one', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const first = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Experiment 1',
      protocol: 'p',
      startDate: today(),
      durationDays: 28,
    });
    await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Experiment 2',
      protocol: 'p',
      startDate: today(),
      durationDays: 28,
    });
    expect(await countActiveExperiments(memberClient, memberId)).toBe(2);

    await closeLifestyleExperiment(memberClient, memberId, first!.id, {
      reflectionText: 'done',
      outcome: 'worked',
    });
    expect(await countActiveExperiments(memberClient, memberId)).toBe(1);

    const third = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Experiment 3',
      protocol: 'p',
      startDate: today(),
      durationDays: 28,
    });
    expect(third).not.toBeNull();
    expect(await countActiveExperiments(memberClient, memberId)).toBe(2);
  });

  it('an expired_no_reflection experiment does not count as active', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Long overdue',
      protocol: 'p',
      startDate: '2020-01-01',
      durationDays: 7,
    });

    // countActiveExperiments applies deriveEffectiveStatus itself, so a
    // long-overdue row (start_date 2020, duration 7 days) reads as
    // expired_no_reflection and does not occupy a slot.
    const activeCount = await countActiveExperiments(memberClient, memberId);
    expect(activeCount).toBe(0);

    const second = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Fresh one',
      protocol: 'p',
      startDate: today(),
      durationDays: 28,
    });
    expect(second).not.toBeNull();
    expect(await countActiveExperiments(memberClient, memberId)).toBe(1);
  });

  it('a past-day-7 experiment closes out automatically, for real, in the database — not just at read time', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const overdue = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Long overdue',
      protocol: 'p',
      startDate: '2020-01-01',
      durationDays: 7,
    });
    expect(overdue).not.toBeNull();

    // Reading the member's experiments at all (listMyLifestyleExperiments,
    // exactly like countActiveExperiments) self-heals any overdue row by
    // persisting deriveEffectiveStatus's own verdict back onto the row, so
    // it reads as expired_no_reflection everywhere from now on, not only
    // inside this one count.
    const after = await listMyLifestyleExperiments(memberClient, memberId);
    expect(after.find((e) => e.id === overdue!.id)!.status).toBe('expired_no_reflection');

    const service = serviceRoleClient();
    const { data: raw } = await service.from('lifestyle_experiments').select('status').eq('id', overdue!.id).single();
    expect(raw!.status).toBe('expired_no_reflection');
  });

  it('never touches an experiment that is still within its own tracking window', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const fresh = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Still going',
      protocol: 'p',
      startDate: today(),
      durationDays: 28,
    });
    expect(fresh).not.toBeNull();

    await listMyLifestyleExperiments(memberClient, memberId);

    const service = serviceRoleClient();
    const { data: raw } = await service.from('lifestyle_experiments').select('status').eq('id', fresh!.id).single();
    expect(raw!.status).toBe('active');
  });
});
