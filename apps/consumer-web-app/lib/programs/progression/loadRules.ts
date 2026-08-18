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
 * PROGRESSION IS EARNED, NEVER SCHEDULED. This is the whole revision the
 * coach asked for, and it is one sentence: a load goes up because she did
 * the work at the weight she is on, and never because the program reached
 * another week. There is no calendar in this file. Nothing below reads a
 * week number, a start date or a phase position, and the test suite asserts
 * that feeding a different week produces an identical number.
 *
 * THE FIVE GATES ON AN INCREASE. All five have to hold. Any one of them
 * failing is a hold, and a hold means "stay on the weight she is on", not
 * "she is doing badly".
 *
 *   1. TWO SUCCESSFUL LOGS AT THIS WEIGHT. One logged weight establishes a
 *      baseline and nothing else. Two completed sessions at the same number
 *      is the first moment the weight has been shown to be hers.
 *   2. NO PAIN ON IT. Resolved or not. A resolved report is history the
 *      coach weighs by hand; an unreviewed one removes the suggestion
 *      entirely, which is gate 1 of the suppression rule below.
 *   3. NO "TOO DIFFICULT" ON IT. Her own word about the weight beats any
 *      count of completions.
 *   4. NO REPEATED SKIPPING. Twice is a pattern, the same threshold
 *      signals/insights.ts tells a coach at.
 *   5. REASONABLE PROGRAM COMPLETION. Below half the sessions, the phase is
 *      not a fair read of anything, which is the same line
 *      signals/insights.ts already draws at LOW_COMPLETION_PERCENT.
 *
 * UNREVIEWED PAIN REMOVES THE SUGGESTION. Not "hold at current weight",
 * because a held number beside an unreviewed pain report reads as an
 * endorsement to repeat the thing that hurt. The column says so in words
 * instead, and the exercise re-enters normal gating the moment the coach
 * marks the report reviewed.
 *
 * THE MODEL SLOT.
 *
 *   LINEAR       The only model the engine currently applies. One increment
 *                at a time, from the tables below, out of the band she is
 *                actually working in, and only once the five gates hold.
 *
 *   UNDULATING   PARKED, pending coach-approved design. See
 *                UNDULATING_MODEL_PARKED below. The blueprint's own
 *                `periodization` field is still read and still reported, so
 *                nothing is lost, but the engine treats every program as
 *                performance-gated linear. When the wave returns it will
 *                also be performance-gated: a wave describes the SHAPE a
 *                coach approved, never permission to add weight on a date.
 *
 * THREE THINGS THIS FILE WILL NEVER DO.
 *
 *   It never suggests a weight for an exercise she has not logged one for.
 *   No logged weight means no suggestion, in any signal state. A first
 *   number is a coaching decision made with a person in the room, and an app
 *   guessing at it would be prescribing.
 *
 *   It never suggests an increase over pain or over "too difficult". Those
 *   two produce a hold, a reduction or nothing at all, whatever the
 *   completion rate says.
 *
 *   It never rounds UP. Every computed number lands on a practical increment
 *   (2.5 lb, 1 kg) by rounding DOWN off the safe value, so a suggestion is
 *   always at or below what the rules calculated and always something she
 *   can actually load.
 *
 * NO EM DASHES, per the house rule.
 */
import type { BlueprintBlock, BlueprintPeriodization } from '@mef/shared-types-contracts';
import type { LoggedLoadUnit } from '../weightLogging';

// ---------------------------------------------------------------------
// The practical grid. What she can actually pick up.
// ---------------------------------------------------------------------

/**
 * THE SMALLEST REAL STEP, per unit. A rack goes up in 2.5 lb dumbbells and
 * a kilo rack goes up in 1 kg plates, so 23.5 lbs is not a weight, it is a
 * rounding artefact. Every computed suggestion lands on this grid.
 */
export const PRACTICAL_INCREMENT: Record<LoggedLoadUnit, number> = { lbs: 2.5, kg: 1 };

/**
 * EXTENSION POINT, DELIBERATELY NOT BUILT.
 *
 * Real gyms are not one grid. A fixed dumbbell rack jumps 5 lbs above 30, a
 * plate-loaded barbell moves in 2.5 lb pairs, a selectorised machine has
 * whatever the pin offers and a kettlebell is 4 kg to the next bell. When
 * that lands, it lands HERE: an equipment profile per exercise, resolved
 * into a step, and everything downstream keeps working unchanged because
 * every rounding call already goes through practicalIncrementFor.
 *
 * Nothing is built for it yet, and nothing should be until a coach has said
 * which racks the members actually have. Until then there is one profile.
 */
