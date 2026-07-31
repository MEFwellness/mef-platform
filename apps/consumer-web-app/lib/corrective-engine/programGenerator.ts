/**
 * Orchestrates one 4-week corrective program draft: daysPerWeek distinct
 * full-body sessions (2 or 3), each built by sessionBuilder.ts from the
 * member's detected patterns.
 *
 * Program length is a single 4-week phase, and this phase's weekly session
 * set repeats identically across all 4 weeks — the same "one repeating
 * week, the caller/reader replicates it across weeks" convention this
 * codebase already adopted for Your Move's own /programs/generate
 * response (see BUILD_STATUS.md's "Coach-side workout/program generation"
 * entry). Progression (mobility -> stability -> strength -> power across
 * phases; power-tier work only from phase 2 onward) is a phase-to-phase
 * concern this single-phase generator doesn't build — a second call for
 * "phase 2" is a future extension, not built here.
 *
 * Pure function — no Supabase access. Callers load the exercise pool
 * (exercisePool.ts) and detect patterns (patternMapping.ts) first.
 */
import type { CorrectiveExercise, CorrectiveProgramDraft, DetectedPattern } from './types';
import { overallSeverity } from './patternMapping';
import { buildSession } from './sessionBuilder';
import { DEFAULT_EQUIPMENT } from './exercisePool';

export interface GenerateCorrectiveProgramInput {
  patterns: DetectedPattern[];
  daysPerWeek: 2 | 3;
  equipment?: readonly string[];
  seed: string;
  pool: CorrectiveExercise[];
}

const SESSION_LABELS = ['Session A', 'Session B', 'Session C'];

export function generateCorrectiveProgramDraft(input: GenerateCorrectiveProgramInput): CorrectiveProgramDraft {
  if (input.patterns.length === 0) {
    throw new Error('generateCorrectiveProgramDraft requires at least one detected corrective pattern.');
  }
  if (input.daysPerWeek !== 2 && input.daysPerWeek !== 3) {
    throw new Error('generateCorrectiveProgramDraft: daysPerWeek must be 2 or 3.');
  }

  const equipment = input.equipment ?? DEFAULT_EQUIPMENT;
  const weeklySessions = Array.from({ length: input.daysPerWeek }, (_, i) =>
    buildSession(input.pool, input.patterns, `${input.seed}:session${i}`, SESSION_LABELS[i]!)
  );

  return {
    patterns: input.patterns,
    overallSeverity: overallSeverity(input.patterns),
    daysPerWeek: input.daysPerWeek,
    equipment: [...equipment],
    seed: input.seed,
    weeklySessions,
  };
}
