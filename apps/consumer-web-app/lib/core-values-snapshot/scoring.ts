/**
 * Core Values Snapshot — pure scoring, no I/O. Mirrors lib/wbsa/results.ts's
 * role: assessment-specific presentation/scoring logic that reads a
 * completed (or in-progress, for the live Q12 generation step) session's
 * own real stored answers, computed entirely client- and server-side from
 * the Unified Adaptive Assessment Runtime's own SessionAnswers — no new
 * scoring engine, just this assessment's own scoring rules applied to data
 * the runtime already persists.
 */

import type { SessionAnswers } from '@/lib/assessment-runtime/types';
import { AREA_LABEL, SCREEN1_QUESTION_KEYS, SLIDER_QUESTION_AREA, VALUE_AREAS, type ValueArea } from './constants';
import type { CvsBranch, CvsScoring, GapClassification } from './types';

function zeroRecord(): Record<ValueArea, number> {
  const record = {} as Record<ValueArea, number>;
  for (const area of VALUE_AREAS) record[area] = 0;
  return record;
}

function areaAnswer(answers: SessionAnswers, questionKey: string): ValueArea | null {
  const value = answers[questionKey];
  return typeof value === 'string' && (VALUE_AREAS as readonly string[]).includes(value) ? (value as ValueArea) : null;
}

/** Importance contributed by Q1-Q4 alone (each worth 1, Q4 worth 2) — the basis both for Q12's option generation and the "split" flag, both of which must ignore Q11/Q12's own points. */
export function computeImportanceThroughQ4(answers: SessionAnswers): Record<ValueArea, number> {
  const importance = zeroRecord();
  const weights: Record<string, number> = { cvs_q1: 1, cvs_q2: 1, cvs_q3: 1, cvs_q4: 2 };
  for (const key of SCREEN1_QUESTION_KEYS) {
    const area = areaAnswer(answers, key);
    if (area) importance[area] += weights[key] ?? 0;
  }
  return importance;
}

/** Deterministic tiebreak order when nothing else distinguishes two areas — canonical VALUE_AREAS order. */
function pickHighest(
  scores: Record<ValueArea, number>,
  candidates: readonly ValueArea[],
  tiebreakOrder: (ValueArea | null)[]
): ValueArea {
  const max = Math.max(...candidates.map((a) => scores[a]));
  const tied = candidates.filter((a) => scores[a] === max);
  if (tied.length === 1) return tied[0]!;

  for (const preferred of tiebreakOrder) {
    if (preferred && tied.includes(preferred)) return preferred;
  }
  return [...tied].sort((a, b) => VALUE_AREAS.indexOf(a) - VALUE_AREAS.indexOf(b))[0]!;
}

export function computeCvsScoring(answers: SessionAnswers): CvsScoring {
  const importanceThroughQ4 = computeImportanceThroughQ4(answers);

  const q4Answer = areaAnswer(answers, 'cvs_q4') ?? VALUE_AREAS[0];
  const q11Pick = areaAnswer(answers, 'cvs_q11') ?? VALUE_AREAS[0];
  const q12Winner = areaAnswer(answers, 'cvs_q12') ?? q4Answer;
  const guiltArea = areaAnswer(answers, 'cvs_q3') ?? VALUE_AREAS[0];

  const importance = { ...importanceThroughQ4 };
  importance[q11Pick] = (importance[q11Pick] ?? 0) + 2;
  importance[q12Winner] = (importance[q12Winner] ?? 0) + 1;

  const attention = zeroRecord();
  for (const [questionKey, area] of Object.entries(SLIDER_QUESTION_AREA)) {
    const value = answers[questionKey];
    if (typeof value === 'number') attention[area] = value;
    else if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      attention[area] = Number(value);
    }
  }

  // Tiebreak for Top Value: Q4 answer -> Q12 winner -> Q11 pick -> canonical order.
  const topTiebreak = [q4Answer, q12Winner, q11Pick];
  const topValue = pickHighest(importance, VALUE_AREAS, topTiebreak);

  const remaining = VALUE_AREAS.filter((a) => a !== topValue);
  const runnerUpValue = pickHighest(importance, remaining, topTiebreak);

  const topAttention = attention[topValue];
  const gapClassification: GapClassification = topAttention <= 2 ? 'clear_gap' : topAttention === 3 ? 'slipping' : 'aligned';

  const split = importanceThroughQ4[q11Pick] === 0;
  const branch: CvsBranch = split ? 'split' : gapClassification;

  const guiltAreaAttention = attention[guiltArea];
  const s1Fires = branch !== 'split' && guiltAreaAttention >= 4;

  return {
    importance,
    attention,
    topValue,
    runnerUpValue,
    gapClassification,
    split,
    branch,
    guiltArea,
    guiltAreaAttention,
    s1Fires,
    q11Pick,
    q4Answer,
    q12Winner,
  };
}

export function areaLabel(area: ValueArea): string {
  return AREA_LABEL[area];
}

/** All twelve Q1-Q11 questions answered — Q12's dynamic options depend on Q1-Q4, so it can only be reached once those are in, but this checks the full set for "ready to complete." */
export function allCoreQuestionsAnswered(answers: SessionAnswers): boolean {
  const requiredKeys = [...SCREEN1_QUESTION_KEYS, ...Object.keys(SLIDER_QUESTION_AREA), 'cvs_q11', 'cvs_q12'];
  return requiredKeys.every((key) => answers[key] !== undefined);
}
