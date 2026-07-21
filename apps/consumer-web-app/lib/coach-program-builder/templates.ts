/**
 * Data access for coach_program_templates / coach_program_template_sections
 * / coach_program_template_exercises (migration 82). Same shape as every
 * other data.ts in this codebase: pure functions taking a SupabaseClient,
 * RLS (coach_all_own_*) is the real authorization boundary.
 *
 * replaceTemplateContent() is a deliberate simplification: rather than
 * exposing a dozen granular create/update/delete/reorder RPCs for
 * sections and exercises, the builder UI holds the whole section+exercise
 * tree in local state (drag, drop, duplicate, delete, move between
 * sections, add, edit — all local edits) and saves it as one atomic
 * replace. A template rarely exceeds a few dozen exercises, so a full
 * delete-and-reinsert is cheap and sidesteps a much larger surface of
 * diff-and-reconcile logic for no real benefit — the same "don't build
 * more than the shape of the problem needs" restraint this codebase
 * applies elsewhere (see movement_programs' own "foundation only"
 * header). Content is never edited concurrently by two sessions, so there
 * is no lost-update risk this needs to guard against.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CoachProgramTemplate,
  CoachProgramTemplateExercise,
  CoachProgramTemplateSection,
  CoachProgramTemplateWithContent,
  ExercisePrescriptionFields,
  ProgramDifficulty,
  ProgramSectionType,
  ProgramTemplateStatus,
} from '@mef/shared-types-contracts';

export type TemplateMetaInput = {
  name: string;
  description: string | null;
  goal: string | null;
  difficulty: ProgramDifficulty | null;
  estimatedDurationMinutes: number | null;
  equipment: string[];
  programTags: string[];
  correctiveTags: string[];
  movementTags: string[];
  targetMuscles: string[];
  coachNotes: string | null;
  internalNotes: string | null;
  memberInstructions: string | null;
};

export type TemplateContentExerciseInput = ExercisePrescriptionFields & {
  provider: string;
  externalId: string;
  exerciseName: string;
  /** Why this exercise was selected — set only when it came from the Prescription Intelligence Engine. */
  selectionReasoning?: string | null;
};

export type TemplateContentSectionInput = {
  name: string;
  sectionType: ProgramSectionType;
  exercises: TemplateContentExerciseInput[];
  /** Why this block/section exists — set only when it came from the Prescription Intelligence Engine. */
  blockReasoning?: string | null;
};

function hydrateTemplate(
  template: CoachProgramTemplate,
  sections: CoachProgramTemplateSection[],
  exercises: CoachProgramTemplateExercise[]
): CoachProgramTemplateWithContent {
  const bySection = new Map<string, CoachProgramTemplateExercise[]>();
  for (const exercise of exercises) {
    const list = bySection.get(exercise.section_id) ?? [];
    list.push(exercise);
    bySection.set(exercise.section_id, list);
  }
  return {
    ...template,
    sections: sections
      .slice()
      .sort((a, b) => a.sequence_index - b.sequence_index)
      .map((section) => ({
        ...section,
        exercises: (bySection.get(section.id) ?? []).sort(
          (a, b) => a.sequence_index - b.sequence_index
        ),
      })),
  };
}

export type TemplateListFilters = {
  status?: ProgramTemplateStatus | undefined;
  search?: string | undefined;
  favoritedOnly?: boolean | undefined;
  tag?: string | undefined;
};

export async function listCoachTemplates(
  supabase: SupabaseClient,
  coachId: string,
  filters: TemplateListFilters = {}
): Promise<CoachProgramTemplate[]> {
  let query = supabase.from('coach_program_templates').select('*').eq('coach_id', coachId);

  if (filters.status) query = query.eq('status', filters.status);
  else query = query.neq('status', 'archived');
  if (filters.favoritedOnly) query = query.eq('is_favorited', true);
  if (filters.search) query = query.ilike('name', `%${filters.search}%`);
  if (filters.tag) {
    query = query.or(
      `program_tags.cs.{${filters.tag}},corrective_tags.cs.{${filters.tag}},movement_tags.cs.{${filters.tag}}`
    );
  }

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) {
    console.error('listCoachTemplates failed', error);
    return [];
  }
  return data as CoachProgramTemplate[];
}

