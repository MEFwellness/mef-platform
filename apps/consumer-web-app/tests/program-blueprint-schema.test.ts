/**
 * The blueprint store itself, against real local Supabase. No mocks.
 *
 * What this proves:
 *   1. The seed blueprint exists, is a DRAFT, and is complete: three
 *      weekly sessions, every slot filled.
 *   2. THE ONE RULE (migration 170) holds for every blueprint slot in the
 *      table, not just the seed's: a filled slot points at an exercise a
 *      member can be shown how to do. This test is the guard that fails
 *      the build the day somebody seeds a slot pointing at an exercise
 *      with no video.
 *   3. Priority ranks are real data: unique and contiguous from 1 within
 *      each session, so "the highest priority N slots" is always a
 *      sensible shortened session rather than an arbitrary subset.
 *   4. Every per-week override names a week the program actually has, and
 *      only changes fields a progression is allowed to change.
 *   5. RLS: a member, and a signed-out visitor, read NOTHING from any
 *      blueprint or slot table. A coach and an admin read them.
 */
import { describe, it, expect } from 'vitest';
import { anonClient, serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  getBlueprintByKey,
  sessionDesignationsOf,
  shortenedSession,
  slotsForSession,
} from '../lib/programs/blueprints/data';
import type { ProgramBlueprintSlot } from '@mef/shared-types-contracts';

const SEED_KEY = 'home_dumbbell_foundation';

/** The only fields a per-week progression may change. Anything else would make week 3 a different program. */
const OVERRIDABLE_FIELDS = ['sets', 'reps', 'hold_duration_seconds', 'tempo', 'rest_seconds'];

describe('the seed blueprint', () => {
  it('exists as a draft, four weeks, three sessions a week, home equipment', async () => {
    const supabase = serviceRoleClient();
    const blueprint = await getBlueprintByKey(supabase, SEED_KEY);
    expect(blueprint).not.toBeNull();
    expect(blueprint!.status).toBe('draft');
    expect(blueprint!.version_number).toBe(1);
    expect(blueprint!.duration_weeks).toBe(4);
    expect(blueprint!.sessions_per_week).toBe(3);
    expect(blueprint!.equipment_mode).toBe('home');
    expect(blueprint!.member_title).toBe('Home Dumbbell Foundation');
    expect(blueprint!.member_description).toBeTruthy();
    expect(blueprint!.approved_at).toBeNull();
    expect(blueprint!.approved_by).toBeNull();
  });

  it('has three weekly sessions and every slot is filled', async () => {
    const supabase = serviceRoleClient();
    const blueprint = await getBlueprintByKey(supabase, SEED_KEY);
    const sessions = sessionDesignationsOf(blueprint!.slots);
    expect(sessions).toEqual(['A', 'B', 'C']);

    for (const slot of blueprint!.slots) {
      expect(slot.provider).toBe('your_move');
      expect(slot.external_id).toBeTruthy();
      expect(slot.exercise_name).toBeTruthy();
    }
  });

  it('follows the MEF sequence in slot order within every session', async () => {
    const supabase = serviceRoleClient();
    const blueprint = await getBlueprintByKey(supabase, SEED_KEY);
    const order = ['release', 'mobility', 'stability', 'strength', 'core'];

    for (const session of sessionDesignationsOf(blueprint!.slots)) {
      const blocks = slotsForSession(blueprint!.slots, session).map((s) => order.indexOf(s.block));
      const sorted = blocks.slice().sort((a, b) => a - b);
      expect(blocks).toEqual(sorted);
    }
  });

  it('prescribes something on every single slot', async () => {
    const supabase = serviceRoleClient();
    const blueprint = await getBlueprintByKey(supabase, SEED_KEY);
    for (const slot of blueprint!.slots) {
      expect(slot.sets).toBeGreaterThan(0);
      // Either reps or a hold, never neither. (Never both is asserted by
      // the materializer's own test.)
      const hasVolume = slot.reps !== null || slot.hold_duration_seconds !== null;
      expect(hasVolume, `${slot.session_designation}${slot.slot_order} ${slot.exercise_name}`).toBe(
        true
      );
    }
  });

  it('changes something real in week 3, and only in weeks the program has', async () => {
    const supabase = serviceRoleClient();
    const blueprint = await getBlueprintByKey(supabase, SEED_KEY);

    const withOverrides = blueprint!.slots.filter(
      (s) => Object.keys(s.week_overrides ?? {}).length > 0
    );
    expect(withOverrides.length).toBeGreaterThan(0);

    for (const slot of withOverrides) {
      for (const [week, patch] of Object.entries(slot.week_overrides)) {
        const weekNumber = Number(week);
        expect(Number.isInteger(weekNumber)).toBe(true);
        expect(weekNumber).toBeGreaterThanOrEqual(1);
        expect(weekNumber).toBeLessThanOrEqual(blueprint!.duration_weeks!);
        for (const field of Object.keys(patch)) {
          expect(OVERRIDABLE_FIELDS).toContain(field);
        }
      }
    }

    // The main lift of each session gains a set in week 3, which is the
    // progression the blueprint claims in its own description.
    const week3Sets = withOverrides.filter((s) => s.week_overrides['3']?.sets !== undefined);
    expect(week3Sets).toHaveLength(3);
    for (const slot of week3Sets) {
      expect(slot.block).toBe('strength');
      expect(slot.priority_rank).toBe(1);
      expect(slot.week_overrides['3']!.sets).toBe((slot.sets ?? 0) + 1);
    }
  });
});

