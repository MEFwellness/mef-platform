/**
 * Coach-review data access for corrective-engine-generated program drafts —
 * the layer app/actions/corrective-programs.ts wraps for the Corrective
 * Programs screen. Reuses the Coach Program Builder's own functions
 * verbatim (listCoachTemplates/getTemplateWithContent/replaceTemplateContent/
 * setTemplateStatus/updateTemplateMeta/deleteTemplate, and assignments.ts's
 * createAssignment) — no parallel read/write path, same discipline as
 * save.ts.
 *
 * A "corrective program" has no row of its own — it's `daysPerWeek`
 * coach_program_templates (one per weekly session, "Session A/B/C") that
 * share one program_tags entry, `corrective-program:<uuid>` (save.ts's
 * `programGroupTag`). Every function here operates on that whole group at
 * once, since a coach reviews/edits/approves/discards a program, not one
 * session template in isolation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoachProgramTemplateWithContent } from '@mef/shared-types-contracts';
import {
  listCoachTemplates,
  getTemplateWithContent,
  replaceTemplateContent,
  updateTemplateMeta,
  setTemplateStatus,
  deleteTemplate,
} from '../coach-program-builder/templates';
import { createAssignment } from '../coach-program-builder/assignments';
import { supersedePreviousPrograms } from '../program-lifecycle/service';
import {
  CORRECTIVE_PROGRAM_DURATION_WEEKS,
  weeklyDayPatternFor,
} from './approvalDefaults';
import { getLatestCompletedPostureAssessment } from './findings';
import { detectCorrectivePatterns } from './patternMapping';
import { loadCorrectiveExercisePool } from './exercisePool';
import { generateCorrectiveProgramDraft } from './programGenerator';
import { sessionToSections } from './save';

const GROUP_TAG_PREFIX = 'corrective-program:';
const MEMBER_TAG_PREFIX = 'corrective-member:';

export interface CorrectiveDraftGroup {
  programGroupTag: string;
  memberId: string;
  templates: CoachProgramTemplateWithContent[];
}

function groupTagOf(template: { program_tags: string[] }): string | null {
  return template.program_tags.find((t) => t.startsWith(GROUP_TAG_PREFIX)) ?? null;
}

/** Every pending_coach_review corrective draft group for one member, newest first — a coach may have generated more than one over time (nothing here auto-discards an old one). */
export async function listCorrectiveDraftGroupsForMember(
  supabase: SupabaseClient,
  coachId: string,
  memberId: string
): Promise<CorrectiveDraftGroup[]> {
  const templates = await listCoachTemplates(supabase, coachId, {
    status: 'pending_coach_review',
    tag: `${MEMBER_TAG_PREFIX}${memberId}`,
  });

  const byGroup = new Map<string, typeof templates>();
  for (const template of templates) {
    const tag = groupTagOf(template);
    if (!tag) continue;
    const list = byGroup.get(tag) ?? [];
    list.push(template);
    byGroup.set(tag, list);
  }

  const groups: CorrectiveDraftGroup[] = [];
  for (const [programGroupTag, groupTemplates] of byGroup) {
    const ordered = groupTemplates.slice().sort((a, b) => a.name.localeCompare(b.name));
    const hydrated = await Promise.all(ordered.map((t) => getTemplateWithContent(supabase, t.id)));
    const content = hydrated.filter((t): t is CoachProgramTemplateWithContent => t !== null);
    if (content.length > 0) groups.push({ programGroupTag, memberId, templates: content });
  }

  return groups.sort((a, b) =>
    (b.templates[0]?.created_at ?? '').localeCompare(a.templates[0]?.created_at ?? '')
  );
}

export async function getCorrectiveDraftGroup(
  supabase: SupabaseClient,
  coachId: string,
  memberId: string,
  programGroupTag: string
): Promise<CorrectiveDraftGroup | null> {
  const groups = await listCorrectiveDraftGroupsForMember(supabase, coachId, memberId);
  return groups.find((g) => g.programGroupTag === programGroupTag) ?? null;
}

export interface RegenerateCorrectiveDraftInput {
  coachId: string;
  memberId: string;
  programGroupTag: string;
}

/**
 * Re-detects the member's current patterns and re-runs the generator with a
 * fresh seed, then overwrites each existing session template's content in
 * place (same daysPerWeek/equipment the group already has) — a regenerate
 * never creates a new template group, so any coach edits already made to
 * *other* sessions in the group are untouched and the group's identity
 * (programGroupTag) never changes underneath an open review screen.
 */