export type EquipmentIncrementProfile = 'default';

/** The step for one unit, and eventually for one piece of equipment. See EquipmentIncrementProfile. */
export function practicalIncrementFor(
  unit: LoggedLoadUnit,
  _equipment: EquipmentIncrementProfile = 'default'
): number {
  return PRACTICAL_INCREMENT[unit];
}

/**
 * Rounds a safe value DOWN onto the practical grid. Down and never nearest,
 * because rounding up hands her more weight than the rules calculated, and
 * the whole point of a safe value is that nothing exceeds it.
 */
export function roundDownToPracticalStep(
  value: number,
  unit: LoggedLoadUnit,
  equipment: EquipmentIncrementProfile = 'default'
): number {
  const step = practicalIncrementFor(unit, equipment);
  // The epsilon is for binary floating point only: 26 / 2.5 can arrive as
  // 10.399999999999999 and floor it to a step she did not earn.
  const steps = Math.floor(value / step + 1e-9);
  return Math.round(steps * step * 1e6) / 1e6;
}

/** True when a number is a weight rather than a rounding artefact. The rounding law, as a predicate a test can read. */
export function landsOnPracticalIncrement(value: number, unit: LoggedLoadUnit): boolean {
  const step = practicalIncrementFor(unit);
  const steps = value / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

// ---------------------------------------------------------------------
// The tables.
// ---------------------------------------------------------------------

/**
 * One row of an increment table: how much to add, for loads at or below
 * `throughUnits`. Rows are read in order and the first match wins, so the
 * last row of every table must be the open-ended one.
 *
 * EVERY INCREMENT IS ITSELF A WHOLE NUMBER OF PRACTICAL STEPS. A 1 lb
 * increment on a 2.5 lb grid would round back down to where she started and
 * stall her forever, which is the bug the practical grid would otherwise
 * introduce. A test asserts it for every row of every table.
 */
export interface LoadIncrementRule {
  /** The top of this band, in the same unit as `incrementUnits`. */
  throughUnits: number;
  incrementUnits: number;
}

/**
 * STANDARD INCREMENTS, POUNDS. What a member on a normal strength program
 * is offered once all five gates hold.
 *
 * The bands exist because a 2.5 lb jump on a 15 lb goblet squat is real work
 * and a 2.5 lb jump on a 135 lb deadlift is nothing. Percentages were
 * rejected on purpose: a coach cannot look at a percentage and know what
 * plate that is.
 */
export const STANDARD_INCREMENTS_LBS: Record<BlueprintBlock, LoadIncrementRule[]> = {
  // Rolling and release work is never loaded. No band, no suggestion.
  release: [],
  // Neither is a stretch.
  mobility: [],
  // Corrective and activation work: the smallest step there is, because the
  // point of the block is control and a jump buys nothing.
  stability: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 2.5 }],
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

/** STANDARD INCREMENTS, KILOS. The same shape, on the 1 kg grid a kilo member loads from. */
export const STANDARD_INCREMENTS_KG: Record<BlueprintBlock, LoadIncrementRule[]> = {
  release: [],
  mobility: [],
  stability: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 1 }],
  strength: [
    { throughUnits: 15, incrementUnits: 1 },
    { throughUnits: 30, incrementUnits: 2 },
    { throughUnits: 55, incrementUnits: 2 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 5 },
  ],
  core: [
    { throughUnits: 12, incrementUnits: 1 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 2 },
  ],
};

/**
 * CONSERVATIVE INCREMENTS, POUNDS. Corrective programs, and any member with
 * a live pain history on the program being reviewed.
 *
 * The same table walked more slowly, floored at the practical grid, which is
 * what "conservative" means when somebody is rebuilding. On the light blocks
 * standard is ALREADY at the smallest real step, so conservative matches it
 * there rather than inventing a half-dumbbell.
 */
export const CONSERVATIVE_INCREMENTS_LBS: Record<BlueprintBlock, LoadIncrementRule[]> = {
  release: [],
  mobility: [],
  stability: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 2.5 }],
  strength: [
    { throughUnits: 30, incrementUnits: 2.5 },
    { throughUnits: 60, incrementUnits: 2.5 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 5 },
  ],
  core: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 2.5 }],
};

