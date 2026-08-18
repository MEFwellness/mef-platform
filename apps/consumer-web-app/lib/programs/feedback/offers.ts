/**
 * What she may be offered instead, and in what order.
 *
 * A MEMBER NEVER SEES THE LIBRARY. No search box, no browse, no "show
 * everything". She sees at most three exercises, chosen by rule, or she
 * sees none and is told why in a sentence. That is the difference between
 * a program somebody wrote for her and a menu.
 *
 * THE RULES, in the order they are applied. Every one of them can only
 * ever REMOVE a candidate; none of them can add one.
 *
 *   0. A LOCKED exercise offers nothing at all. Her coach chose that one
 *      specifically, and the screen says so rather than hiding the
 *      control, because a control that vanishes reads as a bug.
 *
 *   1. PAIN offers nothing. See ./safety.ts. TOO EASY offers nothing
 *      either, and for a reason worth stating plainly: making an exercise
 *      harder is a progression decision, progressions belong to her coach,
 *      and an app that answers "this was easy" by handing out a harder
 *      movement has just prescribed. It is logged and her coach is told.
 *
 *   2. Everything offered is CLIENT ASSIGNABLE (migration 170's one rule)
 *      and is not the exercise she already has.
 *
 *   3. Nothing in her AVOIDANCE HISTORY is ever offered, on any branch,
 *      for any reason. That list is the one thing in here that outlives a
 *      single report.
 *
 *   4. The slot's own REPLACEMENT CRITERIA still apply, read off the
 *      frozen row (migration 177) through the same
 *      lib/programs/blueprints/swap.ts a coach's picker uses. One set of
 *      rules, two callers.
 *
 *   5. TOO DIFFICULT narrows further, to genuine regressions only: the
 *      same movement done without load, or an easier graded version, or a
 *      lower stability demand. Never a lateral move, and never anything
 *      harder than what she has. This is the branch where "Bodyweight
 *      Split Squat for Split Squat" has to come out on top, and it does,
 *      because a bodyweight version of the same movement family is ranked
 *      first by construction.
 *
 *   6. Her REASON shapes the order of what is left. Missing equipment
 *      floats bodyweight up; not understanding it floats the simplest
 *      option up. Nothing here silences a rule, it only decides which of
 *      the survivors she reads first.
 *
 * Pure functions, no Supabase import. The reads live in ./candidates.ts so
 * that every rule in this file can be tested against a handful of literals.
 *
 * NO EM DASHES, per the house rule.
 */
import type {
  BlueprintBlock,
  BlueprintReplacementCriteria,
  ExerciseFeedbackReason,
  ExerciseSwapOption,
  ProgramDifficulty,
  ProgramBlueprintSlot,
} from '@mef/shared-types-contracts';
import { slotSwapBlockedReason, type SwapCandidate } from '../blueprints/swap';

/** At most this many, ever. Three is a choice; eight is a catalog. */
export const MAX_OFFERS = 3;

const DIFFICULTY_ORDER: Record<ProgramDifficulty, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/** Words in an exercise name that describe how it is loaded rather than what the movement is. */
const LOAD_WORDS = new Set([
  'bodyweight',
  'dumbbell',
  'dumbbells',
  'barbell',
  'kettlebell',
  'band',
  'banded',
  'cable',
  'machine',
  'weighted',
  'loaded',
  'smith',
  'with',
  'a',
  'the',
  'and',
]);

function movementTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !LOAD_WORDS.has(token))
  );
}

/**
 * Whether two exercises are the same movement done differently.
 *
 * Names, with the loading words stripped. Crude, and honest about being
 * crude: this is the signal the catalog actually carries, and the
 * alternative is a hand-maintained family table that would be wrong the
 * first week somebody added an exercise. It is only ever used to RANK, so
 * a miss costs an ordering and never a wrong offer.
 */
export function sameMovementFamily(a: string, b: string): boolean {
  const left = movementTokens(a);
  const right = movementTokens(b);
  if (left.size === 0 || right.size === 0) return false;
  const smaller = left.size <= right.size ? left : right;
  const larger = smaller === left ? right : left;
  for (const token of smaller) {
    if (!larger.has(token)) return false;
  }
  return true;
}

function isBodyweight(candidate: SwapCandidate): boolean {
  const equipment = (candidate.equipment ?? '').trim().toLowerCase();
  return equipment === '' || equipment === 'bodyweight' || equipment === 'none';
}

function difficultyRank(candidate: SwapCandidate): number | null {
  return candidate.difficulty ? DIFFICULTY_ORDER[candidate.difficulty] : null;
}

/**
 * Whether `candidate` is a genuine regression of `original`.
 *
 * Three ways to be one, and a hard veto that overrides all three: anything
 * graded harder than what she already has is never a regression, whatever
 * else is true about it.
 */
export function isRegressionOf(original: SwapCandidate, candidate: SwapCandidate): boolean {
  const originalRank = difficultyRank(original);
  const candidateRank = difficultyRank(candidate);

  // The veto. A candidate with no grade at all cannot be shown to be
  // harder, so it is allowed through on the other two tests only.
  if (originalRank !== null && candidateRank !== null && candidateRank > originalRank) {
    return false;
  }

  // 1. The same movement, done without the load.
  if (sameMovementFamily(original.name, candidate.name) && isBodyweight(candidate) && !isBodyweight(original)) {
    return true;
  }
  // 2. Graded easier.
  if (originalRank !== null && candidateRank !== null && candidateRank < originalRank) {
    return true;
  }
  // 3. The load taken off, which is the lower stability and lower demand
  //    version of almost any strength movement.
  if (!isBodyweight(original) && isBodyweight(candidate)) return true;

  return false;
}

