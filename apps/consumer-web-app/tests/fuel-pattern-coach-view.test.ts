/**
 * The coach's reading of a Fuel Pattern sitting.
 *
 * WHAT HE MUST BE ABLE TO SEE, and it is the exact inverse of the member
 * page: the pattern with its confidence, all three raw scores, her
 * tendencies in plain language, every place the instrument got no
 * reading, the digestive discomfort signal and her vitality answer
 * exactly as she gave it.
 *
 * AND WHAT THE READING MUST NEVER TURN INTO. The discomfort flag is a
 * coaching signal: it is never scored, it never moves a pattern, and the
 * sentence beside it has to say both. The vitality answer is printed and
 * not interpreted. Neither is allowed to become a finding.
 */

import { describe, it, expect } from 'vitest';
import { buildFpaCoachReading, vitalityLineFor } from '../lib/fuel-pattern/coachView';
import { computeFpaScoring } from '../lib/fuel-pattern/scoring';
import { FPA_QUESTIONS } from '../lib/fuel-pattern/questionContent';
import {
  FPA_DIGESTIVE_DISCOMFORT_NOTE,
  FPA_TENDENCY_LABEL,
  FPA_VITALITY_NOT_ANSWERED,
} from '../lib/fuel-pattern/coachCopy';
import {
  FPA_DIGESTION_QUESTION_KEY,
  FPA_DIGESTIVE_DISCOMFORT_VALUE,
  FPA_VITALITY_QUESTION_KEY,
} from '../lib/fuel-pattern/constants';
import type { FpaWeightClass } from '../lib/fuel-pattern/types';

function optionValue(questionKey: string, weight: FpaWeightClass): string {
  const question = FPA_QUESTIONS.find((q) => q.key === questionKey)!;
  return (question.options.find((o) => o.weight === weight) ?? question.options[0]!).value;
}

function sitting(
  base: FpaWeightClass,
  overrides: Record<string, string> = {}
): Record<string, string> {
  const responses: Record<string, string> = {};
  for (const question of FPA_QUESTIONS) responses[question.key] = optionValue(question.key, base);
  return { ...responses, ...overrides };
}

function reading(responses: Record<string, string>) {
  const scoring = computeFpaScoring(responses);
  return buildFpaCoachReading({
    pattern: scoring.pattern,
    confidence: scoring.confidence,
    scores: scoring.scores,
    scoredQuestionCount: scoring.scoredQuestionCount,
    zeroWeightCount: scoring.zeroWeightCount,
    responses: scoring.responses,
    tendencies: scoring.tendencies,
    digestiveDiscomfort: scoring.digestiveDiscomfort,
    vitalityResponse: scoring.vitalityResponse,
  });
}

describe('the pattern, the confidence and the three scores', () => {
  it('prints all of them, in the same words the member reads for the pattern name', () => {
    const view = reading(sitting('protein'));
    expect(view.patternLabel).toBe('Protein-Supportive');
    expect(view.confidenceLabel).toBe('High');
    expect(view.scores.protein).toBeGreaterThan(view.scores.balanced);
    expect(view.scores.carb).toBe(0);
  });

  it('says what it counted, so a count on this card always names its own denominator', () => {
    const view = reading(sitting('neutral'));
    expect(view.scoredQuestionCount).toBe(23);
    expect(view.zeroWeightCount).toBe(23);
  });
});

describe('response tendencies, in plain language', () => {
  it('turns every stored code into its own sentence', () => {
    const view = reading(
      sitting('balanced', {
        fpa_q7: optionValue('fpa_q7', 'tendency'),
        fpa_q20: optionValue('fpa_q20', 'tendency'),
      })
    );
    expect(view.tendencyLines).toContain(FPA_TENDENCY_LABEL.skips_breakfast);
    expect(view.tendencyLines).toContain(FPA_TENDENCY_LABEL.appetite_decreases_under_stress);
  });

  it('prints an unknown code rather than dropping it, so a gap is visible', () => {
    const view = buildFpaCoachReading({
      pattern: 'balanced_fuel',
      confidence: 'moderate',
      scores: { protein: 1, balanced: 2, carb: 1 },
      scoredQuestionCount: 23,
      zeroWeightCount: 1,
      responses: {},
      tendencies: ['a_code_with_no_label'],
      digestiveDiscomfort: false,
      vitalityResponse: null,
    });
    expect(view.tendencyLines).toEqual(['a_code_with_no_label']);
  });
});

