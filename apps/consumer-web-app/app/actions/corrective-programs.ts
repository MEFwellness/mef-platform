/**
 * Server actions for the Corrective Programs coach screen — triggers the
 * Corrective Program Generator Engine (lib/corrective-engine/), lists and
 * edits its pending_coach_review drafts, and approves one to a member.
 * Same "RLS is the real authorization boundary" convention as
 * app/actions/coach-programs.ts: these actions don't re-check the coach/
 * client relationship themselves, they just perform the read/write and
 * report whatever Postgres allows.
 *
 * Editing a draft's exercise content/notes reuses the existing Coach
 * Program Builder actions verbatim — saveProgramTemplateContentAction and
 * updateProgramTemplateMetaAction (app/actions/coach-programs.ts) — since a
 * corrective draft is just an ordinary coach_program_templates row (status
 * pending_coach_review) once it's saved; there is no separate "draft"
 * table or write path to duplicate.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type { BlueprintKey, DetectedPattern, SessionBlockType, CorrectiveExercise } from '@/lib/corrective-engine/types';
import { getLatestCompletedPostureAssessment } from '@/lib/corrective-engine/findings';
import { detectCorrectivePatterns } from '@/lib/corrective-engine/patternMapping';
import { loadCorrectiveExercisePool, DEFAULT_EQUIPMENT } from '@/lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '@/lib/corrective-engine/programGenerator';
import { saveCorrectiveProgramDraft } from '@/lib/corrective-engine/save';
import { qualifiesForBlock } from '@/lib/corrective-engine/blockQualification';
import { findSlotCoverageGaps, type SlotCoverageGap } from '@/lib/corrective-engine/coverage';
import {
  listCorrectiveDraftGroupsForMember,
  getCorrectiveDraftGroup,
  regenerateCorrectiveDraftGroup,
  approveCorrectiveDraftGroup,
  discardCorrectiveDraftGroup,
  type CorrectiveDraftGroup,
} from '@/lib/corrective-engine/review';
import {
  correctiveApprovalDefaults,
  type CorrectiveApprovalDefaults,
} from '@/lib/corrective-engine/approvalDefaults';
import { todaysLocalDate } from '@/lib/time/localDate';
import { composeProgramExplanation } from '@/lib/programs/explain/programExplanation';
import { loadMemberExplanationFacts } from '@/lib/programs/explain/memberFacts';
import { memberProgramFocus, memberProgramName } from '@/lib/programs/memberPresentation';
import type { BodyAssessmentFinding } from '@mef/shared-types-contracts';

async function resolveMemberTimezone(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', memberId).single();
  return data?.timezone ?? 'America/New_York';
}

async function resolveCoach(): Promise<{
  supabase: ReturnType<typeof createClient>;
  coachId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, coachId: user.id };
}

export interface MemberCorrectiveOverview {
  memberId: string;
  memberName: string;
  latestAssessment: {
    assessmentId: string;
    completedAt: string | null;
    findings: BodyAssessmentFinding[];
    patterns: DetectedPattern[];
  } | null;
  draftGroups: CorrectiveDraftGroup[];
}

/** Everything the entry screen needs for one member: their latest completed posture assessment (or null — the empty state), its detected corrective patterns, and any drafts already awaiting review. */
export async function getMemberCorrectiveOverviewAction(
  memberId: string
): Promise<MemberCorrectiveOverview | null> {
  const context = await resolveCoach();
  if (!context) return null;
  const { supabase, coachId } = context;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', memberId)
    .maybeSingle();
  if (!profile) return null;

  const [latest, draftGroups] = await Promise.all([
    getLatestCompletedPostureAssessment(supabase, memberId),
    listCorrectiveDraftGroupsForMember(supabase, coachId, memberId),
  ]);

  return {
    memberId,
    memberName: profile.display_name ?? 'This member',
    latestAssessment: latest
      ? {
          assessmentId: latest.assessmentId,
          completedAt: latest.completedAt,
          findings: latest.findings,
          patterns: detectCorrectivePatterns(latest.findings),
        }
      : null,
    draftGroups,
  };
}

