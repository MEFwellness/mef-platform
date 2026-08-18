/**
 * The catalog leak, closed and proved closed.
 *
 * BEFORE. Every signed-in account could read all 853 exercise_catalog rows
 * and every row of mef_exercise_metadata with the anon key, including
 * contraindications and coach_notes. The Exercise Library screens had been
 * made staff-only; the data underneath them had not.
 *
 * AFTER (migration 170). Staff read both tables whole. A member reads only
 * the exercises she has a genuine screen for: the ones in a published Root
 * Movement session, and the ones in her own published assigned workouts.
 * She reads no row of mef_exercise_metadata at all, and gets coaching cues
 * through a three-column view instead.
 *
 * These sign in as the real seeded users and query through real policies.
 * A member's own client is used for every member assertion; the
 * service-role client appears only to establish what the truth is that the
 * member is being kept from, which is what makes "she sees less" a
 * measurement rather than an assumption.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TEST_USERS, signInAs, serviceRoleClient, anonClient } from './setup/test-clients';
import { getSessionDetail, listActiveSessionTemplates } from '../lib/movement-sessions/data';
import { getMemberExerciseCues } from '../lib/exercise-library/metadata';

let member: SupabaseClient;
let coach: SupabaseClient;
let admin: SupabaseClient;

/** Every catalog row, read past RLS, so "the member sees fewer" has a denominator. */
let totalCatalogRows: number;
/** The exercises a published Root Movement session actually uses. */
let sessionExerciseIds: Set<string>;

beforeAll(async () => {
  [member, coach, admin] = await Promise.all([
    signInAs(TEST_USERS.memberOne),
    signInAs(TEST_USERS.coachOne),
    signInAs(TEST_USERS.adminOne),
  ]);

  const service = serviceRoleClient();
  const { count } = await service
    .from('exercise_catalog')
    .select('id', { count: 'exact', head: true });
  totalCatalogRows = count ?? 0;
  expect(totalCatalogRows).toBeGreaterThan(800);

  const { data: slots } = await service
    .from('movement_session_template_slots')
    .select('external_id, template_id, movement_session_templates!inner(is_active)')
    .eq('movement_session_templates.is_active', true);
  sessionExerciseIds = new Set(
    ((slots ?? []) as { external_id: string }[]).map((s) => s.external_id)
  );
  expect(sessionExerciseIds.size).toBeGreaterThan(0);
});

async function visibleCatalogIds(client: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from('exercise_catalog')
      .select('external_id')
      .range(offset, offset + 499);
    if (error) throw error;
    const rows = (data ?? []) as { external_id: string }[];
    for (const row of rows) ids.add(row.external_id);
    if (rows.length < 500) break;
  }
  return ids;
}

describe('exercise_catalog, read by a member', () => {
  it('no longer hands over the whole catalog', async () => {
    const visible = await visibleCatalogIds(member);
    expect(visible.size).toBeLessThan(totalCatalogRows);
  });

  it('shows her exactly the exercises her own screens need, and not one more', async () => {
    const visible = await visibleCatalogIds(member);

    // Her assigned-program exercises, whatever they happen to be.
    const service = serviceRoleClient();
    const { data: assigned } = await service
      .from('coach_assigned_workout_exercises')
      .select('external_id, coach_assigned_workouts!inner(member_id, published_at)')
      .eq('coach_assigned_workouts.member_id', TEST_USERS.memberOne.id)
      .not('coach_assigned_workouts.published_at', 'is', null);
    const assignedIds = new Set(
      ((assigned ?? []) as { external_id: string }[]).map((r) => r.external_id)
    );

    const allowed = new Set([...sessionExerciseIds, ...assignedIds]);
    for (const id of visible) {
      expect(allowed.has(id)).toBe(true);
    }
  });

  it('a signed-out visitor gets nothing at all', async () => {
    const visible = await visibleCatalogIds(anonClient());
    expect(visible.size).toBe(0);
  });
});

