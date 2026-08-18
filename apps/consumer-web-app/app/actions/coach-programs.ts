/**
 * Server actions for the Coach Program Builder and Workout Prescription
 * System (migration 82). Same convention as app/actions/coach.ts and
 * app/actions/movement-profile.ts: RLS is the real authorization boundary
 * (coach_all_own_* on templates, coach_read/insert/update_assigned_* +
 * member_read/update_own_* on assignments/workouts, is_active_coach_for
 * throughout) — these actions don't re-check roles, they just perform the
 * read/write and report whatever Postgres allows.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import {
  listCoachTemplates,
  getTemplate,
  getTemplateWithContent,
  createTemplate,
  updateTemplateMeta,
  replaceTemplateContent,
  setTemplateStatus,
  setTemplateFavorited,
  deleteTemplate,
  duplicateTemplate,
  type TemplateMetaInput,
  type TemplateContentSectionInput,
  type TemplateListFilters,
} from '@/lib/coach-program-builder/templates';
import {
  createAssignment,
  publishAssignment,
  cancelAssignment,
  listAssignmentsForMember,
  listAssignmentSummariesForMember,
  listAssignedWorkoutsForMember,
  getAssignedWorkoutWithContent,
  updateAssignedWorkoutStatus,
  updateAssignedWorkoutExercise,
  updateAssignedWorkoutCoachNotes,
  getAssignmentLifecycle,
  listAssignmentsInProgramGroup,
  pauseAssignment,
  resumeAssignment,
  listMyProgramLifecycles,
} from '@/lib/coach-program-builder/assignments';
import { buildMemberProgramViews, type MemberProgramView } from '@/lib/program-lifecycle/memberView';
import {
  recordProgramLifecycleEvent,
  supersedePreviousPrograms,
} from '@/lib/program-lifecycle/service';
import { getRecommendedExerciseMetadataForMember } from '@/lib/coach-program-builder/recommendations';
import { getMovementProfile } from '@/lib/movement-profile/data';
import { getExercisesByExternalIds } from '@/lib/your-move/catalog';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { todaysLocalDate } from '@/lib/time/localDate';
import type {
  AssignedWorkoutStatus,
  CoachAssignedWorkout,
  CoachAssignedWorkoutWithContent,
  CoachProgramAssignment,
  CoachProgramTemplate,
  CoachProgramTemplateWithContent,
  ExerciseComfortRating,
  ExerciseDifficultyRating,
  ProgramAssignmentSummary,
  ProgramScheduleConfig,
  ProgramScheduleType,
  ProgramTemplateStatus,
} from '@mef/shared-types-contracts';
export type RecommendedExercise = {
  provider: string;
  externalId: string;
  name: string;
  matchReasons: string[];
};

async function resolveUserId(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function resolveMemberTimezone(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', memberId).single();
  return data?.timezone ?? 'America/New_York';
}

// ---------------------------------------------------------------------------
// Templates — coach-owned; every action here scopes to the signed-in coach.
// ---------------------------------------------------------------------------

export async function listMyProgramTemplatesAction(
  filters: TemplateListFilters = {}
): Promise<CoachProgramTemplate[]> {
  const context = await resolveUserId();
  if (!context) return [];
  return listCoachTemplates(context.supabase, context.userId, filters);
}

export async function getProgramTemplateAction(
  templateId: string
): Promise<CoachProgramTemplate | null> {
  const context = await resolveUserId();
  if (!context) return null;
  return getTemplate(context.supabase, templateId);
}

export async function getProgramTemplateWithContentAction(
  templateId: string
): Promise<CoachProgramTemplateWithContent | null> {
  const context = await resolveUserId();
  if (!context) return null;
  return getTemplateWithContent(context.supabase, templateId);
}

export async function createProgramTemplateAction(
  meta: TemplateMetaInput
): Promise<{ id: string } | ActionResult> {
  if (!meta.name.trim()) return { error: 'Give this program a name.' };
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const created = await createTemplate(context.supabase, context.userId, meta);
  if (!created) return { error: 'Could not create this program. Please try again.' };
  return { id: created.id };
}

export async function updateProgramTemplateMetaAction(
  templateId: string,
  meta: TemplateMetaInput
): Promise<ActionResult> {
  if (!meta.name.trim()) return { error: 'Give this program a name.' };
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const ok = await updateTemplateMeta(context.supabase, templateId, meta);
  if (!ok) return { error: 'Could not save this program. Please try again.' };
  return {};
}

export async function saveProgramTemplateContentAction(
  templateId: string,
  sections: TemplateContentSectionInput[]
): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const ok = await replaceTemplateContent(context.supabase, templateId, context.userId, sections);
  if (!ok) return { error: 'Could not save this program’s content. Please try again.' };
  return {};
}

export async function setProgramTemplateStatusAction(
  templateId: string,
  status: ProgramTemplateStatus
): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };
  const ok = await setTemplateStatus(context.supabase, templateId, status);
  if (!ok) return { error: 'Could not update this program. Please try again.' };
  return {};
}

export async function toggleProgramTemplateFavoriteAction(
  templateId: string,
  isFavorited: boolean
): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };
  const ok = await setTemplateFavorited(context.supabase, templateId, isFavorited);
  if (!ok) return { error: 'Could not update favorites. Please try again.' };
  return {};
}

export async function deleteProgramTemplateAction(templateId: string): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };
  const ok = await deleteTemplate(context.supabase, templateId);
  if (!ok) return { error: 'Could not delete this program. Please try again.' };
  return {};
}

export async function duplicateProgramTemplateAction(
  templateId: string
): Promise<{ id: string } | ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };
  const copy = await duplicateTemplate(context.supabase, context.userId, templateId);
  if (!copy) return { error: 'Could not duplicate this program. Please try again.' };
  return { id: copy.id };
}

// ---------------------------------------------------------------------------
// Movement Profile-informed recommendations — coach-facing, read-only.
// ---------------------------------------------------------------------------

/**
 * Hydrates recommended mef_exercise_metadata rows with a display name from
 * exercise_catalog — the metadata table itself has no name column (see its
 * own migration header), same "fetch the catalog's own name for display"
 * pattern as getMyFavoriteExercises (app/actions/exercise-library.ts).
 * Bounded to a small recommendation set, never a full catalog fan-out.
 */