export type GenerateCorrectiveDraftInput = {
  memberId: string;
  daysPerWeek: 2 | 3;
  equipment: string[];
};

export async function generateCorrectiveProgramDraftAction(
  input: GenerateCorrectiveDraftInput
): Promise<{ programGroupTag: string } | ActionResult> {
  const context = await resolveCoach();
  if (!context) return { error: 'Sign in required.' };
  const { supabase, coachId } = context;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', input.memberId)
    .maybeSingle();
  if (!profile) return { error: 'Could not find this member.' };

  const latest = await getLatestCompletedPostureAssessment(supabase, input.memberId);
  if (!latest) {
    return { error: 'This member needs a completed posture assessment before a corrective program can be generated.' };
  }

  const patterns = detectCorrectivePatterns(latest.findings);
  if (patterns.length === 0) {
    return {
      error:
        "This member's latest posture assessment has no active findings that map to a corrective pattern, so nothing can be generated from it.",
    };
  }

  const equipment = input.equipment.length > 0 ? input.equipment : [...DEFAULT_EQUIPMENT];

  try {
    const pool = await loadCorrectiveExercisePool(supabase, equipment);
    const seed = `${input.memberId}:${Date.now()}`;
    const draft = generateCorrectiveProgramDraft({
      patterns,
      daysPerWeek: input.daysPerWeek,
      equipment,
      seed,
      pool,
    });
    const saved = await saveCorrectiveProgramDraft(supabase, {
      draft,
      coachId,
      memberId: input.memberId,
      memberLabel: profile.display_name ?? 'This member',
    });
    return { programGroupTag: saved.programGroupTag };
  } catch (err) {
    console.error('generateCorrectiveProgramDraftAction failed', err);
    return { error: 'Could not generate a draft. Please try again.' };
  }
}

export async function getCorrectiveDraftGroupAction(
  memberId: string,
  programGroupTag: string
): Promise<CorrectiveDraftGroup | null> {
  const context = await resolveCoach();
  if (!context) return null;
  return getCorrectiveDraftGroup(context.supabase, context.coachId, memberId, programGroupTag);
}

export async function regenerateCorrectiveDraftAction(
  memberId: string,
  programGroupTag: string
): Promise<ActionResult> {
  const context = await resolveCoach();
  if (!context) return { error: 'Sign in required.' };
  const ok = await regenerateCorrectiveDraftGroup(context.supabase, {
    coachId: context.coachId,
    memberId,
    programGroupTag,
  });
  if (!ok) return { error: 'Could not regenerate this draft. Please try again.' };
  return {};
}

export async function approveCorrectiveDraftAction(
  memberId: string,
  programGroupTag: string,
  startDate: string,
  durationWeeks?: number,
  /** "Why this program", as the coach left it on the review screen (migration 176). Omitted assigns without one, which reads exactly as it did before. */
  memberExplanation?: string | null
): Promise<{ assignmentIds: string[]; replacedAssignmentIds: string[] } | ActionResult> {
  const context = await resolveCoach();
  if (!context) return { error: 'Sign in required.' };

  const timezone = await resolveMemberTimezone(context.supabase, memberId);
  const result = await approveCorrectiveDraftGroup(context.supabase, {
    coachId: context.coachId,
    memberId,
    programGroupTag,
    startDate,
    durationWeeks,
    today: todaysLocalDate(timezone),
    timezone,
    memberExplanation: memberExplanation?.trim() || null,
  });
  if (!result) return { error: 'Could not approve and assign this program. Please try again.' };
  return result;
}

/**
 * The draft of "Why this program" for a corrective-born program.
 *
 * Same composer the blueprint path uses, given the two things a generated
 * program knows about itself that an authored one does not: it has no
 * authored member description, and it IS named after a body area, so the
 * focus sentence stands in for the description. Everything else, her name,
 * her stated goal, the areas her assessment pointed at, is read by the same
 * function from the same tables.
 *
 * Reads only. Composing an explanation writes nothing anywhere.
 */
