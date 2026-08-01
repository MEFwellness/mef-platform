/**
 * Life Signal Check — pure scoring, no I/O. Mirrors
 * lib/core-values-snapshot/scoring.ts's role: assessment-specific
 * presentation/scoring logic applied to a completed (or in-progress, for
 * the live Q10 option generation step) session's own real stored
 * answers, computed entirely from the Unified Adaptive Assessment
 * Runtime's own SessionAnswers — no new scoring engine.
 */

import type { SessionAnswers } from '@/lib/assessment-runtime/types';
import {
  BODY_TEXT_SIGNAL_GUESS,
  QUESTION_KEY_SIGNAL,
  SCREEN2_QUESTION_KEYS,
  SIGNALS,
  SIGNAL_OPTION_SCORES,
  SIGNAL_QUESTION_KEY,
  type BodyText,
  type Duration,
  type Signal,
  type TimeOfDay,
} from './constants';
import { computeLoudSignals } from './q10';
import { isAdjacent } from './adjacency';
import type { CvsContextForEcho, LscPattern, LscScoring } from './types';

function zeroRecord(): Record<Signal, number> {
  const record = {} as Record<Signal, number>;
  for (const signal of SIGNALS) record[signal] = 0;
  return record;
}

function stringAnswer<T extends string>(answers: SessionAnswers, key: string): T | null {
  const value = answers[key];
  return typeof value === 'string' ? (value as T) : null;
}

export function computeSignalScores(answers: SessionAnswers): Record<Signal, number> {
  const scores = zeroRecord();
  for (const key of SCREEN2_QUESTION_KEYS) {
    const signal = QUESTION_KEY_SIGNAL[key];
    const optionValue = answers[key];
    if (typeof optionValue === 'string') {
      scores[signal] = SIGNAL_OPTION_SCORES[key]?.[optionValue] ?? 0;
    }
  }
  return scores;
}

/** Deterministic tiebreak — canonical SIGNALS order — when two or more signals share the top score. */
function pickLoudest(scores: Record<Signal, number>): Signal {
  const max = Math.max(...SIGNALS.map((s) => scores[s]));
  return SIGNALS.find((s) => scores[s] === max)!;
}

/** Purely a function of how many signals are loud: 0 -> quiet_body, 1-2 -> one_loud (a single clear leader, even when a second signal is also elevated), 3+ -> chorus. Exported so the taker UI (LifeSignalCheckTaker.tsx) can decide, live during Screen 3, whether Question 10 has a real choice to offer. */
export function derivePattern(loudCount: number): LscPattern {
  if (loudCount === 0) return 'quiet_body';
  if (loudCount >= 3) return 'chorus';
  return 'one_loud';
}

const TIME_OF_DAY_WITH_A_CLEAN_CONTRAST = new Set<TimeOfDay>(['mornings', 'midday', 'evenings']);

export function computeLscScoring(answers: SessionAnswers, cvsContext: CvsContextForEcho | null): LscScoring {
  const scores = computeSignalScores(answers);
  const loudSignals = computeLoudSignals(scores);
  const loudestSignal = pickLoudest(scores);
  const chosenSignal = stringAnswer<Signal>(answers, 'lsc_q10') ?? loudestSignal;
  const pattern = derivePattern(loudSignals.length);

  const duration = stringAnswer<Duration>(answers, 'lsc_q11') ?? 'just_this_week';
  const bestTimeOfDay = stringAnswer<TimeOfDay>(answers, 'lsc_q1');
  const hardestTimeOfDay = stringAnswer<TimeOfDay>(answers, 'lsc_q2');
  const bodyText = stringAnswer<BodyText>(answers, 'lsc_q3');

  const surpriseFires = bodyText === 'okay_actually' && loudSignals.length > 0;

  const echoFires =
    cvsContext !== null &&
    cvsContext.branch !== 'aligned' &&
    isAdjacent(cvsContext.topValue, loudestSignal);

  const q1ContrastFires =
    bestTimeOfDay !== null &&
    hardestTimeOfDay !== null &&
    bestTimeOfDay !== hardestTimeOfDay &&
    TIME_OF_DAY_WITH_A_CLEAN_CONTRAST.has(bestTimeOfDay) &&
    TIME_OF_DAY_WITH_A_CLEAN_CONTRAST.has(hardestTimeOfDay);

  // Comparing against "the loudest signal" only means something once at
  // least one signal is genuinely loud — on quiet_body, loudestSignal is
  // just SIGNALS' canonical-order tiebreak among a field of zeros, not a
  // real finding, so there is nothing honest to confirm or contradict.
  const predictedSignalFromQ3 = bodyText ? (BODY_TEXT_SIGNAL_GUESS[bodyText] ?? null) : null;
  const q3Comparison: LscScoring['q3Comparison'] =
    predictedSignalFromQ3 === null || loudSignals.length === 0
      ? null
      : predictedSignalFromQ3 === loudestSignal
        ? 'confirmed'
        : 'mismatch';

  return {
    scores,
    loudSignals,
    loudestSignal,
    chosenSignal,
    pickDivergedFromLoudest: chosenSignal !== loudestSignal,
    pattern,
    duration,
    bestTimeOfDay,
    hardestTimeOfDay,
    bodyText,
    surpriseFires,
    echoFires,
    q1ContrastFires,
    predictedSignalFromQ3,
    q3Comparison,
  };
}

/** All eleven questions answered — Q10's dynamically-generated options depend on Q4-Q9, so it can only be reached once those are in, but this checks the full set for "ready to complete." */
export function allLscQuestionsAnswered(answers: SessionAnswers): boolean {
  const requiredKeys = ['lsc_q1', 'lsc_q2', 'lsc_q3', ...Object.values(SIGNAL_QUESTION_KEY), 'lsc_q10', 'lsc_q11'];
  return requiredKeys.every((key) => answers[key] !== undefined);
}
