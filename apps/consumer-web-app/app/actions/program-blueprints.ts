/**
 * Server actions for the blueprint library (administrator) and the unified
 * assign flow (coach).
 *
 * Same convention as app/actions/corrective-programs.ts: RLS is the real
 * authorization boundary and these actions do not try to be a second one.
 * They do check the role before a WRITE, for one narrow reason: the write
 * policies on the blueprint tables are `for insert` and `for all`, so an
 * approve a coach is not allowed to do fails as "0 rows updated" rather
 * than as an error, and "nothing happened, quietly" is the worst possible
 * answer to give a person who just pressed Approve. The check turns it
 * into a sentence. It never grants anything the database would refuse.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import type { ActionResult } from './auth';

import type {
  BlueprintPeriodization,
  BlueprintStatus,
  BlueprintWithSlots,
  MovementProgram,
  MovementProgramVersion,
  ProgramBlueprintSlot,
  ProgramDifficulty,
} from '@mef/shared-types-contracts';
import { loadBlockCandidates } from '@/lib/programs/blueprints/candidates';
import {
  candidatesForSlot,
  describeSlotCriteria,
  slotSwapBlockedReason,
} from '@/lib/programs/blueprints/swap';
import {
  getBlueprintVersion,
  listBlueprintPrograms,
  listBlueprintVersions,
} from '@/lib/programs/blueprints/data';
import {
  approveBlueprintVersion,
  archiveBlueprintVersion,
  duplicateBlueprint,
  editBlueprintVersion,
  type BlueprintVersionEdits,
} from '@/lib/programs/blueprints/versioning';
import { blueprintEquipment } from '@/lib/programs/blueprints/materialize';
import {
  saveProgramAsBlueprintDraft,
  type SaveAsBlueprintInput,
} from '@/lib/programs/blueprints/saveAsTemplate';
import {
  planFromBlueprint,
  plannedSessionSections,
  type PlannedSession,
} from '@/lib/programs/blueprints/plan';
import {
  assignMaterializedProgram,
  blueprintAssignmentBlockedReason,
  discardBlueprintDraft,
} from '@/lib/programs/blueprints/assign';
import {
  NAMED_PROGRAM_GROUP_TAG_PREFIX,
  NAMED_PROGRAM_TAG,
  NAMED_PROGRAM_VERSION_TAG_PREFIX,
  blueprintInternalNotes,
} from '@/lib/programs/blueprints/materialize';
import { materializeProgram } from '@/lib/programs/materialize';
import { composeProgramExplanation } from '@/lib/programs/explain/programExplanation';
import { loadMemberExplanationFacts } from '@/lib/programs/explain/memberFacts';
import { todaysLocalDate } from '@/lib/time/localDate';

/**
 * A failure with a sentence in it.
 *
 * Distinct from ActionResult, whose `error` is optional, because an action
 * that returns EITHER a value OR a failure has to be narrowable by the
 * caller: `'error' in result` narrows nothing when the error is optional,
 * since a result with no error also fails that test. Required here, so a
 * screen that has handled the failure is left holding the value.
 */
export interface ActionFailure {
  error: string;
}


// ---------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------

