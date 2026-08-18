/**
 * The program a coach is looking at, in one shape, whichever door she came
 * in through.
 *
 * The unified assign flow has two entry points: an approved blueprint, and
 * a corrective program generated from a member's own findings. They are
 * authored by different things and they carry different extras (a blueprint
 * slot knows its rank, its lock and its per week plan; a generated exercise
 * knows why it was selected). Downstream of the choice, everything is the
 * same: preview it, swap something, write a note, assign it. So everything
 * downstream reads ONE model, and the two doors each have a small function
 * that produces it.
 *
 * This file is pure. No Supabase import, no React, no writes. It builds the
 * model, resolves what each week prescribes, and converts back to the
 * template input the shared materializer already takes. That is what lets
 * the coach's screen, the preview and the assignment agree by construction
 * instead of by inspection.
 */
import type {
  BlueprintBlock,
  BlueprintWeekOverrides,
  BlueprintWithSlots,
  CoachProgramTemplateWithContent,
  ProgramSectionType,
} from '@mef/shared-types-contracts';
import type {
  TemplateContentExerciseInput,
  TemplateContentSectionInput,
} from '../../coach-program-builder/templates';
import { SECTION_TYPE_BY_BLOCK } from '../../corrective-engine/save';
import { blockPrescription } from '../../corrective-engine/dosing';
import type { CorrectiveSeverity } from '../../corrective-engine/types';
import { applyWeekOverride, overrideForWeek } from '../weekProgression';
import type { LoggedLoadUnit } from '../weightLogging';
import { memberExerciseReasoning } from '../explain/exerciseReasoning';
import { BLUEPRINT_BLOCK_SECTION_NAME, BLUEPRINT_DEFAULT_DOSING_TIER, priorityForRank } from './materialize';
import { sessionDesignationsOf, slotsForSession } from './data';

/**
 * `load` is a TEXT column on both prescription tables and always has been,
 * because a coach's prescription may say "bodyweight" or "red band" as
 * easily as it says a number. The plan model works in numbers, so the two
 * readers below are the only place the text becomes a number and the
 * writer below is the only place a number becomes text. Anything in that
 * column that is not a plain weight reads as no weight, which is exactly
 * what it means to a suggestion engine.
 */
function parsePrescribedLoad(raw: string | null): number | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function prescribedLoadUnit(raw: string | null): LoggedLoadUnit | null {
  return raw === 'lbs' || raw === 'kg' ? raw : null;
}

/** The section_type a coach's block maps to, inverted, for reading a saved template back into this model. */
const BLOCK_BY_SECTION_TYPE: Record<string, BlueprintBlock> = {
  corrective: 'release',
  mobility: 'mobility',
  activation: 'stability',
  strength: 'strength',
  core: 'core',
};

/** Numbers, not strings. The screen keeps its own text state; this model is what gets written. */
export interface PlannedPrescription {
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
  tempo: string | null;
  restSeconds: number | null;
  /**
   * The weight her coach is asking for, when there is one (migration 178).
   *
   * A BLUEPRINT NEVER SETS THIS. An authored program describes a movement
   * and a dose, and the first weight a person picks up is a decision made
   * with her in the room. It gets written by exactly one path: the
   * end-of-phase review's Progress outcome, where the number came from her
   * OWN logged weights, was suggested by lib/programs/progression, and was
   * read and left or edited by a coach before the draft was approved.
   *
   * What she then reads on her screen is "Your coach set: 25 lbs" beside
   * "Last time: 22.5 lbs", which are two different facts and are shown as
   * two different facts.
   */
  load: number | null;
  loadUnit: LoggedLoadUnit | null;
}

export interface PlannedExercise {
  /** Stable within one editing session, so React can key on it through a swap. */
  key: string;
  provider: string;
  externalId: string;
  exerciseName: string;
  block: BlueprintBlock;

