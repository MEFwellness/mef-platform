/**
 * Corrective-role classification — pure, deterministic rules that turn an
 * exercise_catalog row's existing Your Move data (exercise_type tags,
 * category, muscles, difficulty, name/instructions) into the corrective
 * metadata layer used by the (future, not built here) AI corrective
 * program generator: which of the 7 corrective roles an exercise serves,
 * which muscles it lengthens vs. loads, how taxing it is, and whether it's
 * a spinal-flexion core movement that corrective programs must exclude.
 *
 * No AI/LLM call, no Your Move API call — every rule below reads only
 * fields already present on ExerciseCatalogRow. scripts/exercise-media/
 * generate-corrective-metadata.ts runs this over the full catalog and
 * writes the reviewable JSON + SQL migration; this file is the actual
 * authored rule set, kept here (not inline in the script) so it's
 * unit-testable on its own.
 */

export type CorrectiveRole =
  | 'release'
  | 'stretch'
  | 'mobility'
  | 'stability'
  | 'strength'
  | 'power'
  | 'core_stability';

export const CORRECTIVE_ROLES: readonly CorrectiveRole[] = [
  'release',
  'stretch',
  'mobility',
  'stability',
  'strength',
  'power',
  'core_stability',
];

export type StrainLevel = 'low' | 'moderate' | 'high';

export const STRAIN_LEVELS: readonly StrainLevel[] = ['low', 'moderate', 'high'];

/** Roles that mean "this exercise lengthens the target tissue" vs. "this exercise loads/strengthens it" — mutually exclusive per exercise, see classify() below. */
const LENGTHENING_ROLES: readonly CorrectiveRole[] = ['release', 'stretch', 'mobility'];
const LOADING_ROLES: readonly CorrectiveRole[] = ['strength', 'stability', 'power', 'core_stability'];

export interface CorrectiveClassificationInput {
  name: string;
  description: string | null;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  category: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  exerciseType: string[];
}

export interface CorrectiveClassification {
  correctiveRoles: CorrectiveRole[];
  musclesStretched: string[];
  musclesStrengthened: string[];
  strainLevel: StrainLevel;
  spinalFlexionCore: boolean;
  equipmentNeeded: string[];
  /** Not persisted — surfaced by the generator script's report for human review, per the task's "list anything classified with low confidence" requirement. */
  lowConfidence: boolean;
  confidenceNote: string | null;
}

// ============================================================================
// Muscle canonicalization — Your Move's raw muscle vocabulary (snake_case,
// sometimes an equipment name mistakenly used as a muscle) mapped to the
// plain-English muscle groups the 4 corrective blueprints name. A raw token
// can map to more than one canonical group (e.g. rectus_femoris is both a
// quad and a hip flexor).
// ============================================================================
const MUSCLE_CANON: Record<string, string[]> = {
  hip_flexors: ['hip flexors'],
  iliopsoas: ['hip flexors'],
  rectus_femoris: ['hip flexors', 'quads'],
  quadriceps: ['quads'],
  quads: ['quads'],
  erector_spinae: ['lumbar erectors'],
  spinal_erectors: ['lumbar erectors'],
  lower_back: ['lumbar erectors'],
  glutes: ['glutes'],
  glute_max: ['glutes'],
  glute_med: ['glutes'],
  hamstrings: ['hamstrings'],
  semitendinosus: ['hamstrings'],
  core: ['abdominals'],
  abs: ['abdominals'],
  rectus_abdominis: ['abdominals'],
  lower_abs: ['abdominals'],
  obliques: ['abdominals'],
  internal_obliques: ['abdominals'],
  external_obliques: ['abdominals'],
  transverse_abdominis: ['deep abdominals (TVA)', 'abdominals'],
  chest: ['pecs'],
  pectoralis_major: ['pecs'],
  pectoralis_minor: ['pecs'],
  upper_chest: ['pecs'],
  lower_chest: ['pecs'],
  upper_traps: ['upper traps'],
  lower_traps: ['lower traps'],
  middle_traps: ['mid traps'],
  traps: ['traps'],
  lats: ['lats'],
  sternocleidomastoid: ['SCM'],
  cervical_extensors: ['cervical extensors'],
  rhomboids: ['rhomboids'],
  serratus_anterior: ['serratus anterior'],
  neck: ['neck'],
  back: ['back'],
  upper_back: ['upper back'],
  shoulders: ['shoulders'],
  front_deltoids: ['shoulders'],
  rear_deltoids: ['shoulders'],
  lateral_deltoids: ['shoulders'],
  teres_major: ['rotator cuff'],
  teres_minor: ['rotator cuff'],
  infraspinatus: ['rotator cuff'],
  supraspinatus: ['rotator cuff'],
  rotator_cuff: ['rotator cuff'],
  calves: ['calves'],
  gastrocnemius: ['calves'],
  soleus: ['calves'],
  tibialis_anterior: ['shins'],
  peroneals: ['calves'],
  adductors: ['adductors'],
  abductors: ['abductors'],
  biceps: ['biceps'],
  biceps_long_head: ['biceps'],
  brachialis: ['biceps'],
  brachioradialis: ['forearms'],
  triceps: ['triceps'],
  triceps_lateral_head: ['triceps'],
  triceps_long_head: ['triceps'],
  forearms: ['forearms'],
  forearm_flexors: ['forearms'],
  forearm_extensors: ['forearms'],
  wrist_flexors: ['forearms'],
  full_body: ['full body'],
};

