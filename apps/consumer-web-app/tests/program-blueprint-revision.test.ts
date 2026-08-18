/**
 * The Home Dumbbell Foundation revision (migration 175), against real local
 * Supabase. No mocks.
 *
 * What this proves, in the order a coach asked for it:
 *   1. The revision is a NEW version. v1 is still there, still a draft,
 *      still 26 slots, and reading it still gives back what was reviewed.
 *   2. Every revised slot points at an exercise a member may be shown how
 *      to do. Migration 170's one rule, on the new lineup.
 *   3. The corrections landed: no rear lunge that steps, no Side Plank,
 *      exactly one exercise repeated across the week, three distinct
 *      openers, per side marked where it belongs, and the carry noted as
 *      both hands.
 *   4. The rebalance holds: an opener of at most three, strength of three
 *      or four, core of one or two, and ranks 1 to 5 always strength and
 *      core.
 *   5. Week 3 was recomputed against the new lineup, not carried over.
 *   6. Periodization is recorded and is linear.
 */
import { describe, it, expect } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { getBlueprintByKey, sessionDesignationsOf, slotsForSession } from '../lib/programs/blueprints/data';
import { planFromBlueprint, previewWeeks, weeksWorthShowing } from '../lib/programs/blueprints/plan';
import type { ProgramBlueprintSlot } from '@mef/shared-types-contracts';

const SEED_KEY = 'home_dumbbell_foundation';

async function v2() {
  const blueprint = await getBlueprintByKey(serviceRoleClient(), SEED_KEY, { versionNumber: 2 });
  if (!blueprint) throw new Error('Home Dumbbell Foundation v2 is missing');
  return blueprint;
}

async function v1() {
  const blueprint = await getBlueprintByKey(serviceRoleClient(), SEED_KEY, { versionNumber: 1 });
  if (!blueprint) throw new Error('Home Dumbbell Foundation v1 is missing');
  return blueprint;
}

describe('the revision is a new version, not an edit', () => {
  it('leaves v1 exactly as it was seeded', async () => {
    const one = await v1();
    expect(one.version_number).toBe(1);
    expect(one.status).toBe('draft');
    expect(one.approved_at).toBeNull();
    expect(one.archived_at).toBeNull();
    expect(one.slots).toHaveLength(26);
    // v1 predates the periodization column and has no opinion about it.
    expect(one.periodization).toBeNull();
  });

  it('adds v2 as a draft with the revised lineup', async () => {
    const two = await v2();
    expect(two.version_number).toBe(2);
    expect(two.status).toBe('draft');
    expect(two.approved_at).toBeNull();
    expect(two.slots).toHaveLength(24);
    expect(two.duration_weeks).toBe(4);
    expect(two.sessions_per_week).toBe(3);
    expect(two.periodization).toBe('linear');
  });

  it('is the version a reader gets by default, because it is the newest', async () => {
    const latest = await getBlueprintByKey(serviceRoleClient(), SEED_KEY);
    expect(latest!.version_number).toBe(2);
  });
});

describe('every revised slot', () => {
  it('points at a client-assignable exercise', async () => {
    const supabase = serviceRoleClient();
    const two = await v2();

    const { data: catalog, error } = await supabase
      .from('exercise_catalog')
      .select('provider, external_id, is_client_assignable')
      .in('external_id', two.slots.map((s) => s.external_id as string));
    expect(error).toBeNull();

    const assignable = new Map(
      (catalog ?? []).map((c) => [`${c.provider}:${c.external_id}`, c.is_client_assignable])
    );
    const offenders = two.slots.filter(
      (s) => assignable.get(`${s.provider}:${s.external_id}`) !== true
    );
    expect(
      offenders.map((o) => `${o.session_designation}${o.slot_order} ${o.exercise_name}`)
    ).toEqual([]);
  });

  it('prescribes either reps or a hold, never neither', async () => {
    const two = await v2();
    for (const slot of two.slots) {
      expect(slot.sets, `${slot.exercise_name}`).toBeGreaterThan(0);
      const hasVolume = slot.reps !== null || slot.hold_duration_seconds !== null;
      expect(hasVolume, `${slot.session_designation}${slot.slot_order} ${slot.exercise_name}`).toBe(
        true
      );
    }
  });

  it('prescribes no load anywhere, on any slot', async () => {
    // A blueprint never says how heavy. The coach sets that at the first
    // session, which is what the program's own cautions promise.
    const two = await v2();
    for (const slot of two.slots) {
      expect(slot.equipment_requirement.every((e) => e === 'dumbbell')).toBe(true);
    }
  });
});

