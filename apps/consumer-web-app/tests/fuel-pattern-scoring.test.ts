/**
 * The Fuel Pattern scoring engine.
 *
 * Every claim the completion report makes about the weight map, the
 * Flexible Fuel rule and the confidence thresholds is asserted here
 * against real answer sets rather than against the constants themselves,
 * so a threshold changed in code without being changed in the report
 * fails.
 */
import { describe, it, expect } from 'vitest';
import {
  CONFIDENCE_THRESHOLDS,
  FLEXIBLE_LEAD_THRESHOLD,
  FLEXIBLE_ZERO_SHARE,
  FPA_SCORED_QUESTION_KEYS,
  allFpaQuestionsAnswered,
  computeConfidence,
  computeFpaScoring,
} from '../lib/fuel-pattern/scoring';
import { FPA_QUESTIONS } from '../lib/fuel-pattern/questionContent';
import {
  FPA_DIGESTION_QUESTION_KEY,
  FPA_DIGESTIVE_DISCOMFORT_VALUE,
  FPA_VITALITY_QUESTION_KEY,
} from '../lib/fuel-pattern/constants';
import type { FpaWeightClass } from '../lib/fuel-pattern/types';

/** Answer every question with the first option carrying this weight class, falling back to the first option at all. */
function answerAll(preferred: FpaWeightClass): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of FPA_QUESTIONS) {
    const match = question.options.find((o) => o.weight === preferred) ?? question.options[0]!;
    answers[question.key] = match.value;
  }
  return answers;
}

describe('the weight map', () => {
  it('scores twenty three questions and never the vitality one', () => {
    expect(FPA_SCORED_QUESTION_KEYS).toHaveLength(23);
    expect(FPA_SCORED_QUESTION_KEYS).not.toContain(FPA_VITALITY_QUESTION_KEY);
  });

  it('gives every option exactly one of the six weight classes', () => {
    const allowed: FpaWeightClass[] = ['protein', 'balanced', 'carb', 'neutral', 'tendency', 'unscored'];
    for (const question of FPA_QUESTIONS) {
      for (const option of question.options) {
        expect(allowed, `${question.key}/${option.value}`).toContain(option.weight);
      }
    }
  });

  it('names a tendency code on every tendency option and on no other', () => {
    for (const question of FPA_QUESTIONS) {
      for (const option of question.options) {
        if (option.weight === 'tendency') expect(option.tendency, option.value).toBeTruthy();
        else expect(option.tendency, option.value).toBeUndefined();
      }
    }
  });

  /*
    ONE QUESTION HAS NO BALANCED ANSWER, AND IT IS NOT AN OVERSIGHT.
    Question 20 asks what stress does to her eating, and the four things
    it offers are hungrier, craving sweets or starches, appetite drops and
    unpredictable. There is no middle answer to that question, because
    "stress does nothing much" is the fifth option and it is a neutral
    rather than a balanced statement about fuel. The question's wording is
    fixed, so the exception is named here rather than papered over by
    weakening the rule for all twenty three.
  */
  const NO_BALANCED_ANSWER = ['fpa_q20'];

  it('offers a protein, a balanced and a carb answer on every scored question', () => {
    for (const key of FPA_SCORED_QUESTION_KEYS) {
      const question = FPA_QUESTIONS.find((q) => q.key === key)!;
      const classes = new Set(question.options.map((o) => o.weight));
      expect(classes.has('protein'), key).toBe(true);
      expect(classes.has('carb'), key).toBe(true);
      expect(classes.has('balanced'), key).toBe(!NO_BALANCED_ANSWER.includes(key));
    }
  });

  it('applies 2/1/0, 1/2/1 and 0/1/2 exactly', () => {
    const proteinOnly = computeFpaScoring({ fpa_q2: 'protein_veg_fat' });
    expect(proteinOnly.scores).toEqual({ protein: 2, balanced: 1, carb: 0 });

    const balancedOnly = computeFpaScoring({ fpa_q2: 'balanced_mix' });
    expect(balancedOnly.scores).toEqual({ protein: 1, balanced: 2, carb: 1 });

    const carbOnly = computeFpaScoring({ fpa_q2: 'carb_plus_protein' });
    expect(carbOnly.scores).toEqual({ protein: 0, balanced: 1, carb: 2 });
  });
});