/** Your Move data-quality noise: equipment/category values that show up in the muscle fields but aren't muscles at all. Dropped, never canonicalized. */
const BOGUS_MUSCLE_TOKENS = new Set([
  'bodyweight',
  'kettlebell-exercises',
  'ketllebell',
  'smith-machine',
  'cardiovascular_system',
  'legs',
  'arms',
]);

function canonicalizeMuscle(raw: string): string[] {
  const key = raw.trim().toLowerCase();
  if (BOGUS_MUSCLE_TOKENS.has(key)) return [];
  if (MUSCLE_CANON[key]) return MUSCLE_CANON[key]!;
  return [key.replace(/_/g, ' ')];
}

function collectMuscles(input: CorrectiveClassificationInput): string[] {
  const raw = [input.primaryMuscle, ...input.secondaryMuscles].filter(
    (m): m is string => !!m && m.trim().length > 0
  );
  const canon = new Set<string>();
  for (const m of raw) {
    for (const c of canonicalizeMuscle(m)) canon.add(c);
  }
  return Array.from(canon);
}

// ============================================================================
// Spinal-flexion (crunch-type) detection — name-keyword match, with an
// exclusion list for movements that contain a flexion-sounding word but are
// actually spinal-extension work ("superman crunch" is a back extension,
// not an ab crunch, despite the name Your Move gave it).
// ============================================================================
const FLEXION_KEYWORDS = /\b(crunch|sit-?up|sit up|v-?up|jackknife|toe touch(ers?|es)?|curl-?up|curl up)\b/i;
// "toe touch(es)" alone also matches a standing hamstring-stretch (hip
// hinge, not spinal flexion) and plank/push-up "toe touch" stability
// drills (reaching a hand or knee across the body while holding a plank) —
// neither is a crunch-type movement, so both are excluded by name here.
const FLEXION_EXCLUSIONS =
  /\b(superman|super man|hyperextension|reverse hyper|back extension|plank|posterior|push[\s-]?ups?)\b/i;

function isSpinalFlexionCore(input: CorrectiveClassificationInput): boolean {
  const text = input.name;
  return FLEXION_KEYWORDS.test(text) && !FLEXION_EXCLUSIONS.test(text);
}

// ============================================================================
// Anti-movement / isometric core-stability pattern detection — Your Move's
// own tags are inconsistent for these (e.g. "Bird Dog" and "Dead Bug" ship
// with empty category/exercise_type), so name keywords are checked
// independently of the tag set.
// ============================================================================
const CORE_STABILITY_NAME_PATTERN =
  /\b(plank|dead ?bug|bird ?dog|pallof|hollow body|hollow hold|farmer|suitcase carry|anti-?rotation)\b/i;
const ISOMETRIC_HOLD_PATTERN = /\b(plank|dead ?bug|bird ?dog|pallof|hollow|bridge|carry|hold)\b/i;

const RELEASE_NAME_PATTERN = /\b(foam roll(ing)?|myofascial|trigger point|self-massage)\b/i;

const COMPOUND_LIFT_NAME_PATTERN = /\b(deadlift|squat|clean|snatch|thruster)\b/i;

function tagSet(input: CorrectiveClassificationInput): Set<string> {
  const tags = new Set<string>();
  for (const t of input.exerciseType) tags.add(t.toLowerCase());
  if (input.category) tags.add(input.category.toLowerCase());
  return tags;
}