export async function getRecommendedExercisesForClientAction(
  clientId: string
): Promise<RecommendedExercise[]> {
  const context = await resolveUserId();
  if (!context) return [];
  const profile = await getMovementProfile(context.supabase, clientId);
  const recommended = await getRecommendedExerciseMetadataForMember(context.supabase, profile);
  if (recommended.length === 0) return [];

  const catalogMap = await getExercisesByExternalIds(
    context.supabase,
    recommended.map((metadata) => metadata.external_id)
  );

  return recommended
    .map((metadata): RecommendedExercise | null => {
      const catalogRow = catalogMap.get(metadata.external_id);
      if (!catalogRow) return null;
      return {
        provider: metadata.provider,
        externalId: metadata.external_id,
        name: catalogRow.name,
        matchReasons: metadata.matchReasons,
      };
    })
    .filter((e): e is RecommendedExercise => e !== null);
}

// ---------------------------------------------------------------------------
// Assignments — coach-facing create/publish/cancel + coach's view of a
// client's assignment history.
// ---------------------------------------------------------------------------

export type AssignProgramInput = {
  templateId: string;
  scheduleType: ProgramScheduleType;
  scheduleConfig: ProgramScheduleConfig;
  assignmentNotes: string;
  internalNotes: string;
  publishImmediately: boolean;
};

export async function assignProgramToClientAction(
  clientId: string,
  input: AssignProgramInput
): Promise<{ id: string } | ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const template = await getTemplateWithContent(context.supabase, input.templateId);
  if (!template) return { error: 'Could not load this program.' };
  if (template.sections.every((s) => s.exercises.length === 0)) {
    return { error: 'Add at least one exercise to this program before assigning it.' };
  }

  const memberTimezone = await resolveMemberTimezone(context.supabase, clientId);
  const assignment = await createAssignment(context.supabase, {
    memberId: clientId,
    coachId: context.userId,
    template,
    scheduleType: input.scheduleType,
    scheduleConfig: input.scheduleConfig,
    assignmentNotes: input.assignmentNotes.trim() || null,
    internalNotes: input.internalNotes.trim() || null,
    publishImmediately: input.publishImmediately,
    lifecycle: { today: todaysLocalDate(memberTimezone) },
  });
  if (!assignment) return { error: 'Could not schedule any workouts from this program.' };

  // A member is on one program at a time. Assigning a new one supersedes
  // whatever she was already on, with lineage, rather than leaving two
  // programs both claiming to be current. Only when this one is actually
  // going to reach her: a draft is not yet a program.
  if (input.publishImmediately) {
    await supersedePreviousPrograms(context.supabase, {
      memberId: clientId,
      newAssignmentIds: [assignment.id],
      supersededBy: assignment.id,
      timezone: memberTimezone,
    });
  }

  if (input.publishImmediately) {
    try {
      const localDate = todaysLocalDate(await resolveMemberTimezone(context.supabase, clientId));
      await recordTimelineEvent(context.supabase, {
        memberId: clientId,
        eventType: 'coach_workout_assigned',
        localDate,
        title: `Your coach assigned "${template.name}"`,
        sourceFeature: 'coach_program_builder',
        sourceRecordId: assignment.id,
      });
    } catch (err) {
      console.error('assignProgramToClientAction timeline write failed', err);
    }
  }

  return { id: assignment.id };
}

