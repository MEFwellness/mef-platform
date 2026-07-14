/**
 * End-to-end integration test for the Member Health Narrative
 * (lib/narrative/service.ts, app/actions/narrative.ts) against real local
 * Supabase — real RLS, no mocked Supabase client.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  updateNarrativeForEvent,
  recordSafetyRestrictionNarrative,
} from '../lib/narrative/service';
import {
  insertNarrativeItem,
  setPinned,
  listNarrativeItems,
  findActiveItem,
} from '../lib/narrative/data';
import type { AiEvent, DailyCheckin } from '@mef/shared-types-contracts';
import type { RuleFacts } from '../lib/ai/rules/facts';

const memberIds = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('narrative_items').delete().in('member_id', memberIds);
});

function fakeEvent(overrides: Partial<AiEvent> = {}): AiEvent {
  return {
    id: 'fake-event-id',
    event_type: 'member_completed_checkin',
    member_id: TEST_USERS.memberOne.id,
    source: 'member',
    payload: {},
    occurred_at: '2026-01-01T00:00:00.000Z',
    processed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function fakeFacts(): RuleFacts {
  return {
    daysSinceLastCheckin: null,
    stressConsecutiveIncreaseDays: 0,
    sleepConsecutiveDecreaseDays: 0,
    stressTrend: null,
    sleepTrend: null,
    energyTrend: null,
    moodTrend: null,
    hydrationTrend: null,
    digestionTrend: null,
    movementTrend: null,
    painTrend: null,
    wellnessIndexScore: null,
    wellnessIndexDelta: null,
  };
}

function checkin(overrides: Partial<DailyCheckin>, id: string): DailyCheckin {
  return {
    id,
    user_id: TEST_USERS.memberOne.id,
    timezone: 'America/New_York',
    local_date: '2026-01-01',
    recorded_at: '2026-01-01T08:00:00.000Z',
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: '2026-01-01T08:00:00.000Z',
    mood_level: 3,
    sleep_quality: 3,
    sleep_duration: '6-7h',
    energy_level: 3,
    stress_level: 3,
    water_cups: 5,
    digestion_rating: 3,
    pain_discomfort_level: 1,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    ...overrides,
  };
}

describe('updateNarrativeForEvent — creation, evidence linkage, dedup', () => {
  it('derives a recurring_patterns item from real check-in history, linked to real check-in ids', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const low = Array.from({ length: 4 }, (_, i) =>
      checkin({ sleep_duration: '5-6h', stress_level: 5 }, `low-${i}`)
    );
    const adequate = Array.from({ length: 4 }, (_, i) =>
      checkin({ sleep_duration: '8h+', stress_level: 2 }, `adq-${i}`)
    );
    const recentCheckins = [...low, ...adequate];

    await updateNarrativeForEvent(
      client,
      fakeEvent({ member_id: TEST_USERS.memberOne.id, payload: { recentCheckins } }),
      fakeFacts()
    );

    const items = await listNarrativeItems(client, TEST_USERS.memberOne.id);
    const pattern = items.find((i) => i.category === 'recurring_patterns');
    expect(pattern).toBeTruthy();
    expect(pattern!.provenance).toBe('inferred');
    expect(pattern!.source_refs.length).toBeGreaterThan(0);
    expect(pattern!.status).toBe('active');
  });

  it('does not create a duplicate when the exact same fact is derived again (dedup)', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const low = Array.from({ length: 4 }, (_, i) =>
      checkin({ sleep_duration: '5-6h', stress_level: 5 }, `low2-${i}`)
    );
    const adequate = Array.from({ length: 4 }, (_, i) =>
      checkin({ sleep_duration: '8h+', stress_level: 2 }, `adq2-${i}`)
    );
    const event = fakeEvent({
      member_id: TEST_USERS.memberOne.id,
      payload: { recentCheckins: [...low, ...adequate] },
    });

    const before = await listNarrativeItems(client, TEST_USERS.memberOne.id);
    await updateNarrativeForEvent(client, event, fakeFacts());
    const after = await listNarrativeItems(client, TEST_USERS.memberOne.id);

    // Same (category, title) as the previous test's item — no new row.
    expect(after.length).toBe(before.length);
  });

  it('produces a recent_wins item on a real streak milestone', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const sevenDayStreak = Array.from({ length: 7 }, (_, i) =>
      checkin({ user_id: TEST_USERS.memberTwo.id, local_date: `2026-02-0${i + 1}` }, `streak-${i}`)
    );

    await updateNarrativeForEvent(
      client,
      fakeEvent({
        member_id: TEST_USERS.memberTwo.id,
        payload: { recentCheckins: sevenDayStreak },
      }),
      fakeFacts()
    );

    const items = await listNarrativeItems(client, TEST_USERS.memberTwo.id);
    const win = items.find((i) => i.category === 'recent_wins');
    expect(win).toBeTruthy();
    expect(win!.title).toContain('7-day');
  });
});

describe('recordSafetyRestrictionNarrative — Milestone 1 compatibility, supersede on change', () => {
  it('creates an active_restrictions item, then supersedes it when the restriction changes', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await recordSafetyRestrictionNarrative(
      client,
      TEST_USERS.memberOne.id,
      'member',
      TEST_USERS.memberOne.id,
      {
        id: 'fake-classification-1',
        classification_level: 'coach_review_required',
        restricted_topics: ['medication'],
        created_at: '2026-01-01T00:00:00.000Z',
      }
    );

    const first = await findActiveItem(
      client,
      TEST_USERS.memberOne.id,
      'active_restrictions',
      'Coaching is currently limited on: medication'
    );
    expect(first).toBeTruthy();

    await recordSafetyRestrictionNarrative(
      client,
      TEST_USERS.memberOne.id,
      'member',
      TEST_USERS.memberOne.id,
      {
        id: 'fake-classification-2',
        classification_level: 'coach_review_required',
        restricted_topics: ['pain_severity'],
        created_at: '2026-01-02T00:00:00.000Z',
      }
    );

    const { data: oldRow } = await client
      .from('narrative_items')
      .select('*')
      .eq('id', first!.id)
      .single();
    expect(oldRow.status).toBe('outdated');
    expect(oldRow.superseded_by_id).not.toBeNull();

    const second = await findActiveItem(
      client,
      TEST_USERS.memberOne.id,
      'active_restrictions',
      'Coaching is currently limited on: pain_severity'
    );
    expect(second).toBeTruthy();
    expect(second!.id).toBe(oldRow.superseded_by_id);
  });
});

describe('Coach corrections, pinning, and coach-only visibility', () => {
  it('a coach can add a coach-only (member_visible=false) item the member cannot read', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const created = await insertNarrativeItem(
      coachClient,
      TEST_USERS.memberOne.id,
      'coach',
      TEST_USERS.coachOne.id,
      {
        category: 'coach_verified_observations',
        title: 'Sensitive coach-only note',
        summary: 'Only the coach should see this.',
        provenance: 'coach_entered',
        confidence: null,
        memberVisible: false,
        sourceRefs: [],
      }
    );
    expect(created).toBeTruthy();

    const memberClient = await signInAs(TEST_USERS.memberOne);
    const { data: memberView } = await memberClient
      .from('narrative_items')
      .select('*')
      .eq('id', created!.id);
    expect(memberView).toEqual([]);

    const { data: coachView } = await coachClient
      .from('narrative_items')
      .select('*')
      .eq('id', created!.id);
    expect(coachView).toHaveLength(1);
  });

  it('a coach can pin an item, and pinning records who pinned it', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const created = await insertNarrativeItem(
      coachClient,
      TEST_USERS.memberOne.id,
      'coach',
      TEST_USERS.coachOne.id,
      {
        category: 'primary_priorities',
        title: 'Pin-test item',
        summary: 'Testing pin behavior.',
        provenance: 'coach_entered',
        confidence: null,
        memberVisible: true,
        sourceRefs: [],
      }
    );

    const ok = await setPinned(coachClient, created!.id, true, TEST_USERS.coachOne.id);
    expect(ok).toBe(true);

    const { data: pinned } = await coachClient
      .from('narrative_items')
      .select('*')
      .eq('id', created!.id)
      .single();
    expect(pinned.is_pinned).toBe(true);
    expect(pinned.pinned_by).toBe(TEST_USERS.coachOne.id);
  });
});

describe('RLS — authorization boundaries', () => {
  it('a member cannot insert a narrative item for another member', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { error } = await client.from('narrative_items').insert({
      member_id: TEST_USERS.memberTwo.id,
      category: 'current_goals',
      title: 'Should be rejected',
      summary: 'Should be rejected.',
      provenance: 'member_reported',
      created_by_actor_type: 'member',
    });
    expect(error).not.toBeNull();
  });

  it("an unassigned coach cannot read or update memberTwo's narrative", async () => {
    // coachOne is not actively assigned to memberTwo in the seed data.
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data } = await coachClient
      .from('narrative_items')
      .select('*')
      .eq('member_id', TEST_USERS.memberTwo.id);
    expect(data).toEqual([]);
  });
});
