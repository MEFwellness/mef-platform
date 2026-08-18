/**
 * HOW MUCH MORE. The rules that turn a member's own logged weights into a
 * number her coach is offered for the next phase.
 *
 * THIS FILE IS MEANT TO BE EDITED BY A COACH, exactly like
 * lib/corrective-engine/dosing.ts. It is tables and a small amount of
 * arithmetic over them, with no database access, no selection logic and no
 * knowledge of any screen. Changing a number here changes what the review
 * screen SUGGESTS next time. It cannot reach backwards and it cannot reach
 * a member: every number this file produces is a suggestion on a coach's
 * screen, editable and clearable, and nothing reaches a member until the
 * coach approves a draft.
 *
 * THE TWO MODELS.
 *
 *   LINEAR       Steady, small weekly increases while the signals stay
 *                green. One increment at a time, from the table below, out
 *                of the range the member is actually working in. This is
 *                the model almost everyone is on, and it is the model
 *                corrective and rehab work is ALWAYS on.
 *
 *   UNDULATING   A planned heavier and lighter wave across the weeks of a
 *                phase rather than a straight line. The wave is a table of
 *                percentages, one per week, and the last week of a phase is
 *                the heaviest. A member on this model still only ever moves
 *                up when the signals are green: the wave describes the
 *                SHAPE of a phase, never permission to load somebody who
 *                reported pain.
 *
 * WHICH MODEL APPLIES comes from the blueprint's own `periodization` field
 * (migration 175). A program with no periodization recorded is linear,
 * because linear is the conservative reading of silence. A corrective
 * program and a member in a rehab context are linear and conservative
 * whatever the blueprint says, and that override is not configurable here:
 * see resolveModel below.
 *
 * THREE THINGS THIS FILE WILL NEVER DO.
 *
 *   It never suggests a weight for an exercise she has not logged one for.
 *   No logged weight means no suggestion, on any model, in any signal
 *   state. A first number is a coaching decision made with a person in the
 *   room, and an app guessing at it would be prescribing.
 *
 *   It never suggests an increase over pain or over "too difficult". Those
 *   two produce a hold or a reduction and nothing else, whatever the
 *   completion rate says.
 *
 *   It never rounds to something she cannot load. Every number it produces
 *   lands on a half unit, which is what the field she types into accepts
 *   and what the column stores.
 *
 * NO EM DASHES, per the house rule.
 */
import type { BlueprintBlock, BlueprintPeriodization } from '@mef/shared-types-contracts';
import type { LoggedLoadUnit } from '../weightLogging';

// ---------------------------------------------------------------------
// The tables.
// ---------------------------------------------------------------------

/**
 * One row of an increment table: how much to add, for loads at or below
 * `throughUnits`. Rows are read in order and the first match wins, so the
 * last row of every table must be the open-ended one.
 */
export interface LoadIncrementRule {
  /** The top of this band, in the same unit as `incrementUnits`. */
  throughUnits: number;
  incrementUnits: number;
}

/**
 * STANDARD INCREMENTS, POUNDS. What a healthy member on a normal strength
 * program is offered when everything is green.
 *
 * The bands exist because a 5 lb jump on a 15 lb goblet squat is a third
 * more work and a 5 lb jump on a 135 lb deadlift is nothing. Percentages
 * were rejected on purpose: a coach cannot look at a percentage and know
 * what plate that is.
 */
export const STANDARD_INCREMENTS_LBS: Record<BlueprintBlock, LoadIncrementRule[]> = {
  // Rolling and release work is never loaded. No band, no suggestion.
  release: [],
  // Neither is a stretch.
  mobility: [],
  // Corrective and activation work: the smallest step there is, because the
  // point of the block is control and a jump buys nothing.
  stability: [
    { throughUnits: 20, incrementUnits: 1 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 2.5 },
  ],
  strength: [
    // A member working at 22.5 lbs is on a dumbbell, and the next dumbbell
    // up is 2.5 lbs away. The band runs to 30 for that reason and not
    // because 30 is round.
    { throughUnits: 30, incrementUnits: 2.5 },
    { throughUnits: 60, incrementUnits: 5 },
    { throughUnits: 120, incrementUnits: 5 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 10 },
  ],
  core: [
    { throughUnits: 25, incrementUnits: 2.5 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 5 },
  ],
};

/** STANDARD INCREMENTS, KILOS. The same shape, in the units a kilo member reads. */
export const STANDARD_INCREMENTS_KG: Record<BlueprintBlock, LoadIncrementRule[]> = {
  release: [],
  mobility: [],
  stability: [
    { throughUnits: 10, incrementUnits: 0.5 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 1 },
  ],
  strength: [
    { throughUnits: 15, incrementUnits: 1 },
    { throughUnits: 30, incrementUnits: 2.5 },
    { throughUnits: 55, incrementUnits: 2.5 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 5 },
  ],
  core: [
    { throughUnits: 12, incrementUnits: 1 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 2.5 },
  ],
};

