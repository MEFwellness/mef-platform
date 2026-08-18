/**
 * Giving a named program to a member, through the same assignment pipeline
 * a corrective program goes through (createAssignment, then
 * supersedePreviousPrograms). No second pipeline, and no member delivery
 * code of its own: what a member opens is the same frozen
 * coach_assigned_workouts row either way.
 *
 * THE APPROVAL GATE. Only an APPROVED blueprint version may be published
 * to a member. A draft may be materialized and inspected as an unpublished
 * assignment, which is what makes it reviewable at all, but an unpublished
 * assignment is invisible to the member: coach_assigned_workouts'
 * member_read_own policy gates on published_at, and a draft assignment
 * never sets it. An archived version starts nothing new at all.
 *
 * The gate is a pure function so the rule can be read, and tested, without
 * a database.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlueprintWithSlots, CoachProgramTemplateWithContent } from '@mef/shared-types-contracts';
import { createAssignment } from '../../coach-program-builder/assignments';
import { getTemplateWithContent } from '../../coach-program-builder/templates';
import { supersedePreviousPrograms } from '../../program-lifecycle/service';
import { weeklyDayPatternFor } from '../../corrective-engine/approvalDefaults';
import { materializeBlueprint, type BlueprintMaterializationInput } from './materialize';

export interface BlueprintAssignmentIntent {
  status: BlueprintWithSlots['status'];
  publish: boolean;
}

/**
 * Why this blueprint may not be given out, or null when it may. One
 * sentence, in the words a coach would use, because it is the message a
 * screen shows.
 */
export function blueprintAssignmentBlockedReason(
  intent: BlueprintAssignmentIntent
): string | null {
  if (intent.status === 'archived') {
    return 'This program has been retired and cannot be started for anyone new.';
  }
  if (intent.status === 'draft' && intent.publish) {
    return 'This program is still a draft. It has to be approved before a member can be given it.';
  }
  return null;
}

export interface AssignBlueprintInput extends BlueprintMaterializationInput {
  /** YYYY-MM-DD the first week's sessions start from. */
  startDate: string;
  /** The member's own local date, so a program starting today opens active rather than upcoming. */
  today: string;
  /** The member's timezone, for the lifecycle events a published assignment writes. */
  timezone: string;
  /** Publish immediately, i.e. actually give it to her. Requires an approved blueprint. */
  publish: boolean;
  /** Defaults to the blueprint's own duration. */
  durationWeeks?: number;
  /** "Why this program", written for the member. Composed by the assign flow; null here assigns without one, which reads exactly as it did before migration 176. */
  memberExplanation?: string | null;
}

export interface AssignedBlueprintProgram {
  programGroupTag: string;
  templateIds: string[];
  assignmentIds: string[];
  replacedAssignmentIds: string[];
}

export interface AssignMaterializedProgramInput {
  memberId: string;
  coachId: string;
  programGroupTag: string;
  templateIds: string[];
  startDate: string;
  durationWeeks: number;
  today: string;
  timezone: string;
  publish: boolean;
  /** Lineage, when this program came from a blueprint. Null for a coach-edited or generated one. */
  sourceBlueprintVersionId: string | null;
  /** "Why this program", written for the member (migration 176). The same text on every weekly session, because it explains the program and not the session. */
  memberExplanation?: string | null;
}

/**
 * Templates in, an assigned program out: one assignment per weekly
 * session, each on its own day of the week, all sharing the program's own
 * start date and duration.
 *
 * Split out of assignBlueprintToMember because the unified coach flow
 * materializes a plan the coach has EDITED rather than the blueprint
 * itself, and both have to land through the same door. There is one
 * assignment pipeline in this app and this is the only caller of it for
 * named programs.
 */
