/**
 * Readiness Pulse — pure scoring, no I/O. Mirrors
 * lib/life-signal-check/scoring.ts's role: assessment-specific
 * presentation/scoring logic applied to a completed session's own real
 * stored answers, computed entirely from the Unified Adaptive Assessment
 * Runtime's own SessionAnswers plus optional cross-conversation context
 * (Life Signal Check's loudest signal) — no new scoring engine.
 *
 * THE DERIVED READINESS FORMULA — exact thresholds, documented here so the
 * same answers always produce the same pattern:
 *
 *   Capacity score  = Q4 (genuinely_open=3, room_if_protect=2,
 *                     small_pockets=1, almost_none=0)
 *                   + Q7 (easily_doable=3, doable_good_days=2,
 *                     sounds_small_know_myself=1, even_that_heavy=0)
 *                     -> range 0-6.
 *   Willingness score = Q3 (overdue=3, curious=2, appealing_but_exhausting=1,
 *                     a_little_scary=1) + 1 for having answered Q8
 *                     (Q8 is required to complete the session, so this
 *                     is 1 for every completed session; the +0 branch only
 *                     matters if this function is ever called on an
 *                     in-progress session) -> range 1-4 once Q3 is answered.
 *
 *   Willingness band (from willingnessScore alone, since Q3's own three
 *   distinct values plus the constant +1 already produce exactly three
 *   clean bands): <=2 -> low, ==3 -> medium, ==4 -> high.
 *
 *   Capacity band (from capacityScore 0-6, with Q7's own "even that feels
 *   heavy" as an explicit override per the build brief's own parenthetical
 *   -- "(or Q7 at 0)"): Q7==0 or capacityScore<=2 -> thin;
 *   capacityScore>=5 (and Q7>=1) -> strong; everything else -> medium.
 *
 *   Pattern (a full, deterministic 3x3 table over the two bands):
 *     willingness low                          -> not_yet, any capacity
 *     willingness medium, capacity thin         -> ready_if_small
 *     willingness medium, capacity medium/strong -> still_deciding
 *     willingness high, capacity strong          -> ready_now
 *     willingness high, capacity thin/medium     -> ready_if_small
 *
 * Her own Question 9 pick always wins as the final pattern for every
 * downstream decision, exactly like Life Signal Check's Question 10 pick-
 * wins rule — derivedPattern is retained only so Root can honestly note a
 * divergence, never to override her.
 */

import type { SessionAnswers } from '@/lib/assessment-runtime/types';
import type { Signal } from '../life-signal-check/constants';
import { triedBranchFor, type ReadinessPattern } from './constants';
import type {
  Q1Answer,
  Q2Answer,
  Q3Answer,
  Q4Answer,
  Q5Answer,
  Q6Answer,
  Q7Answer,
  Q9Answer,
} from './constants';
import type { CapacityBand, LscContextForRpl, RplScoring, WillingnessBand } from './types';

function stringAnswer<T extends string>(answers: SessionAnswers, key: string): T | null {
  const value = answers[key];
  return typeof value === 'string' ? (value as T) : null;
}

const Q3_SCORE: Record<Q3Answer, number> = {
  overdue: 3,
  curious: 2,
  appealing_but_exhausting: 1,
  a_little_scary: 1,
};

const Q4_SCORE: Record<Q4Answer, number> = {
  genuinely_open: 3,
  room_if_protect: 2,
  small_pockets: 1,
  almost_none: 0,
};

const Q7_SCORE: Record<Q7Answer, number> = {
  easily_doable: 3,
  doable_good_days: 2,
  sounds_small_know_myself: 1,
  even_that_heavy: 0,
};

export function willingnessBandFor(score: number): WillingnessBand {
  if (score <= 2) return 'low';
  if (score === 3) return 'medium';
  return 'high';
}

