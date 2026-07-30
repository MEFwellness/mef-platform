/**
 * Phase 4 coaching-cue generation — for exercises with neither video nor
 * image, produces 2-3 short cues (setup, movement, what to feel) in the
 * platform's observational, non-clinical voice, written into
 * mef_exercise_metadata.coaching_cues (see normalize.ts — that column is
 * what the card/detail media-substitute reads). Reuses ExerciseAPI.dev's
 * OWN instructions/exerciseTips text when present — real, exercise-
 * specific content — rather than inventing generic boilerplate; only
 * falls back to a muscle/equipment/force template for exercises the
 * vendor gave no instructional text at all. `source` on the result says
 * which happened, so the Phase 4 report can be honest about how many of
 * each.
 */

export type CueGenerationInput = {
  name: string;
  instructions: string[];
  exerciseTips: string[];
  primaryMuscles: string[];
  equipment: string | null;
  force: 'push' | 'pull' | 'static' | null;
  mechanic: 'compound' | 'isolation' | null;
};

export type CueGenerationResult = {
  cues: string[];
  source: 'vendor_instructions' | 'template';
};

function humanizeMuscle(muscle: string): string {
  return muscle.replace(/_/g, ' ');
}

function truncateSentence(text: string, maxLength = 90): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Condenses the vendor's own instruction steps into a setup + movement cue, and its own tips (or the last instruction step) into a what-to-feel cue — real, exercise-specific text, not a template. */
function fromVendorInstructions(input: CueGenerationInput): string[] {
  const cues: string[] = [];
  if (input.instructions.length > 0) {
    cues.push(truncateSentence(input.instructions[0]!));
  }
  if (input.instructions.length > 1) {
    const middle = input.instructions[Math.min(1, input.instructions.length - 1)]!;
    cues.push(truncateSentence(middle));
  }
  if (input.exerciseTips.length > 0) {
    cues.push(truncateSentence(input.exerciseTips[0]!));
  } else if (input.primaryMuscles.length > 0) {
    cues.push(`Feel it through the ${humanizeMuscle(input.primaryMuscles[0]!)}.`);
  }
  return cues.slice(0, 3);
}

/** Template fallback for the minority of exercises with no vendor instructional text at all — built from the metadata every exercise already has (equipment/muscle/force), not invented specifics. */
function fromTemplate(input: CueGenerationInput): string[] {
  const muscle = input.primaryMuscles[0] ? humanizeMuscle(input.primaryMuscles[0]) : null;
  const equipment = input.equipment && input.equipment !== 'body only' ? input.equipment : null;

  const setup = equipment
    ? `Get set up with the ${equipment}, in a stable, controlled starting position.`
    : 'Find a stable, controlled starting position before you begin.';

  const movement =
    input.force === 'push'
      ? 'Drive through the movement with control — press away rather than rushing it.'
      : input.force === 'pull'
        ? 'Pull with control, leading with the target muscle rather than momentum.'
        : input.mechanic === 'isolation'
          ? 'Move through a focused range, keeping the rest of the body still.'
          : 'Move through the full range with control, keeping your form steady.';

  const feel = muscle ? `You should feel this mainly in the ${muscle}.` : 'Focus on a slow, controlled tempo.';

  return [setup, movement, feel];
}

export function generateCues(input: CueGenerationInput): CueGenerationResult {
  // Gate on real instruction steps, not the total cue count — a single
  // vendor instruction plus a generic muscle-feel filler shouldn't count
  // as "real" vendor-derived content.
  if (input.instructions.length >= 2) {
    return { cues: fromVendorInstructions(input), source: 'vendor_instructions' };
  }
  return { cues: fromTemplate(input), source: 'template' };
}