/**
 * CONSERVATIVE INCREMENTS, POUNDS. Corrective programs, and any member with
 * a live pain history on the program being reviewed.
 *
 * Half the standard step, floored at the smallest thing a person can
 * actually pick up. This is not a different philosophy, it is the same
 * table walked more slowly, which is what "conservative" means when
 * somebody is rebuilding.
 */
export const CONSERVATIVE_INCREMENTS_LBS: Record<BlueprintBlock, LoadIncrementRule[]> = {
  release: [],
  mobility: [],
  stability: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 1 }],
  strength: [
    { throughUnits: 30, incrementUnits: 1 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 2.5 },
  ],
  core: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 1 }],
};

/** CONSERVATIVE INCREMENTS, KILOS. */
export const CONSERVATIVE_INCREMENTS_KG: Record<BlueprintBlock, LoadIncrementRule[]> = {
  release: [],
  mobility: [],
  stability: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 0.5 }],
  strength: [
    { throughUnits: 15, incrementUnits: 0.5 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 1 },
  ],
  core: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 0.5 }],
};

/**
 * THE UNDULATING WAVE. Percentage of the member's own last logged weight,
 * by week of the phase.
 *
 * Read as a shape rather than as four separate decisions: week 1 repeats
 * what she finished the last phase on so the new phase opens on a number
 * she has already done, week 2 steps up, week 3 backs off, week 4 is the
 * heaviest thing in the phase. A phase longer than this table wraps around
 * it, which keeps an eight week phase as two four week waves rather than
 * one that runs off the end.
 *
 * The whole wave is scaled DOWN when the signals are not green, and is
 * never applied at all over pain or "too difficult".
 */
export const UNDULATING_WAVE_PERCENT: readonly number[] = [100, 107, 95, 112];

/**
 * How far back a "too difficult" report pulls the load, as a percentage of
 * what she last logged. Rounded DOWN onto the increment grid, so a
 * reduction is never accidentally a rounding-up.
 */
export const TOO_DIFFICULT_REDUCTION_PERCENT = 90;

/**
 * The smallest load this file will ever suggest, per unit. Below this there
 * is no equipment to pick up and the honest answer is bodyweight, which is
 * a coaching decision and not a number.
 */
export const MIN_SUGGESTED_LOAD: Record<LoggedLoadUnit, number> = { lbs: 2.5, kg: 1 };

/** Every suggestion lands on a half unit, which is what her field accepts and what the column stores. */
export const LOAD_ROUNDING_STEP = 0.5;

// ---------------------------------------------------------------------
// Reading the tables.
// ---------------------------------------------------------------------

export type LoadSuggestionDirection = 'increase' | 'hold' | 'reduce' | 'none';

/** Which table applies, in one word a coach can read on the screen. */
export type LoadPace = 'standard' | 'conservative';

export function incrementTableFor(
  pace: LoadPace,
  unit: LoggedLoadUnit
): Record<BlueprintBlock, LoadIncrementRule[]> {
  if (pace === 'conservative') {
    return unit === 'kg' ? CONSERVATIVE_INCREMENTS_KG : CONSERVATIVE_INCREMENTS_LBS;
  }
  return unit === 'kg' ? STANDARD_INCREMENTS_KG : STANDARD_INCREMENTS_LBS;
}

/**
 * The step for one exercise at one weight, or null when this block is never
 * loaded at all. Null is a real answer: a stretch has no increment and
 * pretending it has one would put a weight field on a hamstring stretch.
 */
export function incrementFor(input: {
  block: BlueprintBlock;
  lastLoggedLoad: number;
  unit: LoggedLoadUnit;
  pace: LoadPace;
}): number | null {
  const rules = incrementTableFor(input.pace, input.unit)[input.block];
  if (!rules || rules.length === 0) return null;
  const rule = rules.find((r) => input.lastLoggedLoad <= r.throughUnits) ?? rules[rules.length - 1]!;
  return rule.incrementUnits;
}

/** Rounds onto the grid her field accepts. `direction` decides which way a number between two steps goes. */
export function roundToLoadStep(value: number, direction: 'nearest' | 'down' = 'nearest'): number {
  const steps = value / LOAD_ROUNDING_STEP;
  const rounded = direction === 'down' ? Math.floor(steps) : Math.round(steps);
  return rounded * LOAD_ROUNDING_STEP;
}