  /** Set only on the blueprint path. Null for a generated corrective exercise. */
  slotId: string | null;
  priorityRank: number | null;
  isLocked: boolean;
  isPerSide: boolean;
  /** Coach-facing. Never rendered to a member by any code path. */
  purpose: string | null;
  /**
   * Member-facing. Why this exercise is here, in her language, composed by
   * rule from the slot's own block, movement pattern and rank (migration
   * 176). The coach may rewrite it on the review screen before it is
   * frozen, so this is state the screen edits, not a derived value.
   */
  memberReasoning: string;
  isCoachOverride: boolean;

  prescription: PlannedPrescription;
  weekOverrides: BlueprintWeekOverrides;
}

export interface PlannedSession {
  /** 'A' | 'B' | 'C' … */
  session: string;
  /** The template this session came from, when it came from one. Null for a blueprint not yet materialized. */
  templateId: string | null;
  label: string;
  coachNotes: string;
  exercises: PlannedExercise[];
}

// ---------------------------------------------------------------------
// Door one: an approved blueprint.
// ---------------------------------------------------------------------

/**
 * A blueprint's sessions as a plan. The slot's prescription wins; where a
 * slot says nothing, the corrective dosing table fills the gap for that
 * block, which is exactly the rule the materializer follows, so what a
 * coach previews is what gets written.
 */
export function planFromBlueprint(
  blueprint: BlueprintWithSlots,
  tier: CorrectiveSeverity = BLUEPRINT_DEFAULT_DOSING_TIER
): PlannedSession[] {
  return sessionDesignationsOf(blueprint.slots).map((session) => ({
    session,
    templateId: null,
    label: `Session ${session}`,
    coachNotes: '',
    exercises: slotsForSession(blueprint.slots, session)
      .filter((slot) => slot.provider && slot.external_id && slot.exercise_name)
      .map((slot, index) => {
        const fallback = blockPrescription(slot.block, tier);
        const statesVolume = slot.reps !== null || slot.hold_duration_seconds !== null;
        return {
          key: slot.id,
          provider: slot.provider!,
          externalId: slot.external_id!,
          exerciseName: slot.exercise_name!,
          block: slot.block,
          slotId: slot.id,
          priorityRank: slot.priority_rank,
          isLocked: slot.is_locked,
          isPerSide: slot.is_per_side === true,
          purpose: slot.purpose,
          // Composed with the same seed and the same position the
          // materializer will use, so the paragraph a coach previews is
          // the paragraph that gets written.
          memberReasoning: memberExerciseReasoning({
            block: slot.block,
            movementPattern: slot.movement_pattern,
            isPerSide: slot.is_per_side === true,
            priorityRank: slot.priority_rank,
            variantSeed: blueprint.id,
            variantIndex: index,
          }),
          isCoachOverride: false,
          prescription: {
            sets: slot.sets ?? fallback.sets,
            reps: statesVolume ? slot.reps : fallback.rep_range_low,
            holdSeconds: statesVolume
              ? slot.hold_duration_seconds
              : fallback.hold_duration_seconds,
            tempo: slot.tempo ?? fallback.tempo,
            restSeconds: slot.rest_seconds ?? fallback.rest_seconds,
            // Never from a blueprint. See PlannedPrescription.load.
            load: null,
            loadUnit: null,
          },
          weekOverrides: slot.week_overrides ?? {},
        };
      }),
  }));
}

// ---------------------------------------------------------------------
// Door two: a corrective draft, already saved as templates.
// ---------------------------------------------------------------------

function sessionLetterOf(name: string, fallbackIndex: number): string {
  const match = name.match(/Session ([A-Z])\s*$/);
  return match?.[1] ?? String.fromCharCode(65 + fallbackIndex);
}