export async function regenerateCorrectiveDraftGroup(
  supabase: SupabaseClient,
  input: RegenerateCorrectiveDraftInput
): Promise<boolean> {
  const group = await getCorrectiveDraftGroup(supabase, input.coachId, input.memberId, input.programGroupTag);
  if (!group || group.templates.length === 0) return false;

  const daysPerWeek = group.templates.length === 3 ? 3 : 2;
  const equipment = group.templates[0]!.equipment;

  const latest = await getLatestCompletedPostureAssessment(supabase, input.memberId);
  if (!latest) return false;
  const patterns = detectCorrectivePatterns(latest.findings);
  if (patterns.length === 0) return false;

  const pool = await loadCorrectiveExercisePool(supabase, equipment);
  const seed = `${input.programGroupTag}:regen:${Date.now()}`;
  const draft = generateCorrectiveProgramDraft({ patterns, daysPerWeek, equipment, seed, pool });

  for (let i = 0; i < draft.weeklySessions.length; i++) {
    const template = group.templates[i];
    const session = draft.weeklySessions[i];
    if (!template || !session) continue;

    const contentOk = await replaceTemplateContent(supabase, template.id, input.coachId, sessionToSections(session, seed));
    if (!contentOk) return false;

    const newDescription = template.description
      ? template.description.replace(/seed "[^"]*"/, `seed "${seed}"`)
      : template.description;
    await updateTemplateMeta(supabase, template.id, {
      name: template.name,
      description: newDescription,
      goal: template.goal,
      difficulty: template.difficulty,
      estimatedDurationMinutes: template.estimated_duration_minutes,
      equipment: template.equipment,
      programTags: template.program_tags,
      correctiveTags: template.corrective_tags,
      movementTags: template.movement_tags,
      targetMuscles: template.target_muscles,
      coachNotes: template.coach_notes,
      internalNotes: template.internal_notes,
      memberInstructions: template.member_instructions,
    });
  }

  return true;
}

export interface ApproveCorrectiveDraftInput {
  coachId: string;
  memberId: string;
  programGroupTag: string;
  /** YYYY-MM-DD the first week's sessions should start from. */
  startDate: string;
  /** How long the program runs. Defaults to the corrective phase's own four weeks. */
  durationWeeks?: number | undefined;
  /** The member's own local date, so a program starting today opens active rather than upcoming. */
  today: string;
  /** The member's timezone, for the lifecycle events this approval writes. */
  timezone: string;
  /** "Why this program", written for the member (migration 176). Composed on the review screen from her own facts and edited by the coach; the same text lands on every weekly session. */
  memberExplanation?: string | null;
}

export interface ApprovedCorrectiveProgram {
  assignmentIds: string[];
  /** The programs this one superseded. Empty when the member was not on anything. */
  replacedAssignmentIds: string[];
}

/**
 * Moves every session template in the group from pending_coach_review to
 * active, then assigns each one to the member on its own weekly day for a
 * 4-week span, published immediately — delivered entirely through the
 * existing Coach Program Builder assignment pipeline (createAssignment),
 * which is exactly what the member's existing "My Programs" surface already
 * reads. Nothing here is member-visible until this runs: a
 * pending_coach_review template is invisible to the default template list
 * and templates are never member-readable at all (no member RLS policy
 * exists on coach_program_templates); a member only ever sees the frozen,
 * published coach_assigned_workouts rows this call creates.
 */
export async function approveCorrectiveDraftGroup(
  supabase: SupabaseClient,
  input: ApproveCorrectiveDraftInput
): Promise<ApprovedCorrectiveProgram | null> {
  const group = await getCorrectiveDraftGroup(supabase, input.coachId, input.memberId, input.programGroupTag);
  if (!group || group.templates.length === 0) return null;

  const dayPattern = weeklyDayPatternFor(group.templates.length);
  const durationWeeks = input.durationWeeks ?? CORRECTIVE_PROGRAM_DURATION_WEEKS;

  const assignmentIds: string[] = [];
  for (let i = 0; i < group.templates.length; i++) {
    const template = group.templates[i]!;
    const activated = await setTemplateStatus(supabase, template.id, 'active');
    if (!activated) return null;

    const assignment = await createAssignment(supabase, {
      memberId: input.memberId,
      coachId: input.coachId,
      template,
      scheduleType: 'weekly',
      scheduleConfig: {
        type: 'weekly',
        startDate: input.startDate,
        daysOfWeek: [dayPattern[i] ?? 1],
        weeks: durationWeeks,
      },
      assignmentNotes: null,
      internalNotes: null,
      publishImmediately: true,
      memberExplanation: input.memberExplanation ?? null,
      // All the sessions of one corrective program share the program's own
      // start date and duration, not the date of the first session each
      // happens to land on — otherwise "Week 2 of 4" would mean a different
      // week depending on which session she opened. The group tag they
      // already share becomes their program_group_key.
      lifecycle: {
        startDate: input.startDate,
        durationWeeks,
        programGroupKey: input.programGroupTag,
        today: input.today,
      },
    });
    if (!assignment) return null;
    assignmentIds.push(assignment.id);
  }

  // Whatever she was on before is superseded, with lineage, never deleted.
  // The whole batch is excluded so the program cannot replace itself.
  const superseded = await supersedePreviousPrograms(supabase, {
    memberId: input.memberId,
    newAssignmentIds: assignmentIds,
    supersededBy: assignmentIds[0]!,
    timezone: input.timezone,
  });

  return { assignmentIds, replacedAssignmentIds: superseded };
}

/** Deletes every session template in the group — a discarded draft leaves nothing behind (never archived/soft-deleted, since a draft that was never assigned has no history worth keeping). */
export async function discardCorrectiveDraftGroup(
  supabase: SupabaseClient,
  coachId: string,
  memberId: string,
  programGroupTag: string
): Promise<boolean> {
  const group = await getCorrectiveDraftGroup(supabase, coachId, memberId, programGroupTag);
  if (!group) return false;
  for (const template of group.templates) {
    const ok = await deleteTemplate(supabase, template.id);
    if (!ok) return false;
  }
  return true;
}
