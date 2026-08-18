/**
 * Turns a generated CorrectiveProgramDraft into the input the shared
 * materializer takes, and hands it over. The writing itself — one
 * coach_program_templates row per weekly session, its sections, its
 * exercises, and the all-or-nothing cleanup if any of it fails — lives in
 * lib/programs/materialize.ts, which the named-program blueprint path
 * calls too. This file decides WHAT a corrective program says; it no
 * longer decides HOW a program is written down, because there is now more
 * than one kind of program and exactly one way to write one down.
 *
 * Everything about the result is unchanged by that move: same template
 * rows, same program_tags group id, same 'pending_coach_review' status,
 * and still nothing assigned to anybody. coach_program_assignments is
 * never touched here.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CorrectiveProgramDraft, SessionDraft } from './types';
import { SEVERITY_TAG_PREFIX } from './types';
import { CORRECTIVE_BLUEPRINTS } from './blueprints';
import { blockPrescription } from './dosing';
import { materializeProgram } from '../programs/materialize';
import { memberExerciseReasoning } from '../programs/explain/exerciseReasoning';
import type {
  TemplateContentSectionInput,
  TemplateMetaInput,
} from '../coach-program-builder/templates';

/** Also reused by lib/corrective-engine/review.ts (the coach review screen's block labels) and its inverse — keep this the single source of truth for the block <-> section_type mapping. */
export const SECTION_TYPE_BY_BLOCK = {
  release: 'corrective',
  mobility: 'mobility',
  stability: 'activation',
  strength: 'strength',
  core: 'core',
} as const;

export interface SaveCorrectiveProgramDraftInput {
  draft: CorrectiveProgramDraft;
  coachId: string;
  /** Display-only label for who this draft is for (e.g. a member's name) — this program is never assigned or made member-visible by this function; see this file's header. */
  memberLabel: string;
  memberId: string;
  programName?: string;
}

export interface SavedCorrectiveProgram {
  programGroupTag: string;
  templateIds: string[];
}

function patternSummary(draft: CorrectiveProgramDraft): string {
  return draft.patterns
    .map((p) => `${CORRECTIVE_BLUEPRINTS[p.blueprint].name} (${p.severity})`)
    .join(', ');
}

/**
 * Also reused by review.ts's regenerate path, so a regenerated draft is
 * written through the exact same shape a fresh save uses.
 *
 * Every exercise carries a real prescription, read from
 * lib/corrective-engine/dosing.ts for this block at this session's
 * severity. It used to write null for all of them, which reached the
 * member as an exercise name and nothing else. The fields this engine has
 * no opinion about (load, band colour, RPE, side) stay null on purpose:
 * a coach fills those in, and a fabricated number would be worse than a
 * blank.
 */
export function sessionToSections(
  session: SessionDraft,
  /**
   * The program's own identity, so the member-facing line's opening
   * sentence varies across the 24 exercises of a program rather than
   * opening every one of them the same way, and stays identical on every
   * render of THIS program. The generator's own seed is exactly that: one
   * value per generated program, already stored on the draft.
   */
  variantSeed: string | null = null
): TemplateContentSectionInput[] {
  // Position within the whole weekly session, not within its block, so
  // consecutive exercises differ even across a block boundary.
  let variantIndex = -1;
  return session.blocks.map((block) => {
    const dose = blockPrescription(block.block, session.severity);
    return {
      name: block.name,
      sectionType: SECTION_TYPE_BY_BLOCK[block.block],
      blockReasoning: block.blockReasoning,
      exercises: block.exercises.map((exercise) => {
        variantIndex += 1;
        return {
        provider: exercise.provider,
        externalId: exercise.externalId,
        exerciseName: exercise.exerciseName,
        selectionReasoning: exercise.selectionReasoning,
        // The same exercise explained to the member instead of to her
        // coach (migration 176). Composed from the block, which is all a
        // generated exercise knows about its own job, and deliberately not
        // derived from selectionReasoning above: that sentence names a
        // pattern and grades a muscle, and no amount of rewording makes it
        // hers.
        memberReasoning: memberExerciseReasoning({
          block: block.block,
          movementPattern: null,
          isPerSide: false,
          priorityRank: null,
          variantSeed,
          variantIndex,
        }),
        sets: dose.sets,
        reps: dose.reps,
        rep_range_low: dose.rep_range_low,
        rep_range_high: dose.rep_range_high,
        time_seconds: null,
        distance_meters: null,
        rest_seconds: dose.rest_seconds,
        tempo: dose.tempo,
        rpe: null,
        load: null,
        load_unit: null,
        resistance: null,
        band_color: null,
        side: null,
        unilateral: false,
        hold_duration_seconds: dose.hold_duration_seconds,
        frequency: null,
        priority: 'medium',
        is_required: true,
        notes: null,
        coaching_cues: exercise.coachingCues,
        pain_modification_notes: null,
        alternate_exercises: {},
        };
      }),
    };
  });
}