export async function publishProgramAssignmentAction(
  assignmentId: string,
  memberId: string,
  templateName: string
): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };
  const ok = await publishAssignment(context.supabase, assignmentId);
  if (!ok) return { error: 'Could not publish this assignment. Please try again.' };

  try {
    const localDate = todaysLocalDate(await resolveMemberTimezone(context.supabase, memberId));
    await recordTimelineEvent(context.supabase, {
      memberId,
      eventType: 'coach_workout_assigned',
      localDate,
      title: `Your coach assigned "${templateName}"`,
      sourceFeature: 'coach_program_builder',
      sourceRecordId: assignmentId,
    });
  } catch (err) {
    console.error('publishProgramAssignmentAction timeline write failed', err);
  }

  return {};
}

/** Stops a program. Unchanged since migration 82 except that, like pause and resume, it now acts on every weekly session of the program rather than on one of them. */
export async function cancelProgramAssignmentAction(assignmentId: string): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const rows = await listAssignmentsInProgramGroup(context.supabase, assignmentId);
  const targets = rows.length > 0 ? rows.map((r) => r.id) : [assignmentId];
  for (const id of targets) {
    const ok = await cancelAssignment(context.supabase, id, context.userId);
    if (!ok) return { error: 'Could not cancel this assignment. Please try again.' };
  }
  return {};
}

/**
 * Holds a program where it is. The member's screen says it is paused, the
 * weeks stop advancing, and nothing about what she was given changes.
 * Reversible by resumeProgramAssignmentAction below.
 *
 * Acts on the whole program, not on the one assignment the coach happened
 * to click. A corrective program is two or three weekly-session
 * assignments, and pausing a third of a program is not a state this
 * product has: the live run that found this had a coach screen reading
 * "Paused" while the member's screen still, correctly, said the program
 * was running.
 */
export async function pauseProgramAssignmentAction(assignmentId: string): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const rows = await listAssignmentsInProgramGroup(context.supabase, assignmentId);
  if (rows.length === 0) return { error: 'Could not find this program.' };

  const timezone = await resolveMemberTimezone(context.supabase, rows[0]!.member_id);
  let paused = 0;
  for (const row of rows) {
    if (row.status !== 'active' && row.status !== 'upcoming') continue;
    if (!(await pauseAssignment(context.supabase, row.id))) continue;
    paused += 1;
    await recordProgramLifecycleEvent(context.supabase, {
      memberId: row.member_id,
      assignmentId: row.id,
      eventType: 'program_paused',
      timezone,
      fromStatus: row.status,
      toStatus: 'paused',
      week: row.current_week,
      durationWeeks: row.duration_weeks,
    });
  }

  if (paused === 0) {
    return { error: 'Only a program that is running or about to start can be paused.' };
  }
  return {};
}

/** Restarts a held program and gives back the days it was held, so a pause never costs the member part of her program. Acts on the whole program, same reason pause does. */
export async function resumeProgramAssignmentAction(assignmentId: string): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const rows = await listAssignmentsInProgramGroup(context.supabase, assignmentId);
  if (rows.length === 0) return { error: 'Could not find this program.' };

  const timezone = await resolveMemberTimezone(context.supabase, rows[0]!.member_id);
  const today = todaysLocalDate(timezone);
  let resumed = 0;
  for (const row of rows) {
    if (row.status !== 'paused') continue;
    if (!(await resumeAssignment(context.supabase, row.id, today))) continue;
    resumed += 1;
    const after = await getAssignmentLifecycle(context.supabase, row.id);
    await recordProgramLifecycleEvent(context.supabase, {
      memberId: row.member_id,
      assignmentId: row.id,
      eventType: 'program_resumed',
      timezone,
      fromStatus: 'paused',
      toStatus: after?.status ?? 'active',
      week: after?.current_week ?? row.current_week,
      durationWeeks: row.duration_weeks,
    });
  }

  if (resumed === 0) return { error: 'Only a paused program can be resumed.' };
  return {};
}

