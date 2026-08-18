/**
 * The MEF program library: sixteen named programs, against real local
 * Supabase. No mocks and no fixtures, because the thing under test IS the
 * content, and content that only passes against a fixture of itself has
 * been tested by nobody.
 *
 * The rules asserted here are the coach's own, restated once in code so
 * that a seventeenth program added later has to meet them too:
 *
 *   1. The MEF session shape. At most three opener movements, strength as
 *      the clear majority, then core, and ranks 1 to 5 always strength or
 *      core so a shortened session drops the opener and never the lift.
 *   2. Stage logic. No Side Plank, Bulgarian split squat, pistol squat or
 *      bent-over two-dumbbell row anywhere, and no single-arm row in the
 *      beginner stage programs.
 *   3. At most ONE deliberately repeated exercise per program, and where
 *      there is one, the slot says why in its own coach-facing purpose.
 *      No two sessions of one program share an opener.
 *   4. Per side is said by the slot, never by the exercise name, and a
 *      carry is never per side because it uses both dumbbells at once.
 *   5. No preset loads, and no home program that quietly needs a gym.
 *   6. A real week 3 on every session.
 *   7. Member-facing text is warm, claims nothing, and carries no em dash,
 *      no clinical vocabulary and no treatment language.
 *
 * The migration asserts most of these at seed time as well. That is
 * deliberate duplication: the migration catches a bad seed on the way in,
 * and this catches a row edited afterwards through any other door.
 */
import { describe, it, expect } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { getBlueprintByKey, sessionDesignationsOf, slotsForSession } from '../lib/programs/blueprints/data';
import { planFromBlueprint, previewWeeks } from '../lib/programs/blueprints/plan';
import { blueprintEquipment, sessionSections } from '../lib/programs/blueprints/materialize';
import { containsClinicalLanguage } from '../lib/programs/memberPresentation';
import type { BlueprintWithSlots } from '@mef/shared-types-contracts';

/** The sixteen, in the order the coach listed them. */
export const LIBRARY_KEYS = [
  'rebuild_your_foundation',
  'beginner_strength_and_stability',
  'back_to_exercise_reset',
  'active_aging_and_balance',
  'gym_strength_foundation',
  'strong_after_40',
  'menopause_strength_foundation',
  'low_impact_strength_and_conditioning',
  'energy_and_recovery_movement_plan',
  'bone_balance_and_strength_support',
  'desk_worker_movement_reset',
  'busy_parent_three_day_plan',
  'low_stress_training_week',
  'travel_and_hotel_program',
  'return_after_illness_or_extended_break',
  'golf_mobility_and_performance_foundation',
] as const;

/**
 * The programs written for a beginner stage population. Stage logic is
 * stricter here: the pull is a band, a chair or the floor, never a
 * single-arm dumbbell row, and single-leg work never steps or alternates.
 */
const BEGINNER_STAGE_KEYS = new Set([
  'rebuild_your_foundation',
  'back_to_exercise_reset',
  'active_aging_and_balance',
  'return_after_illness_or_extended_break',
]);

/** Never in this library, at any stage. The coach's explicit exclusions. */
const EXCLUDED_EXERCISE_PATTERNS = [
  /side\s*plank/i,
  /bulgarian/i,
  /pistol/i,
  /two-?dumbbell row/i,
  /row two arm bent over/i,
  /bent over barbell row/i,
];

/** Vendor plumbing. The side is said by is_per_side, never by the name. */
const PLUMBING_PATTERNS = [/\((l|r|left|right)\)/i, /,\s*(left|right)\s+side$/i, / - \d+$/];

/** A lunge that steps or alternates every rep. Intermediate stage and up. */
const STEPPING_LUNGE = /walking lunge|switching lunge|jumping lunge|alternating lunge|forward lunge/i;

/**
 * Words that would turn a strength program into a medical claim. Checked
 * against member-facing text only: a coach's cautions field is SUPPOSED to
 * say "get clinical clearance", and gagging it would make the library less
 * safe rather than more.
 */
const TREATMENT_WORDS = [
  'treat',
  'cure',
  'heal',
  'reverse',
  'prevent',
  'diagnos',
  'symptom',
  'therapy',
  'rehabilitat',
  'medical',
  'clinical',
  'disease',
  'osteo',
  'bone density',
  'hormone',
  'protects your',
  'guarantee',
];

const BLOCK_SEQUENCE = ['release', 'mobility', 'stability', 'strength', 'core'];
const OPENER_BLOCKS = new Set(['release', 'mobility', 'stability']);

let cache: Map<string, BlueprintWithSlots> | null = null;