/** A saved program's templates as a plan. Used for the corrective path and for reading an already-materialized blueprint back. */
export function planFromTemplates(templates: CoachProgramTemplateWithContent[]): PlannedSession[] {
  return templates.map((template, index) => ({
    session: sessionLetterOf(template.name, index),
    templateId: template.id,
    label: `Session ${sessionLetterOf(template.name, index)}`,
    coachNotes: template.coach_notes ?? '',
    exercises: template.sections.flatMap((section, sectionIndex) =>
      section.exercises.map((exercise, exerciseIndex) => ({
        key: exercise.id,
        provider: exercise.provider,
        externalId: exercise.external_id,
        exerciseName: exercise.exercise_name,
        block: BLOCK_BY_SECTION_TYPE[section.section_type] ?? 'strength',
        slotId: null,
        priorityRank: null,
        // A template written from a blueprint carries the slot's lock
        // (migration 177); a corrective-born one carries false, which is
        // what it has always meant.
        isLocked: exercise.is_locked === true,
        isPerSide: exercise.unilateral === true,
        purpose: null,
        // A saved template carries its own line already. Where it does not
        // (every template written before migration 176), one is composed
        // from the block, which is the only thing a corrective-born
        // exercise knows about its own job.
        memberReasoning:
          exercise.member_reasoning ??
          memberExerciseReasoning({
            block: BLOCK_BY_SECTION_TYPE[section.section_type] ?? 'strength',
            movementPattern: exercise.movement_pattern ?? null,
            isPerSide: exercise.unilateral === true,
            priorityRank: null,
            variantSeed: template.id,
            variantIndex: sectionIndex * 10 + exerciseIndex,
          }),
        isCoachOverride: exercise.is_coach_override === true,
        prescription: {
          sets: exercise.sets,
          reps: exercise.rep_range_low ?? (exercise.reps ? Number(exercise.reps) || null : null),
          holdSeconds: exercise.hold_duration_seconds,
          tempo: exercise.tempo,
          restSeconds: exercise.rest_seconds,
          load: parsePrescribedLoad(exercise.load),
          loadUnit: prescribedLoadUnit(exercise.load_unit),
        },
        weekOverrides: (exercise.week_overrides ?? {}) as BlueprintWeekOverrides,
      }))
    ),
  }));
}

// ---------------------------------------------------------------------
// The preview.
// ---------------------------------------------------------------------

export interface PreviewExercise {
  key: string;
  exerciseName: string;
  block: BlueprintBlock;
  sectionName: string;
  isPerSide: boolean;
  isLocked: boolean;
  /** True when this week prescribes something different from week 1. */
  changedFromWeekOne: boolean;
  prescription: PlannedPrescription;
}

export interface PreviewSession {
  session: string;
  label: string;
  exercises: PreviewExercise[];
}

export interface PreviewWeek {
  week: number;
  /** True when anything at all differs from week 1. Week 1 itself is always false. */
  differsFromWeekOne: boolean;
  sessions: PreviewSession[];
}

function resolveForWeek(
  exercise: PlannedExercise,
  week: number
): PlannedPrescription {
  const resolved = applyWeekOverride(
    {
      sets: exercise.prescription.sets,
      reps: exercise.prescription.reps === null ? null : String(exercise.prescription.reps),
      rep_range_low: exercise.prescription.reps,
      rep_range_high: exercise.prescription.reps,
      hold_duration_seconds: exercise.prescription.holdSeconds,
      tempo: exercise.prescription.tempo,
      rest_seconds: exercise.prescription.restSeconds,
    },
    overrideForWeek(exercise.weekOverrides, week)
  );
  return {
    sets: resolved.sets,
    reps: resolved.rep_range_low,
    holdSeconds: resolved.hold_duration_seconds,
    tempo: resolved.tempo,
    restSeconds: resolved.rest_seconds,
    // A per week override changes volume, never load. There is no
    // week_overrides key for a weight and there deliberately is not one: a
    // program that quietly adds five pounds in week 3 has prescribed a
    // progression nobody approved.
    load: exercise.prescription.load,
    loadUnit: exercise.prescription.loadUnit,
  };
}

function samePrescription(a: PlannedPrescription, b: PlannedPrescription): boolean {
  return (
    a.sets === b.sets &&
    a.reps === b.reps &&
    a.holdSeconds === b.holdSeconds &&
    a.tempo === b.tempo &&
    a.restSeconds === b.restSeconds &&
    a.load === b.load
  );
}

/**
 * Every week of the program, resolved. This is the whole point of showing
 * a coach a preview rather than a lineup: a program whose week 3 differs
 * should say so on the screen where it is approved, not only in the frozen
 * rows a member gets afterwards.
 */