export function capacityBandFor(capacityScore: number, q7Score: number): CapacityBand {
  if (q7Score === 0 || capacityScore <= 2) return 'thin';
  if (capacityScore >= 5) return 'strong';
  return 'medium';
}

export function deriveReadinessPattern(willingness: WillingnessBand, capacity: CapacityBand): ReadinessPattern {
  if (willingness === 'low') return 'not_yet';
  if (willingness === 'high' && capacity === 'strong') return 'ready_now';
  if (capacity === 'thin') return 'ready_if_small';
  if (willingness === 'high' && capacity === 'medium') return 'ready_if_small';
  return 'still_deciding';
}

function surpriseFiresFor(q3: Q3Answer, q9: Q9Answer): boolean {
  if (q3 === 'overdue' && q9 === 'not_yet') return true;
  if ((q3 === 'a_little_scary' || q3 === 'appealing_but_exhausting') && q9 === 'ready_now') return true;
  return false;
}

export function computeRplScoring(answers: SessionAnswers, lscContext: LscContextForRpl | null): RplScoring {
  const q1 = stringAnswer<Q1Answer>(answers, 'rpl_q1') ?? 'first_real_try';
  const q2 = stringAnswer<Q2Answer>(answers, 'rpl_q2');
  const q3 = stringAnswer<Q3Answer>(answers, 'rpl_q3') ?? 'curious';
  const q4 = stringAnswer<Q4Answer>(answers, 'rpl_q4') ?? 'small_pockets';
  const q5 = stringAnswer<Q5Answer>(answers, 'rpl_q5') ?? 'adaptive';
  const q6 = stringAnswer<Q6Answer>(answers, 'rpl_q6') ?? 'schedule';
  const q7 = stringAnswer<Q7Answer>(answers, 'rpl_q7') ?? 'doable_good_days';
  const q8Signal = stringAnswer<Signal>(answers, 'rpl_q8') ?? 'energy';
  const q9 = stringAnswer<Q9Answer>(answers, 'rpl_q9') ?? 'still_deciding';

  const capacityScore = Q4_SCORE[q4] + Q7_SCORE[q7];
  const willingnessScore = Q3_SCORE[q3] + (answers['rpl_q8'] !== undefined ? 1 : 0);

  const willingnessBand = willingnessBandFor(willingnessScore);
  const capacityBand = capacityBandFor(capacityScore, Q7_SCORE[q7]);
  const derivedPattern = deriveReadinessPattern(willingnessBand, capacityBand);
  const finalPattern: ReadinessPattern = q9;

  const lscLoud = lscContext !== null && lscContext.pattern !== 'quiet_body';
  const q8Comparison: RplScoring['q8Comparison'] = !lscLoud ? null : q8Signal === lscContext!.loudestSignal ? 'confirmed' : 'mismatch';
  const targetSignal = lscLoud ? lscContext!.loudestSignal : q8Signal;

  return {
    q1,
    triedBranch: triedBranchFor(q1),
    q2,
    q3,
    q4,
    q5,
    q6,
    q7,
    q8Signal,
    q9,
    capacityScore,
    willingnessScore,
    willingnessBand,
    capacityBand,
    derivedPattern,
    finalPattern,
    pickDivergedFromDerived: finalPattern !== derivedPattern,
    lscContext,
    q8Comparison,
    targetSignal,
    surpriseFires: surpriseFiresFor(q3, q9),
  };
}

/** All nine questions answered — Question 2's own answer_options depend on Question 1 but the question_key itself ('rpl_q2') is always the one required key, same as Q10 for Life Signal Check. */
export function allRplQuestionsAnswered(answers: SessionAnswers): boolean {
  const requiredKeys = ['rpl_q1', 'rpl_q2', 'rpl_q3', 'rpl_q4', 'rpl_q5', 'rpl_q6', 'rpl_q7', 'rpl_q8', 'rpl_q9'];
  return requiredKeys.every((key) => answers[key] !== undefined);
}