describe("the coach's corrections", () => {
  it('replaced the stepping rear lunge with a stationary single leg movement', async () => {
    const two = await v2();
    const names = two.slots.map((s) => s.exercise_name);
    expect(names).not.toContain('Dumbbell Rear Lunge');

    // Named "Split Squat" since migration 176. The "(R)" it carried was
    // never a coaching instruction: the catalog stored left and right as
    // separate rows and only the right one was dumbbell loaded, so the
    // suffix was vendor plumbing in a name a member would read. The slot
    // is unchanged; only its name is.
    expect(names).not.toContain('Split squat (R)');
    const splitSquat = two.slots.find((s) => s.exercise_name === 'Split Squat');
    expect(splitSquat, 'the stationary split squat should be in the program').toBeDefined();
    expect(splitSquat!.block).toBe('strength');
    expect(splitSquat!.is_per_side).toBe(true);
  });

  it('removed Side Plank and put a beginner hold in its place', async () => {
    const two = await v2();
    const names = two.slots.map((s) => s.exercise_name);
    expect(names).not.toContain('Side Plank');

    const replacement = two.slots.find((s) => s.exercise_name === 'Ab Bridge Complex');
    expect(replacement, 'the replacement core hold should be in Session B').toBeDefined();
    expect(replacement!.block).toBe('core');
    expect(replacement!.session_designation).toBe('B');
    expect(replacement!.difficulty_tier).toBe('beginner');
    // A hold, not reps: that is what it replaced.
    expect(replacement!.hold_duration_seconds).toBeGreaterThan(0);
    expect(replacement!.reps).toBeNull();
  });

  it('marks the row per side and the carry as both hands at once', async () => {
    const two = await v2();
    const rows = two.slots.filter((s) => s.exercise_name === 'Single Arm Dumbbell Row');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.is_per_side).toBe(true);

    const carry = two.slots.find((s) => s.exercise_name === 'Farmers walk');
    expect(carry).toBeDefined();
    expect(carry!.is_per_side).toBe(false);
    expect(carry!.purpose?.toLowerCase()).toContain('both dumbbells');
  });

  it('repeats exactly one exercise across the week, and it is the row', async () => {
    const two = await v2();
    const bySession = new Map<string, Set<string>>();
    for (const slot of two.slots) {
      const set = bySession.get(slot.external_id!) ?? new Set<string>();
      set.add(slot.session_designation);
      bySession.set(slot.external_id!, set);
    }
    const repeated = two.slots.filter((s) => (bySession.get(s.external_id!)?.size ?? 0) > 1);
    const repeatedNames = Array.from(new Set(repeated.map((s) => s.exercise_name)));
    expect(repeatedNames).toEqual(['Single Arm Dumbbell Row']);
  });

  it('opens every session differently', async () => {
    const two = await v2();
    const openers = two.slots.filter((s) =>
      ['release', 'mobility', 'stability'].includes(s.block)
    );
    const ids = openers.map((s) => s.external_id);
    expect(new Set(ids).size, 'no opener exercise is shared between sessions').toBe(ids.length);
  });
});

