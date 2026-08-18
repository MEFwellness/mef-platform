/**
 * WHAT EACH OUTCOME ACTUALLY BUILDS.
 *
 * Four of the six outcomes write a program. All four write the SAME shape,
 * through the SAME pipeline every other program in this app goes through:
 *
 *   PlannedSession[]  ->  materializeProgram  ->  assignMaterializedProgram
 *                                                  with publish: false
 *
 * There is no second assignment path here and no second materializer. What
 * a review produces is an ordinary unpublished assignment, which is exactly
 * what the coach's own assign flow produces when she previews rather than
 * publishes, and it is discarded by the same discardBlueprintDraft.
 *
 * PUBLISH IS HARD-WIRED FALSE. Not a parameter with a default, not a flag
 * the caller passes: the literal `false` appears in one place in this file
 * and nothing above it can change it. An unpublished assignment is
 * invisible to the member because coach_assigned_workouts' member_read_own
 * policy gates on published_at, so this is enforced by the database and not
 * only by this file.
 *
 * THE FOUR BUILDERS, and what each one changes about the plan it starts
 * from:
 *
 *   repeat       nothing at all. The same lineup, the same dosing, new
 *                dates.
 *   progress     the loads, and only the loads. Every other number is what
 *                the coach approved last time, because "progress" at the
 *                end of a four week phase means the weight went up, not
 *                that the program was rewritten.
 *   rotate       the exercises, and only the exercises. Every unlocked slot
 *                gets a different movement that the slot itself will
 *                accept, judged by lib/programs/blueprints/swap.ts, which
 *                is the same function a coach's picker and a member's swap
 *                both use. The dosing does not move, because the slot's job
 *                did not.
 *   recovery     none of the above. One week, built from the Root recovery
 *                session that already exists as data
 *                (movement_session_template_slots, migration 153), so a
 *                recovery week is the recovery content this product already
 *                has rather than a second one written here.
 *
 * NO EM DASHES, per the house rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlueprintBlock,
  CoachProgramTemplateWithContent,
  MemberExerciseAvoidance,
  ProgramBlueprintSlot,
} from '@mef/shared-types-contracts';
import { getTemplateWithContent } from '../../coach-program-builder/templates';
import { materializeProgram } from '../materialize';
import { assignMaterializedProgram } from '../blueprints/assign';
import { loadBlockCandidates } from '../blueprints/candidates';
import { slotSwapBlockedReason, type SwapCandidate } from '../blueprints/swap';
import {
  planFromTemplates,
  plannedSessionSections,
  type PlannedExercise,
  type PlannedSession,
} from '../blueprints/plan';
import { NAMED_PROGRAM_GROUP_TAG_PREFIX, NAMED_PROGRAM_TAG } from '../blueprints/materialize';
import { weeklyDayPatternFor } from '../../corrective-engine/approvalDefaults';
import { nextWeekdayOnOrAfter } from '../../program-lifecycle/transitions';
import { memberExerciseReasoning } from '../explain/exerciseReasoning';
import { blockPrescription } from '../../corrective-engine/dosing';
import type { ExerciseLoadSuggestion } from '../progression/suggest';
import { resolveApprovedLoad, type ApprovedLoadMap } from '../progression/suggest';
import type { ReviewOutcome } from './outcomes';

/** The Root recovery session a recovery week is built from. Data, not code: see migration 153. */
export const RECOVERY_SESSION_KEY = 'recovery_day';

export interface ReviewDraftResult {
  programGroupTag: string;
  /** The date the draft actually starts on, which may be a day or two after the one the coach picked. See writeReviewDraft. */
  startDate: string;
  templateIds: string[];
  assignmentIds: string[];
  /** Always empty. A draft supersedes nothing, which is why an unapproved review cannot end her current program. */
  replacedAssignmentIds: string[];
}

// ---------------------------------------------------------------------
// Reading the program the review is about.
// ---------------------------------------------------------------------

/** The plan a review starts from: the templates the current program was materialized out of. */
export async function planForCurrentProgram(
  supabase: SupabaseClient,
  templateIds: string[]
): Promise<PlannedSession[]> {
  const templates: CoachProgramTemplateWithContent[] = [];
  for (const id of templateIds) {
    const template = await getTemplateWithContent(supabase, id);
    if (template) templates.push(template as CoachProgramTemplateWithContent);
  }
  return planFromTemplates(templates);
}

// ---------------------------------------------------------------------
// The four transforms. Pure, so what each outcome changes is testable
// without a database.
// ---------------------------------------------------------------------