/** CONSERVATIVE INCREMENTS, KILOS. */
export const CONSERVATIVE_INCREMENTS_KG: Record<BlueprintBlock, LoadIncrementRule[]> = {
  release: [],
  mobility: [],
  stability: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 1 }],
  strength: [
    { throughUnits: 15, incrementUnits: 1 },
    { throughUnits: 55, incrementUnits: 1 },
    { throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 2 },
  ],
  core: [{ throughUnits: Number.POSITIVE_INFINITY, incrementUnits: 1 }],
};

/**
 * THE UNDULATING MODEL IS PARKED, pending coach-approved design.
 *
 * What was here was a weekly wave of percentages (100 / 107 / 95 / 112) that
 * moved a member's weight because the program had entered another week. The
 * coach's review rejected it, and rightly: nothing about a date says she is
 * ready for more.
 *
 * The slot stays because the model is worth having. A phase genuinely does
 * have a shape, and a coach who plans a heavy week and a back-off week is
 * doing real coaching. What a returning wave must satisfy:
 *
 *   it may only ever scale a load the FIVE GATES have already released, so
 *   the wave shapes an earned increase and never creates one;
 *
 *   it may not read a calendar. Week position in a phase is a plan, not a
 *   performance, and it must be expressed as "her Nth qualifying session on
 *   this exercise" or as a coach's explicit per-week table she approved;
 *
 *   it must round down onto the practical grid like everything else here.
 *
 * Until a coach has approved that design, this flag stays false, the
 * blueprint's `periodization` field is read and REPORTED but not applied,
 * and every program is treated as performance-gated linear.
 */
export const UNDULATING_MODEL_PARKED = true;

/**
 * How far back a "too difficult" report pulls the load, as a percentage of
 * what she last logged. Rounded DOWN onto the practical grid, so a reduction
 * is never accidentally a rounding-up.
 */
export const TOO_DIFFICULT_REDUCTION_PERCENT = 90;

/**
 * The smallest load this file will ever suggest, per unit. Below this there
 * is no equipment to pick up and the honest answer is bodyweight, which is
 * a coaching decision and not a number.
 */
export const MIN_SUGGESTED_LOAD: Record<LoggedLoadUnit, number> = { lbs: 2.5, kg: 1 };

// ---------------------------------------------------------------------
// The gate thresholds. Each one is a number a coach can change.
// ---------------------------------------------------------------------

/**
 * How many COMPLETED sessions at the weight she is on before an increase is
 * offered. Two, because one is a baseline: she picked the weight up once and
 * that is all anybody knows. Two is the first evidence the weight is hers.
 */
export const MIN_SUCCESSFUL_LOGS_AT_LOAD = 2;

/**
 * How many misses of one exercise counts as repeated skipping. Two, the same
 * threshold signals/insights.ts uses to tell a coach about it: once is a
 * Tuesday, twice is a pattern.
 */
export const REPEATED_SKIP_THRESHOLD_FOR_LOAD = 2;

/**
 * The program completion an increase needs behind it, as a percentage. Fifty
 * is the same line signals/insights.ts already draws: below half the
 * sessions the phase is not a fair read of anything, so a number derived
 * from it would be a guess wearing a decimal point.
 */
export const MIN_PROGRAM_COMPLETION_FOR_INCREASE = 50;

// ---------------------------------------------------------------------
// Reading the tables.
// ---------------------------------------------------------------------

export type LoadSuggestionDirection = 'increase' | 'hold' | 'reduce' | 'needs_review' | 'none';

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

/**
 * The model this program's loads move on, and the pace they move at.
 *
 * The blueprint's own field is read and reported, and while
 * UNDULATING_MODEL_PARKED is true the APPLIED model is always linear. Two
 * overrides on the pace are rules rather than settings:
 *
 *   a corrective program is always conservative, because a program built
 *   from a posture finding is not a strength phase;
 *
 *   a member with an unreviewed pain report on this program is always
 *   conservative, whatever the program is.
 */
