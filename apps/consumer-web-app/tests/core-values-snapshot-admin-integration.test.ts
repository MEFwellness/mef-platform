/**
 * Core Values Snapshot admin testing tools (app/actions/
 * coreValuesSnapshotAdmin.ts) — real RLS, real DB. Server actions can't be
 * called directly here (cookies() needs a real request scope — see
 * tests/setup/test-clients.ts's own header comment), so these tests issue
 * the exact same Supabase queries the actions issue, authenticated as the
 * real seeded users, proving what actually guards this: RLS, not app code.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';

async function cvsDefinitionId(): Promise<string> {
  const service = serviceRoleClient();
  const { data } = await service.from('unified_assessment_definitions').select('id').eq('key', 'core-values-snapshot').single();
  return data!.id as string;
}

const createdSessionIds: string[] = [];
const createdExperimentIds: string[] = [];
const createdNarrativeIds: string[] = [];

afterAll(async () => {
  const service = serviceRoleClient();
  if (createdSessionIds.length > 0) await service.from('unified_assessment_sessions').delete().in('id', createdSessionIds);
  if (createdExperimentIds.length > 0) await service.from('lifestyle_experiments').delete().in('id', createdExperimentIds);
  if (createdNarrativeIds.length > 0) await service.from('narrative_items').delete().in('id', createdNarrativeIds);
});

async function seedSessionFor(memberId: string, status: 'in_progress' | 'completed' = 'completed') {
  const service = serviceRoleClient();
  const definitionId = await cvsDefinitionId();
  const { data, error } = await service
    .from('unified_assessment_sessions')
    .insert({
      member_id: memberId,
      assessment_definition_id: definitionId,
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  createdSessionIds.push(data!.id as string);
  return data!.id as string;
}

async function seedNarrativeFor(memberId: string, sessionId: string, category: string, title: string) {
  const service = serviceRoleClient();
  const { data, error } = await service
    .from('narrative_items')
    .insert({
      member_id: memberId,
      category,
      title,
      summary: 'Test fixture.',
      provenance: 'system_observed',
      status: 'active',
      member_visible: true,
      source_refs: [{ type: 'unified_assessment_session', id: sessionId, note: 'core-values-snapshot' }],
      created_by_actor_type: 'system',
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  createdNarrativeIds.push(data!.id as string);
  return data!.id as string;
}

async function seedExperimentFor(memberId: string, sessionId: string, startDate: string) {
  const service = serviceRoleClient();
  const { data, error } = await service
    .from('lifestyle_experiments')
    .insert({
      member_id: memberId,
      recommendation_id: null,
      source_session_id: sessionId,
      title: 'Health & Energy',
      protocol: 'Test protocol.',
      start_date: startDate,
      duration_days: 7,
      status: 'active',
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  createdExperimentIds.push(data!.id as string);
  return data!.id as string;
}

describe('Core Values Snapshot admin tools — reset (RETAKE)', () => {
  it('an admin can clear one member’s CVS sessions, narrative entries, and experiments without touching another member’s', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const definitionId = await cvsDefinitionId();

    const sessionOne = await seedSessionFor(TEST_USERS.memberOne.id);
    await seedNarrativeFor(TEST_USERS.memberOne.id, sessionOne, 'primary_priorities', `Reset test ${Date.now()}`);
    await seedExperimentFor(TEST_USERS.memberOne.id, sessionOne, '2026-07-20');

    const sessionTwo = await seedSessionFor(TEST_USERS.memberTwo.id);
    const untouchedNarrativeId = await seedNarrativeFor(TEST_USERS.memberTwo.id, sessionTwo, 'primary_priorities', `Untouched ${Date.now()}`);
    const untouchedExperimentId = await seedExperimentFor(TEST_USERS.memberTwo.id, sessionTwo, '2026-07-20');

    // The exact same three deletes resetCvsForMemberAction issues, scoped to memberOne only.
    const { data: deletedSessions } = await admin
      .from('unified_assessment_sessions')
      .delete()
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('assessment_definition_id', definitionId)
      .select('id');
    expect(deletedSessions).toHaveLength(1);

    const { data: deletedNarrative } = await admin
      .from('narrative_items')
      .delete()
      .eq('member_id', TEST_USERS.memberOne.id)
      .contains('source_refs', JSON.stringify([{ note: 'core-values-snapshot' }]))
      .select('id');
    expect(deletedNarrative).toHaveLength(1);

    const { data: deletedExperiments } = await admin
      .from('lifestyle_experiments')
      .delete()
      .eq('member_id', TEST_USERS.memberOne.id)
      .is('recommendation_id', null)
      .select('id');
    expect(deletedExperiments).toHaveLength(1);

    // memberTwo's rows survive untouched.
    const service = serviceRoleClient();
    const { data: survivingNarrative } = await service.from('narrative_items').select('id').eq('id', untouchedNarrativeId).maybeSingle();
    expect(survivingNarrative).not.toBeNull();
    const { data: survivingExperiment } = await service.from('lifestyle_experiments').select('id').eq('id', untouchedExperimentId).maybeSingle();
    expect(survivingExperiment).not.toBeNull();
    // afterAll's cleanup still deletes everything by id, including the
    // already-admin-deleted memberOne rows (a harmless no-op re-delete)
    // and the surviving memberTwo fixtures (real cleanup) — no special
    // bookkeeping needed here.
  });

  it('a non-admin member cannot delete another member’s CVS data — RLS blocks it, not just missing UI', async () => {
    const sessionTwo = await seedSessionFor(TEST_USERS.memberTwo.id);
    const memberOne = await signInAs(TEST_USERS.memberOne);

    const { data: deleted, error } = await memberOne
      .from('unified_assessment_sessions')
      .delete()
      .eq('id', sessionTwo)
      .select('id');

    // RLS silently returns zero affected rows for an update/delete outside
    // the caller's own policy scope (no error, just nothing matched) —
    // same behavior every other RLS test in this suite relies on.
    expect(error).toBeNull();
    expect(deleted).toHaveLength(0);

    const service = serviceRoleClient();
    const { data: stillThere } = await service.from('unified_assessment_sessions').select('id').eq('id', sessionTwo).maybeSingle();
    expect(stillThere).not.toBeNull();
  });
});

describe('Core Values Snapshot admin tools — time-shift', () => {
  it('shifting to day 7 with a mostly-yes pattern classifies as mostly_yes, and patchy classifies as patchy', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const sessionId = await seedSessionFor(TEST_USERS.memberOne.id);
    const experimentId = await seedExperimentFor(TEST_USERS.memberOne.id, sessionId, '2026-07-01');

    const newStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { error: updateError } = await admin
      .from('lifestyle_experiments')
      .update({ start_date: newStart })
      .eq('id', experimentId);
    expect(updateError).toBeNull();

    const mostlyYesPattern: (boolean | null)[] = [true, true, true, true, true, false, null];
    const rows: { experiment_id: string; member_id: string; local_date: string; completed: boolean }[] = [];
    for (let i = 0; i < mostlyYesPattern.length; i++) {
      const completed = mostlyYesPattern[i]!;
      if (completed === null) continue;
      const localDate = new Date(new Date(newStart).getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      rows.push({ experiment_id: experimentId, member_id: TEST_USERS.memberOne.id, local_date: localDate, completed });
    }

    const { error: insertError } = await admin.from('cvs_experiment_daily_logs').insert(rows);
    expect(insertError).toBeNull();

    const { classifyDay7Pattern, daysSinceStart, isDay7Eligible } = await import('../lib/core-values-snapshot/experiment');
    const today = new Date().toISOString().slice(0, 10);
    expect(daysSinceStart(newStart, today)).toBe(7);
    expect(isDay7Eligible(newStart, today)).toBe(true);

    const logs = rows.map((r) => ({ localDate: r.local_date, completed: r.completed, day3Response: null }));
    expect(classifyDay7Pattern(logs, 7).pattern).toBe('mostly_yes');

    const patchyLogs = [true, false, null, null, false, null, null].map((completed, i) => ({
      localDate: `2026-07-0${i + 1}`,
      completed,
      day3Response: null,
    }));
    expect(classifyDay7Pattern(patchyLogs, 7).pattern).toBe('patchy');
  });

  it('clearing prior day-3/day-7 coaching messages for one experiment does not touch another experiment’s messages', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const service = serviceRoleClient();
    const sessionId = await seedSessionFor(TEST_USERS.memberOne.id);
    const experimentId = await seedExperimentFor(TEST_USERS.memberOne.id, sessionId, '2026-07-01');
    const otherExperimentId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    const { error: insertError } = await service.from('member_coaching_messages').insert([
      {
        member_id: TEST_USERS.memberOne.id,
        topic_key: `cvs::${experimentId}::day3`,
        conversation_type: 'cvs_day3_checkin',
        message_text: 'test',
        message_hash: 'test-hash-1',
        source_state: 'cvs_experiment_day3',
      },
      {
        member_id: TEST_USERS.memberOne.id,
        topic_key: `cvs::${otherExperimentId}::day3`,
        conversation_type: 'cvs_day3_checkin',
        message_text: 'test-other',
        message_hash: 'test-hash-2',
        source_state: 'cvs_experiment_day3',
      },
    ]);
    expect(insertError).toBeNull();

    const { data: deleted, error: deleteError } = await admin
      .from('member_coaching_messages')
      .delete()
      .eq('member_id', TEST_USERS.memberOne.id)
      .in('topic_key', [`cvs::${experimentId}::day3`, `cvs::${experimentId}::day7`])
      .select('id');
    expect(deleteError).toBeNull();
    expect(deleted).toHaveLength(1);

    const { data: otherStillThere } = await service
      .from('member_coaching_messages')
      .select('id')
      .eq('topic_key', `cvs::${otherExperimentId}::day3`)
      .maybeSingle();
    expect(otherStillThere).not.toBeNull();

    await service.from('member_coaching_messages').delete().eq('topic_key', `cvs::${otherExperimentId}::day3`);
  });
});
