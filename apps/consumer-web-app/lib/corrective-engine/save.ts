/**
 * Persists a generated CorrectiveProgramDraft into the existing Coach
 * Program Builder tables — reuses createTemplate/replaceTemplateContent
 * (lib/coach-program-builder/templates.ts) verbatim, no parallel write
 * path. One coach_program_templates row per weekly session, all sharing a
 * program_tags group id so they're recognizable as one generated program;
 * status starts (and, until a coach acts, stays) 'pending_coach_review'.
 * Nothing here assigns anything to a member — coach_program_assignments is
 * never touched.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CorrectiveProgramDraft, SessionDraft } from './types';
import { SEVERITY_TAG_PREFIX } from './types';
import { CORRECTIVE_BLUEPRINTS } from './blueprints';
import { blockPrescription } from './dosing';
import {
  createTemplate,
  replaceTemplateContent,
  setTemplateStatus,
  type TemplateContentSectionInput,
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
export function sessionToSections(session: SessionDraft): TemplateContentSectionInput[] {
  return session.blocks.map((block) => {
    const dose = blockPrescription(block.block, session.severity);
    return {
      name: block.name,
      sectionType: SECTION_TYPE_BY_BLOCK[block.block],
      blockReasoning: block.blockReasoning,
      exercises: block.exercises.map((exercise) => ({
        provider: exercise.provider,
        externalId: exercise.externalId,
        exerciseName: exercise.exerciseName,
        selectionReasoning: exercise.selectionReasoning,
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
      })),
    };
  });
}

/**
 * Deletes every coach_program_templates row already tagged with this
 * program group — used only if a save partway fails, so a retry never
 * leaves orphaned half-a-program templates behind (same "no partial
 * saves" discipline as the Your Move generation save path).
 */
async function cleanupPartialSave(supabase: SupabaseClient, coachId: string, templateIds: string[]) {
  if (templateIds.length === 0) return;
  await supabase
    .from('coach_program_templates')
    .delete()
    .eq('coach_id', coachId)
    .in('id', templateIds);
}

export async function saveCorrectiveProgramDraft(
  supabase: SupabaseClient,
  input: SaveCorrectiveProgramDraftInput
): Promise<SavedCorrectiveProgram> {
  const { draft, coachId, memberLabel, memberId } = input;
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

  const createdTemplateIds: string[] = [];

  for (const session of draft.weeklySessions) {
    const template = await createTemplate(supabase, coachId, {
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
    });

    if (!template) {
      await cleanupPartialSave(supabase, coachId, createdTemplateIds);
      throw new Error('saveCorrectiveProgramDraft: failed to create template.');
    }
    createdTemplateIds.push(template.id);

    const contentOk = await replaceTemplateContent(supabase, template.id, coachId, sessionToSections(session));
    if (!contentOk) {
      await cleanupPartialSave(supabase, coachId, createdTemplateIds);
      throw new Error('saveCorrectiveProgramDraft: failed to write session content.');
    }

    const statusOk = await setTemplateStatus(supabase, template.id, 'pending_coach_review');
    if (!statusOk) {
      await cleanupPartialSave(supabase, coachId, createdTemplateIds);
      throw new Error('saveCorrectiveProgramDraft: failed to set pending_coach_review status.');
    }
  }

  return { programGroupTag, templateIds: createdTemplateIds };
}