export function previewWeeks(sessions: PlannedSession[], durationWeeks: number): PreviewWeek[] {
  const weeks = Math.max(1, Math.min(52, Math.floor(durationWeeks) || 1));
  return Array.from({ length: weeks }, (_, index) => {
    const week = index + 1;
    let differs = false;

    const previewSessions: PreviewSession[] = sessions.map((session) => ({
      session: session.session,
      label: session.label,
      exercises: session.exercises.map((exercise) => {
        const prescription = resolveForWeek(exercise, week);
        const weekOne = resolveForWeek(exercise, 1);
        const changed = week !== 1 && !samePrescription(prescription, weekOne);
        if (changed) differs = true;
        return {
          key: exercise.key,
          exerciseName: exercise.exerciseName,
          block: exercise.block,
          sectionName: BLUEPRINT_BLOCK_SECTION_NAME[exercise.block],
          isPerSide: exercise.isPerSide,
          isLocked: exercise.isLocked,
          changedFromWeekOne: changed,
          prescription,
        };
      }),
    }));

    return { week, differsFromWeekOne: differs, sessions: previewSessions };
  });
}

/** The weeks a preview actually needs to show in full: week 1, plus every week that prescribes something different. */
export function weeksWorthShowing(weeks: PreviewWeek[]): number[] {
  return weeks.filter((w) => w.week === 1 || w.differsFromWeekOne).map((w) => w.week);
}

// ---------------------------------------------------------------------
// Back out to the shared materializer.
// ---------------------------------------------------------------------

function plannedToExerciseInput(exercise: PlannedExercise): TemplateContentExerciseInput {
  const reps = exercise.prescription.reps;
  return {
    provider: exercise.provider,
    externalId: exercise.externalId,
    exerciseName: exercise.exerciseName,

    sets: exercise.prescription.sets,
    reps: reps === null ? null : String(reps),
    rep_range_low: reps,
    rep_range_high: reps,
    time_seconds: null,
    distance_meters: null,
    rest_seconds: exercise.prescription.restSeconds,
    tempo: exercise.prescription.tempo,
    hold_duration_seconds: exercise.prescription.holdSeconds,

    rpe: null,
    // Null on every path except the end-of-phase review's Progress
    // outcome, where a coach read a suggestion made from this member's own
    // logged weights and approved it. See PlannedPrescription.load.
    load: exercise.prescription.load === null ? null : String(exercise.prescription.load),
    load_unit: exercise.prescription.loadUnit,
    resistance: null,
    band_color: null,
    side: null,
    unilateral: exercise.isPerSide,
    frequency: null,

    priority: exercise.priorityRank === null ? 'medium' : priorityForRank(exercise.priorityRank),
    is_required: true,

    notes: null,
    coaching_cues: null,
    pain_modification_notes: null,
    alternate_exercises: {},

    // Member-visible once published (migration 82), so nothing
    // coach-facing goes here. A coach override says only that.
    selectionReasoning: exercise.isCoachOverride
      ? 'Coach override: picked from the full library.'
      : null,
    // Her own line, as the coach left it. Written to the template and
    // frozen from there, so what she reads is what was approved.
    memberReasoning: exercise.memberReasoning.trim() || null,
    isCoachOverride: exercise.isCoachOverride,

    weekOverrides: exercise.weekOverrides,
  };
}

/** One session's blocks, in MEF sequence order, ready for the shared materializer. Consecutive exercises in the same block share one section, exactly as the blueprint materializer builds them. */
export function plannedSessionSections(session: PlannedSession): TemplateContentSectionInput[] {
  const sections: TemplateContentSectionInput[] = [];
  for (const exercise of session.exercises) {
    const name = BLUEPRINT_BLOCK_SECTION_NAME[exercise.block];
    const last = sections[sections.length - 1];
    if (last && last.name === name) {
      last.exercises.push(plannedToExerciseInput(exercise));
      continue;
    }
    sections.push({
      name,
      sectionType: SECTION_TYPE_BY_BLOCK[exercise.block] as ProgramSectionType,
      blockReasoning: null,
      exercises: [plannedToExerciseInput(exercise)],
    });
  }
  return sections;
}
