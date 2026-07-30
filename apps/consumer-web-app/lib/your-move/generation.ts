/**
 * Coach-side workout/program generation via Your Move's /workouts/generate
 * and /programs/generate endpoints (lib/your-move/apiClient.ts). Turns a
 * raw generate response into an editable draft (never persisted on its
 * own — see your-move-generation.types.ts's header) and maps every
 * embedded exercise onto our own exercise_catalog by external_id, creating
 * a new catalog row on the fly when one doesn't exist yet.
 *
 * Catalog mapping deliberately reuses browse-mode-shaped data already
 * embedded in the generate response itself (confirmed live: every
 * exercise entry carries `videoExcludedReason: "browse_mode"`) rather
 * than making a second Your Move call — no extra request, no quota spent,
 * same discipline as fetch-your-move-catalog.ts. A newly-created row has
 * has_video forced false (never guessed true) — the next full catalog
 * refresh backfills the real flag; until then it falls back to generated
 * cues, the same graceful path any other no-video catalog exercise uses.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  YourMoveGeneratedExercise,
  YourMoveGeneratedExerciseEntry,
  YourMoveGeneratedProgram,
  YourMoveGeneratedWorkout,
} from './apiClient';
import { getExerciseByExternalId } from './catalog';
import { normalizeCatalogName } from '../exercise-library/catalogDedupe';
import type {
  AlternateExercises,
  ExercisePrescriptionFields,
  ProgramDifficulty,
  ProgramSectionType,
} from '@mef/shared-types-contracts';

const DEFAULT_PRESCRIPTION: ExercisePrescriptionFields = {
  sets: null,
  reps: null,
  rep_range_low: null,
  rep_range_high: null,
  time_seconds: null,
  distance_meters: null,
  rest_seconds: null,
  tempo: null,
  rpe: null,
  load: null,
  load_unit: null,
  resistance: null,
  band_color: null,
  side: null,
  unilateral: false,
  hold_duration_seconds: null,
  frequency: null,
  priority: 'medium',
  is_required: true,
  notes: null,
  coaching_cues: null,
  pain_modification_notes: null,
  alternate_exercises: {} as AlternateExercises,
};

export type GeneratedDraftExercise = ExercisePrescriptionFields & {
  provider: 'your_move';
  externalId: string;
  exerciseName: string;
};

export type GeneratedDraftSection = {
  name: string;
  sectionType: ProgramSectionType;
  exercises: GeneratedDraftExercise[];
};

export type GeneratedWorkoutDraft = {
  name: string;
  difficulty: ProgramDifficulty | null;
  estimatedDurationMinutes: number | null;
  sections: GeneratedDraftSection[];
};

export type GeneratedProgramDayDraft = {
  dayLabel: string;
  muscleGroups: string[];
  sections: GeneratedDraftSection[];
};

export type GeneratedProgramDraft = {
  programName: string;
  goal: string;
  difficulty: ProgramDifficulty | null;
  daysPerWeek: number;
  /** The coach's actually-requested week count — never the vendor's echoed `weeks` (see YourMoveGeneratedProgram's own doc comment: it's always 4, ignoring the request). */
  weeks: number;
  split: string;
  days: GeneratedProgramDayDraft[];
};

