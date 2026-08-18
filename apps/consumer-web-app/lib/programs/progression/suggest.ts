/**
 * ONE PROGRAM'S LOAD SUGGESTIONS. The bridge between what she actually
 * logged (../signals) and the rules a coach edits (./loadRules.ts).
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: a suggestion appears only where
 * she has logged a weight for that exercise. Not "appears as zero", not
 * "appears greyed out", not "appears as the prescribed load". Absent. Every
 * caller renders the absence as the sentence about suggestions beginning
 * once she logs weights, and no caller is allowed to fill the gap with a
 * number of its own.
 *
 * That rule is enforced HERE rather than in a screen, because there are
 * three callers (the program panel's weekly nudge, the review's Progress
 * outcome, and the draft the outcome writes) and a rule enforced in three
 * screens is a rule enforced in two.
 *
 * Pure. No Supabase import: everything comes from a signal bundle the
 * caller already loaded.
 *
 * NO EM DASHES, per the house rule.
 */
import type { BlueprintPeriodization, CoachAssignedWorkoutExercise } from '@mef/shared-types-contracts';
import type { ProgramSignals } from '../signals/aggregate';
import { loadSignalsForExercise } from '../signals/aggregate';
import type { LoggedLoadUnit } from '../weightLogging';
import {
  NO_SUGGESTION_PENDING_PAIN_REVIEW,
  resolveModel,
  suggestLoad,
  type LoadPace,
  type LoadSuggestion,
} from './loadRules';

export interface ExerciseLoadSuggestion extends LoadSuggestion {
  provider: string;
  externalId: string;
  exerciseName: string;
}

export interface ProgramLoadSuggestions {
  /** The model actually applied. Linear, while the undulating wave is parked. */
  model: BlueprintPeriodization;
  /** What the blueprint itself records, applied or not. Null when it records nothing. */
  blueprintModel: BlueprintPeriodization | null;
  pace: LoadPace;
  /** Why this model and this pace, in one sentence for the coach's screen. */
  modelReason: string;
  /** One per exercise she has logged a weight for. Empty is the normal state of a brand new program. */
  suggestions: ExerciseLoadSuggestion[];
  /** True when she has logged nothing at all, which is the state the panel explains in words. */
  noLoggedWeights: boolean;
}

export interface SuggestProgramLoadsInput {
  signals: ProgramSignals;
  /** Every frozen exercise row of the program, so one exercise's own occurrences can be counted. */
  exercises: CoachAssignedWorkoutExercise[];
  /** The blueprint's own field. Null for a program that never recorded one, which reads as linear. */
  periodization: BlueprintPeriodization | null;
  /**
   * PARKED AND IGNORED, exactly as on LoadSuggestionInput. It was the
   * undulating wave's week index. No load changes because the program
   * reached another week, so nothing downstream reads it.
   */
  weekOfNextPhase?: number;
}

/**
 * Every suggestion this program can honestly make, plus the model that made
 * them. Exercises with no logged weight are simply not in the list.
 */
export function suggestProgramLoads(input: SuggestProgramLoadsInput): ProgramLoadSuggestions {
  const { model, blueprintModel, pace, why } = resolveModel({
    periodization: input.periodization,
    isCorrectiveProgram: input.signals.isCorrectiveProgram,
    hasOpenPainReport: input.signals.hasOpenPainReport,
  });

  const suggestions: ExerciseLoadSuggestion[] = [];
  for (const trend of input.signals.loadTrends) {
    const suggestion = suggestLoad({
      block: trend.block,
      lastLoggedLoad: trend.lastLoad,
      lastLoggedUnit: trend.unit,
      lastLoggedPerSide: trend.perSide,
      model,
      pace,
      signals: loadSignalsForExercise(
        input.signals,
        trend.externalId,
        input.exercises,
        trend.lastLoad
      ),
      ...(input.weekOfNextPhase === undefined ? {} : { weekOfNextPhase: input.weekOfNextPhase }),
    });
    if (!suggestion) continue;
    suggestions.push({
      ...suggestion,
      provider: trend.provider,
      externalId: trend.externalId,
      exerciseName: trend.exerciseName,
    });
  }

  suggestions.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

  return {
    model,
    blueprintModel,
    pace,
    modelReason: why,
    suggestions,
    noLoggedWeights: input.signals.loadTrends.length === 0,
  };
}

/**
 * "Suggested: 25 lbs, last logged 22.5". The one line the coach reads
 * beside the editable field, composed here so the review screen and the
 * program panel say it the same way.
 *
 * An exercise waiting on a pain review says ONLY the suppression sentence.
 * No "suggested", no "hold at", and no number dressed up as advice. The last
 * logged weight is still available to the coach, as a fact, in the reason
 * line beside it.
 */
export function describeSuggestion(suggestion: ExerciseLoadSuggestion): string {
  const side = suggestion.perSide ? ' per side' : '';
  if (suggestion.direction === 'needs_review') {
    return NO_SUGGESTION_PENDING_PAIN_REVIEW;
  }
  if (suggestion.suggestedLoad === null) {
    return `Last logged ${suggestion.lastLoggedLoad} ${suggestion.unit}${side}.`;
  }
  if (suggestion.suggestedLoad === suggestion.lastLoggedLoad) {
    return `Suggested: hold at ${suggestion.suggestedLoad} ${suggestion.unit}${side}, last logged ${suggestion.lastLoggedLoad}.`;
  }
  return `Suggested: ${suggestion.suggestedLoad} ${suggestion.unit}${side}, last logged ${suggestion.lastLoggedLoad}.`;
}

/**
 * The weekly nudge on the coach's program panel: the short list of
 * exercises whose signals say she is ready for more, in one sentence each.
 *
 * Only increases appear here. A hold is not news and a reduction belongs in
 * the review beside its reason, not in a nudge on a list screen.
 */
export function readyForMoreNudges(loads: ProgramLoadSuggestions): string[] {
  return loads.suggestions
    .filter((s) => s.direction === 'increase' && s.suggestedLoad !== null)
    .map(
      (s) =>
        `Signals suggest she is ready for more on ${s.exerciseName}. She last logged ${s.lastLoggedLoad} ${s.unit}${s.perSide ? ' per side' : ''}.`
    );
}

/** The coach's edits, keyed by external id, as they come back off the review form. A cleared field is an explicit null and means "no prescribed weight", never "use the suggestion". */
export type ApprovedLoadMap = Record<string, { load: number | null; unit: LoggedLoadUnit } | null>;

/**
 * What actually gets written for one exercise: the coach's number when she
 * touched the field, the suggestion when she left it alone, and null when
 * she cleared it.
 *
 * The three-way distinction is the whole point. `undefined` in the map
 * means she never touched it; an explicit `null` means she deliberately
 * cleared it, and a cleared field must not silently come back as the
 * suggestion on save.
 */
export function resolveApprovedLoad(
  externalId: string,
  edits: ApprovedLoadMap,
  suggestion: ExerciseLoadSuggestion | undefined
): { load: number | null; unit: LoggedLoadUnit | null } {
  if (Object.prototype.hasOwnProperty.call(edits, externalId)) {
    const edit = edits[externalId];
    if (edit === null || edit === undefined) return { load: null, unit: null };
    return { load: edit.load, unit: edit.unit };
  }
  if (!suggestion || suggestion.suggestedLoad === null) return { load: null, unit: null };
  return { load: suggestion.suggestedLoad, unit: suggestion.unit };
}