export async function getTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<CoachProgramTemplate | null> {
  const { data, error } = await supabase
    .from('coach_program_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();
  if (error) {
    console.error('getTemplate failed', error);
    return null;
  }
  return data as CoachProgramTemplate | null;
}

export async function getTemplateWithContent(
  supabase: SupabaseClient,
  templateId: string
): Promise<CoachProgramTemplateWithContent | null> {
  const [{ data: template, error: templateError }, { data: sections, error: sectionsError }] =
    await Promise.all([
      supabase.from('coach_program_templates').select('*').eq('id', templateId).maybeSingle(),
      supabase
        .from('coach_program_template_sections')
        .select('*')
        .eq('template_id', templateId)
        .order('sequence_index', { ascending: true }),
    ]);

  if (templateError || !template) {
    if (templateError) console.error('getTemplateWithContent (template) failed', templateError);
    return null;
  }
  if (sectionsError) {
    console.error('getTemplateWithContent (sections) failed', sectionsError);
    return hydrateTemplate(template as CoachProgramTemplate, [], []);
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from('coach_program_template_exercises')
    .select('*')
    .eq('template_id', templateId)
    .order('sequence_index', { ascending: true });

  if (exercisesError) {
    console.error('getTemplateWithContent (exercises) failed', exercisesError);
    return hydrateTemplate(template as CoachProgramTemplate, sections ?? [], []);
  }

  return hydrateTemplate(
    template as CoachProgramTemplate,
    (sections as CoachProgramTemplateSection[]) ?? [],
    (exercises as CoachProgramTemplateExercise[]) ?? []
  );
}

export async function createTemplate(
  supabase: SupabaseClient,
  coachId: string,
  meta: TemplateMetaInput
): Promise<CoachProgramTemplate | null> {
  const { data, error } = await supabase
    .from('coach_program_templates')
    .insert({
      coach_id: coachId,
      name: meta.name,
      description: meta.description,
      goal: meta.goal,
      difficulty: meta.difficulty,
      estimated_duration_minutes: meta.estimatedDurationMinutes,
      equipment: meta.equipment,
      program_tags: meta.programTags,
      corrective_tags: meta.correctiveTags,
      movement_tags: meta.movementTags,
      target_muscles: meta.targetMuscles,
      coach_notes: meta.coachNotes,
      internal_notes: meta.internalNotes,
      member_instructions: meta.memberInstructions,
    })
    .select('*')
    .single();

  if (error) {
    console.error('createTemplate failed', error);
    return null;
  }
  return data as CoachProgramTemplate;
}

export async function updateTemplateMeta(
  supabase: SupabaseClient,
  templateId: string,
  meta: TemplateMetaInput
): Promise<boolean> {
  const { error } = await supabase
    .from('coach_program_templates')
    .update({
      name: meta.name,
      description: meta.description,
      goal: meta.goal,
      difficulty: meta.difficulty,
      estimated_duration_minutes: meta.estimatedDurationMinutes,
      equipment: meta.equipment,
      program_tags: meta.programTags,
      corrective_tags: meta.correctiveTags,
      movement_tags: meta.movementTags,
      target_muscles: meta.targetMuscles,
      coach_notes: meta.coachNotes,
      internal_notes: meta.internalNotes,
      member_instructions: meta.memberInstructions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId);

  if (error) {
    console.error('updateTemplateMeta failed', error);
    return false;
  }
  return true;
}

/** Deletes every existing section (cascades to its exercises) and reinserts the given content tree fresh, in order — see this file's header for why. */
export async function replaceTemplateContent(
  supabase: SupabaseClient,
  templateId: string,
  coachId: string,
  sections: TemplateContentSectionInput[]
): Promise<boolean> {
  const { error: deleteError } = await supabase
    .from('coach_program_template_sections')
    .delete()
    .eq('template_id', templateId);
  if (deleteError) {
    console.error('replaceTemplateContent (delete) failed', deleteError);
    return false;
  }

  if (sections.length === 0) {
    await supabase
      .from('coach_program_templates')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', templateId);
    return true;
  }

  const { data: insertedSections, error: sectionsError } = await supabase
    .from('coach_program_template_sections')
    .insert(
      sections.map((section, index) => ({
        template_id: templateId,
        coach_id: coachId,
        name: section.name,
        section_type: section.sectionType,
        sequence_index: index,
        block_reasoning: section.blockReasoning ?? null,
      }))
    )
    .select('id')
    .order('id');
  if (sectionsError || !insertedSections) {
    console.error('replaceTemplateContent (sections) failed', sectionsError);
    return false;
  }

  // Insert order isn't guaranteed to match array order once selected back,
  // so re-fetch ordered by sequence_index to reliably zip section rows
  // back up with their source input.
  const { data: orderedSections, error: orderedError } = await supabase
    .from('coach_program_template_sections')
    .select('id, sequence_index')
    .eq('template_id', templateId)
    .order('sequence_index', { ascending: true });
  if (orderedError || !orderedSections) {
    console.error('replaceTemplateContent (reorder fetch) failed', orderedError);
    return false;
  }

  const exerciseRows = orderedSections.flatMap((sectionRow, sectionIndex) => {
    const section = sections[sectionIndex];
    if (!section) return [];
    return section.exercises.map((exercise, exerciseIndex) => ({
      section_id: sectionRow.id,
      template_id: templateId,
      coach_id: coachId,
      provider: exercise.provider,
      external_id: exercise.externalId,
      exercise_name: exercise.exerciseName,
      sequence_index: exerciseIndex,
      sets: exercise.sets,
      reps: exercise.reps,
      rep_range_low: exercise.rep_range_low,
      rep_range_high: exercise.rep_range_high,
      time_seconds: exercise.time_seconds,
      distance_meters: exercise.distance_meters,
      rest_seconds: exercise.rest_seconds,
      tempo: exercise.tempo,
      rpe: exercise.rpe,
      load: exercise.load,
      load_unit: exercise.load_unit,
      resistance: exercise.resistance,
      band_color: exercise.band_color,
      side: exercise.side,
      unilateral: exercise.unilateral,
      hold_duration_seconds: exercise.hold_duration_seconds,
      frequency: exercise.frequency,
      priority: exercise.priority,
      is_required: exercise.is_required,
      notes: exercise.notes,
      coaching_cues: exercise.coaching_cues,
      pain_modification_notes: exercise.pain_modification_notes,
      alternate_exercises: exercise.alternate_exercises,
      selection_reasoning: exercise.selectionReasoning ?? null,
    }));
  });

  if (exerciseRows.length > 0) {
    const { error: exercisesError } = await supabase
      .from('coach_program_template_exercises')
      .insert(exerciseRows);
    if (exercisesError) {
      console.error('replaceTemplateContent (exercises) failed', exercisesError);
      return false;
    }
  }

  await supabase
    .from('coach_program_templates')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', templateId);
  return true;
}

export async function setTemplateStatus(
  supabase: SupabaseClient,
  templateId: string,
  status: ProgramTemplateStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('coach_program_templates')
    .update({
      status,
      archived_at: status === 'archived' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId);
  if (error) {
    console.error('setTemplateStatus failed', error);
    return false;
  }
  return true;
}

export async function setTemplateFavorited(
  supabase: SupabaseClient,
  templateId: string,
  isFavorited: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('coach_program_templates')
    .update({ is_favorited: isFavorited, updated_at: new Date().toISOString() })
    .eq('id', templateId);
  if (error) {
    console.error('setTemplateFavorited failed', error);
    return false;
  }
  return true;
}

export async function deleteTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<boolean> {
  const { error } = await supabase.from('coach_program_templates').delete().eq('id', templateId);
  if (error) {
    console.error('deleteTemplate failed', error);
    return false;
  }
  return true;
}

/** Deep-copies a template's meta and content into a brand-new draft template — the two never share rows afterward, so editing one never touches the other. */
export async function duplicateTemplate(
  supabase: SupabaseClient,
  coachId: string,
  templateId: string
): Promise<CoachProgramTemplate | null> {
  const source = await getTemplateWithContent(supabase, templateId);
  if (!source) return null;

  const copy = await createTemplate(supabase, coachId, {
    name: `${source.name} (Copy)`,
    description: source.description,
    goal: source.goal,
    difficulty: source.difficulty,
    estimatedDurationMinutes: source.estimated_duration_minutes,
    equipment: source.equipment,
    programTags: source.program_tags,
    correctiveTags: source.corrective_tags,
    movementTags: source.movement_tags,
    targetMuscles: source.target_muscles,
    coachNotes: source.coach_notes,
    internalNotes: source.internal_notes,
    memberInstructions: source.member_instructions,
  });
  if (!copy) return null;

  const contentInput: TemplateContentSectionInput[] = source.sections.map((section) => ({
    name: section.name,
    sectionType: section.section_type,
    blockReasoning: section.block_reasoning,
    exercises: section.exercises.map((exercise) => ({
      provider: exercise.provider,
      externalId: exercise.external_id,
      exerciseName: exercise.exercise_name,
      sets: exercise.sets,
      reps: exercise.reps,
      rep_range_low: exercise.rep_range_low,
      rep_range_high: exercise.rep_range_high,
      time_seconds: exercise.time_seconds,
      distance_meters: exercise.distance_meters,
      rest_seconds: exercise.rest_seconds,
      tempo: exercise.tempo,
      rpe: exercise.rpe,
      load: exercise.load,
      load_unit: exercise.load_unit,
      resistance: exercise.resistance,
      band_color: exercise.band_color,
      side: exercise.side,
      unilateral: exercise.unilateral,
      hold_duration_seconds: exercise.hold_duration_seconds,
      frequency: exercise.frequency,
      priority: exercise.priority,
      is_required: exercise.is_required,
      notes: exercise.notes,
      coaching_cues: exercise.coaching_cues,
      pain_modification_notes: exercise.pain_modification_notes,
      alternate_exercises: exercise.alternate_exercises,
      selectionReasoning: exercise.selection_reasoning,
    })),
  }));

  const ok = await replaceTemplateContent(supabase, copy.id, coachId, contentInput);
  return ok ? copy : copy;
}