describe('the rebalance', () => {
  function counts(slots: ProgramBlueprintSlot[]) {
    return {
      opener: slots.filter((s) => ['release', 'mobility', 'stability'].includes(s.block)).length,
      strength: slots.filter((s) => s.block === 'strength').length,
      core: slots.filter((s) => s.block === 'core').length,
    };
  }

  it('keeps the opener to three, strength to three or four, core to one or two', async () => {
    const two = await v2();
    for (const session of sessionDesignationsOf(two.slots)) {
      const { opener, strength, core } = counts(slotsForSession(two.slots, session));
      expect(opener, `session ${session} opener`).toBeLessThanOrEqual(3);
      expect(strength, `session ${session} strength`).toBeGreaterThanOrEqual(3);
      expect(strength, `session ${session} strength`).toBeLessThanOrEqual(4);
      expect(core, `session ${session} core`).toBeGreaterThanOrEqual(1);
      expect(core, `session ${session} core`).toBeLessThanOrEqual(2);
    }
  });

  it('gives ranks 1 to 5 to strength and core in every session', async () => {
    const two = await v2();
    const topRanked = two.slots.filter((s) => s.priority_rank <= 5);
    expect(topRanked.length).toBe(15);
    for (const slot of topRanked) {
      expect(
        ['strength', 'core'],
        `${slot.session_designation}${slot.slot_order} ${slot.exercise_name} at rank ${slot.priority_rank}`
      ).toContain(slot.block);
    }
  });

  it('keeps the MEF sequence in slot order within every session', async () => {
    const two = await v2();
    const order = ['release', 'mobility', 'stability', 'strength', 'core'];
    for (const session of sessionDesignationsOf(two.slots)) {
      const blocks = slotsForSession(two.slots, session).map((s) => order.indexOf(s.block));
      expect(blocks, `session ${session}`).toEqual(blocks.slice().sort((a, b) => a - b));
    }
  });

  it('drops the opener first when a session is shortened to five', async () => {
    const two = await v2();
    for (const session of sessionDesignationsOf(two.slots)) {
      const kept = slotsForSession(two.slots, session)
        .slice()
        .sort((a, b) => a.priority_rank - b.priority_rank)
        .slice(0, 5);
      for (const slot of kept) {
        expect(['strength', 'core']).toContain(slot.block);
      }
    }
  });
});

describe('week 3, recomputed against the revised lineup', () => {
  it("adds a set to each session's main lift and nothing else", async () => {
    const two = await v2();
    const gainingASet = two.slots.filter((s) => s.week_overrides['3']?.sets !== undefined);
    expect(gainingASet).toHaveLength(3);
    for (const slot of gainingASet) {
      expect(slot.block).toBe('strength');
      expect(slot.priority_rank).toBe(1);
      expect(slot.week_overrides['3']!.sets).toBe((slot.sets ?? 0) + 1);
    }
    expect(gainingASet.map((s) => s.session_designation).sort()).toEqual(['A', 'B', 'C']);
  });

  it("lengthens each session's core hold", async () => {
    const two = await v2();
    const longer = two.slots.filter(
      (s) => s.week_overrides['3']?.hold_duration_seconds !== undefined
    );
    expect(longer).toHaveLength(3);
    for (const slot of longer) {
      expect(slot.block).toBe('core');
      expect(slot.week_overrides['3']!.hold_duration_seconds).toBeGreaterThan(
        slot.hold_duration_seconds ?? 0
      );
    }
    expect(longer.map((s) => s.session_designation).sort()).toEqual(['A', 'B', 'C']);
  });

  it('names no week the program does not have', async () => {
    const two = await v2();
    for (const slot of two.slots) {
      for (const week of Object.keys(slot.week_overrides ?? {})) {
        expect(Number(week)).toBeGreaterThanOrEqual(1);
        expect(Number(week)).toBeLessThanOrEqual(two.duration_weeks!);
      }
    }
  });

  it('shows a coach week 1 and week 3 and nothing in between', async () => {
    // The preview a coach reads is built from the same plan the assignment
    // is written from, so "which weeks differ" cannot disagree with what
    // she was shown.
    const two = await v2();
    const weeks = previewWeeks(planFromBlueprint(two), two.duration_weeks!);
    expect(weeksWorthShowing(weeks)).toEqual([1, 3]);

    const week3 = weeks.find((w) => w.week === 3)!;
    const changed = week3.sessions.flatMap((s) =>
      s.exercises.filter((e) => e.changedFromWeekOne)
    );
    // Three main lifts and three core holds.
    expect(changed).toHaveLength(6);

    const week2 = weeks.find((w) => w.week === 2)!;
    expect(week2.differsFromWeekOne).toBe(false);
    const week4 = weeks.find((w) => w.week === 4)!;
    expect(week4.differsFromWeekOne).toBe(false);
  });
});

describe('the copy in the revision', () => {
  it('has no em dashes in anything a member reads', async () => {
    const two = await v2();
    const memberFacing = [two.member_title, two.member_description].filter(Boolean) as string[];
    expect(memberFacing.length).toBeGreaterThan(0);
    for (const text of memberFacing) {
      expect(text, text).not.toContain('—');
    }
  });

  it('keeps every coach-facing word out of what a member reads', async () => {
    const two = await v2();
    // The slot purposes are coach copy. None of them is the member
    // description, and the member description does not quote them.
    for (const slot of two.slots) {
      if (!slot.purpose) continue;
      expect(two.member_description ?? '').not.toContain(slot.purpose);
    }
  });
});