export async function getCorrectiveExplanationDraftAction(input: {
  memberId: string;
  correctiveTags: string[];
  templateName: string;
  equipment: string[];
  durationWeeks: number;
  sessionsPerWeek: number;
}): Promise<string> {
  const context = await resolveCoach();
  if (!context) return '';

  const facts = await loadMemberExplanationFacts(context.supabase, input.memberId);
  return composeProgramExplanation({
    memberFirstName: facts.firstName,
    programName: memberProgramName({
      templateName: input.templateName,
      correctiveTags: input.correctiveTags,
    }),
    // A generated program has no authored member description: the engine
    // wrote one, and it names a pattern and carries a seed. The focus
    // sentence is what stands in its place.
    memberDescription: null,
    focus: memberProgramFocus(input.correctiveTags),
    primaryGoal: facts.primaryGoal,
    goals: facts.goals,
    bodyAreas: facts.bodyAreas,
    equipment: input.equipment,
    durationWeeks: input.durationWeeks,
    sessionsPerWeek: input.sessionsPerWeek,
    // A corrective phase is four identical weeks, on purpose. Saying it
    // builds would be the one invented claim in the paragraph.
    buildsOverTime: false,
  });
}

/** What the approve screen pre-fills before a coach touches anything: the next matching weekday, the program's own duration, and the end date the two imply. */
export async function getCorrectiveApprovalDefaultsAction(
  memberId: string,
  sessionCount: number
): Promise<CorrectiveApprovalDefaults> {
  const context = await resolveCoach();
  const timezone = context
    ? await resolveMemberTimezone(context.supabase, memberId)
    : 'America/New_York';
  return correctiveApprovalDefaults(sessionCount, todaysLocalDate(timezone));
}

export async function discardCorrectiveDraftAction(
  memberId: string,
  programGroupTag: string
): Promise<ActionResult> {
  const context = await resolveCoach();
  if (!context) return { error: 'Sign in required.' };
  const ok = await discardCorrectiveDraftGroup(context.supabase, context.coachId, memberId, programGroupTag);
  if (!ok) return { error: 'Could not discard this draft. Please try again.' };
  return {};
}

/** The default swap/add picker's candidate list — every pool exercise that satisfies qualifiesForBlock() for this block, given the draft's detected blueprints. Severity doesn't affect qualification, so blueprint keys alone (a saved template's corrective_tags) are enough to reconstruct the patterns needed here. */
export async function getQualifiedCorrectiveCandidatesAction(
  blueprintKeys: BlueprintKey[],
  block: SessionBlockType,
  equipment: string[]
): Promise<CorrectiveExercise[]> {
  const context = await resolveCoach();
  if (!context) return [];
  const patterns: DetectedPattern[] = blueprintKeys.map((blueprint) => ({
    blueprint,
    severity: 'mild',
    supportingFindingIds: [],
  }));
  const pool = await loadCorrectiveExercisePool(context.supabase, equipment.length > 0 ? equipment : [...DEFAULT_EQUIPMENT]);
  return pool.filter((e) => qualifiesForBlock(e, block, patterns));
}

/**
 * The slots this program could never fill, for the coach review screen.
 *
 * Computed live from the same pool the generator draws from rather than
 * stored on the draft, so a gap disappears by itself the day the exercise
 * that closes it is given a video, with nothing to regenerate and nothing
 * to migrate. Returns an empty list on any failure, which shows the coach
 * no notice rather than a wrong one.
 */
export async function getCorrectiveSlotGapsAction(
  blueprintKeys: BlueprintKey[],
  equipment: string[]
): Promise<SlotCoverageGap[]> {
  const context = await resolveCoach();
  if (!context) return [];
  if (blueprintKeys.length === 0) return [];

  const patterns: DetectedPattern[] = blueprintKeys.map((blueprint) => ({
    blueprint,
    severity: 'mild',
    supportingFindingIds: [],
  }));

  try {
    const pool = await loadCorrectiveExercisePool(
      context.supabase,
      equipment.length > 0 ? equipment : [...DEFAULT_EQUIPMENT]
    );
    return findSlotCoverageGaps(pool, patterns);
  } catch (error) {
    console.error('getCorrectiveSlotGapsAction failed', error);
    return [];
  }
}