async function resolveStaff(): Promise<{
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

async function resolveAdmin(): Promise<
  { supabase: ReturnType<typeof createClient>; userId: string } | ActionFailure
> {
  const context = await resolveStaff();
  if (!context) return { error: 'Sign in required.' };
  const isAdmin = await hasActiveRole(context.supabase, context.userId, 'platform_administrator');
  if (!isAdmin) {
    return { error: 'Only an administrator can change a blueprint.' };
  }
  return context;
}

async function resolveMemberTimezone(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', memberId).single();
  return data?.timezone ?? 'America/New_York';
}

// ---------------------------------------------------------------------
// Reading the library
// ---------------------------------------------------------------------

export interface BlueprintLibraryRow {
  programId: string;
  key: string;
  displayName: string;
  /** The version a reader cares about: the newest one, whatever its status. */
  latestVersionId: string | null;
  latestVersionNumber: number | null;
  status: BlueprintStatus | null;
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  equipmentMode: string | null;
  periodization: BlueprintPeriodization | null;
  /** Every version of this program, newest first, so history is one click and not one query away. */
  versions: {
    id: string;
    versionNumber: number;
    status: BlueprintStatus;
    displayName: string;
    approvedAt: string | null;
    archivedAt: string | null;
    updatedAt: string;
  }[];
}

/** The whole library, programs with their versions. Staff read; there is nothing here a member can reach. */
export async function listBlueprintLibraryAction(): Promise<BlueprintLibraryRow[]> {
  const context = await resolveStaff();
  if (!context) return [];
  const { supabase } = context;

  const programs = await listBlueprintPrograms(supabase);
  const rows = await Promise.all(
    programs.map(async (program: MovementProgram) => {
      const versions = await listBlueprintVersions(supabase, program.id);
      const latest = versions[0] as MovementProgramVersion | undefined;
      return {
        programId: program.id,
        key: program.key,
        displayName: program.display_name,
        latestVersionId: latest?.id ?? null,
        latestVersionNumber: latest?.version_number ?? null,
        status: latest?.status ?? null,
        durationWeeks: latest?.duration_weeks ?? null,
        sessionsPerWeek: latest?.sessions_per_week ?? null,
        equipmentMode: latest?.equipment_mode ?? null,
        periodization: latest?.periodization ?? null,
        versions: versions.map((v) => ({
          id: v.id,
          versionNumber: v.version_number,
          status: v.status,
          displayName: v.display_name,
          approvedAt: v.approved_at,
          archivedAt: v.archived_at,
          updatedAt: v.updated_at,
        })),
      } satisfies BlueprintLibraryRow;
    })
  );
  return rows;
}

export interface BlueprintDetail {
  blueprint: BlueprintWithSlots;
  /** From the slots themselves rather than from the equipment mode, which is a label. */
  equipment: string[];
  /** Sibling versions of the same program, newest first. */
  versions: {
    id: string;
    versionNumber: number;
    status: BlueprintStatus;
    displayName: string;
  }[];
}

export async function getBlueprintDetailAction(versionId: string): Promise<BlueprintDetail | null> {
  const context = await resolveStaff();
  if (!context) return null;
  const blueprint = await getBlueprintVersion(context.supabase, versionId);
  if (!blueprint) return null;
  const versions = await listBlueprintVersions(context.supabase, blueprint.program_id);
  return {
    blueprint,
    equipment: blueprintEquipment(blueprint),
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.version_number,
      status: v.status,
      displayName: v.display_name,
    })),
  };
}

// ---------------------------------------------------------------------
// Changing the library. Administrator only.
// ---------------------------------------------------------------------

/**
 * Edits a version. A draft changes in place; an approved version gets a
 * successor, and the id in the result is the one to keep working on.
 */
export async function editBlueprintVersionAction(
  versionId: string,
  edits: BlueprintVersionEdits
): Promise<{ versionId: string; versionNumber: number } | ActionFailure> {
  const context = await resolveAdmin();
  if ('error' in context) return context;

  const updated = await editBlueprintVersion(context.supabase, versionId, edits, context.userId);
  if (!updated) {
    return { error: 'Could not save this blueprint. An archived version cannot be edited.' };
  }
  return { versionId: updated.id, versionNumber: updated.version_number };
}

export async function approveBlueprintVersionAction(versionId: string): Promise<ActionResult> {
  const context = await resolveAdmin();
  if ('error' in context) return context;

  const current = await getBlueprintVersion(context.supabase, versionId);
  if (!current) return { error: 'Could not find this blueprint version.' };
  if (current.status !== 'draft') {
    return { error: `This version is already ${current.status}. Only a draft can be approved.` };
  }
  const unfilled = current.slots.filter((slot) => !slot.external_id);
  if (unfilled.length > 0) {
    return {
      error: `This version has ${unfilled.length} slot${unfilled.length === 1 ? '' : 's'} with no exercise in it. Fill every slot before approving.`,
    };
  }

  const ok = await approveBlueprintVersion(context.supabase, versionId, context.userId);
  if (!ok) return { error: 'Could not approve this blueprint. Please try again.' };
  return {};
}

export async function archiveBlueprintVersionAction(versionId: string): Promise<ActionResult> {
  const context = await resolveAdmin();
  if ('error' in context) return context;

  const ok = await archiveBlueprintVersion(context.supabase, versionId, context.userId);
  if (!ok) return { error: 'Could not archive this blueprint. Please try again.' };
  return {};
}

export async function duplicateBlueprintAction(
  versionId: string,
  newDisplayName: string
): Promise<{ versionId: string } | ActionFailure> {
  const context = await resolveAdmin();
  if ('error' in context) return context;

  const created = await duplicateBlueprint(
    context.supabase,
    versionId,
    newDisplayName,
    context.userId
  );
  if (!created) return { error: 'Could not duplicate this blueprint. Give it a name of its own and try again.' };
  return { versionId: created.id };
}