/**
 * The model this program's loads move on.
 *
 * The blueprint's own field decides, with two overrides that are rules
 * rather than settings:
 *
 *   a corrective program is always linear and always conservative, because
 *   a program built from a posture finding is not a strength phase and a
 *   wave through it would be loading a correction;
 *
 *   a member with an unresolved pain report on this program is always
 *   conservative, whatever the program is.
 */
export function resolveModel(input: {
  periodization: BlueprintPeriodization | null | undefined;
  isCorrectiveProgram: boolean;
  hasOpenPainReport: boolean;
}): { model: BlueprintPeriodization; pace: LoadPace; why: string } {
  if (input.isCorrectiveProgram) {
    return {
      model: 'linear',
      pace: 'conservative',
      why: 'This is a corrective program, so loads move in the smallest steps and never in a wave.',
    };
  }
  if (input.hasOpenPainReport) {
    return {
      model: input.periodization ?? 'linear',
      pace: 'conservative',
      why: 'She has a pain report on this program that has not been reviewed, so the steps are the small ones.',
    };
  }
  if (input.periodization === 'undulating') {
    return {
      model: 'undulating',
      pace: 'standard',
      why: 'This program is written as a wave, so the weeks plan heavier and lighter rather than climbing in a line.',
    };
  }
  return {
    model: 'linear',
    pace: 'standard',
    why: input.periodization
      ? 'This program adds a little each week while the signals stay green.'
      : 'This program does not record a periodization plan, so loads move the steady way.',
  };
}

/** The percentage the wave prescribes for one week of a phase. Weeks past the end of the table wrap around it. */
export function wavePercentForWeek(week: number): number {
  const length = UNDULATING_WAVE_PERCENT.length;
  const index = ((Math.max(1, Math.floor(week)) - 1) % length + length) % length;
  return UNDULATING_WAVE_PERCENT[index]!;
}

// ---------------------------------------------------------------------
// The signal rules.
// ---------------------------------------------------------------------

/**
 * What one exercise's history says about whether it may go up. Everything
 * here is read off rows a member actually wrote; none of it is inferred.
 */
export interface ExerciseLoadSignals {
  /** True when she reported pain on this exercise, or stopped it, in the phase being reviewed. */
  reportedPain: boolean;
  /** True when she reported it too difficult, or rated a completion very difficult. */
  reportedTooDifficult: boolean;
  /** True when she reported it too easy, or rated completions easy. */
  reportedTooEasy: boolean;
  /** How many occurrences of this exercise she actually completed. */
  completedOccurrences: number;
  /** How many she skipped or stopped. */
  missedOccurrences: number;
}

/**
 * THE SIGNAL RULES, as one ordered ladder. Read top to bottom; the first
 * rule that matches decides, and nothing below it can overturn it.
 *
 *   1. Pain              hold. Never an increase, whatever else is true.
 *   2. Too difficult     reduce.
 *   3. Nothing completed hold. There is no evidence either way, and a
 *                        suggestion made from no completions is a guess.
 *   4. Too easy          increase. This is the coach-approved answer to
 *                        the "too easy" flag a member raises: she tells
 *                        the app, the app tells the coach, the coach
 *                        decides. Nothing in the member's flow ever moves
 *                        a number by itself.
 *   5. Completed clean   increase.
 *   6. Otherwise         hold.
 */
export function directionForSignals(signals: ExerciseLoadSignals): LoadSuggestionDirection {
  if (signals.reportedPain) return 'hold';
  if (signals.reportedTooDifficult) return 'reduce';
  if (signals.completedOccurrences === 0) return 'hold';
  if (signals.reportedTooEasy) return 'increase';
  // "Clean" is deliberately generous: she did it more often than she missed
  // it, and nothing about it went wrong. A member who did three of four
  // sessions has earned the next step.
  if (signals.completedOccurrences > signals.missedOccurrences) return 'increase';
  return 'hold';
}

/** The one sentence a coach reads beside the number, in plain words. */
export function directionReason(
  direction: LoadSuggestionDirection,
  signals: ExerciseLoadSignals
): string {
  switch (direction) {
    case 'reduce':
      return 'She said this one was too difficult, so this is a step back rather than forward.';
    case 'increase':
      return signals.reportedTooEasy
        ? 'She said this one felt too easy and nothing went wrong with it.'
        : `She completed it ${signals.completedOccurrences} time${signals.completedOccurrences === 1 ? '' : 's'} with nothing to flag.`;
    case 'hold':
      if (signals.reportedPain) {
        return 'She reported pain on this one, so it holds where it is until you have looked at it.';
      }
      if (signals.completedOccurrences === 0) {
        return 'She has not completed this one yet, so there is nothing to move it on.';
      }
      return 'The signals are mixed, so this holds where it is.';
    case 'none':
      return 'She has not logged a weight for this one yet.';
  }
}