export async function getClientProgramAssignmentSummariesAction(
  clientId: string
): Promise<ProgramAssignmentSummary[]> {
  const supabase = createClient();
  return listAssignmentSummariesForMember(supabase, clientId);
}

export async function getClientAssignedWorkoutsAction(
  clientId: string
): Promise<CoachAssignedWorkout[]> {
  const supabase = createClient();
  return listAssignedWorkoutsForMember(supabase, clientId);
}

export async function getAssignedWorkoutDetailAction(
  assignedWorkoutId: string
): Promise<CoachAssignedWorkoutWithContent | null> {
  const supabase = createClient();
  return getAssignedWorkoutWithContent(supabase, assignedWorkoutId);
}

export async function updateAssignedWorkoutCoachNotesAction(
  assignedWorkoutId: string,
  coachNotes: string,
  internalNotes: string
): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };
  const ok = await updateAssignedWorkoutCoachNotes(context.supabase, assignedWorkoutId, {
    coachNotes: coachNotes.trim() || null,
    internalNotes: internalNotes.trim() || null,
  });
  if (!ok) return { error: 'Could not save these notes. Please try again.' };
  return {};
}

// ---------------------------------------------------------------------------
// Member-facing — a member's own assigned workouts.
// ---------------------------------------------------------------------------

export async function getMyProgramAssignmentsAction(): Promise<CoachProgramAssignment[]> {
  const context = await resolveUserId();
  if (!context) return [];
  return listAssignmentsForMember(context.supabase, context.userId);
}

export async function getMyAssignedWorkoutsAction(): Promise<CoachAssignedWorkout[]> {
  const context = await resolveUserId();
  if (!context) return [];
  return listAssignedWorkoutsForMember(context.supabase, context.userId);
}

/** The member's own programs, one view per program rather than one per assignment, each carrying where she is in it. See lib/program-lifecycle/memberView.ts. */
export async function getMyProgramViewsAction(): Promise<MemberProgramView[]> {
  const context = await resolveUserId();
  if (!context) return [];
  const [lifecycles, workouts] = await Promise.all([
    listMyProgramLifecycles(context.supabase),
    listAssignedWorkoutsForMember(context.supabase, context.userId),
  ]);
  return buildMemberProgramViews(lifecycles, workouts);
}

export async function getMyAssignedWorkoutDetailAction(
  assignedWorkoutId: string
): Promise<CoachAssignedWorkoutWithContent | null> {
  const context = await resolveUserId();
  if (!context) return null;
  return getAssignedWorkoutWithContent(context.supabase, assignedWorkoutId);
}

export async function updateMyAssignedWorkoutStatusAction(
  assignedWorkoutId: string,
  status: AssignedWorkoutStatus,
  memberFeedback?: string
): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const ok = await updateAssignedWorkoutStatus(context.supabase, assignedWorkoutId, {
    status,
    memberFeedback: memberFeedback !== undefined ? memberFeedback.trim() || null : undefined,
  });
  if (!ok) return { error: 'Could not update this workout. Please try again.' };

  if (status === 'completed' || status === 'skipped') {
    try {
      const localDate = todaysLocalDate(
        await resolveMemberTimezone(context.supabase, context.userId)
      );
      await recordTimelineEvent(context.supabase, {
        memberId: context.userId,
        eventType: status === 'completed' ? 'coach_workout_completed' : 'coach_workout_skipped',
        localDate,
        title:
          status === 'completed'
            ? 'Completed your assigned workout'
            : 'Skipped an assigned workout',
        sourceFeature: 'coach_program_builder',
        sourceRecordId: assignedWorkoutId,
      });
    } catch (err) {
      console.error('updateMyAssignedWorkoutStatusAction timeline write failed', err);
    }
  }

  return {};
}

export type UpdateMyAssignedExerciseInput = {
  status: AssignedWorkoutStatus;
  memberNotes?: string | undefined;
  difficultyRating?: ExerciseDifficultyRating | undefined;
  comfortRating?: ExerciseComfortRating | undefined;
};

export async function updateMyAssignedWorkoutExerciseAction(
  exerciseRowId: string,
  input: UpdateMyAssignedExerciseInput
): Promise<ActionResult> {
  const context = await resolveUserId();
  if (!context) return { error: 'Sign in required.' };

  const ok = await updateAssignedWorkoutExercise(context.supabase, exerciseRowId, {
    status: input.status,
    memberNotes: input.memberNotes !== undefined ? input.memberNotes.trim() || null : undefined,
    difficultyRating: input.difficultyRating,
    comfortRating: input.comfortRating,
  });
  if (!ok) return { error: 'Could not update this exercise. Please try again.' };
  return {};
}