function classifyRoles(input: CorrectiveClassificationInput, spinalFlexionCore: boolean): CorrectiveRole[] {
  const tags = tagSet(input);
  const roles = new Set<CorrectiveRole>();
  const searchText = `${input.name} ${input.description ?? ''}`;

  if (input.equipment?.toLowerCase() === 'foam roller' || RELEASE_NAME_PATTERN.test(searchText)) {
    roles.add('release');
  }
  if (tags.has('stretching') || tags.has('yoga')) {
    roles.add('stretch');
  }
  if (tags.has('mobility')) {
    roles.add('mobility');
  }
  if (tags.has('balance')) {
    roles.add('stability');
  }
  if (tags.has('plyometric') || tags.has('hiit')) {
    roles.add('power');
  }

  const looksLikeCore = tags.has('core') || CORE_STABILITY_NAME_PATTERN.test(input.name);
  const looksIsometric = tags.has('isometric') || ISOMETRIC_HOLD_PATTERN.test(input.name);
  if (looksLikeCore && looksIsometric && !spinalFlexionCore) {
    roles.add('core_stability');
  }

  // Dynamic/loaded work — strength is the catch-all for anything not
  // already captured by a more specific role above, including spinal-flexion
  // core movements themselves (still real strength exercises for general
  // library purposes; spinal_flexion_core is what excludes them from
  // corrective programs, not the absence of a role).
  const strengthTags = ['strength', 'calisthenics', 'functional', 'rehabilitation'];
  // Only force 'strength' from a bare "core" category/tag when nothing else
  // has already classified the movement — Your Move tags plenty of pure
  // stretches/mobility drills (e.g. a standing hamstring toe-touch) under
  // category "core" too, and those shouldn't also come back as a strength
  // exercise.
  const isDynamicCore = looksLikeCore && !roles.has('core_stability') && !roles.has('stretch') && !roles.has('mobility');
  if (strengthTags.some((t) => tags.has(t)) || isDynamicCore || spinalFlexionCore) {
    roles.add('strength');
  }

  // A handful of catalog rows ship with no exercise_type and no category at
  // all (e.g. some bodyweight staples) — fall back to strength so every
  // exercise gets at least one role; flagged low-confidence by the caller.
  if (roles.size === 0) {
    roles.add('strength');
  }

  // Guard invariant enforced at generation time as well as in the DB check
  // constraint: a spinal-flexion movement never carries a stability role.
  if (spinalFlexionCore) {
    roles.delete('stability');
    roles.delete('core_stability');
  }

  return Array.from(roles);
}

function classifyStrain(
  input: CorrectiveClassificationInput,
  roles: CorrectiveRole[]
): StrainLevel {
  const tags = tagSet(input);

  if (roles.includes('power')) return 'high';
  if (COMPOUND_LIFT_NAME_PATTERN.test(input.name) && input.difficulty !== 'beginner') return 'high';

  const pureLengthening = roles.length > 0 && roles.every((r) => LENGTHENING_ROLES.includes(r));
  if (pureLengthening) return 'low';

  if ((tags.has('warmup') || tags.has('cooldown')) && !roles.some((r) => ['strength', 'power'].includes(r))) {
    return 'low';
  }

  if (input.difficulty === 'advanced' && roles.some((r) => LOADING_ROLES.includes(r))) {
    return 'high';
  }

  return 'moderate';
}

function classifyEquipment(input: CorrectiveClassificationInput): string[] {
  const eq = input.equipment?.trim().toLowerCase();
  return eq ? [eq] : ['bodyweight'];
}

export function classifyExercise(input: CorrectiveClassificationInput): CorrectiveClassification {
  const spinalFlexionCore = isSpinalFlexionCore(input);
  const roles = classifyRoles(input, spinalFlexionCore);
  const muscles = collectMuscles(input);

  const lengthening = roles.some((r) => LENGTHENING_ROLES.includes(r));
  const loading = roles.some((r) => LOADING_ROLES.includes(r));

  // Loading wins when an exercise is tagged as both (e.g. a loaded mobility
  // flow) — guarantees a muscle is never listed as both stretched and
  // strengthened on the same row, by construction rather than by dedupe.
  let musclesStretched: string[] = [];
  let musclesStrengthened: string[] = [];
  if (loading) {
    musclesStrengthened = muscles;
  } else if (lengthening) {
    musclesStretched = muscles;
  }

  const strainLevel = classifyStrain(input, roles);
  const equipmentNeeded = classifyEquipment(input);

  const rawPrimaryBogus =
    !input.primaryMuscle || BOGUS_MUSCLE_TOKENS.has(input.primaryMuscle.trim().toLowerCase());
  const noUsableMuscleData = muscles.length === 0 && rawPrimaryBogus;
  const noTagData = input.exerciseType.length === 0 && !input.category;

  let confidenceNote: string | null = null;
  if (noUsableMuscleData) {
    confidenceNote = 'No usable muscle data (primary_muscle is a non-muscle placeholder and secondary_muscles is empty).';
  } else if (noTagData) {
    confidenceNote = 'No exercise_type tags and no category — role defaulted to strength from name/muscle only.';
  }

  return {
    correctiveRoles: roles,
    musclesStretched,
    musclesStrengthened,
    strainLevel,
    spinalFlexionCore,
    equipmentNeeded,
    lowConfidence: confidenceNote !== null,
    confidenceNote,
  };
}