export async function assignMaterializedProgram(
  supabase: SupabaseClient,
  input: AssignMaterializedProgramInput
): Promise<AssignedBlueprintProgram | null> {
  if (input.templateIds.length === 0) return null;

  const dayPattern = weeklyDayPatternFor(input.templateIds.length);

  const assignmentIds: string[] = [];
  for (let i = 0; i < input.templateIds.length; i++) {
    const templateId = input.templateIds[i]!;
    const template = await getTemplateWithContent(supabase, templateId);
    if (!template) return null;

    const assignment = await createAssignment(supabase, {
      memberId: input.memberId,
      coachId: input.coachId,
      template: template as CoachProgramTemplateWithContent,
      scheduleType: 'weekly',
      scheduleConfig: {
        type: 'weekly',
        startDate: input.startDate,
        daysOfWeek: [dayPattern[i] ?? 1],
        weeks: input.durationWeeks,
      },
      assignmentNotes: null,
      internalNotes: null,
      publishImmediately: input.publish,
      sourceBlueprintVersionId: input.sourceBlueprintVersionId,
      memberExplanation: input.memberExplanation ?? null,
      // Every session of one program shares the program's own start date
      // and duration, so "Week 2 of 4" means the same thing whichever
      // session she opened. Same rule as a corrective program.
      lifecycle: {
        startDate: input.startDate,
        durationWeeks: input.durationWeeks,
        programGroupKey: input.programGroupTag,
        today: input.today,
      },
    });
    if (!assignment) return null;
    assignmentIds.push(assignment.id);
  }

  // Only a program she has actually been given supersedes the one she was
  // on. A draft assignment nobody can see replaces nothing.
  const replacedAssignmentIds = input.publish
    ? await supersedePreviousPrograms(supabase, {
        memberId: input.memberId,
        newAssignmentIds: assignmentIds,
        supersededBy: assignmentIds[0]!,
        timezone: input.timezone,
      })
    : [];

  return {
    programGroupTag: input.programGroupTag,
    templateIds: input.templateIds,
    assignmentIds,
    replacedAssignmentIds,
  };
}

/**
 * Materializes the blueprint into templates and assigns each weekly
 * session on its own day of the week, for the program's own duration.
 * Published only when asked and only when the blueprint is approved.
 */
export async function assignBlueprintToMember(
  supabase: SupabaseClient,
  input: AssignBlueprintInput
): Promise<AssignedBlueprintProgram | null> {
  const blocked = blueprintAssignmentBlockedReason({
    status: input.blueprint.status,
    publish: input.publish,
  });
  if (blocked) {
    console.error('assignBlueprintToMember refused:', blocked);
    return null;
  }

  const materialized = await materializeBlueprint(supabase, input);
  if (materialized.templateIds.length === 0) return null;

  return assignMaterializedProgram(supabase, {
    memberId: input.memberId,
    coachId: input.coachId,
    programGroupTag: materialized.programGroupTag,
    templateIds: materialized.templateIds,
    startDate: input.startDate,
    durationWeeks: input.durationWeeks ?? input.blueprint.duration_weeks ?? 4,
    today: input.today,
    timezone: input.timezone,
    publish: input.publish,
    sourceBlueprintVersionId: input.blueprint.id,
    memberExplanation: input.memberExplanation ?? null,
  });
}

/** Deletes an unpublished trial assignment and the templates it came from. Refuses to touch anything published: a program a member has been given is never quietly removed. */
export async function discardBlueprintDraft(
  supabase: SupabaseClient,
  input: { assignmentIds: string[]; templateIds: string[] }
): Promise<boolean> {
  if (input.assignmentIds.length > 0) {
    const { data: rows, error } = await supabase
      .from('coach_program_assignments')
      .select('id, visibility, published_at')
      .in('id', input.assignmentIds);
    if (error) {
      console.error('discardBlueprintDraft (read) failed', error);
      return false;
    }
    const published = (rows ?? []).filter(
      (r) => r.visibility === 'published' || r.published_at !== null
    );
    if (published.length > 0) {
      console.error('discardBlueprintDraft refused: some assignments are published');
      return false;
    }

    const { error: deleteError } = await supabase
      .from('coach_program_assignments')
      .delete()
      .in('id', input.assignmentIds);
    if (deleteError) {
      console.error('discardBlueprintDraft (assignments) failed', deleteError);
      return false;
    }
  }

  if (input.templateIds.length > 0) {
    const { error } = await supabase
      .from('coach_program_templates')
      .delete()
      .in('id', input.templateIds);
    if (error) {
      console.error('discardBlueprintDraft (templates) failed', error);
      return false;
    }
  }

  return true;
}