/** Repeat: the plan, untouched. Written out rather than inlined so the test that says "repeat changes nothing" has something to call. */
export function planForRepeat(sessions: PlannedSession[]): PlannedSession[] {
  return sessions.map((session) => ({
    ...session,
    // The next phase writes its own templates, so a template id from the
    // phase that just ended must not travel into it.
    templateId: null,
    exercises: session.exercises.map((exercise) => ({ ...exercise })),
  }));
}

/**
 * Progress: the same plan with the coach's approved weights on it.
 *
 * An exercise with no suggestion and no edit keeps whatever load it already
 * carried, which for every program written before this feature is null. A
 * cleared field is an explicit null and stays null: see
 * resolveApprovedLoad's three-way rule.
 */
export function planForProgress(
  sessions: PlannedSession[],
  suggestions: ExerciseLoadSuggestion[],
  edits: ApprovedLoadMap
): PlannedSession[] {
  const byExternalId = new Map(suggestions.map((s) => [s.externalId, s]));
  return planForRepeat(sessions).map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise) => {
      const suggestion = byExternalId.get(exercise.externalId);
      const touched =
        Object.prototype.hasOwnProperty.call(edits, exercise.externalId) || suggestion !== undefined;
      if (!touched) return exercise;
      const resolved = resolveApprovedLoad(exercise.externalId, edits, suggestion);
      return {
        ...exercise,
        prescription: {
          ...exercise.prescription,
          load: resolved.load,
          loadUnit: resolved.load === null ? null : resolved.unit ?? 'lbs',
        },
      };
    }),
  }));
}

/**
 * A synthetic slot, so a frozen exercise is judged by exactly the same
 * predicate a blueprint slot is. Same trick, and the same reason, as
 * lib/programs/feedback/offers.ts's slotShapeFor.
 */
function slotShapeFor(exercise: PlannedExercise): ProgramBlueprintSlot {
  return {
    block: exercise.block,
    is_locked: exercise.isLocked,
    replacement_criteria: {},
    equipment_requirement: [],
  } as unknown as ProgramBlueprintSlot;
}

export interface RotationPool {
  /** Everything the catalog offers for one block, already client assignable. */
  byBlock: Map<BlueprintBlock, SwapCandidate[]>;
  /** External ids she must never be offered. Her live avoidance list. */
  avoidedExternalIds: Set<string>;
}

/**
 * Rotate: a different movement in every unlocked slot.
 *
 * A locked slot keeps its exercise, always, for the same reason a member's
 * own swap cannot touch one: the locked slots are what make the program the
 * program. A slot with nothing eligible left keeps its exercise too, and
 * the caller says so on the screen rather than shipping a gap.
 *
 * Nothing already in the session is picked twice, so a rotation never
 * collapses two slots onto one movement.
 */
export function planForRotation(
  sessions: PlannedSession[],
  pool: RotationPool
): { sessions: PlannedSession[]; unchanged: string[] } {
  const unchanged: string[] = [];
  const used = new Set<string>();
  for (const session of sessions) {
    for (const exercise of session.exercises) used.add(exercise.externalId);
  }

  const rotated = planForRepeat(sessions).map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise, index) => {
      if (exercise.isLocked) {
        unchanged.push(exercise.exerciseName);
        return exercise;
      }
      const slot = slotShapeFor(exercise);
      const candidates = (pool.byBlock.get(exercise.block) ?? []).filter(
        (candidate) =>
          candidate.externalId !== exercise.externalId &&
          !used.has(candidate.externalId) &&
          !pool.avoidedExternalIds.has(candidate.externalId) &&
          slotSwapBlockedReason(slot, candidate) === null
      );
      const replacement = candidates[0];
      if (!replacement) {
        unchanged.push(exercise.exerciseName);
        return exercise;
      }
      used.add(replacement.externalId);
      return {
        ...exercise,
        key: `${exercise.key}:rotated`,
        provider: replacement.provider,
        externalId: replacement.externalId,
        exerciseName: replacement.name,
        // The old exercise's reasoning described the old exercise. A new
        // one is composed by the same rule the assign flow composes with,
        // so the member reads a line written for the movement she is
        // actually given.
        memberReasoning: memberExerciseReasoning({
          block: exercise.block,
          movementPattern: null,
          isPerSide: exercise.isPerSide,
          priorityRank: exercise.priorityRank,
          variantSeed: session.session,
          variantIndex: index,
        }),
        // A rotated exercise is a different movement, so a weight approved
        // for the one it replaced does not travel with it.
        prescription: { ...exercise.prescription, load: null, loadUnit: null },
      };
    }),
  }));

  return { sessions: rotated, unchanged };
}