async function library(): Promise<Map<string, BlueprintWithSlots>> {
  if (cache) return cache;
  const supabase = serviceRoleClient();
  const loaded = new Map<string, BlueprintWithSlots>();
  for (const key of LIBRARY_KEYS) {
    const blueprint = await getBlueprintByKey(supabase, key);
    if (blueprint) loaded.set(key, blueprint);
  }
  cache = loaded;
  return loaded;
}

/** Every program, so a failure names the program it happened in. */
async function eachProgram(): Promise<[string, BlueprintWithSlots][]> {
  return [...(await library()).entries()];
}

describe('the library exists and is complete', () => {
  it('has all sixteen programs, each with a version 1', async () => {
    const loaded = await library();
    expect([...loaded.keys()].sort()).toEqual([...LIBRARY_KEYS].sort());
    for (const [key, blueprint] of loaded) {
      expect(blueprint.version_number, key).toBeGreaterThanOrEqual(1);
      expect(blueprint.slots.length, key).toBeGreaterThan(0);
    }
  });

  it('every slot is filled, and points at a client-assignable exercise', async () => {
    const supabase = serviceRoleClient();
    const loaded = await library();
    const externalIds = [...loaded.values()].flatMap((b) => b.slots.map((s) => s.external_id!));
    expect(externalIds.length).toBe(365);

    for (const [key, blueprint] of loaded) {
      for (const slot of blueprint.slots) {
        expect(slot.provider, `${key} ${slot.session_designation}${slot.slot_order}`).toBe('your_move');
        expect(slot.external_id, `${key} ${slot.session_designation}${slot.slot_order}`).toBeTruthy();
        expect(slot.exercise_name, `${key} ${slot.session_designation}${slot.slot_order}`).toBeTruthy();
      }
    }

    const { data: catalog } = await supabase
      .from('exercise_catalog')
      .select('provider, external_id, name, is_client_assignable')
      .in('external_id', [...new Set(externalIds)]);

    const byId = new Map((catalog ?? []).map((c) => [`${c.provider}:${c.external_id}`, c]));
    const offenders: string[] = [];
    for (const [key, blueprint] of loaded) {
      for (const slot of blueprint.slots) {
        const row = byId.get(`${slot.provider}:${slot.external_id}`);
        if (!row || row.is_client_assignable !== true) {
          offenders.push(`${key} ${slot.session_designation}${slot.slot_order} ${slot.exercise_name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every slot name is the catalog name, so no screen can disagree with another', async () => {
    const supabase = serviceRoleClient();
    const loaded = await library();
    const { data: catalog } = await supabase
      .from('exercise_catalog')
      .select('provider, external_id, name');
    const byId = new Map((catalog ?? []).map((c) => [`${c.provider}:${c.external_id}`, c.name]));

    const drift: string[] = [];
    for (const [key, blueprint] of loaded) {
      for (const slot of blueprint.slots) {
        const catalogName = byId.get(`${slot.provider}:${slot.external_id}`);
        if (catalogName !== slot.exercise_name) {
          drift.push(`${key}: slot says "${slot.exercise_name}", catalog says "${catalogName}"`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('declares its shape: four weeks, linear, a real sessions-per-week and an equipment mode', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      expect(blueprint.duration_weeks, key).toBe(4);
      expect(blueprint.periodization, key).toBe('linear');
      expect(blueprint.equipment_mode, key).toMatch(/^(home|gym|mixed)$/);
      expect(sessionDesignationsOf(blueprint.slots).length, key).toBe(blueprint.sessions_per_week);
      expect(blueprint.sessions_per_week!, key).toBeGreaterThanOrEqual(2);
      expect(blueprint.sessions_per_week!, key).toBeLessThanOrEqual(3);
    }
  });
});

describe('the MEF session shape', () => {
  it('opens with at most three movements, then strength as the majority, then core', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      for (const session of sessionDesignationsOf(blueprint.slots)) {
        const slots = slotsForSession(blueprint.slots, session);
        const where = `${key} session ${session}`;
        const opener = slots.filter((s) => OPENER_BLOCKS.has(s.block));
        const strength = slots.filter((s) => s.block === 'strength');
        const core = slots.filter((s) => s.block === 'core');

        expect(opener.length, `${where} opener`).toBeLessThanOrEqual(3);
        expect(strength.length, `${where} strength`).toBeGreaterThanOrEqual(3);
        expect(core.length, `${where} core`).toBeGreaterThanOrEqual(1);
        expect(strength.length + core.length, `${where} strength+core`).toBeGreaterThanOrEqual(5);
        // "Strength is the clear majority": more strength movements than
        // opener movements, and more strength than core.
        expect(strength.length, `${where} strength vs opener`).toBeGreaterThanOrEqual(opener.length);
        expect(strength.length, `${where} strength vs core`).toBeGreaterThan(core.length);
      }
    }
  });

  it('walks the blocks in MEF sequence order within every session', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      for (const session of sessionDesignationsOf(blueprint.slots)) {
        const order = slotsForSession(blueprint.slots, session).map((s) =>
          BLOCK_SEQUENCE.indexOf(s.block)
        );
        expect(order, `${key} session ${session}`).toEqual(order.slice().sort((a, b) => a - b));
      }
    }
  });

  it('gives ranks 1 to 5 of every session to strength and core', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      const offenders = blueprint.slots
        .filter((s) => s.priority_rank <= 5 && !['strength', 'core'].includes(s.block))
        .map((s) => `${key} ${s.session_designation}${s.slot_order} ${s.exercise_name} (${s.block})`);
      expect(offenders).toEqual([]);
    }
  });

  it('has unique, contiguous ranks within every session', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      for (const session of sessionDesignationsOf(blueprint.slots)) {
        const ranks = slotsForSession(blueprint.slots, session)
          .map((s) => s.priority_rank)
          .sort((a, b) => a - b);
        expect(ranks, `${key} session ${session}`).toEqual(
          Array.from({ length: ranks.length }, (_, i) => i + 1)
        );
      }
    }
  });

  it('prescribes sets plus exactly one of reps or a hold on every single slot', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      for (const slot of blueprint.slots) {
        const where = `${key} ${slot.session_designation}${slot.slot_order} ${slot.exercise_name}`;
        expect(slot.sets, where).toBeGreaterThan(0);
        const hasReps = slot.reps !== null;
        const hasHold = slot.hold_duration_seconds !== null;
        expect(hasReps !== hasHold, `${where}: reps=${slot.reps} hold=${slot.hold_duration_seconds}`).toBe(true);
      }
    }
  });
});

describe("the coach's stage logic", () => {
  it('uses none of the excluded exercises anywhere in the library', async () => {
    const offenders: string[] = [];
    for (const [key, blueprint] of await eachProgram()) {
      for (const slot of blueprint.slots) {
        for (const pattern of EXCLUDED_EXERCISE_PATTERNS) {
          if (pattern.test(slot.exercise_name ?? '')) {
            offenders.push(`${key} ${slot.session_designation}${slot.slot_order} ${slot.exercise_name}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps single-arm rows out of the beginner stage programs', async () => {
    const offenders: string[] = [];
    for (const [key, blueprint] of await eachProgram()) {
      if (!BEGINNER_STAGE_KEYS.has(key)) continue;
      for (const slot of blueprint.slots) {
        if (/single arm dumbbell row|one-arm dumbbell row/i.test(slot.exercise_name ?? '')) {
          offenders.push(`${key} ${slot.exercise_name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps stepping and alternating lunges out of the beginner stage programs', async () => {
    const offenders: string[] = [];
    for (const [key, blueprint] of await eachProgram()) {
      if (!BEGINNER_STAGE_KEYS.has(key)) continue;
      for (const slot of blueprint.slots) {
        if (STEPPING_LUNGE.test(slot.exercise_name ?? '')) {
          offenders.push(`${key} ${slot.exercise_name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never lets a home program require a barbell, a machine or a cable', async () => {
    const offenders: string[] = [];
    for (const [key, blueprint] of await eachProgram()) {
      if (blueprint.equipment_mode !== 'home') continue;
      for (const equipment of blueprintEquipment(blueprint)) {
        if (['barbell', 'machine', 'cable'].includes(equipment)) {
          offenders.push(`${key} needs ${equipment}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('per side, and the names it is never said with', () => {
  it('carries no vendor plumbing in any slot name', async () => {
    const offenders: string[] = [];
    for (const [key, blueprint] of await eachProgram()) {
      for (const slot of blueprint.slots) {
        for (const pattern of PLUMBING_PATTERNS) {
          if (pattern.test(slot.exercise_name ?? '')) {
            offenders.push(`${key} ${slot.exercise_name}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never marks a carry per side, because a carry uses both dumbbells at once', async () => {
    const offenders: string[] = [];
    for (const [key, blueprint] of await eachProgram()) {
      for (const slot of blueprint.slots) {
        if (slot.movement_pattern === 'carry' && slot.is_per_side) {
          offenders.push(`${key} ${slot.exercise_name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('marks the unilateral work per side, and says so in the slot purpose', async () => {
    const unilateral = /split squat|step.?up|single.?leg|single arm|one-arm|leg extension|hip abduction|lateral leg swing|staggered/i;
    const missed: string[] = [];
    for (const [key, blueprint] of await eachProgram()) {
      for (const slot of blueprint.slots) {
        if (slot.block !== 'strength') continue;
        if (!unilateral.test(slot.exercise_name ?? '')) continue;
        if (!slot.is_per_side) missed.push(`${key} ${slot.exercise_name} is not marked per side`);
        else if (!/per side/i.test(slot.purpose ?? '')) {
          missed.push(`${key} ${slot.exercise_name} is per side but its purpose does not say so`);
        }
      }
    }
    expect(missed).toEqual([]);
  });

  it('carries the per-side mark through to the plan a coach previews', async () => {
    const loaded = await library();
    const blueprint = loaded.get('strong_after_40')!;
    const sessions = planFromBlueprint(blueprint);
    const splitSquat = sessions
      .flatMap((s) => s.exercises)
      .find((e) => e.exerciseName === 'Split Squat');
    expect(splitSquat).toBeDefined();
    expect(splitSquat!.isPerSide).toBe(true);

    const carry = sessions.flatMap((s) => s.exercises).find((e) => e.exerciseName === 'Farmers walk');
    expect(carry!.isPerSide).toBe(false);
  });
});

describe('at most one deliberate repeat', () => {
  it('repeats at most one exercise across a program, and says why when it does', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      const sessionsByExercise = new Map<string, Set<string>>();
      for (const slot of blueprint.slots) {
        const id = slot.external_id!;
        if (!sessionsByExercise.has(id)) sessionsByExercise.set(id, new Set());
        sessionsByExercise.get(id)!.add(slot.session_designation);
      }
      const repeated = [...sessionsByExercise.entries()].filter(([, s]) => s.size > 1);
      expect(repeated.length, `${key} repeats ${repeated.length} exercises`).toBeLessThanOrEqual(1);

      for (const [externalId] of repeated) {
        const slots = blueprint.slots.filter((s) => s.external_id === externalId);
        // Every occurrence of the repeat explains itself to the coach.
        for (const slot of slots) {
          expect(slot.purpose ?? '', `${key} ${slot.exercise_name} repeat reason`).toMatch(
            /repeated|second go|both days|twice/i
          );
        }
      }
    }
  });

  it('never shares an opener between two sessions of the same program', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      const sessionsByOpener = new Map<string, Set<string>>();
      for (const slot of blueprint.slots) {
        if (!OPENER_BLOCKS.has(slot.block)) continue;
        const id = slot.external_id!;
        if (!sessionsByOpener.has(id)) sessionsByOpener.set(id, new Set());
        sessionsByOpener.get(id)!.add(slot.session_designation);
      }
      const shared = [...sessionsByOpener.entries()]
        .filter(([, s]) => s.size > 1)
        .map(([id]) => id);
      expect(shared, `${key} shares an opener between sessions`).toEqual([]);
    }
  });
});

describe('the week 3 progression', () => {
  it('adds a set to the main lift of every session', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      for (const session of sessionDesignationsOf(blueprint.slots)) {
        const main = slotsForSession(blueprint.slots, session).find(
          (s) => s.block === 'strength' && s.priority_rank === 1
        );
        expect(main, `${key} session ${session} has no rank 1 strength slot`).toBeDefined();
        expect(main!.week_overrides?.['3']?.sets, `${key} session ${session} main lift`).toBe(
          (main!.sets ?? 0) + 1
        );
      }
    }
  });

  it('only ever changes a field a progression is allowed to change, in a week the program has', async () => {
    const allowed = ['sets', 'reps', 'hold_duration_seconds', 'tempo', 'rest_seconds'];
    for (const [key, blueprint] of await eachProgram()) {
      for (const slot of blueprint.slots) {
        for (const [week, patch] of Object.entries(slot.week_overrides ?? {})) {
          const weekNumber = Number(week);
          expect(Number.isInteger(weekNumber), `${key} week "${week}"`).toBe(true);
          expect(weekNumber, `${key} week ${week}`).toBeGreaterThanOrEqual(1);
          expect(weekNumber, `${key} week ${week}`).toBeLessThanOrEqual(blueprint.duration_weeks!);
          for (const field of Object.keys(patch as object)) {
            expect(allowed, `${key} ${slot.exercise_name}`).toContain(field);
          }
        }
      }
    }
  });

  it('never prescribes a load in any week, on any slot', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      // The slot table has no load column at all, which is the real
      // guarantee. This asserts the other half: no override sneaks one in
      // under a different name, and the plan a coach previews carries none.
      for (const slot of blueprint.slots) {
        const patches = Object.values(slot.week_overrides ?? {}) as Record<string, unknown>[];
        for (const patch of patches) {
          expect(Object.keys(patch), key).not.toContain('load');
          expect(Object.keys(patch), key).not.toContain('load_unit');
        }
      }
      for (const session of planFromBlueprint(blueprint)) {
        for (const exercise of session.exercises) {
          expect(exercise.prescription.load, `${key} ${exercise.exerciseName}`).toBeNull();
          expect(exercise.prescription.loadUnit, `${key} ${exercise.exerciseName}`).toBeNull();
        }
      }
    }
  });

  it('shows a coach a week 3 that genuinely differs from week 1', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      const weeks = previewWeeks(planFromBlueprint(blueprint), blueprint.duration_weeks!);
      expect(weeks, key).toHaveLength(4);
      expect(weeks[0]!.differsFromWeekOne, `${key} week 1`).toBe(false);
      expect(weeks[2]!.differsFromWeekOne, `${key} week 3`).toBe(true);
    }
  });
});

describe('what a member is allowed to read', () => {
  it('gives every program a member-facing title and description', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      expect(blueprint.member_title?.trim(), key).toBeTruthy();
      expect((blueprint.member_description ?? '').length, key).toBeGreaterThan(80);
    }
  });

  it('carries no em dash in any member-facing text', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      expect(blueprint.member_title, key).not.toContain('—');
      expect(blueprint.member_description, key).not.toContain('—');
    }
  });

  it('carries no clinical vocabulary in any member-facing text', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      expect(containsClinicalLanguage(blueprint.member_title), key).toBe(false);
      expect(containsClinicalLanguage(blueprint.member_description), key).toBe(false);
    }
  });

  it('claims nothing medical, in the two programs where the temptation is strongest and in the other fourteen', async () => {
    const offenders: string[] = [];
    for (const [key, blueprint] of await eachProgram()) {
      const text = `${blueprint.member_title ?? ''} ${blueprint.member_description ?? ''}`.toLowerCase();
      for (const word of TREATMENT_WORDS) {
        if (text.includes(word)) offenders.push(`${key}: "${word}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every coach-facing field off the member side and fills all three of them', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      expect(blueprint.coach_purpose?.trim(), `${key} purpose`).toBeTruthy();
      expect(blueprint.intended_population?.trim(), `${key} population`).toBeTruthy();
      expect(blueprint.cautions?.trim(), `${key} cautions`).toBeTruthy();
      // The coach's own words never appear in what she reads.
      expect(blueprint.member_description, key).not.toContain(blueprint.coach_purpose);
      expect(blueprint.member_description, key).not.toContain(blueprint.cautions);
    }
  });

  it('materializes with a prescription on every exercise and nothing coach-facing in a member-visible field', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      for (const session of sessionDesignationsOf(blueprint.slots)) {
        const sections = sessionSections(blueprint, session);
        expect(sections.length, `${key} ${session}`).toBeGreaterThan(0);
        for (const section of sections) {
          // block_reasoning reaches a member once published (migration 82).
          expect(section.blockReasoning, `${key} ${session} ${section.name}`).toBeNull();
          for (const exercise of section.exercises) {
            const where = `${key} ${session} ${exercise.exerciseName}`;
            expect(exercise.sets, where).toBeGreaterThan(0);
            expect(
              exercise.rep_range_low !== null || exercise.hold_duration_seconds !== null,
              where
            ).toBe(true);
            // selection_reasoning is member-visible; the slot purpose is
            // coach vocabulary and must never be copied into it.
            expect(exercise.selectionReasoning, where).toBeNull();
            expect(exercise.load, where).toBeNull();
            expect(containsClinicalLanguage(exercise.memberReasoning), where).toBe(false);
          }
        }
      }
    }
  });
});

describe('a coach can actually give one of these to somebody', () => {
  it('plans into the number of sessions it advertises, every slot intact', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      const sessions = planFromBlueprint(blueprint);
      expect(sessions.length, key).toBe(blueprint.sessions_per_week);
      const planned = sessions.reduce((total, s) => total + s.exercises.length, 0);
      expect(planned, key).toBe(blueprint.slots.length);
    }
  });

  it('locks the main lift of every session, so a swap cannot quietly change the program', async () => {
    for (const [key, blueprint] of await eachProgram()) {
      for (const session of sessionDesignationsOf(blueprint.slots)) {
        const main = slotsForSession(blueprint.slots, session).find(
          (s) => s.block === 'strength' && s.priority_rank === 1
        );
        expect(main!.is_locked, `${key} session ${session} main lift`).toBe(true);
      }
    }
  });
});