describe('every blueprint slot ever seeded', () => {
  it('points at a client-assignable exercise', async () => {
    const supabase = serviceRoleClient();
    const { data: slots, error } = await supabase
      .from('program_blueprint_slots')
      .select('id, session_designation, slot_order, exercise_name, provider, external_id')
      .not('external_id', 'is', null);
    expect(error).toBeNull();
    expect((slots ?? []).length).toBeGreaterThan(0);

    const { data: catalog, error: catalogError } = await supabase
      .from('exercise_catalog')
      .select('provider, external_id, is_client_assignable')
      .in(
        'external_id',
        (slots ?? []).map((s) => s.external_id as string)
      );
    expect(catalogError).toBeNull();

    const assignable = new Map(
      (catalog ?? []).map((c) => [`${c.provider}:${c.external_id}`, c.is_client_assignable])
    );

    const offenders = (slots ?? []).filter(
      (s) => assignable.get(`${s.provider}:${s.external_id}`) !== true
    );
    expect(
      offenders.map((o) => `${o.session_designation}${o.slot_order} ${o.exercise_name}`)
    ).toEqual([]);
  });

  it('has priority ranks that are unique and contiguous from 1 within each session', async () => {
    const supabase = serviceRoleClient();
    const { data, error } = await supabase
      .from('program_blueprint_slots')
      .select('program_version_id, session_designation, priority_rank');
    expect(error).toBeNull();

    const bySession = new Map<string, number[]>();
    for (const row of (data ?? []) as Pick<
      ProgramBlueprintSlot,
      'program_version_id' | 'session_designation' | 'priority_rank'
    >[]) {
      const key = `${row.program_version_id}:${row.session_designation}`;
      bySession.set(key, [...(bySession.get(key) ?? []), row.priority_rank]);
    }

    expect(bySession.size).toBeGreaterThan(0);
    for (const [key, ranks] of bySession) {
      const sorted = ranks.slice().sort((a, b) => a - b);
      expect(sorted, key).toEqual(Array.from({ length: ranks.length }, (_, i) => i + 1));
    }
  });

  it('makes a shortened session that keeps the main lift and drops the extras', async () => {
    const supabase = serviceRoleClient();
    const blueprint = await getBlueprintByKey(supabase, SEED_KEY);
    const short = shortenedSession(blueprint!.slots, 'A', 4);

    expect(short).toHaveLength(4);
    // Still in walking order, not in priority order.
    expect(short.map((s) => s.slot_order)).toEqual(
      short.map((s) => s.slot_order).slice().sort((a, b) => a - b)
    );
    // The blocks a four slot session should keep.
    expect(short.map((s) => s.block)).toContain('strength');
    expect(short.map((s) => s.block)).toContain('core');
    expect(short.every((s) => s.priority_rank <= 4)).toBe(true);
  });
});

describe('who may read a blueprint', () => {
  const TABLES = ['movement_programs', 'movement_program_versions', 'program_blueprint_slots'];

  it('a member reads nothing from any blueprint table', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    for (const table of TABLES) {
      const { data, error } = await member.from(table).select('*');
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it('a signed-out visitor reads nothing either', async () => {
    const anon = anonClient();
    for (const table of TABLES) {
      const { data } = await anon.from(table).select('*');
      expect(data ?? [], table).toEqual([]);
    }
  });

  it('a coach reads them, and an admin reads them', async () => {
    for (const user of [TEST_USERS.coachOne, TEST_USERS.adminOne]) {
      const client = await signInAs(user);
      for (const table of TABLES) {
        const { data, error } = await client.from(table).select('*');
        expect(error, `${user.email} ${table}`).toBeNull();
        expect((data ?? []).length, `${user.email} ${table}`).toBeGreaterThan(0);
      }
    }
  });

  it('a member cannot write a blueprint slot either', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { error } = await member.from('program_blueprint_slots').insert({
      program_version_id: '00000000-0000-0000-0000-000000000000',
      session_designation: 'A',
      slot_order: 1,
      block: 'strength',
      priority_rank: 1,
    });
    expect(error).not.toBeNull();
  });

  it('a coach cannot write a blueprint: blueprints are MEF owned', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const { error } = await coach
      .from('movement_programs')
      .insert({ key: 'coach_invented_program', display_name: 'Coach invented' });
    expect(error).not.toBeNull();
  });
});
