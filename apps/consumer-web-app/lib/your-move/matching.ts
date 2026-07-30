/**
 * Conservative name/movement matching between our catalog (ExerciseAPI.dev)
 * and Your Move's catalog, for Phase 1 of the media build. Per the
 * explicit matching rule: same movement, not similar name ("Barbell
 * Squat" != "Barbell Split Squat") — when unsure, do not match. This is a
 * deterministic, explainable algorithm, not a fuzzy-similarity score,
 * specifically so every decision has a reason a human reviewer can check.
 *
 * Three outcomes, not two, because "no reasonable candidate at all" and
 * "a close-looking candidate that is actually a different movement" need
 * different reporting (Phase 1 asks for both a near-miss-rejections list
 * WITH reasons, and a separate unmatched list):
 *   - 'confident': exact match after normalization — same tokens, same
 *     order irrelevant-free (see normalizeExerciseName).
 *   - 'near_miss': a candidate is close (token-set difference is small)
 *     but not identical — rejected, with the differing tokens named as
 *     the reason.
 *   - 'unmatched': no candidate is even close.
 */

/** Tokens whose presence/absence on one side signals a genuinely different movement, not just a naming variant — the exact case the matching rule calls out ("Squat" vs "Split Squat"). */
const MOVEMENT_MODIFIER_WORDS = new Set([
  'split',
  'single',
  'leg',
  'arm',
  'bulgarian',
  'sumo',
  'close',
  'wide',
  'incline',
  'decline',
  'seated',
  'standing',
  'kneeling',
  'half',
  'assisted',
  'banded',
  'deficit',
  'pause',
  'tempo',
  'pulse',
  'narrow',
  'staggered',
  'walking',
  'reverse',
  'alternating',
  'one',
  'pistol',
  'archer',
  'nordic',
  'zercher',
  'jefferson',
  'landmine',
  'goblet',
  'front',
  'back',
  'overhead',
  'behind',
]);

/** Max total differing tokens (added + removed) still worth reporting as a *reasoned* near-miss rejection, rather than silently falling to "no candidate found." */
const NEAR_MISS_MAX_TOKEN_DIFF = 2;

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(name: string): string[] {
  return normalizeExerciseName(name).split(' ').filter(Boolean);
}

function tokenSetDiff(a: string[], b: string[]): { onlyInA: string[]; onlyInB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyInA: a.filter((t) => !setB.has(t)),
    onlyInB: b.filter((t) => !setA.has(t)),
  };
}

export type MatchCandidate = {
  id: string;
  title: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  hasVideo: boolean;
};

export type MatchResult =
  | { status: 'confident'; candidate: MatchCandidate; reasoning: string }
  | { status: 'near_miss'; candidate: MatchCandidate; reasoning: string }
  | { status: 'unmatched'; reasoning: string };

/**
 * Finds the best Your Move candidate for one of our exercises. Only
 * candidates with hasVideo=true are considered at all — a match to a
 * Your Move exercise with no video would give nothing the dominance rule
 * cares about.
 */
export function matchExercise(
  ourName: string,
  ourMuscles: string[],
  candidates: MatchCandidate[]
): MatchResult {
  const withVideo = candidates.filter((c) => c.hasVideo);
  if (withVideo.length === 0) {
    return { status: 'unmatched', reasoning: 'No Your Move candidate with video at all' };
  }

  const ourTokens = tokens(ourName);
  const ourNormalized = normalizeExerciseName(ourName);
  const ourMusclesLower = new Set(ourMuscles.map((m) => m.toLowerCase().replace(/_/g, ' ')));

  // 1. Exact normalized-name match.
  const exact = withVideo.find((c) => normalizeExerciseName(c.title) === ourNormalized);
  if (exact) {
    const muscleOverlap = ourMusclesLower.has(exact.muscleGroup.toLowerCase());
    return {
      status: 'confident',
      candidate: exact,
      reasoning: muscleOverlap
        ? `Exact name match; muscle group "${exact.muscleGroup}" corroborated by our primary/secondary muscles`
        : `Exact name match (muscle group "${exact.muscleGroup}" not directly corroborated, but the name is unambiguous)`,
    };
  }

  // 2. Close-but-different — a reasoned near-miss rejection, not a silent
  // unmatched. Pick the closest candidate by token-diff size.
  let closest: { candidate: MatchCandidate; diffSize: number; onlyInOurs: string[]; onlyInTheirs: string[] } | null =
    null;
  for (const candidate of withVideo) {
    const candidateTokens = tokens(candidate.title);
    const { onlyInA, onlyInB } = tokenSetDiff(ourTokens, candidateTokens);
    const diffSize = onlyInA.length + onlyInB.length;
    if (diffSize === 0) continue; // would have been caught by the exact match above

    // Two names sharing zero real tokens (e.g. "Adductor" vs "Burpee",
    // both single words) can still have a small diffSize by pure token
    // *count* coincidence — that's not a close name, it's two unrelated
    // names of similar length. Require actual shared vocabulary before
    // this counts as "close enough to be worth a reasoned rejection."
    // (ourTokens.length + candidateTokens.length - diffSize is exactly
    // 2x the intersection size — zero iff there is no overlap at all.)
    const hasSharedTokens = ourTokens.length + candidateTokens.length - diffSize > 0;
    if (!hasSharedTokens) continue;

    if (!closest || diffSize < closest.diffSize) {
      closest = { candidate, diffSize, onlyInOurs: onlyInA, onlyInTheirs: onlyInB };
    }
  }

  if (closest && closest.diffSize <= NEAR_MISS_MAX_TOKEN_DIFF) {
    const isMovementModifier = [...closest.onlyInOurs, ...closest.onlyInTheirs].some((t) =>
      MOVEMENT_MODIFIER_WORDS.has(t)
    );
    const diffDescription = [
      closest.onlyInOurs.length > 0 ? `ours adds "${closest.onlyInOurs.join(' ')}"` : null,
      closest.onlyInTheirs.length > 0 ? `theirs adds "${closest.onlyInTheirs.join(' ')}"` : null,
    ]
      .filter(Boolean)
      .join('; ');

    return {
      status: 'near_miss',
      candidate: closest.candidate,
      reasoning: isMovementModifier
        ? `"${ourName}" vs "${closest.candidate.title}" — ${diffDescription}, which changes the movement, not just the name (per the conservative matching rule)`
        : `"${ourName}" vs "${closest.candidate.title}" — ${diffDescription}, too close to trust without confirming it's the same movement, so left unmatched rather than guessed`,
    };
  }

  return {
    status: 'unmatched',
    reasoning: 'No sufficiently close Your Move candidate with video found',
  };
}