// ---------------------------------------------------------------------
// The coach's side.
// ---------------------------------------------------------------------

export interface AssignableBlueprint {
  versionId: string;
  key: string;
  displayName: string;
  memberTitle: string | null;
  memberDescription: string | null;
  coachPurpose: string | null;
  intendedPopulation: string | null;
  cautions: string | null;
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  equipmentMode: string | null;
  periodization: BlueprintPeriodization | null;
  versionNumber: number;
}

/**
 * The named programs a coach may actually give somebody: approved
 * versions, newest version of each program, nothing else. A draft is not
 * on this list, which is the whole point of a draft.
 */
export async function listAssignableBlueprintsAction(): Promise<AssignableBlueprint[]> {
  const context = await resolveStaff();
  if (!context) return [];
  const { supabase } = context;

  const programs = await listBlueprintPrograms(supabase);
  const results: AssignableBlueprint[] = [];
  for (const program of programs) {
    const versions = await listBlueprintVersions(supabase, program.id);
    const approved = versions.find((v) => v.status === 'approved');
    if (!approved) continue;
    results.push({
      versionId: approved.id,
      key: program.key,
      displayName: program.display_name,
      memberTitle: approved.member_title,
      memberDescription: approved.member_description,
      coachPurpose: approved.coach_purpose,
      intendedPopulation: approved.intended_population,
      cautions: approved.cautions,
      durationWeeks: approved.duration_weeks,
      sessionsPerWeek: approved.sessions_per_week,
      equipmentMode: approved.equipment_mode,
      periodization: approved.periodization,
      versionNumber: approved.version_number,
    });
  }
  return results;
}

export interface BlueprintPlanForMember {
  blueprint: BlueprintWithSlots;
  sessions: PlannedSession[];
  equipment: string[];
  /** Non-null when this blueprint cannot be given to anybody right now. */
  blockedReason: string | null;
  /**
   * The draft of "Why this program", composed from this member's own facts
   * and this program's own shape (migration 176). The coach reads it,
   * edits it if she wants to, and what she ends up with is what gets
   * stored. Nothing is written by asking for it.
   */
  memberExplanationDraft: string;
}

/** The plan a coach opens: the blueprint's own lineup, dosed, ready to edit, with the draft explanation this member would be given. Reads only. */
export async function getBlueprintPlanAction(
  versionId: string,
  memberId: string
): Promise<BlueprintPlanForMember | null> {
  const context = await resolveStaff();
  if (!context) return null;
  const blueprint = await getBlueprintVersion(context.supabase, versionId);
  if (!blueprint) return null;

  const sessions = planFromBlueprint(blueprint);
  const equipment = blueprintEquipment(blueprint);
  const facts = await loadMemberExplanationFacts(context.supabase, memberId);

  return {
    blueprint,
    sessions,
    equipment,
    blockedReason: blueprintAssignmentBlockedReason({ status: blueprint.status, publish: true }),
    memberExplanationDraft: composeProgramExplanation({
      memberFirstName: facts.firstName,
      programName: blueprint.member_title ?? blueprint.program.display_name,
      memberDescription: blueprint.member_description,
      focus: null,
      primaryGoal: facts.primaryGoal,
      goals: facts.goals,
      bodyAreas: facts.bodyAreas,
      equipment,
      durationWeeks: blueprint.duration_weeks,
      sessionsPerWeek: blueprint.sessions_per_week ?? sessions.length,
      // A blueprint builds over time when any slot prescribes something
      // different in a later week. Read off the slots rather than off the
      // periodization label, because the label is a plan and the overrides
      // are what actually happens.
      buildsOverTime: blueprint.slots.some(
        (slot) => Object.keys(slot.week_overrides ?? {}).length > 0
      ),
    }),
  };
}

export interface AssignPlanInput {
  memberId: string;
  /** The blueprint this plan started from, for lineage. Null when it did not start from one. */
  blueprintVersionId: string | null;
  sessions: PlannedSession[];
  startDate: string;
  durationWeeks: number;
  /** Written into each session's coach notes, which a member reads once the program is published. */
  programNotes: string | null;
  /** "Why this program", as the coach left it. Stored on every assignment of the program and read by the member on her program screen. */
  memberExplanation: string | null;
  /** False materializes an unpublished draft the member cannot see. */
  publish: boolean;
}

