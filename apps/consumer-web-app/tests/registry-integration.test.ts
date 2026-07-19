/**
 * End-to-end tests for the Universal Metric & Finding Registry
 * (lib/registry/*) against real local Supabase — real RLS, no mocked
 * client, same philosophy as tests/intelligence-core-integration.test.ts.
 * Exercises the registry directly (insert/supersede/dedup/RLS), separate
 * from the full publish cascade covered by
 * tests/health-profile-orchestration-integration.test.ts.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  insertRegistryEntry,
  findActiveRegistryEntry,
  listRegistryEntriesForMember,
} from '../lib/registry/data';
import type { RegistryEntryDraft } from '../lib/registry/types';

const memberId = TEST_USERS.memberOne.id;

function metricDraft(overrides: Partial<RegistryEntryDraft> = {}): RegistryEntryDraft {
  return {
    entry_kind: 'metric',
    domain: 'wearable',
    code: 'resting_heart_rate',
    label: 'Resting heart rate',
    severity: null,
    numeric_value: 58,
    unit: 'bpm',
    confidence: 0.9,
    narrative: null,
    evidence_refs: [{ type: 'wearable_sync', id: 'sync-1' }],
    source_feature: 'body_assessment_finding',
    source_record_id: '00000000-0000-0000-0000-000000000001',
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    recorded_at: new Date().toISOString(),
    ...overrides,
  };
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('registry_entries').delete().eq('member_id', memberId);
});

describe('Universal Registry — insert, dedup, supersede, RLS', () => {
  it('insertRegistryEntry writes a metric entry and findActiveRegistryEntry finds it', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const entry = await insertRegistryEntry(coachClient, memberId, metricDraft());
    expect(entry).not.toBeNull();
    expect(entry!.entry_kind).toBe('metric');
    expect(entry!.numeric_value).toBe(58);

    const active = await findActiveRegistryEntry(
      coachClient,
      memberId,
      'wearable',
      'resting_heart_rate'
    );
    expect(active).not.toBeNull();
    expect(active!.id).toBe(entry!.id);
  }, 30_000);

  it('inserting with supersedesId marks the old row superseded and the new row active', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const first = await insertRegistryEntry(
      coachClient,
      memberId,
      metricDraft({ code: 'sleep_efficiency', numeric_value: 80 })
    );
    const second = await insertRegistryEntry(
      coachClient,
      memberId,
      metricDraft({ code: 'sleep_efficiency', numeric_value: 92 }),
      { supersedesId: first!.id }
    );

    const { data: oldRow } = await coachClient
      .from('registry_entries')
      .select('*')
      .eq('id', first!.id)
      .single();
    expect(oldRow!.status).toBe('superseded');
    expect(oldRow!.superseded_by_id).toBe(second!.id);

    const active = await findActiveRegistryEntry(
      coachClient,
      memberId,
      'wearable',
      'sleep_efficiency'
    );
    expect(active!.id).toBe(second!.id);
  }, 30_000);

  it('a member-invisible (coach-only) entry is findable by findActiveRegistryEntry under the coach session, dedup by (domain, code)', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const entry = await insertRegistryEntry(
      coachClient,
      memberId,
      metricDraft({ code: 'coach_only_metric', member_visible: false })
    );
    expect(entry).not.toBeNull();

    const active = await findActiveRegistryEntry(
      coachClient,
      memberId,
      'wearable',
      'coach_only_metric'
    );
    expect(active!.id).toBe(entry!.id);
  }, 30_000);

  it('RLS: a member reads only their own member_visible + active entries', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const coachClient = await signInAs(TEST_USERS.coachOne);

    await insertRegistryEntry(
      coachClient,
      memberId,
      metricDraft({ code: 'visible_metric', member_visible: true })
    );
    await insertRegistryEntry(
      coachClient,
      memberId,
      metricDraft({ code: 'hidden_metric', member_visible: false })
    );

    const { data, error } = await memberClient
      .from('registry_entries')
      .select('code')
      .eq('member_id', memberId);
    expect(error).toBeNull();
    const codes = data!.map((r) => r.code);
    expect(codes).toContain('visible_metric');
    expect(codes).not.toContain('hidden_metric');
  }, 30_000);

  it("RLS: an unassigned member (memberTwo) cannot read or write memberOne's registry entries", async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);

    const { data, error } = await memberTwoClient
      .from('registry_entries')
      .select('*')
      .eq('member_id', memberId);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { error: insertError } = await memberTwoClient.from('registry_entries').insert({
      member_id: memberId,
      entry_kind: 'metric',
      domain: 'wearable',
      code: 'malicious_insert',
      label: 'x',
      confidence: 0.5,
      source_feature: 'body_assessment_finding',
      source_record_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(insertError).not.toBeNull();
  }, 30_000);

  it('listRegistryEntriesForMember filters by status', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const entries = await listRegistryEntriesForMember(coachClient, memberId, {
      statusFilter: ['active'],
    });
    expect(entries.every((e) => e.status === 'active')).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  }, 30_000);
});