describe('ambiguous and mixed areas', () => {
  it('lists every zero weight answer with its question and her own words', () => {
    const view = reading(
      sitting('protein', {
        fpa_q2: optionValue('fpa_q2', 'neutral'),
        fpa_q17: optionValue('fpa_q17', 'tendency'),
      })
    );
    const keys = view.ambiguous.map((a) => a.questionKey);
    expect(keys).toEqual(['fpa_q2', 'fpa_q17']);
    expect(view.ambiguous[0]!.kind).toBe('varies');
    expect(view.ambiguous[1]!.kind).toBe('tendency');
    expect(view.ambiguous[0]!.order).toBe(2);
    expect(view.ambiguous[0]!.prompt).toContain('energy most stable');
    expect(view.ambiguous[0]!.answer.length).toBeGreaterThan(0);
  });

  it('lists nothing when every scored question carried a direction', () => {
    expect(reading(sitting('balanced')).ambiguous).toEqual([]);
  });

  it('never lists the vitality question, which is not scored and has no zero weight to report', () => {
    const view = reading(sitting('neutral'));
    expect(view.ambiguous.map((a) => a.questionKey)).not.toContain(FPA_VITALITY_QUESTION_KEY);
    expect(view.ambiguous).toHaveLength(23);
  });
});

describe('the digestive discomfort signal', () => {
  it('is flagged, and worded so it cannot be read as a finding', () => {
    const view = reading(
      sitting('protein', { [FPA_DIGESTION_QUESTION_KEY]: FPA_DIGESTIVE_DISCOMFORT_VALUE })
    );
    expect(view.digestiveDiscomfort).toBe(true);
    expect(view.digestiveDiscomfortNote).toBe(FPA_DIGESTIVE_DISCOMFORT_NOTE);
    expect(view.digestiveDiscomfortNote).toContain('Coaching signal only');
    expect(view.digestiveDiscomfortNote).toContain('did not influence the pattern');
  });

  it('really does leave the denominator rather than counting as a zero', () => {
    const withFlag = reading(
      sitting('protein', { [FPA_DIGESTION_QUESTION_KEY]: FPA_DIGESTIVE_DISCOMFORT_VALUE })
    );
    const without = reading(sitting('protein'));
    expect(withFlag.scoredQuestionCount).toBe(without.scoredQuestionCount - 1);
    expect(withFlag.zeroWeightCount).toBe(0);
  });

  it('is absent when she did not pick it', () => {
    expect(reading(sitting('balanced')).digestiveDiscomfort).toBe(false);
  });
});

describe('her vitality answer', () => {
  it('is printed exactly as she gave it', () => {
    expect(vitalityLineFor('comes_and_goes')).toBe('Comes and goes');
    expect(vitalityLineFor('very_low')).toBe('Very low lately');
  });

  it('says she declined when she declined, which is not the same as silence', () => {
    expect(vitalityLineFor('prefer_not_to_answer')).toBe('Preferred not to answer');
  });

  it('says nothing was answered when nothing was', () => {
    expect(vitalityLineFor(null)).toBe(FPA_VITALITY_NOT_ANSWERED);
    expect(vitalityLineFor('')).toBe(FPA_VITALITY_NOT_ANSWERED);
  });

  it('is never scored, whichever way she answered it', () => {
    const strong = reading(sitting('balanced', { [FPA_VITALITY_QUESTION_KEY]: 'strong_consistent' }));
    const low = reading(sitting('balanced', { [FPA_VITALITY_QUESTION_KEY]: 'very_low' }));
    expect(strong.scores).toEqual(low.scores);
    expect(strong.pattern).toBe(low.pattern);
  });
});
