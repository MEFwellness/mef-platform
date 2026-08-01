/**
 * Server actions for coach-side workout/program generation via Your
 * Move's /workouts/generate and /programs/generate endpoints. Coach-only:
 * unlike every other action in this codebase (see coach-programs.ts's own
 * header — RLS is normally the sole authorization boundary), this file
 * adds an explicit hasActiveRole check before ever making the live Your
 * Move HTTP call, because that call has no RLS of its own to fall back
 * on. Every call (success or failure) is logged to
 * your_move_generation_log before this action returns.
 *
 * A generated draft is never written to coach_program_templates until the
 * coach explicitly saves it (saveGeneratedWorkoutDraftAction /
 * saveGeneratedProgramDraftAction) — generation itself only returns a
 * plain object the client holds in local state and edits.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import type { ActionResult } from './auth';
import {
  buildYourMoveApiClientFromEnv,
  YourMoveApiError,
  type YourMoveErrorCode,
} from '@/lib/your-move/apiClient';
import {
  generatedWorkoutToDraft,
  generatedProgramToDraft,
  type GeneratedWorkoutDraft,
  type GeneratedProgramDraft,
  type GeneratedDraftSection,
} from '@/lib/your-move/generation';
import {
  createTemplate,
  replaceTemplateContent,
  setTemplateStatus,
  deleteTemplate,
  type TemplateContentSectionInput,
} from '@/lib/coach-program-builder/templates';
import type { ProgramDifficulty } from '@mef/shared-types-contracts';

type CoachContext = { supabase: ReturnType<typeof createClient>; userId: string };

async function resolveCoachContext(): Promise<CoachContext | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in required.' };
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) return { error: 'Only coaches can generate workouts or programs.' };
  return { supabase, userId: user.id };
}

function describeGenerationError(err: unknown): { code: string; message: string } {
  if (err instanceof YourMoveApiError) {
    const messages: Record<YourMoveErrorCode, string> = {
      INVALID_API_KEY: 'Generation is temporarily unavailable. Nothing was created. Please try again later.',
      RATE_LIMITED: 'Too many requests right now. Nothing was created. Wait a moment and try again.',
      NOT_FOUND: 'No matching workout could be generated for these options. Nothing was created. Try different muscle groups or equipment.',
      INVALID_PARAMETER: 'One of the selected options isn’t supported. Nothing was created. Try adjusting your selection.',
      INTERNAL_ERROR: 'The exercise provider had an error. Nothing was created. Please try again in a moment.',
      NETWORK_ERROR: 'Could not reach the exercise provider. Nothing was created. Check your connection and try again.',
      NOT_CONFIGURED: 'Generation isn’t configured yet. Nothing was created.',
    };
    return { code: err.code, message: messages[err.code] };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong generating this. Nothing was created. Please try again.' };
}

async function logGeneration(
  supabase: ReturnType<typeof createClient>,
  coachId: string,
  kind: 'workout' | 'program',
  requestParams: Record<string, unknown>,
  outcome:
    | { status: 'success'; resultSummary: Record<string, unknown> }
    | { status: 'error'; errorCode: string; errorMessage: string }
): Promise<string> {
  const { data, error } = await supabase
    .from('your_move_generation_log')
    .insert({
      coach_id: coachId,
      kind,
      request_params: requestParams,
      status: outcome.status,
      error_code: outcome.status === 'error' ? outcome.errorCode : null,
      error_message: outcome.status === 'error' ? outcome.errorMessage : null,
      result_summary: outcome.status === 'success' ? outcome.resultSummary : {},
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('logGeneration failed', error);
    return '';
  }
  return data.id as string;
}

async function appendSavedTemplateIds(
  supabase: ReturnType<typeof createClient>,
  logId: string,
  ids: string[]
): Promise<void> {
  if (!logId || ids.length === 0) return;
  const { data } = await supabase
    .from('your_move_generation_log')
    .select('saved_template_ids')
    .eq('id', logId)
    .maybeSingle();
  const current = (data?.saved_template_ids as string[] | null) ?? [];
  await supabase
    .from('your_move_generation_log')
    .update({ saved_template_ids: [...current, ...ids] })
    .eq('id', logId);
}

// ---------------------------------------------------------------------------
// Generate — live Your Move call, returns an editable draft, nothing saved.
// ---------------------------------------------------------------------------

export type GenerateWorkoutParams = {
  muscleGroups: string[];
  equipment?: string | undefined;
  difficulty?: string | undefined;
};

export type GenerateWorkoutResult = { draft: GeneratedWorkoutDraft; logId: string } | ActionResult;

export async function generateWorkoutDraftAction(
  params: GenerateWorkoutParams
): Promise<GenerateWorkoutResult> {
  const context = await resolveCoachContext();
  if ('error' in context) return context;
  if (params.muscleGroups.length === 0) return { error: 'Choose at least one muscle group.' };

  const client = buildYourMoveApiClientFromEnv();
  if (!client) {
    await logGeneration(context.supabase, context.userId, 'workout', params, {
      status: 'error',
      errorCode: 'NOT_CONFIGURED',
      errorMessage: 'YMOVE_API_KEY not set.',
    });
    return { error: 'Generation isn’t configured yet. Nothing was created.' };
  }

  try {
    const workout = await client.generateWorkout(params);
    const draft = await generatedWorkoutToDraft(context.supabase, workout);
    const logId = await logGeneration(context.supabase, context.userId, 'workout', params, {
      status: 'success',
      resultSummary: {
        name: workout.name,
        exerciseCount: workout.exerciseCount,
        estimatedMinutes: workout.estimatedMinutes,
      },
    });
    return { draft, logId };
  } catch (err) {
    const { code, message } = describeGenerationError(err);
    await logGeneration(context.supabase, context.userId, 'workout', params, {
      status: 'error',
      errorCode: code,
      errorMessage: message,
    });
    return { error: message };
  }
}

export type GenerateProgramParams = {
  goal: string;
  weeks: number;
  difficulty?: string | undefined;
};

export type GenerateProgramResult = { draft: GeneratedProgramDraft; logId: string } | ActionResult;

export async function generateProgramDraftAction(
  params: GenerateProgramParams
): Promise<GenerateProgramResult> {
  const context = await resolveCoachContext();
  if ('error' in context) return context;
  if (!params.goal) return { error: 'Choose a goal.' };
  if (!params.weeks || params.weeks < 1) return { error: 'Choose how many weeks this program should run.' };

  const client = buildYourMoveApiClientFromEnv();
  if (!client) {
    await logGeneration(context.supabase, context.userId, 'program', params, {
      status: 'error',
      errorCode: 'NOT_CONFIGURED',
      errorMessage: 'YMOVE_API_KEY not set.',
    });
    return { error: 'Generation isn’t configured yet. Nothing was created.' };
  }

  try {
    const program = await client.generateProgram({
      goal: params.goal,
      weeks: params.weeks,
      difficulty: params.difficulty,
    });
    const draft = await generatedProgramToDraft(context.supabase, program, params.weeks);
    const logId = await logGeneration(context.supabase, context.userId, 'program', params, {
      status: 'success',
      resultSummary: {
        name: program.name,
        goal: program.goal,
        daysPerWeek: program.daysPerWeek,
        split: program.split,
      },
    });
    return { draft, logId };
  } catch (err) {
    const { code, message } = describeGenerationError(err);
    await logGeneration(context.supabase, context.userId, 'program', params, {
      status: 'error',
      errorCode: code,
      errorMessage: message,
    });
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// Save — the coach's edited draft becomes ordinary Program Library
// content (coach_program_templates), set 'active' immediately so it shows
// up in the existing assign flow (AssignProgramPanel only lists 'active'
// templates) without an extra manual step.
// ---------------------------------------------------------------------------

export type SaveGeneratedWorkoutInput = {
  name: string;
  difficulty: ProgramDifficulty | null;
  estimatedDurationMinutes: number | null;
  coachNotes?: string | undefined;
  sections: TemplateContentSectionInput[];
  logId?: string | undefined;
};

export async function saveGeneratedWorkoutDraftAction(
  input: SaveGeneratedWorkoutInput
): Promise<{ id: string } | ActionResult> {
  const context = await resolveCoachContext();
  if ('error' in context) return context;
  if (!input.name.trim()) return { error: 'Give this workout a name.' };
  if (input.sections.every((s) => s.exercises.length === 0)) {
    return { error: 'Add at least one exercise before saving.' };
  }

  const created = await createTemplate(context.supabase, context.userId, {
    name: input.name.trim(),
    description: null,
    goal: null,
    difficulty: input.difficulty,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    equipment: [],
    programTags: [],
    correctiveTags: [],
    movementTags: [],
    targetMuscles: [],
    coachNotes: input.coachNotes?.trim() || null,
    internalNotes: null,
    memberInstructions: null,
  });
  if (!created) return { error: 'Could not save this workout. Please try again.' };

  const ok = await replaceTemplateContent(context.supabase, created.id, context.userId, input.sections);
  if (!ok) {
    await deleteTemplate(context.supabase, created.id);
    return { error: 'Could not save this workout’s exercises. Please try again.' };
  }
  await setTemplateStatus(context.supabase, created.id, 'active');

  if (input.logId) await appendSavedTemplateIds(context.supabase, input.logId, [created.id]);
  return { id: created.id };
}

export type SaveGeneratedProgramDayInput = {
  dayLabel: string;
  coachNotes?: string | undefined;
  sections: TemplateContentSectionInput[];
};

export type SaveGeneratedProgramInput = {
  programName: string;
  goal: string;
  difficulty: ProgramDifficulty | null;
  days: SaveGeneratedProgramDayInput[];
  logId?: string | undefined;
};

export async function saveGeneratedProgramDraftAction(
  input: SaveGeneratedProgramInput
): Promise<{ ids: string[] } | ActionResult> {
  const context = await resolveCoachContext();
  if ('error' in context) return context;
  if (!input.programName.trim()) return { error: 'Give this program a name.' };
  if (input.days.length === 0) return { error: 'This program has no days to save.' };
  if (input.days.some((d) => d.sections.every((s) => s.exercises.length === 0))) {
    return { error: 'Every day needs at least one exercise before saving.' };
  }

  const groupTag = `program:${input.programName.trim()}`;
  const createdIds: string[] = [];

  for (const day of input.days) {
    const created = await createTemplate(context.supabase, context.userId, {
      name: `${input.programName.trim()}: ${day.dayLabel}`,
      description: null,
      goal: input.goal || null,
      difficulty: input.difficulty,
      estimatedDurationMinutes: null,
      equipment: [],
      programTags: [groupTag],
      correctiveTags: [],
      movementTags: [],
      targetMuscles: [],
      coachNotes: day.coachNotes?.trim() || null,
      internalNotes: null,
      memberInstructions: null,
    });
    if (!created) {
      for (const id of createdIds) await deleteTemplate(context.supabase, id);
      return { error: `Could not save "${day.dayLabel}". Nothing from this program was saved. Please try again.` };
    }
    createdIds.push(created.id);

    const ok = await replaceTemplateContent(context.supabase, created.id, context.userId, day.sections);
    if (!ok) {
      for (const id of createdIds) await deleteTemplate(context.supabase, id);
      return { error: `Could not save "${day.dayLabel}"’s exercises. Nothing from this program was saved. Please try again.` };
    }
    await setTemplateStatus(context.supabase, created.id, 'active');
  }

  if (input.logId) await appendSavedTemplateIds(context.supabase, input.logId, createdIds);
  return { ids: createdIds };
}

export type { GeneratedDraftSection };
