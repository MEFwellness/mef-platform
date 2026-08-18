/**
 * WHAT TO DO NEXT, and why, in words a coach can argue with.
 *
 * HARVESTED, NOT INVENTED. The retired Prescription Intelligence Engine's
 * lib/prescription-intelligence/progression.ts held one genuinely good
 * thing: an ordered ladder that decided progress / maintain / regress /
 * repeat / deload / substitute from one exercise's own history plus today's
 * readiness. That ladder is the ladder below. Three things changed and
 * nothing else:
 *
 *   it reads a PROGRAM rather than one exercise, because the decision at
 *   the end of a phase is about the phase;
 *
 *   its six verbs map onto the six locked period-end outcomes rather than
 *   onto six prescription verbs (see ./outcomes.ts);
 *
 *   its readiness rung reads ../readiness/gate.ts, which is the other
 *   surviving piece of the same engine, rather than poking at check-in
 *   fields directly.
 *
 * THE LADDER. First rule that matches decides, and nothing below it can
 * overturn it. Read top to bottom; that order IS the coaching.
 *
 *   1. She reported pain and nobody has looked at it   rotate
 *   2. She did none of it and the phase is over        complete and archive
 *   3. Readiness says do not load anybody today        recovery week
 *   4. She finished less than half of it               repeat
 *   5. She said more than one thing was too difficult  repeat
 *   6. She kept skipping or swapping specific things   rotate
 *   7. She did most of it and nothing went wrong       progress
 *   8. Anything else                                   repeat
 *
 * IT IS A RECOMMENDATION AND NOTHING ELSE. It writes nothing, it selects
 * nothing, and every one of the six outcomes stays one tap away on the
 * screen whatever this says. A coach overruling it costs one tap and no
 * explanation.
 *
 * Pure. No Supabase import. The readiness half is passed in already
 * gathered, so the ladder can be tested against literals.
 *
 * NO EM DASHES, per the house rule.
 */
import type { ProgramSignals } from '../signals/aggregate';
import { LOW_COMPLETION_PERCENT } from '../signals/insights';
import type { ReadinessGateResult } from '../readiness/gate';
import type { ReviewOutcome } from './outcomes';

/** Above this, with nothing flagged, she has earned the next phase. */
export const STRONG_COMPLETION_PERCENT = 70;

/** How many distinct exercises she has to be avoiding before rotating beats repeating. */
export const ROTATE_FRICTION_THRESHOLD = 2;

export interface RecommendationInput {
  signals: ProgramSignals;
  /**
   * ../readiness/gate.ts's own answer for this member, or null when there
   * is not enough about her to ask. Null is a real answer and the ladder
   * simply skips that rung rather than assuming she is fine.
   */
  readiness: ReadinessGateResult | null;
  /** True when the program has run its full span. A review opened early skips the rung that only makes sense at the end. */
  phaseIsOver: boolean;
}

export interface ProgramRecommendation {
  outcome: ReviewOutcome;
  /** The paragraph on the screen. Plain words, and it always names the thing it is reasoning from. */
  reasoning: string;
  /** The numbers the paragraph was built from, so a coach can check it rather than trust it. */
  basis: {
    completionPercent: number;
    completedSessions: number;
    totalSessions: number;
    openPainReports: number;
    tooDifficultFlags: number;
    tooEasyFlags: number;
    frictionExercises: number;
    readinessBlocked: boolean;
  };
}

/** Exercises she has told us, one way or another, that she does not want: repeated skips, repeated reports, or a swap. */
export function frictionExerciseCount(signals: ProgramSignals): number {
  const ids = new Set<string>();
  for (const skip of signals.skippedExercises) {
    if (skip.count >= 2) ids.add(skip.externalId);
  }
  for (const flag of signals.otherReports) ids.add(flag.externalId);
  for (const swap of signals.swaps) ids.add(swap.fromExerciseName);
  return ids.size;
}