export interface AssignedPlanResult {
  programGroupTag: string;
  templateIds: string[];
  assignmentIds: string[];
  replacedAssignmentIds: string[];
}

/**
 * Assigns the plan the coach is looking at, edits and all, through the
 * same materializer and the same assignment pipeline a corrective program
 * goes through. The blueprint is lineage on the assignment, not a second
 * source of truth: what gets written is what the coach approved.
 */
export async function assignPlanToMemberAction(
  input: AssignPlanInput
): Promise<AssignedPlanResult | ActionFailure> {
  const context = await resolveStaff();
  if (!context) return { error: 'Sign in required.' };
  const { supabase, userId: coachId } = context;

  const sessions = input.sessions.filter((session) => session.exercises.length > 0);
  if (sessions.length === 0) {
    return { error: 'There is nothing in this program to assign.' };
  }

  let blueprint: BlueprintWithSlots | null = null;
  if (input.blueprintVersionId) {
    blueprint = await getBlueprintVersion(supabase, input.blueprintVersionId);
    if (!blueprint) return { error: 'Could not find the program this plan came from.' };
    const blocked = blueprintAssignmentBlockedReason({
      status: blueprint.status,
      publish: input.publish,
    });
    if (blocked) return { error: blocked };
  }

  const title = blueprint?.member_title ?? blueprint?.program.display_name ?? 'Program';
  const programGroupTag = `${NAMED_PROGRAM_GROUP_TAG_PREFIX}${crypto.randomUUID()}`;
  const equipment = blueprint ? blueprintEquipment(blueprint) : [];

  const { templateIds } = await materializeProgram(supabase, {
    coachId,
    status: 'pending_coach_review',
    sessions: sessions.map((session) => ({
      templateMeta: {
        name: `${title}: Session ${session.session}`,
        description: blueprint?.member_description ?? null,
        goal: 'strength',
        difficulty: 'beginner',
        estimatedDurationMinutes: null,
        equipment,
        programTags: [
          programGroupTag,
          NAMED_PROGRAM_TAG,
          ...(blueprint ? [`${NAMED_PROGRAM_VERSION_TAG_PREFIX}${blueprint.id}`] : []),
          `named-program-member:${input.memberId}`,
        ],
        // A named program is not a corrective one, and leaving this empty
        // is what stops memberPresentation.ts renaming it after a postural
        // pattern it does not have.
        correctiveTags: [],
        movementTags: blueprint ? [blueprint.program.key] : [],
        targetMuscles: [],
        // Member-visible once published.
        coachNotes: session.coachNotes.trim() || input.programNotes?.trim() || null,
        internalNotes: blueprint ? blueprintInternalNotes(blueprint, session.session) : null,
        memberInstructions: null,
      },
      sections: plannedSessionSections(session),
    })),
  });

  if (templateIds.length === 0) {
    return { error: 'Could not write this program. Please try again.' };
  }

  const timezone = await resolveMemberTimezone(supabase, input.memberId);
  const assigned = await assignMaterializedProgram(supabase, {
    memberId: input.memberId,
    coachId,
    programGroupTag,
    templateIds,
    startDate: input.startDate,
    durationWeeks: Math.max(1, Math.min(52, Math.floor(input.durationWeeks) || 4)),
    today: todaysLocalDate(timezone),
    timezone,
    publish: input.publish,
    sourceBlueprintVersionId: blueprint?.id ?? null,
    memberExplanation: input.memberExplanation?.trim() || null,
  });
  if (!assigned) return { error: 'Could not assign this program. Please try again.' };
  return assigned;
}

/** Deletes an unpublished trial assignment and the templates it came from. Refuses to touch anything published. */
export async function discardAssignedPlanAction(input: {
  assignmentIds: string[];
  templateIds: string[];
}): Promise<ActionResult> {
  const context = await resolveStaff();
  if (!context) return { error: 'Sign in required.' };
  const ok = await discardBlueprintDraft(context.supabase, input);
  if (!ok) return { error: 'Could not discard this. A published program is never quietly removed.' };
  return {};
}

export interface SlotSwapOptions {
  /** Why nothing can be swapped here, or null. Set when the slot is locked. */
  blockedReason: string | null;
  /** What this slot will take, in a sentence, for the picker's header. */
  criteria: string;
  candidates: {
    provider: string;
    externalId: string;
    name: string;
    equipment: string | null;
    difficulty: string | null;
  }[];
}