export interface RecoverySlotRow {
  external_id: string;
  provider: string;
  exercise_name: string;
  prescription_type: 'time' | 'reps';
  prescription_seconds: number | null;
  prescription_reps: number | null;
  rest_seconds: number;
}

/**
 * Recovery: one session, one week, built from the Root recovery lineup.
 *
 * Every slot lands in the mobility block, which is where a recovery
 * movement belongs in the MEF sequence and is what keeps the section names
 * on her screen the ones she already knows. The prescription is the Root
 * session's own, not the dosing table's, because the Root session is the
 * content and its numbers were authored with it.
 */
export function planForRecoveryWeek(slots: RecoverySlotRow[]): PlannedSession[] {
  if (slots.length === 0) return [];
  const fallback = blockPrescription('mobility', 'mild');
  return [
    {
      session: 'A',
      templateId: null,
      label: 'Recovery Week',
      coachNotes:
        'A lighter week. Move gently, breathe, and let the last few weeks settle. Nothing here is meant to be hard.',
      exercises: slots.map((slot, index) => ({
        key: `recovery:${slot.external_id}`,
        provider: slot.provider,
        externalId: slot.external_id,
        exerciseName: slot.exercise_name,
        block: 'mobility' as BlueprintBlock,
        slotId: null,
        priorityRank: index + 1,
        isLocked: false,
        isPerSide: false,
        purpose: null,
        memberReasoning: memberExerciseReasoning({
          block: 'mobility',
          movementPattern: null,
          isPerSide: false,
          priorityRank: null,
          variantSeed: RECOVERY_SESSION_KEY,
          variantIndex: index,
        }),
        isCoachOverride: false,
        prescription: {
          sets: 1,
          reps: slot.prescription_type === 'reps' ? slot.prescription_reps : null,
          holdSeconds: slot.prescription_type === 'time' ? slot.prescription_seconds : null,
          tempo: null,
          restSeconds: slot.rest_seconds || fallback.rest_seconds,
          // A recovery week is never loaded.
          load: null,
          loadUnit: null,
        },
        weekOverrides: {},
      })),
    },
  ];
}

// ---------------------------------------------------------------------
// The reads the rotate and recovery builders need.
// ---------------------------------------------------------------------

export async function loadRotationPool(
  supabase: SupabaseClient,
  input: { memberId: string; blocks: BlueprintBlock[] }
): Promise<RotationPool> {
  const byBlock = new Map<BlueprintBlock, SwapCandidate[]>();
  for (const block of new Set(input.blocks)) {
    byBlock.set(block, await loadBlockCandidates(supabase, block));
  }

  const { data, error } = await supabase
    .from('member_exercise_avoidance')
    .select('external_id')
    .eq('member_id', input.memberId)
    .is('released_at', null);
  if (error) {
    // A read that failed must not quietly widen what she can be given. Same
    // rule, and the same reason, as loadAvoidedExternalIds.
    console.error('loadRotationPool (avoidance) failed', error);
    throw new Error('Could not read the avoidance list.');
  }

  return {
    byBlock,
    avoidedExternalIds: new Set(
      ((data ?? []) as Pick<MemberExerciseAvoidance, 'external_id'>[]).map((row) => row.external_id)
    ),
  };
}

/** The Root recovery session's ordered slots, with the catalog names a member reads. */
export async function loadRecoverySlots(supabase: SupabaseClient): Promise<RecoverySlotRow[]> {
  const { data: template, error: templateError } = await supabase
    .from('movement_session_templates')
    .select('id')
    .eq('session_key', RECOVERY_SESSION_KEY)
    .maybeSingle();
  if (templateError || !template) {
    if (templateError) console.error('loadRecoverySlots (template) failed', templateError);
    return [];
  }

  const { data: slots, error: slotError } = await supabase
    .from('movement_session_template_slots')
    .select('provider, external_id, prescription_type, prescription_seconds, prescription_reps, rest_seconds')
    .eq('template_id', template.id)
    .order('slot_order', { ascending: true });
  if (slotError || !slots) {
    if (slotError) console.error('loadRecoverySlots (slots) failed', slotError);
    return [];
  }

  const externalIds = slots.map((s) => s.external_id as string);
  const { data: catalog } = await supabase
    .from('exercise_catalog')
    .select('external_id, name, is_client_assignable')
    .in('external_id', externalIds);
  const nameById = new Map(
    ((catalog ?? []) as { external_id: string; name: string; is_client_assignable: boolean }[])
      // Migration 170's one rule, applied here too: a member is only ever
      // given an exercise she can be shown how to do.
      .filter((row) => row.is_client_assignable === true)
      .map((row) => [row.external_id, row.name])
  );

  return slots
    .filter((slot) => nameById.has(slot.external_id as string))
    .map((slot) => ({
      provider: (slot.provider as string) ?? 'your_move',
      external_id: slot.external_id as string,
      exercise_name: nameById.get(slot.external_id as string)!,
      prescription_type: slot.prescription_type as 'time' | 'reps',
      prescription_seconds: (slot.prescription_seconds as number | null) ?? null,
      prescription_reps: (slot.prescription_reps as number | null) ?? null,
      rest_seconds: (slot.rest_seconds as number | null) ?? 0,
    }));
}