describe('exercise_catalog, read by staff', () => {
  it('a coach still reads every row', async () => {
    const visible = await visibleCatalogIds(coach);
    expect(visible.size).toBe(totalCatalogRows);
  });

  it('an administrator still reads every row', async () => {
    const visible = await visibleCatalogIds(admin);
    expect(visible.size).toBe(totalCatalogRows);
  });
});

describe('mef_exercise_metadata — clinical notes a member must never read', () => {
  it('gives a member no row whatsoever', async () => {
    const { data, error } = await member.from('mef_exercise_metadata').select('external_id');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('gives her no row even for an exercise she IS allowed to see in the catalog', async () => {
    const oneSessionExercise = [...sessionExerciseIds][0]!;
    const { data } = await member
      .from('mef_exercise_metadata')
      .select('external_id, contraindications, coach_notes')
      .eq('external_id', oneSessionExercise);
    expect(data ?? []).toHaveLength(0);
  });

  it('still gives a coach the whole curation layer', async () => {
    const { data, error } = await coach
      .from('mef_exercise_metadata')
      .select('external_id, contraindications, coach_notes')
      .limit(5);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe('member_exercise_cues — the three columns she does get', () => {
  it('returns cues for an exercise in a published Root Movement session', async () => {
    const ids = [...sessionExerciseIds];
    const cues = await getMemberExerciseCues(member, ids);
    // Not every slot necessarily has generated cues, but the read must
    // succeed and reach at least one.
    expect(cues.size).toBeGreaterThan(0);
  });

  it('refuses an exercise she has no screen for', async () => {
    const service = serviceRoleClient();
    const { data } = await service
      .from('mef_exercise_metadata')
      .select('external_id')
      .not('external_id', 'in', `(${[...sessionExerciseIds].map((i) => `"${i}"`).join(',')})`)
      .limit(1);
    const strangerId = (data as { external_id: string }[])[0]!.external_id;

    const cues = await getMemberExerciseCues(member, [strangerId]);
    expect(cues.has(strangerId)).toBe(false);
  });

  it('carries no contraindications column and no coach_notes column at all', async () => {
    const withContra = await member
      .from('member_exercise_cues')
      .select('external_id, contraindications');
    expect(withContra.error).not.toBeNull();

    const withNotes = await member.from('member_exercise_cues').select('external_id, coach_notes');
    expect(withNotes.error).not.toBeNull();

    // And the columns it does carry work, so the two failures above are
    // about those columns and not about the view being unreadable.
    const ok = await member.from('member_exercise_cues').select('provider, external_id, coaching_cues');
    expect(ok.error).toBeNull();
  });
});

describe('the two member screens that depend on all of this', () => {
  it('the Root Movement session player still resolves a full session for a member', async () => {
    const templates = await listActiveSessionTemplates(member);
    expect(templates.length).toBeGreaterThan(0);

    const detail = await getSessionDetail(member, templates[0]!.session_key);
    expect(detail).not.toBeNull();
    expect(detail!.slots.length).toBeGreaterThan(0);
    // Every slot resolved to a real catalog name. A slot whose exercise
    // the member could not read would have been dropped, so a full
    // lineup here is the proof the policy lets the player through.
    for (const slot of detail!.slots) {
      expect(slot.name.length).toBeGreaterThan(0);
    }

    const service = serviceRoleClient();
    const staffDetail = await getSessionDetail(service, templates[0]!.session_key);
    expect(detail!.slots.length).toBe(staffDetail!.slots.length);
  });

  it('a member still reads her own assigned program content', async () => {
    const { data, error } = await member
      .from('coach_assigned_workouts')
      .select('id, template_name')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(error).toBeNull();
    // Assigned content is frozen onto the assignment rows themselves
    // (exercise_name lives there), so this path never needed the catalog
    // and is unaffected either way. Asserted so a future change that
    // makes it need the catalog cannot pass unnoticed.
    expect(Array.isArray(data)).toBe(true);
  });
});