/**
 * The exercises this blueprint slot will accept, already filtered by the
 * slot's own replacement criteria. The screen renders what comes back; it
 * does not decide eligibility itself, so a rule can only ever be in one
 * place.
 */
export async function getSlotSwapOptionsAction(
  slotId: string,
  excludeExternalIds: string[] = [],
  /**
   * The coach has explicitly unlocked this slot on her own screen, for
   * this member, for this assignment. It relaxes the lock and NOTHING
   * else: every other rule the slot carries is still applied below, and
   * the blueprint itself is not modified for anybody.
   */
  unlockedByCoach = false
): Promise<SlotSwapOptions | null> {
  const context = await resolveStaff();
  if (!context) return null;

  const { data: slotRow, error } = await context.supabase
    .from('program_blueprint_slots')
    .select('*')
    .eq('id', slotId)
    .maybeSingle();
  if (error || !slotRow) {
    if (error) console.error('getSlotSwapOptionsAction failed', error);
    return null;
  }
  const slot = { ...(slotRow as ProgramBlueprintSlot) };
  if (unlockedByCoach) slot.is_locked = false;

  if (slot.is_locked) {
    return {
      blockedReason: slotSwapBlockedReason(slot, {
        provider: 'your_move',
        externalId: '',
        name: 'anything',
        isClientAssignable: true,
      }),
      criteria: describeSlotCriteria(slot),
      candidates: [],
    };
  }

  const excluded = new Set(excludeExternalIds);
  const pool = await loadBlockCandidates(context.supabase, slot.block);
  return {
    blockedReason: null,
    criteria: describeSlotCriteria(slot),
    candidates: candidatesForSlot(slot, pool)
      .filter((candidate) => !excluded.has(candidate.externalId))
      .map((candidate) => ({
        provider: candidate.provider,
        externalId: candidate.externalId,
        name: candidate.name,
        equipment: candidate.equipment ?? null,
        difficulty: candidate.difficulty ?? null,
      })),
  };
}

/**
 * Whether a specific exercise may go in a specific slot. The full library
 * override path calls this, so a coach stepping outside the guided list is
 * still stopped by the slot's own rules rather than only by the picker's
 * filtering.
 */
export async function checkSlotSwapAction(
  slotId: string,
  candidate: { provider: string; externalId: string; name: string },
  /** Same meaning as on getSlotSwapOptionsAction: relaxes the lock and nothing else. */
  unlockedByCoach = false
): Promise<{ blockedReason: string | null }> {
  const context = await resolveStaff();
  if (!context) return { blockedReason: 'Sign in required.' };

  const { data: row } = await context.supabase
    .from('program_blueprint_slots')
    .select('*')
    .eq('id', slotId)
    .maybeSingle();
  if (!row) return { blockedReason: 'Could not find this slot.' };
  const slotRow = { ...(row as ProgramBlueprintSlot) };
  if (unlockedByCoach) slotRow.is_locked = false;

  const { data: catalogRow } = await context.supabase
    .from('exercise_catalog')
    .select('name, equipment, difficulty, is_client_assignable')
    .eq('provider', candidate.provider)
    .eq('external_id', candidate.externalId)
    .maybeSingle();

  return {
    blockedReason: slotSwapBlockedReason(slotRow, {
      provider: candidate.provider,
      externalId: candidate.externalId,
      name: (catalogRow?.name as string | undefined) ?? candidate.name,
      isClientAssignable: catalogRow?.is_client_assignable === true,
      // The catalog does not record a block or a movement pattern, so the
      // checks that depend on them are skipped rather than guessed at.
      // Equipment and difficulty it does record, and those are checked.
      equipment: (catalogRow?.equipment as string | null | undefined) ?? null,
      difficulty: (catalogRow?.difficulty as ProgramDifficulty | null | undefined) ?? null,
    }),
  };
}

/** Saves the plan a coach is looking at as a NEW draft blueprint, for an administrator to approve. Approves nothing. */
export async function saveProgramAsBlueprintDraftAction(
  input: Omit<SaveAsBlueprintInput, 'coachId'>
): Promise<{ versionId: string; displayName: string } | ActionFailure> {
  const context = await resolveStaff();
  if (!context) return { error: 'Sign in required.' };

  const created = await saveProgramAsBlueprintDraft(context.supabase, {
    ...input,
    coachId: context.userId,
  });
  if (!created) {
    return { error: 'Could not save this as a program. Give it a name of its own and try again.' };
  }
  return { versionId: created.id, displayName: created.program.display_name };
}