describe('the four outcomes', () => {
  it('reads a protein leaning set as Protein-Supportive', () => {
    const scoring = computeFpaScoring(answerAll('protein'));
    expect(scoring.pattern).toBe('protein_supportive');
    expect(scoring.scores.protein).toBeGreaterThan(scoring.scores.balanced);
    expect(scoring.zeroWeightCount).toBe(0);
  });

  it('reads a carb leaning set as Carb-Supportive', () => {
    const scoring = computeFpaScoring(answerAll('carb'));
    expect(scoring.pattern).toBe('carb_supportive');
    expect(scoring.scores.carb).toBeGreaterThan(scoring.scores.balanced);
  });

  it('reads an every-question-balanced set as Balanced Fuel', () => {
    const scoring = computeFpaScoring(answerAll('balanced'));
    expect(scoring.pattern).toBe('balanced_fuel');
  });

  it('reads a mostly "it varies" set as Flexible Fuel, which is a result and not an error', () => {
    const scoring = computeFpaScoring(answerAll('neutral'));
    expect(scoring.pattern).toBe('flexible_fuel');
    expect(scoring.scoredQuestionCount).toBeGreaterThan(0);
    expect(scoring.zeroWeightShare).toBe(1);
  });

  it('reads a genuinely close set as Flexible Fuel even with no zero weight answers', () => {
    // Alternate protein and carb answers: the two directions land close
    // together and balanced collects a point from each, so nothing leads.
    const answers: Record<string, string> = {};
    FPA_QUESTIONS.forEach((question, i) => {
      const wanted = i % 2 === 0 ? 'protein' : 'carb';
      const option = question.options.find((o) => o.weight === wanted) ?? question.options[0]!;
      answers[question.key] = option.value;
    });
    const scoring = computeFpaScoring(answers);
    expect(scoring.zeroWeightCount).toBe(0);
    expect(scoring.leadShare).toBeLessThan(FLEXIBLE_LEAD_THRESHOLD);
    expect(scoring.pattern).toBe('flexible_fuel');
  });
});

describe('the Flexible Fuel rule, both halves', () => {
  it('turns a clear lead into Flexible once zero weight answers reach the share', () => {
    const protein = answerAll('protein');
    // Replace enough answers with a neutral one to cross the share.
    const keys = FPA_SCORED_QUESTION_KEYS.slice();
    const needed = Math.ceil(FLEXIBLE_ZERO_SHARE * keys.length);
    const answers = { ...protein };
    for (const key of keys.slice(0, needed)) {
      const question = FPA_QUESTIONS.find((q) => q.key === key)!;
      answers[key] = question.options.find((o) => o.weight === 'neutral')!.value;
    }
    const scoring = computeFpaScoring(answers);
    expect(scoring.zeroWeightShare).toBeGreaterThanOrEqual(FLEXIBLE_ZERO_SHARE);
    expect(scoring.pattern).toBe('flexible_fuel');
  });

  it('leaves a clear lead alone just under the share', () => {
    const protein = answerAll('protein');
    const keys = FPA_SCORED_QUESTION_KEYS.slice();
    const answers = { ...protein };
    // One fewer than the count that would cross the threshold.
    const needed = Math.ceil(FLEXIBLE_ZERO_SHARE * keys.length) - 1;
    for (const key of keys.slice(0, needed)) {
      const question = FPA_QUESTIONS.find((q) => q.key === key)!;
      answers[key] = question.options.find((o) => o.weight === 'neutral')!.value;
    }
    const scoring = computeFpaScoring(answers);
    expect(scoring.zeroWeightShare).toBeLessThan(FLEXIBLE_ZERO_SHARE);
    expect(scoring.pattern).toBe('protein_supportive');
  });
});