// ---------------------------------------------------------------------
// The suggestion.
// ---------------------------------------------------------------------

export interface LoadSuggestionInput {
  block: BlueprintBlock;
  /** Her most recent logged weight for this exercise. NULL MEANS NO SUGGESTION, always. */
  lastLoggedLoad: number | null;
  lastLoggedUnit: LoggedLoadUnit | null;
  lastLoggedPerSide: boolean;
  model: BlueprintPeriodization;
  pace: LoadPace;
  signals: ExerciseLoadSignals;
  /** Which week of the NEXT phase this number is for. Only the undulating model reads it. */
  weekOfNextPhase?: number;
}

export interface LoadSuggestion {
  direction: LoadSuggestionDirection;
  /** Null whenever direction is 'none'. Otherwise the number the coach is offered, already rounded. */
  suggestedLoad: number | null;
  unit: LoggedLoadUnit;
  perSide: boolean;
  lastLoggedLoad: number;
  /** One sentence, plain words, for the coach's screen. */
  reason: string;
}

/**
 * One exercise's suggested load for the next phase, or nothing at all.
 *
 * Returns null, not a zero and not a placeholder, when she has never logged
 * a weight for this exercise. Every caller renders that as the sentence
 * about suggestions beginning once she logs weights, and no caller invents
 * a number to fill the gap.
 */
export function suggestLoad(input: LoadSuggestionInput): LoadSuggestion | null {
  if (input.lastLoggedLoad === null || input.lastLoggedLoad <= 0) return null;

  const unit: LoggedLoadUnit = input.lastLoggedUnit ?? 'lbs';
  const last = input.lastLoggedLoad;
  const direction = directionForSignals(input.signals);
  const base = {
    direction,
    unit,
    perSide: input.lastLoggedPerSide,
    lastLoggedLoad: last,
    reason: directionReason(direction, input.signals),
  };

  const increment = incrementFor({
    block: input.block,
    lastLoggedLoad: last,
    unit,
    pace: input.pace,
  });

  // A block that is never loaded gets no number even when she somehow
  // logged one against it. The table is the authority on what is loadable.
  if (increment === null) {
    return { ...base, direction: 'hold', suggestedLoad: last, reason: base.reason };
  }

  if (direction === 'hold') {
    return { ...base, suggestedLoad: last };
  }

  if (direction === 'reduce') {
    const reduced = roundToLoadStep((last * TOO_DIFFICULT_REDUCTION_PERCENT) / 100, 'down');
    return {
      ...base,
      suggestedLoad: Math.max(MIN_SUGGESTED_LOAD[unit], Math.min(reduced, last - increment / 2)),
    };
  }

  // An increase. Linear adds one step; undulating shapes the phase around
  // the step it would have added, so a wave and a line start from the same
  // honest place.
  const linearTarget = last + increment;
  if (input.model === 'linear') {
    return { ...base, suggestedLoad: roundToLoadStep(linearTarget) };
  }

  const percent = wavePercentForWeek(input.weekOfNextPhase ?? 1);
  const waved = roundToLoadStep((linearTarget * percent) / 100);
  return {
    ...base,
    suggestedLoad: Math.max(MIN_SUGGESTED_LOAD[unit], waved),
    reason: `${base.reason} Week ${Math.max(1, Math.floor(input.weekOfNextPhase ?? 1))} of the wave runs at ${percent}%.`,
  };
}

/**
 * The whole rules table as rows a screen (or a report) can print, so the
 * coach reviewing these defaults reads exactly what the code applies rather
 * than a description of it.
 */
export interface LoadRuleRow {
  pace: LoadPace;
  unit: LoggedLoadUnit;
  block: BlueprintBlock;
  band: string;
  increment: number;
}

export function loadRuleRows(): LoadRuleRow[] {
  const rows: LoadRuleRow[] = [];
  const paces: LoadPace[] = ['standard', 'conservative'];
  const units: LoggedLoadUnit[] = ['lbs', 'kg'];
  for (const pace of paces) {
    for (const unit of units) {
      const table = incrementTableFor(pace, unit);
      for (const block of Object.keys(table) as BlueprintBlock[]) {
        const rules = table[block];
        let floor = 0;
        for (const rule of rules) {
          rows.push({
            pace,
            unit,
            block,
            band: Number.isFinite(rule.throughUnits)
              ? `over ${floor} up to ${rule.throughUnits} ${unit}`
              : `over ${floor} ${unit}`,
            increment: rule.incrementUnits,
          });
          floor = Number.isFinite(rule.throughUnits) ? rule.throughUnits : floor;
        }
      }
    }
  }
  return rows;
}