export function recommendNextPhase(input: RecommendationInput): ProgramRecommendation {
  const { signals } = input;
  const openPain = signals.painReports.filter((r) => r.resolvedAt === null);
  const friction = frictionExerciseCount(signals);
  const readinessBlocked = input.readiness?.blocked === true;

  const basis = {
    completionPercent: signals.completionPercent,
    completedSessions: signals.completedSessions,
    totalSessions: signals.totalSessions,
    openPainReports: openPain.length,
    tooDifficultFlags: signals.tooDifficultFlags.length,
    tooEasyFlags: signals.tooEasyFlags.length,
    frictionExercises: friction,
    readinessBlocked,
  };

  // 1. Safety leads, exactly as it does everywhere else in this product.
  if (openPain.length > 0) {
    const names = [...new Set(openPain.map((r) => r.exerciseName))];
    return {
      outcome: 'rotate_exercises',
      reasoning:
        `She reported pain on ${listNames(names)} and ${openPain.length === 1 ? 'that report has' : 'those reports have'} not been marked reviewed. ` +
        `Rotating keeps the same work in the same blocks with different movements, and ${names.length === 1 ? 'that exercise stays' : 'those exercises stay'} off her list until you release ${names.length === 1 ? 'it' : 'them'}. ` +
        'Resolve the report first so the next phase is built from a clean read.',
      basis,
    };
  }

  // 2. A program nothing happened in. Only at the end, because a program
  //    with three weeks left has not failed, it has not finished.
  if (input.phaseIsOver && signals.totalSessions > 0 && signals.completedSessions === 0) {
    return {
      outcome: 'complete_and_archive',
      reasoning:
        `The phase has run its span and she did not complete any of its ${signals.totalSessions} sessions. ` +
        'Closing it out keeps her history honest, and whatever comes next is worth starting from a conversation rather than from this.',
      basis,
    };
  }

  // 3. Readiness. The harvested gate's own answer, and the reason its
  //    'recovery_session' verb is the review's 'recovery_week' outcome.
  if (input.readiness?.blocked) {
    return {
      outcome: 'recovery_week',
      reasoning:
        `Her readiness signals say do not add load right now (${readinessReason(input.readiness)}). ` +
        'A recovery week is the honest next step, and the phase after it will read a lot more clearly.',
      basis,
    };
  }

  // 4. She missed too much of it for the last four weeks to be a fair read.
  if (signals.totalSessions > 0 && signals.completionPercent < LOW_COMPLETION_PERCENT) {
    return {
      outcome: 'repeat_phase',
      reasoning:
        `She finished ${signals.completedSessions} of ${signals.totalSessions} sessions, which is ${signals.completionPercent}%. ` +
        'There is not enough here to progress from, and repeating gives her the same four weeks without treating the gap as failure.',
      basis,
    };
  }

  // 5. It was too hard. Harvested rung: progression.ts regressed on a
  //    very-difficult rating, and at program level the same fact means
  //    running the phase again rather than adding to it.
  if (signals.tooDifficultFlags.length >= 2) {
    const names = [...new Set(signals.tooDifficultFlags.map((f) => f.exerciseName))];
    return {
      outcome: 'repeat_phase',
      reasoning:
        `She said ${listNames(names)} ${names.length === 1 ? 'was' : 'were'} too difficult. ` +
        'Repeating the phase lets the same work settle before anything gets heavier, and the load suggestions below step back rather than forward on those.',
      basis,
    };
  }

  // 6. She keeps working around specific movements. The program is fine,
  //    the lineup is not.
  if (friction >= ROTATE_FRICTION_THRESHOLD) {
    return {
      outcome: 'rotate_exercises',
      reasoning:
        `She has skipped, swapped or asked about ${friction} different exercises in this phase. ` +
        'The shape of the program is working and the lineup is not, so rotating the movements keeps the goals and changes what she is actually asked to do.',
      basis,
    };
  }

  // 7. The green path. Harvested rung: progression.ts progressed on two
  //    easy, comfortable completions, and at program level the same fact is
  //    a phase she got through with nothing to flag.
  if (signals.completionPercent >= STRONG_COMPLETION_PERCENT) {
    const easy =
      signals.tooEasyFlags.length > 0
        ? ` She also said ${listNames([...new Set(signals.tooEasyFlags.map((f) => f.exerciseName))])} felt too easy, which is her asking for more.`
        : '';
    return {
      outcome: 'progress_next_phase',
      reasoning:
        `She finished ${signals.completedSessions} of ${signals.totalSessions} sessions with no pain reports and nothing rated too difficult.${easy} ` +
        'Progressing builds the next four weeks from this one, with a suggested weight on every exercise she has logged one for.',
      basis,
    };
  }

  // 8. Mixed. Repeating is the conservative reading of mixed, and it is
  //    the reading a coach can most easily overrule.
  return {
    outcome: 'repeat_phase',
    reasoning:
      `She finished ${signals.completedSessions} of ${signals.totalSessions} sessions, which is ${signals.completionPercent}%, with nothing clearly flagged either way. ` +
      'Repeating is the conservative read of a mixed phase. If you saw something in her sessions that the numbers here do not show, any of the other options is one tap away.',
    basis,
  };
}

function listNames(names: string[]): string {
  if (names.length === 0) return 'an exercise';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The gate's own verdict, said in a coach's words rather than as a stored key. */
function readinessReason(readiness: ReadinessGateResult): string {
  if (!readiness.blocked) return 'nothing blocking';
  switch (readiness.blockReason) {
    case 'red_flag':
      return 'she flagged a new or worsening concern on her latest check-in';
    case 'extremely_poor_readiness':
      return 'her sleep, stress and energy are all at the bottom of her range';
    case 'missing_baseline_assessment':
      return 'there is no movement profile to build from yet';
    case 'insufficient_data':
      return 'there is not enough recent data to read her either way';
    default:
      return 'her readiness signals are low';
  }
}