export function resolveModel(input: {
  periodization: BlueprintPeriodization | null | undefined;
  isCorrectiveProgram: boolean;
  hasOpenPainReport: boolean;
}): {
  /** The model actually applied. Linear, while the wave is parked. */
  model: BlueprintPeriodization;
  /** What the blueprint itself records, whether or not it is applied. Null when it records nothing. */
  blueprintModel: BlueprintPeriodization | null;
  pace: LoadPace;
  why: string;
} {
  const blueprintModel = input.periodization ?? null;
  const parkedNote =
    blueprintModel === 'undulating' && UNDULATING_MODEL_PARKED
      ? ' This program is written as a wave, and the wave is parked until you approve how it should work, so loads move the steady way for now.'
      : '';

  if (input.isCorrectiveProgram) {
    return {
      model: 'linear',
      blueprintModel,
      pace: 'conservative',
      why:
        'This is a corrective program, so loads move in the smallest steps and only after she has done the weight twice.' +
        parkedNote,
    };
  }
  if (input.hasOpenPainReport) {
    return {
      model: 'linear',
      blueprintModel,
      pace: 'conservative',
      why:
        'She has a pain report on this program that has not been reviewed, so the steps are the small ones and the exercise she reported has no suggestion at all.' +
        parkedNote,
    };
  }
  return {
    model: 'linear',
    blueprintModel,
    pace: 'standard',
    why:
      'Weight goes up because she did the work at the weight she is on, never because the program reached another week.' +
      parkedNote,
  };
}

// ---------------------------------------------------------------------
// The signal rules.
// ---------------------------------------------------------------------

/**
 * What one exercise's history says about whether it may go up. Everything
 * here is read off rows a member actually wrote; none of it is inferred.
 */
export interface ExerciseLoadSignals {
  /**
   * True when she reported pain on this exercise, or stopped it, in the
   * phase being reviewed. Resolved reports still count: a resolved report is
   * history the coach weighs by hand, not history that disappears.
   */
  reportedPain: boolean;
  /**
   * True when at least one of those pain reports has NOT been marked
   * reviewed. This is the one that removes the suggestion entirely, so it is
   * deliberately narrower than reportedPain: it means there is a report on
   * the table for the coach to act on.
   */
  hasUnreviewedPain: boolean;
  /** True when she reported it too difficult, or rated a completion very difficult. */
  reportedTooDifficult: boolean;
  /** True when she reported it too easy, or rated completions easy. */
  reportedTooEasy: boolean;
  /** How many occurrences of this exercise she actually completed, at any weight. */
  completedOccurrences: number;
  /** How many she skipped or stopped. */
  missedOccurrences: number;
  /** How many she COMPLETED at the weight she is on right now. The two-exposure gate reads this and nothing else. */
  successfulLogsAtCurrentLoad: number;
  /** The whole program's completion, 0 to 100. A load decision made from a phase she barely did is a guess. */
  programCompletionPercent: number;
}

/**
 * THE EXACT SENTENCE for an exercise whose pain report nobody has looked at
 * yet. It says there is no suggestion, because there is not one, and it
 * never says "hold at current weight": a held number beside an unreviewed
 * pain report reads as permission to repeat the thing that hurt.
 */
export const NO_SUGGESTION_PENDING_PAIN_REVIEW =
  'No load suggestion. Pain feedback needs coach review first.';

/** What the column says while she is still establishing the weight. Warm, and honest that it means "not yet" rather than "no". */
export const SUGGESTIONS_BEGIN_AFTER_TWO_LOGS =
  'Suggestions begin after she logs this weight a couple of times.';

/**
 * THE GATE, as one ordered ladder. Read top to bottom; the first rule that
 * matches decides, and nothing below it can overturn it.
 *
 *   1. Unreviewed pain    NO SUGGESTION. Not a hold. See
 *                         NO_SUGGESTION_PENDING_PAIN_REVIEW.
 *   2. Too difficult      reduce. Her own word about the weight, and a step
 *                         back is more conservative than a hold, which is
 *                         why it sits above the pain-history rung.
 *   3. Pain in history    hold. The report has been reviewed, so the coach
 *                         has already weighed it; the engine still refuses
 *                         to add weight to something that hurt her.
 *   4. Nothing completed  hold. There is no evidence either way.
 *   5. Repeated skipping  hold. She is working around it, not through it.
 *   6. Low completion     hold. The phase is not a fair read.
 *   7. Under two logs at
 *      this weight        hold. One log is a baseline and nothing else.
 *   8. All gates hold     increase.
 *
 * "Too easy" is NOT a rung. She can say it as often as she likes and it will
 * not move a number by itself; it earns its place in the reason beside the
 * suggestion, so the coach sees her asking and decides. That is the change
 * the coach's review asked for.
 */