// ---------------------------------------------------------------------
// Writing the draft.
// ---------------------------------------------------------------------

export interface WriteReviewDraftInput {
  memberId: string;
  coachId: string;
  timezone: string;
  today: string;
  startDate: string;
  durationWeeks: number;
  programTitle: string;
  memberExplanation: string | null;
  sessions: PlannedSession[];
  outcome: ReviewOutcome;
  /** Carried from the program this review is about, so the draft says it needs what the phase before it needed. */
  equipment: string[];
}

/**
 * The one place a review writes anything a member could eventually see, and
 * the one place `publish` is decided. It is `false`, it is a literal, and
 * there is no code path through this function that sets it otherwise.
 */
export async function writeReviewDraft(
  supabase: SupabaseClient,
  input: WriteReviewDraftInput
): Promise<ReviewDraftResult | null> {
  const sessions = input.sessions.filter((session) => session.exercises.length > 0);
  if (sessions.length === 0) return null;

  // A WEEK HAS TO CONTAIN ITS OWN SESSIONS.
  //
  // generateScheduledDates lays a program's weekly pattern over whole
  // calendar weeks and drops any occurrence that lands before the start
  // date. So a one week block starting on a Tuesday, whose pattern day is
  // Monday, produces ZERO sessions: the only Monday in its week is
  // yesterday. Found by tests/program-review-drafts.test.ts on the
  // recovery week outcome, which is the one that is always a single week.
  //
  // The fix is to start the draft on the first day its own pattern
  // actually uses, on or after the date the coach picked. Same rule
  // defaultCorrectiveStartDate already applies when a coach approves a
  // corrective program, so a review's draft and a corrective approval now
  // land on the same weekday for the same reason.
  const firstPatternDay = weeklyDayPatternFor(sessions.length)[0] ?? 1;
  const startDate = nextWeekdayOnOrAfter(input.startDate, firstPatternDay);

  const programGroupTag = `${NAMED_PROGRAM_GROUP_TAG_PREFIX}${crypto.randomUUID()}`;
  const equipment = input.equipment;

  const { templateIds } = await materializeProgram(supabase, {
    coachId: input.coachId,
    status: 'pending_coach_review',
    sessions: sessions.map((session) => ({
      templateMeta: {
        name: `${input.programTitle}: Session ${session.session}`,
        description: null,
        goal: 'strength',
        difficulty: 'beginner',
        estimatedDurationMinutes: null,
        equipment,
        programTags: [
          programGroupTag,
          NAMED_PROGRAM_TAG,
          `named-program-member:${input.memberId}`,
          `phase-review-outcome:${input.outcome}`,
        ],
        // A review's draft is not a corrective program, whatever the phase
        // it came out of was. Leaving this empty is what stops
        // memberPresentation.ts renaming it after a postural pattern.
        correctiveTags: [],
        movementTags: [],
        targetMuscles: [],
        coachNotes: session.coachNotes.trim() || null,
        internalNotes: `Drafted from an end-of-phase review (${input.outcome}). Unpublished until approved.`,
        memberInstructions: null,
      },
      sections: plannedSessionSections(session),
    })),
  });
  if (templateIds.length === 0) return null;

  const assigned = await assignMaterializedProgram(supabase, {
    memberId: input.memberId,
    coachId: input.coachId,
    programGroupTag,
    templateIds,
    startDate,
    durationWeeks: Math.max(1, Math.min(52, Math.floor(input.durationWeeks) || 4)),
    today: input.today,
    timezone: input.timezone,
    // THE INVARIANT. A review never publishes.
    publish: false,
    sourceBlueprintVersionId: null,
    memberExplanation: input.memberExplanation,
  });
  if (!assigned) return null;

  return {
    programGroupTag: assigned.programGroupTag,
    startDate,
    templateIds: assigned.templateIds,
    assignmentIds: assigned.assignmentIds,
    replacedAssignmentIds: assigned.replacedAssignmentIds,
  };
}