/** The template row a corrective session becomes. Split out so the shape of a corrective program is readable in one place, separately from the writing of it. */
function sessionTemplateMeta(
  session: SessionDraft,
  input: SaveCorrectiveProgramDraftInput,
  programName: string,
  programGroupTag: string,
  targetMuscles: string[]
): TemplateMetaInput {
  const { draft, memberLabel, memberId } = input;
  return {
    name: `${programName}: ${session.label}`,
    description:
      `Auto-generated 4-week corrective phase for ${memberLabel} (${patternSummary(draft)}). ` +
      `${session.label} of ${draft.daysPerWeek}/week, this weekly session set repeats identically ` +
      `across all 4 weeks of the phase. Generated with seed "${draft.seed}".`,
    goal: 'corrective',
    difficulty: draft.overallSeverity === 'severe' ? 'beginner' : 'intermediate',
    estimatedDurationMinutes: null,
    equipment: draft.equipment,
    programTags: [
      programGroupTag,
      'corrective-generated',
      `corrective-member:${memberId}`,
      // The tier this draft's dosing was read at, as structured data
      // rather than as a sentence inside coach_notes (which a coach
      // edits freely). The review screen reads it back so an exercise a
      // coach ADDS to a block gets the same starting prescription the
      // generated ones got, instead of an invented one.
      `${SEVERITY_TAG_PREFIX}${draft.overallSeverity}`,
    ],
    correctiveTags: draft.patterns.map((p) => p.blueprint),
    movementTags: [],
    targetMuscles,
    // coach_notes is MEMBER-VISIBLE and internal_notes is coach-only
    // (migration 82). The generator's own account of what it detected
    // and how severe it judged it belongs in the coach-only one: it was
    // going into coach_notes, which put a pattern name and a severity
    // on the member's screen. coach_notes starts empty so the review
    // screen offers the coach a blank box to write to her in.
    coachNotes: null,
    internalNotes:
      `Generated by the Corrective Program Generator Engine, not yet reviewed. ` +
      `Detected patterns: ${patternSummary(draft)}. Overall severity (worst finding): ${draft.overallSeverity}.`,
    memberInstructions: null,
  };
}

export async function saveCorrectiveProgramDraft(
  supabase: SupabaseClient,
  input: SaveCorrectiveProgramDraftInput
): Promise<SavedCorrectiveProgram> {
  const { draft, coachId } = input;
  const programGroupTag = `corrective-program:${crypto.randomUUID()}`;
  const blueprintNames = draft.patterns.map((p) => CORRECTIVE_BLUEPRINTS[p.blueprint].name).join(' + ');
  const programName = input.programName ?? `Corrective: ${blueprintNames}`;

  const targetMuscles = Array.from(
    new Set(
      draft.patterns.flatMap((p) => {
        const bp = CORRECTIVE_BLUEPRINTS[p.blueprint];
        return [...bp.tightMuscles, ...bp.longMuscles].map((s) => s.muscle);
      })
    )
  );

  const { templateIds } = await materializeProgram(supabase, {
    coachId,
    status: 'pending_coach_review',
    sessions: draft.weeklySessions.map((session) => ({
      templateMeta: sessionTemplateMeta(session, input, programName, programGroupTag, targetMuscles),
      sections: sessionToSections(session, draft.seed),
    })),
  });

  return { programGroupTag, templateIds };
}