describe('the two questions that must never move the pattern', () => {
  it('scores nothing for the digestive discomfort answer, and still flags it', () => {
    const base = answerAll('protein');
    const withDiscomfort = {
      ...base,
      [FPA_DIGESTION_QUESTION_KEY]: FPA_DIGESTIVE_DISCOMFORT_VALUE,
    };

    const a = computeFpaScoring(base);
    const b = computeFpaScoring(withDiscomfort);

    // The question leaves the scoring denominator entirely rather than
    // counting as a zero weight answer, so it cannot push her toward
    // Flexible Fuel either.
    expect(b.scoredQuestionCount).toBe(a.scoredQuestionCount - 1);
    expect(b.zeroWeightCount).toBe(a.zeroWeightCount);
    expect(b.digestiveDiscomfort).toBe(true);
    expect(a.digestiveDiscomfort).toBe(false);
    expect(b.pattern).toBe(a.pattern);
  });

  it('scores nothing for any vitality answer, and stores the one she gave', () => {
    const base = answerAll('protein');
    const scores = new Set<string>();
    for (const option of FPA_QUESTIONS.find((q) => q.key === FPA_VITALITY_QUESTION_KEY)!.options) {
      const scoring = computeFpaScoring({ ...base, [FPA_VITALITY_QUESTION_KEY]: option.value });
      scores.add(JSON.stringify([scoring.scores, scoring.scoredQuestionCount, scoring.pattern]));
      expect(scoring.vitalityResponse).toBe(option.value);
    }
    // Every vitality answer produced the identical scoring.
    expect(scores.size).toBe(1);
  });
});

describe('response tendencies', () => {
  it('collects the code for every zero weight answer that describes neither direction', () => {
    const answers = answerAll('tendency');
    const scoring = computeFpaScoring(answers);
    expect(scoring.tendencies).toContain('skips_breakfast');
    expect(scoring.tendencies).toContain('salty_crunchy_craving');
    expect(scoring.tendencies).toContain('appetite_decreases_under_stress');
    expect(new Set(scoring.tendencies).size).toBe(scoring.tendencies.length);
  });

  it('stores every answer she gave, all twenty four of them', () => {
    const scoring = computeFpaScoring(answerAll('protein'));
    expect(Object.keys(scoring.responses)).toHaveLength(FPA_QUESTIONS.length);
  });
});

describe('confidence', () => {
  it('uses exactly the thresholds the completion report prints', () => {
    expect(CONFIDENCE_THRESHOLDS.directional.high).toEqual({ minLead: 0.35, maxZeroShare: 0.2 });
    expect(CONFIDENCE_THRESHOLDS.directional.moderate).toEqual({ minLead: 0.2, maxZeroShare: 0.35 });
    expect(CONFIDENCE_THRESHOLDS.flexible.high).toEqual({ maxLead: 0.1, maxZeroShare: 0.2 });
    expect(CONFIDENCE_THRESHOLDS.flexible.moderate).toEqual({ maxZeroShare: 0.4 });
  });

  it('reads a directional result off the lead and the zero weight share', () => {
    expect(computeConfidence('protein_supportive', 0.5, 0)).toBe('high');
    expect(computeConfidence('protein_supportive', 0.35, 0.2)).toBe('high');
    expect(computeConfidence('protein_supportive', 0.34, 0.2)).toBe('moderate');
    expect(computeConfidence('protein_supportive', 0.5, 0.25)).toBe('moderate');
    expect(computeConfidence('protein_supportive', 0.5, 0.36)).toBe('low');
  });

  it('reads a Flexible result the other way round, so a decisive Flexible is a confident one', () => {
    expect(computeConfidence('flexible_fuel', 0.02, 0)).toBe('high');
    expect(computeConfidence('flexible_fuel', 0.15, 0.1)).toBe('moderate');
    expect(computeConfidence('flexible_fuel', 0.0, 0.9)).toBe('low');
  });

  it('gives a wholly protein leaning set high confidence', () => {
    expect(computeFpaScoring(answerAll('protein')).confidence).toBe('high');
  });

  it('gives an all "it varies" set low confidence, and still a real pattern', () => {
    const scoring = computeFpaScoring(answerAll('neutral'));
    expect(scoring.confidence).toBe('low');
    expect(scoring.pattern).toBe('flexible_fuel');
  });
});

describe('completeness', () => {
  it('is not finished until all twenty four have an answer, the vitality one included', () => {
    const answers = answerAll('protein');
    expect(allFpaQuestionsAnswered(answers)).toBe(true);
    const missingVitality = { ...answers };
    delete missingVitality[FPA_VITALITY_QUESTION_KEY];
    expect(allFpaQuestionsAnswered(missingVitality)).toBe(false);
  });

  it('is Flexible Fuel with nothing answered at all, rather than an error', () => {
    const scoring = computeFpaScoring({});
    expect(scoring.pattern).toBe('flexible_fuel');
    expect(scoring.scoredQuestionCount).toBe(0);
  });
});