export function gateForSignals(signals: ExerciseLoadSignals): {
  direction: LoadSuggestionDirection;
  reason: string;
} {
  if (signals.hasUnreviewedPain) {
    return { direction: 'needs_review', reason: NO_SUGGESTION_PENDING_PAIN_REVIEW };
  }
  if (signals.reportedTooDifficult) {
    return {
      direction: 'reduce',
      reason: 'She said this one was too difficult, so this is a step back rather than forward.',
    };
  }
  if (signals.reportedPain) {
    return {
      direction: 'hold',
      reason:
        'She reported pain on this one earlier in the phase. You have reviewed it, and it still holds where it is until you decide otherwise.',
    };
  }
  if (signals.completedOccurrences === 0) {
    return {
      direction: 'hold',
      reason: 'She has not completed this one yet, so there is nothing to move it on.',
    };
  }
  if (signals.missedOccurrences >= REPEATED_SKIP_THRESHOLD_FOR_LOAD) {
    return {
      direction: 'hold',
      reason: `She has missed this one ${signals.missedOccurrences} times, so it holds where it is until it is going in again.`,
    };
  }
  if (signals.programCompletionPercent < MIN_PROGRAM_COMPLETION_FOR_INCREASE) {
    return {
      direction: 'hold',
      reason: `She has finished ${signals.programCompletionPercent}% of the program, which is not enough of it to add weight from.`,
    };
  }
  if (signals.successfulLogsAtCurrentLoad < MIN_SUCCESSFUL_LOGS_AT_LOAD) {
    return { direction: 'hold', reason: SUGGESTIONS_BEGIN_AFTER_TWO_LOGS };
  }
  return {
    direction: 'increase',
    reason:
      `She has completed this weight ${signals.successfulLogsAtCurrentLoad} times with nothing to flag.` +
      (signals.reportedTooEasy ? ' She also said it felt too easy.' : ''),
  };
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
  /** The APPLIED model. Linear while the wave is parked, and read by nothing below. */
  model: BlueprintPeriodization;
  pace: LoadPace;
  signals: ExerciseLoadSignals;
  /**
   * PARKED AND IGNORED. It was the undulating wave's week index and no
   * arithmetic in this file reads it, because no load may change on a date.
   * Kept on the type, rather than deleted, so that the parked model has a
   * visible slot and so a test can assert that changing it changes nothing.
   */
  weekOfNextPhase?: number;
}

export interface LoadSuggestion {
  direction: LoadSuggestionDirection;
  /** Null for 'none' and for 'needs_review'. Otherwise the number the coach is offered, already on the practical grid. */
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
  const gate = gateForSignals(input.signals);
  const base = {
    direction: gate.direction,
    unit,
    perSide: input.lastLoggedPerSide,
    lastLoggedLoad: last,
    reason: gate.reason,
  };

  // Unreviewed pain. No number, in any direction, at any weight. The
  // sentence the SCREEN shows is NO_SUGGESTION_PENDING_PAIN_REVIEW, composed
  // by suggest.ts's describeSuggestion. The reason beside it hands the coach
  // the last logged weight as a fact, clearly labelled as one, because she
  // needs to know what hurt without being told to repeat it.
  if (gate.direction === 'needs_review') {
    const side = input.lastLoggedPerSide ? ' per side' : '';
    return {
      ...base,
      suggestedLoad: null,
      reason: `She reported pain on this one and nobody has reviewed it yet. She last logged ${last} ${unit}${side}, which is a fact rather than a suggestion.`,
    };
  }

  const increment = incrementFor({
    block: input.block,
    lastLoggedLoad: last,
    unit,
    pace: input.pace,
  });

  // A block that is never loaded gets no movement even when she somehow
  // logged a number against it. The table is the authority on what is
  // loadable.
  if (increment === null) {
    return {
      ...base,
      direction: 'hold',
      suggestedLoad: last,
      reason: 'This block is never loaded, so there is no weight to move.',
    };
  }

  // A hold is her own number, exactly. It is NOT rounded onto the practical
  // grid: rounding a hold down would quietly take weight off her for no
  // reason anybody could explain. The grid governs numbers this file
  // CALCULATES, and a hold calculates nothing.
  if (gate.direction === 'hold') {
    return { ...base, suggestedLoad: last };
  }

  if (gate.direction === 'reduce') {
    const safe = Math.min((last * TOO_DIFFICULT_REDUCTION_PERCENT) / 100, last - increment);
    const reduced = roundDownToPracticalStep(safe, unit);
    return { ...base, suggestedLoad: Math.max(MIN_SUGGESTED_LOAD[unit], reduced) };
  }

  // An increase, and the only path in this file that produces a bigger
  // number. One step out of her band, rounded DOWN onto the practical grid.
  // No week, no percentage, no calendar.
  const safe = last + increment;
  return { ...base, suggestedLoad: roundDownToPracticalStep(safe, unit) };
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
