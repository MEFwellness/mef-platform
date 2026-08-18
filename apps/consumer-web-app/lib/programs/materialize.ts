/**
 * THE MATERIALIZER. One program, however it was decided on, written into
 * the Coach Program Builder tables as one coach_program_templates row per
 * weekly session.
 *
 * There are two ways a program gets decided on and there is one way it
 * gets written down:
 *
 *   generated   lib/corrective-engine/save.ts    a member's own findings
 *   authored    lib/programs/blueprints/         a named MEF blueprint
 *
 * Both build the same input shape and call materializeProgram(). Neither
 * writes to coach_program_templates itself, and this function does not
 * know which of them called it, which is what keeps a blueprint-born
 * program and a corrective-born program identical from here on: same
 * template rows, same section and exercise rows, same assignment pipeline
 * (lib/coach-program-builder/assignments.ts), same frozen snapshot, same
 * lifecycle, same member delivery.
 *
 * This function assigns nothing. coach_program_assignments is never
 * touched here, by either caller. Everything it creates is a template in
 * whatever status the caller asked for, waiting for a human.
 *
 * The partial-save discipline is the corrective engine's own, moved here
 * unchanged: if any step of any session fails, every template this call
 * already created is deleted, so a retry never leaves half a program
 * behind.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgramTemplateStatus } from '@mef/shared-types-contracts';
import {
  createTemplate,
  replaceTemplateContent,
  setTemplateStatus,
  type TemplateContentSectionInput,
  type TemplateMetaInput,
} from '../coach-program-builder/templates';

export interface MaterializeSessionInput {
  /** Everything that goes on the template row itself. Already member-safe: this function does not scrub. */
  templateMeta: TemplateMetaInput;
  /** The session's blocks, in the order a member walks them. */
  sections: TemplateContentSectionInput[];
}

export interface MaterializeProgramInput {
  coachId: string;
  /** One entry per weekly session (Session A/B/C). */
  sessions: MaterializeSessionInput[];
  /** The status every created template lands in. Both callers use 'pending_coach_review': nothing is assignable until a human has looked at it. */
  status: ProgramTemplateStatus;
}

export interface MaterializedProgram {
  templateIds: string[];
}

/**
 * Deletes every template this call created — used only when a save partway
 * fails, so a retry never leaves orphaned half-a-program templates behind.
 */
async function cleanupPartialSave(
  supabase: SupabaseClient,
  coachId: string,
  templateIds: string[]
): Promise<void> {
  if (templateIds.length === 0) return;
  await supabase
    .from('coach_program_templates')
    .delete()
    .eq('coach_id', coachId)
    .in('id', templateIds);
}

export async function materializeProgram(
  supabase: SupabaseClient,
  input: MaterializeProgramInput
): Promise<MaterializedProgram> {
  const createdTemplateIds: string[] = [];

  for (const session of input.sessions) {
    const template = await createTemplate(supabase, input.coachId, session.templateMeta);
    if (!template) {
      await cleanupPartialSave(supabase, input.coachId, createdTemplateIds);
      throw new Error('materializeProgram: failed to create template.');
    }
    createdTemplateIds.push(template.id);

    const contentOk = await replaceTemplateContent(
      supabase,
      template.id,
      input.coachId,
      session.sections
    );
    if (!contentOk) {
      await cleanupPartialSave(supabase, input.coachId, createdTemplateIds);
      throw new Error('materializeProgram: failed to write session content.');
    }

    const statusOk = await setTemplateStatus(supabase, template.id, input.status);
    if (!statusOk) {
      await cleanupPartialSave(supabase, input.coachId, createdTemplateIds);
      throw new Error(`materializeProgram: failed to set ${input.status} status.`);
    }
  }

  return { templateIds: createdTemplateIds };
}