function normalizeVocab(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

const VALID_DIFFICULTIES: ProgramDifficulty[] = ['beginner', 'intermediate', 'advanced'];
function normalizeDifficulty(value: string | null | undefined): ProgramDifficulty | null {
  const normalized = normalizeVocab(value);
  return (VALID_DIFFICULTIES as string[]).includes(normalized ?? '')
    ? (normalized as ProgramDifficulty)
    : null;
}

type ResolvedCatalogExercise = { externalId: string; name: string };

/**
 * Maps a generate-embedded exercise onto exercise_catalog by external_id,
 * inserting a new row if one doesn't exist. Checks for a normalized-name
 * collision first (matching lib/exercise-library/catalogDedupe.ts's own
 * normalizer) so a Your Move id that was merged away by migration 121's
 * dedupe never reintroduces a duplicate under a second external_id.
 */
export async function ensureCatalogRowForGeneratedExercise(
  supabase: SupabaseClient,
  exercise: YourMoveGeneratedExercise
): Promise<ResolvedCatalogExercise> {
  const existing = await getExerciseByExternalId(supabase, exercise.id);
  if (existing) return { externalId: existing.external_id, name: existing.name };

  // A plain ilike filter can't catch a spacing/punctuation-only variant
  // (ilike with no wildcards is effectively an exact case-insensitive
  // match) — the whole point of this fallback is to catch exactly that
  // kind of variant (the same class of vendor duplicate migration 121's
  // dedupe already cleaned up), so this compares the normalized name
  // against every catalog row instead. Bounded (~800 rows today, two
  // columns), same "load the whole catalog for a name comparison"
  // precedent as scripts/exercise-media/dedupe-exercise-catalog.ts, and
  // only runs on the not-found-by-external_id path, not every call.
  const normalizedTarget = normalizeCatalogName(exercise.title);
  const { data: allNames } = await supabase.from('exercise_catalog').select('external_id, name');
  const nameMatch = ((allNames as { external_id: string; name: string }[] | null) ?? []).find(
    (row) => normalizeCatalogName(row.name) === normalizedTarget
  );
  if (nameMatch) return { externalId: nameMatch.external_id, name: nameMatch.name };

  const { data: inserted, error } = await supabase
    .from('exercise_catalog')
    .insert({
      provider: 'your_move' as const,
      external_id: exercise.id,
      name: exercise.title,
      slug: exercise.slug ?? null,
      description: exercise.description ?? null,
      instructions: exercise.instructions ?? [],
      exercise_tips: [],
      primary_muscle: normalizeVocab(exercise.muscleGroup),
      secondary_muscles: [],
      equipment: normalizeVocab(exercise.equipment),
      category: null,
      difficulty: normalizeDifficulty(exercise.difficulty),
      exercise_type: [],
      has_video: false,
      has_video_white: false,
      has_video_gym: false,
    })
    .select('external_id, name')
    .single();

  if (error || !inserted) {
    // Unique-violation race (two concurrent generations both missing the
    // same exercise) — re-check by external_id before giving up.
    const retry = await getExerciseByExternalId(supabase, exercise.id);
    if (retry) return { externalId: retry.external_id, name: retry.name };
    throw new Error(`Could not create a catalog entry for "${exercise.title}" (${exercise.id}).`);
  }
  return { externalId: inserted.external_id, name: inserted.name };
}

function toDraftExercise(
  entry: YourMoveGeneratedExerciseEntry,
  resolved: ResolvedCatalogExercise
): GeneratedDraftExercise {
  return {
    ...DEFAULT_PRESCRIPTION,
    provider: 'your_move',
    externalId: resolved.externalId,
    exerciseName: resolved.name,
    sets: entry.sets,
    reps: entry.reps,
    rest_seconds: entry.restSeconds,
  };
}

async function mapEntries(
  supabase: SupabaseClient,
  entries: YourMoveGeneratedExerciseEntry[]
): Promise<GeneratedDraftExercise[]> {
  const out: GeneratedDraftExercise[] = [];
  // Sequential, not Promise.all — avoids racing duplicate inserts when the
  // same not-yet-cataloged exercise appears more than once in one response
  // (e.g. warmup and main both drawing from a small full_body pool).
  for (const entry of entries) {
    const resolved = await ensureCatalogRowForGeneratedExercise(supabase, entry.exercise);
    out.push(toDraftExercise(entry, resolved));
  }
  return out;
}

async function entriesToSections(
  supabase: SupabaseClient,
  mainName: string,
  warmup: YourMoveGeneratedExerciseEntry[],
  main: YourMoveGeneratedExerciseEntry[],
  cooldown: YourMoveGeneratedExerciseEntry[]
): Promise<GeneratedDraftSection[]> {
  const sections: GeneratedDraftSection[] = [];
  if (warmup.length > 0) {
    sections.push({ name: 'Warm Up', sectionType: 'warm_up', exercises: await mapEntries(supabase, warmup) });
  }
  sections.push({ name: mainName, sectionType: 'strength', exercises: await mapEntries(supabase, main) });
  if (cooldown.length > 0) {
    sections.push({ name: 'Cooldown', sectionType: 'cooldown', exercises: await mapEntries(supabase, cooldown) });
  }
  return sections;
}

export async function generatedWorkoutToDraft(
  supabase: SupabaseClient,
  workout: YourMoveGeneratedWorkout
): Promise<GeneratedWorkoutDraft> {
  const sections = await entriesToSections(
    supabase,
    'Main Set',
    workout.warmup,
    workout.exercises,
    workout.cooldown
  );
  return {
    name: workout.name,
    difficulty: normalizeDifficulty(workout.difficulty),
    estimatedDurationMinutes: workout.estimatedMinutes ?? null,
    sections,
  };
}

export async function generatedProgramToDraft(
  supabase: SupabaseClient,
  program: YourMoveGeneratedProgram,
  requestedWeeks: number
): Promise<GeneratedProgramDraft> {
  const days: GeneratedProgramDayDraft[] = [];
  for (const day of program.weeklySchedule) {
    const sections = await entriesToSections(supabase, 'Main Set', day.warmup, day.exercises, day.cooldown);
    days.push({ dayLabel: day.name, muscleGroups: day.muscleGroups, sections });
  }
  return {
    programName: program.name,
    goal: program.goal,
    difficulty: normalizeDifficulty(program.difficulty),
    daysPerWeek: program.daysPerWeek,
    weeks: requestedWeeks,
    split: program.split,
    days,
  };
}