export interface OfferInput {
  reason: ExerciseFeedbackReason;
  /** True when a coach or a blueprint chose this exercise specifically. */
  isLocked: boolean;
  /** The exercise she has, as the rules see it. */
  original: SwapCandidate;
  /** The block the exercise sits in, so the slot rules have something to check against. */
  block: BlueprintBlock;
  /** The slot's own criteria, read off the frozen row. Empty is the common case and still means "same block". */
  criteria: BlueprintReplacementCriteria;
  /** Everything that would do this slot's job, already filtered to client assignable by ./candidates.ts. */
  candidates: readonly SwapCandidate[];
  /** External ids she must never be offered again. */
  avoidedExternalIds: readonly string[];
  /** What she actually owns, when her movement profile says. Empty means "unknown", and unknown never excludes anything. */
  memberEquipment?: readonly string[] | null;
}

/**
 * A synthetic slot, so the frozen row is judged by exactly the same
 * function a blueprint slot is. The alternative is a second, similar,
 * quietly diverging implementation of the same rules, which is the thing
 * lib/programs/blueprints/swap.ts's header is about.
 */
function slotShapeFor(input: OfferInput): ProgramBlueprintSlot {
  return {
    block: input.block,
    is_locked: input.isLocked,
    replacement_criteria: input.criteria as unknown as ProgramBlueprintSlot['replacement_criteria'],
    equipment_requirement: [],
  } as unknown as ProgramBlueprintSlot;
}

function ownsEquipment(input: OfferInput, candidate: SwapCandidate): boolean {
  const owned = (input.memberEquipment ?? []).map((item) => item.trim().toLowerCase());
  if (owned.length === 0) return true;
  if (isBodyweight(candidate)) return true;
  return owned.includes((candidate.equipment ?? '').trim().toLowerCase());
}

/** The reasons that offer nothing at all, and the reason they do not. */
export function offersNothing(reason: ExerciseFeedbackReason, isLocked: boolean): boolean {
  return isLocked || reason === 'pain' || reason === 'too_easy';
}

/**
 * How this option differs from the one she has, in her words. Never a
 * difficulty grade, never a rule name, never "regression".
 */
function offerNote(input: OfferInput, candidate: SwapCandidate): string {
  if (input.reason === 'too_difficult') {
    if (isBodyweight(candidate) && !isBodyweight(input.original)) {
      return 'Same movement, no weight to hold.';
    }
    return 'A gentler way into the same work.';
  }
  if (input.reason === 'no_equipment' && isBodyweight(candidate)) {
    return 'Nothing to hold, just you and the floor.';
  }
  if (input.reason === 'no_space') return 'Stays in one spot.';
  if (input.reason === 'do_not_understand') return 'A simpler one that does the same job.';
  return 'Does the same job in this part of your session.';
}

/**
 * The two or three she is offered, in the order she reads them. An empty
 * result is a real answer, not a failure, and the screen says so warmly.
 */
export function offersForFeedback(input: OfferInput): ExerciseSwapOption[] {
  if (offersNothing(input.reason, input.isLocked)) return [];

  const avoided = new Set(input.avoidedExternalIds);
  const slot = slotShapeFor(input);

  const survivors = input.candidates.filter((candidate) => {
    if (candidate.externalId === input.original.externalId) return false;
    if (!candidate.isClientAssignable) return false;
    if (avoided.has(candidate.externalId)) return false;
    if (slotSwapBlockedReason(slot, candidate) !== null) return false;
    if (!ownsEquipment(input, candidate)) return false;
    // Missing equipment is answered with something that needs none, not
    // with a different thing she also cannot do.
    if (input.reason === 'no_equipment' && !isBodyweight(candidate)) return false;
    if (input.reason === 'too_difficult' && !isRegressionOf(input.original, candidate)) {
      return false;
    }
    return true;
  });

  const originalRank = difficultyRank(input.original);
  const scored = survivors.map((candidate) => {
    let score = 0;
    // The canonical regression: the same movement without the load. This
    // is what puts Bodyweight Split Squat at the top for Split Squat.
    if (sameMovementFamily(input.original.name, candidate.name)) score -= 40;
    if (input.reason === 'too_difficult') {
      if (isBodyweight(candidate) && !isBodyweight(input.original)) score -= 20;
      const rank = difficultyRank(candidate);
      if (rank !== null && originalRank !== null) score += (rank - originalRank) * 10;
      if (candidate.difficulty === 'beginner') score -= 5;
    }
    if (input.reason === 'no_equipment' && isBodyweight(candidate)) score -= 20;
    if (input.reason === 'do_not_understand' && candidate.difficulty === 'beginner') score -= 15;
    return { candidate, score };
  });

  scored.sort((a, b) =>
    a.score !== b.score ? a.score - b.score : a.candidate.name.localeCompare(b.candidate.name)
  );

  return scored.slice(0, MAX_OFFERS).map(({ candidate }) => ({
    provider: candidate.provider,
    externalId: candidate.externalId,
    name: candidate.name,
    note: offerNote(input, candidate),
  }));
}
