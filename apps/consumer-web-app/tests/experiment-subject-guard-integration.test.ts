/**
 * The write half of "one running experiment per member per subject", against
 * real local Supabase with real RLS: the app-layer guard in
 * startLifestyleExperiment, and migration 216's partial unique index
 * underneath it so no future code path can bypass the guard by skipping the
 * helper.
 *
 * Same philosophy as tests/lifestyle-experiments-integration.test.ts, whose
 * fixtures and cleanup shape this reuses.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { startLifestyleExperiment, findActiveExperimentBySubject } from '../lib/lifestyle-experiments/data';
import { signalSubjectKey, experienceSubjectKey } from '../lib/lifestyle-experiments/subject';

const memberId = TEST_USERS.memberOne.id;

/** deriveEffectiveStatus reads real wall-clock time, so a "still running" fixture anchors to today. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function wipe() {
  await serviceRoleClient().from('lifestyle_experiments').delete().eq('member_id', memberId);
}

beforeEach(wipe);
afterAll(wipe);

describe('one running experiment per subject (migration 216)', () => {
  it('a second start for the same subject from a DIFFERENT experience returns the running one instead of a duplicate', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const fromLsc = await startLifestyleExperiment(client, memberId, {
      recommendationId: null,
      title: 'Energy',
      protocol: 'My theory: your energy runs out because your day has scheduled output but never a scheduled recovery.',
      startDate: today(),
      durationDays: 7,
      sourceExperienceKey: 'life-signal-check',
      subjectKey: signalSubjectKey('energy'),
    });
    expect(fromLsc).not.toBeNull();

    const fromRpl = await startLifestyleExperiment(client, memberId, {
      recommendationId: null,
      title: 'Energy',
      protocol: 'My theory: you already know where this needs to go.',
      startDate: today(),
      durationDays: 7,
      sourceExperienceKey: 'readiness-pulse',
      subjectKey: signalSubjectKey('energy'),
    });

    // Refused silently: she gets back the experiment she is already running,
    // not an error and not a second row.
    expect(fromRpl).not.toBeNull();
    expect(fromRpl!.id).toBe(fromLsc!.id);

    const { data } = await serviceRoleClient()
      .from('lifestyle_experiments')
      .select('id')
      .eq('member_id', memberId)
      .eq('status', 'active');
    expect(data).toHaveLength(1);
  });

  it('a genuinely different subject still starts its own experiment normally', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const energy = await startLifestyleExperiment(client, memberId, {
      recommendationId: null,
      title: 'Energy',
      protocol: 'A protected break each morning.',
      startDate: today(),
      durationDays: 7,
      sourceExperienceKey: 'life-signal-check',
      subjectKey: signalSubjectKey('energy'),
    });
    const noticing = await startLifestyleExperiment(client, memberId, {
      recommendationId: null,
      title: 'Daily Noticing',
      protocol: 'Notice one thing a day.',
      startDate: today(),
      durationDays: 7,
      sourceExperienceKey: 'readiness-pulse',
      subjectKey: experienceSubjectKey('readiness-pulse'),
    });

    expect(energy).not.toBeNull();
    expect(noticing).not.toBeNull();
    expect(noticing!.id).not.toBe(energy!.id);
  });

  it('the database refuses the duplicate even when the helper is bypassed entirely', async () => {
    const service = serviceRoleClient();
    const row = {
      member_id: memberId,
      title: 'Tension',
      protocol: 'Five minutes to let it go.',
      start_date: today(),
      duration_days: 7,
      status: 'active',
      subject_key: signalSubjectKey('tension'),
    };

    const first = await service.from('lifestyle_experiments').insert(row).select('id').single();
    expect(first.error).toBeNull();

    // A hand-made POST, a future code path, a raw insert: the index holds
    // regardless of what the application layer remembered to check.
    const second = await service.from('lifestyle_experiments').insert(row).select('id').single();
    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe('23505');
  });

  it('the index constrains only RUNNING experiments, so a finished one never blocks a restart', async () => {
    const service = serviceRoleClient();
    const subject = signalSubjectKey('sleep');

    // Three closed experiments for one subject: completed, abandoned, and
    // expired with no reflection. All legal, none of them in the index.
    for (const status of ['completed', 'abandoned', 'expired_no_reflection']) {
      const { error } = await service.from('lifestyle_experiments').insert({
        member_id: memberId,
        title: 'Sleep',
        protocol: 'Five screen-free minutes before bed.',
        start_date: '2026-06-01',
        duration_days: 7,
        status,
        subject_key: subject,
      });
      expect(error).toBeNull();
    }

    const client = await signInAs(TEST_USERS.memberOne);
    const restarted = await startLifestyleExperiment(client, memberId, {
      recommendationId: null,
      title: 'Sleep',
      protocol: 'Five screen-free minutes before bed.',
      startDate: today(),
      durationDays: 7,
      sourceExperienceKey: 'life-signal-check',
      subjectKey: subject,
    });
    expect(restarted).not.toBeNull();
    expect(restarted!.status).toBe('active');
  });

  it('findActiveExperimentBySubject ignores started-and-finished rows, so nothing can mistake one for a duplicate', async () => {
    const service = serviceRoleClient();
    await service.from('lifestyle_experiments').insert({
      member_id: memberId,
      title: 'Mind',
      protocol: 'Five minutes of nothing.',
      start_date: '2026-06-01',
      duration_days: 7,
      status: 'completed',
      subject_key: signalSubjectKey('mind'),
    });

    const client = await signInAs(TEST_USERS.memberOne);
    expect(await findActiveExperimentBySubject(client, memberId, signalSubjectKey('mind'))).toBeNull();
  });

  it('an overdue row is not treated as running, so a stale week never locks her out', async () => {
    const service = serviceRoleClient();
    // Stored 'active' but well past its own window: deriveEffectiveStatus
    // reads it as expired, and expireOverdueExperiments writes that back.
    await service.from('lifestyle_experiments').insert({
      member_id: memberId,
      title: 'Body',
      protocol: 'Gentle movement.',
      start_date: '2026-01-01',
      duration_days: 7,
      status: 'active',
      subject_key: signalSubjectKey('body'),
    });

    const client = await signInAs(TEST_USERS.memberOne);
    expect(await findActiveExperimentBySubject(client, memberId, signalSubjectKey('body'))).toBeNull();

    const restarted = await startLifestyleExperiment(client, memberId, {
      recommendationId: null,
      title: 'Body',
      protocol: 'Gentle movement.',
      startDate: today(),
      durationDays: 7,
      sourceExperienceKey: 'life-signal-check',
      subjectKey: signalSubjectKey('body'),
    });
    expect(restarted).not.toBeNull();
    expect(restarted!.startDate).toBe(today());
  });

  it('a row written before migration 216 keeps a null subject_key and is not constrained by the index', async () => {
    const service = serviceRoleClient();
    // Exactly the production shape left alone on purpose: two running
    // experiments for one signal, from two experiences, both predating the
    // column. The index must not have opinions about them.
    const legacy = {
      member_id: memberId,
      title: 'Tension',
      start_date: today(),
      duration_days: 7,
      status: 'active',
      subject_key: null,
    };
    const a = await service
      .from('lifestyle_experiments')
      .insert({ ...legacy, protocol: 'From the Life Signal Check.', source_experience_key: 'life-signal-check' });
    const b = await service
      .from('lifestyle_experiments')
      .insert({ ...legacy, protocol: 'From the Readiness Pulse.', source_experience_key: 'readiness-pulse' });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });
});
