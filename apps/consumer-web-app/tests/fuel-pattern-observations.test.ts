/**
 * "Why this pattern fits you", proved rather than described.
 *
 * THE FAILURE THIS FILE EXISTS TO CATCH. The section under her pattern
 * name prints three or four sentences that say "you told us". A sentence
 * there that her answers do not support is not a cosmetic problem: it is
 * the app telling a member something about herself that she never said.
 * So every rule in lib/fuel-pattern/observations.ts is driven here with
 * real answers, in both directions: the answers that must make a line
 * appear, and the answers that must keep it off the screen.
 *
 * IT ALSO PROVES THE LINES ARE RESPONSE DRIVEN, which is the whole point
 * of building an engine instead of a list per pattern: two members with
 * the same pattern and different answers must not read the same section.
 */

import { describe, it, expect } from 'vitest';
import {
  FPA_MAX_OBSERVATIONS,
  FPA_NO_OBSERVATIONS_LINE,
  FPA_OBSERVATION_RULES,
  describeFpaSupport,
  qualifyingFpaObservations,
  selectFpaObservations,
} from '../lib/fuel-pattern/observations';
import { FPA_QUESTIONS } from '../lib/fuel-pattern/questionContent';
import { computeFpaScoring } from '../lib/fuel-pattern/scoring';
import type { FpaWeightClass, FuelPattern } from '../lib/fuel-pattern/types';

/** The value of the first option on a question carrying this class, or the first option when it has none. */
function optionValue(questionKey: string, weight: FpaWeightClass): string {
  const question = FPA_QUESTIONS.find((q) => q.key === questionKey)!;
  return (question.options.find((o) => o.weight === weight) ?? question.options[0]!).value;
}

/** A whole sitting answered in one class, with named questions answered differently. */
function sitting(
  base: FpaWeightClass,
  overrides: Record<string, FpaWeightClass> = {}
): Record<string, string> {
  const responses: Record<string, string> = {};
  for (const question of FPA_QUESTIONS) {
    responses[question.key] = optionValue(question.key, overrides[question.key] ?? base);
  }
  return responses;
}

function ids(responses: Record<string, string>, pattern: FuelPattern): string[] {
  return selectFpaObservations(responses, pattern).map((o) => o.id);
}

describe('the approved library is used verbatim', () => {
  it('carries exactly the twelve approved lines, word for word', () => {
    expect(FPA_OBSERVATION_RULES.map((r) => [r.id, r.text])).toEqual([
      [
        'protein_satiety',
        'Protein appears to support your satisfaction and staying power between meals.',
      ],
      [
        'carbs_alone_rough',
        'Carbohydrate-heavy meals on their own do not appear to hold you steady.',
      ],
      ['carbs_steady', 'Your response to carbohydrates appears relatively steady.'],
      ['balanced_energy', 'Balanced meals tend to hold your energy well.'],
      ['substantial_meals', 'More substantial meals appear to serve you well.'],
      ['lighter_meals', 'Lighter meals appear to leave you feeling your best.'],
      ['gap_sensitivity', 'Long gaps between meals appear to work against you.'],
      ['long_gaps_fine', 'You appear comfortable going longer stretches between meals.'],
      [
        'fat_matters',
        'Healthy fat appears to play a real role in how satisfying your meals feel.',
      ],
      ['fat_sits_heavy', 'Higher-fat meals appear to sit a little heavily for you.'],
      ['no_extreme', 'You do not show a strong need for either extreme.'],
      [
        'honest_variation',
        'Your responses genuinely vary from day to day, and that is useful information in itself.',
      ],
    ]);
  });

  it('puts no em dash in any of them, nor in the line that stands in for them', () => {
    for (const rule of FPA_OBSERVATION_RULES) expect(rule.text, rule.id).not.toContain('—');
    expect(FPA_NO_OBSERVATIONS_LINE).not.toContain('—');
  });
});

describe('each rule fires on its own evidence and on nothing else', () => {
  it('protein_satiety needs two of Q1, Q4 and Q16 in the protein class', () => {
    const two = sitting('neutral', { fpa_q1: 'protein', fpa_q4: 'protein' });
    expect(qualifyingFpaObservations(two, 'protein_supportive').map((o) => o.id)).toContain(
      'protein_satiety'
    );

    const one = sitting('neutral', { fpa_q1: 'protein' });
    expect(qualifyingFpaObservations(one, 'protein_supportive').map((o) => o.id)).not.toContain(
      'protein_satiety'
    );
  });

  it('carbs_alone_rough and carbs_steady read the same three questions and can never both fire', () => {
    const rough = sitting('neutral', { fpa_q3: 'protein', fpa_q5: 'protein' });
    const roughIds = qualifyingFpaObservations(rough, 'protein_supportive').map((o) => o.id);
    expect(roughIds).toContain('carbs_alone_rough');
    expect(roughIds).not.toContain('carbs_steady');

    const steady = sitting('neutral', { fpa_q3: 'carb', fpa_q5: 'balanced' });
    const steadyIds = qualifyingFpaObservations(steady, 'carb_supportive').map((o) => o.id);
    expect(steadyIds).toContain('carbs_steady');
    expect(steadyIds).not.toContain('carbs_alone_rough');
  });

  it('gap_sensitivity needs both Q9 and Q1 in the protein class', () => {
    const both = sitting('neutral', { fpa_q1: 'protein', fpa_q9: 'protein' });
    expect(qualifyingFpaObservations(both, 'protein_supportive').map((o) => o.id)).toContain(
      'gap_sensitivity'
    );

    const half = sitting('neutral', { fpa_q9: 'protein' });
    expect(qualifyingFpaObservations(half, 'protein_supportive').map((o) => o.id)).not.toContain(
      'gap_sensitivity'
    );
  });

  it('long_gaps_fine needs both Q1 and Q9 in the carb class, and excludes gap_sensitivity by construction', () => {
    const responses = sitting('neutral', { fpa_q1: 'carb', fpa_q9: 'carb' });
    const found = qualifyingFpaObservations(responses, 'carb_supportive').map((o) => o.id);
    expect(found).toContain('long_gaps_fine');
    expect(found).not.toContain('gap_sensitivity');
  });

  it('fat_matters needs both Q12 and Q13, and fat_sits_heavy needs Q13 the other way', () => {
    const matters = sitting('neutral', { fpa_q12: 'protein', fpa_q13: 'protein' });
    expect(qualifyingFpaObservations(matters, 'protein_supportive').map((o) => o.id)).toEqual(
      expect.arrayContaining(['fat_matters'])
    );

    const heavy = sitting('neutral', { fpa_q13: 'carb' });
    const heavyIds = qualifyingFpaObservations(heavy, 'carb_supportive').map((o) => o.id);
    expect(heavyIds).toContain('fat_sits_heavy');
    expect(heavyIds).not.toContain('fat_matters');
  });

  it('no_extreme is offered to Balanced and Flexible only, never to a directional reading', () => {
    const responses = sitting('balanced');
    expect(qualifyingFpaObservations(responses, 'balanced_fuel').map((o) => o.id)).toContain(
      'no_extreme'
    );
    expect(qualifyingFpaObservations(responses, 'flexible_fuel').map((o) => o.id)).toContain(
      'no_extreme'
    );
    expect(qualifyingFpaObservations(responses, 'protein_supportive').map((o) => o.id)).not.toContain(
      'no_extreme'
    );
    expect(qualifyingFpaObservations(responses, 'carb_supportive').map((o) => o.id)).not.toContain(
      'no_extreme'
    );
  });

  it('honest_variation is offered to Flexible only, and only past two fifths of the instrument', () => {
    const varied = sitting('neutral');
    expect(qualifyingFpaObservations(varied, 'flexible_fuel').map((o) => o.id)).toContain(
      'honest_variation'
    );
    expect(qualifyingFpaObservations(varied, 'balanced_fuel').map((o) => o.id)).not.toContain(
      'honest_variation'
    );

    // One "it varies" in an otherwise decisive sitting is not variation.
    const decisive = sitting('protein', { fpa_q2: 'neutral' });
    expect(qualifyingFpaObservations(decisive, 'flexible_fuel').map((o) => o.id)).not.toContain(
      'honest_variation'
    );
  });
});

describe('two lines that contradict each other are never printed side by side', () => {
  it('drops the weaker of substantial_meals and lighter_meals, which is the one pair that can both fire', () => {
    // Q17 and Q22 say substantial, Q18 and Q19 say lighter. Both rules are
    // met on the raw evidence.
    const responses = sitting('neutral', {
      fpa_q17: 'protein',
      fpa_q22: 'protein',
      fpa_q18: 'carb',
      fpa_q19: 'carb',
      fpa_q3: 'protein',
      fpa_q5: 'protein',
    });
    const found = qualifyingFpaObservations(responses, 'protein_supportive').map((o) => o.id);
    expect(found).toContain('substantial_meals');
    expect(found).not.toContain('lighter_meals');
  });

  it('keeps lighter_meals when it is the better supported of the two', () => {
    const responses = sitting('neutral', {
      fpa_q17: 'protein',
      fpa_q19: 'protein',
      fpa_q18: 'carb',
      fpa_q22: 'carb',
    });
    // substantial: Q17 and Q19. lighter: Q18 and Q22. A tie, and a tie goes
    // to the line written first.
    const tie = qualifyingFpaObservations(responses, 'carb_supportive').map((o) => o.id);
    expect(tie).toContain('substantial_meals');
    expect(tie).not.toContain('lighter_meals');

    const stronger = sitting('neutral', {
      fpa_q17: 'protein',
      fpa_q22: 'carb',
      fpa_q18: 'carb',
      fpa_q19: 'carb',
    });
    const found = qualifyingFpaObservations(stronger, 'carb_supportive').map((o) => o.id);
    expect(found).toContain('lighter_meals');
    expect(found).not.toContain('substantial_meals');
  });
});

describe('how many she is shown', () => {
  it('never prints more than four', () => {
    const responses = sitting('protein');
    const shown = selectFpaObservations(responses, 'protein_supportive');
    expect(qualifyingFpaObservations(responses, 'protein_supportive').length).toBeGreaterThan(
      FPA_MAX_OBSERVATIONS
    );
    expect(shown).toHaveLength(FPA_MAX_OBSERVATIONS);
  });

  it('prints exactly two when exactly two qualify, rather than padding to three', () => {
    const responses = sitting('neutral', {
      fpa_q1: 'protein',
      fpa_q4: 'protein',
      fpa_q9: 'protein',
    });
    const qualifying = qualifyingFpaObservations(responses, 'protein_supportive');
    expect(qualifying.map((o) => o.id)).toEqual(['protein_satiety', 'gap_sensitivity']);
    expect(selectFpaObservations(responses, 'protein_supportive')).toHaveLength(2);
  });

  it('prints nothing at all, so the page can say the honest line, when fewer than two qualify', () => {
    const responses = sitting('neutral', { fpa_q13: 'carb' });
    expect(qualifyingFpaObservations(responses, 'protein_supportive')).toHaveLength(1);
    expect(selectFpaObservations(responses, 'protein_supportive')).toEqual([]);
  });

  it('ranks by how many answers support a line, ties going to the order in the library', () => {
    const responses = sitting('neutral', {
      // Three answers support protein_satiety, two support carbs_alone_rough.
      fpa_q1: 'protein',
      fpa_q4: 'protein',
      fpa_q16: 'protein',
      fpa_q3: 'protein',
      fpa_q5: 'protein',
    });
    const found = qualifyingFpaObservations(responses, 'protein_supportive');
    expect(found[0]!.id).toBe('protein_satiety');
    expect(found[0]!.supporting).toHaveLength(3);
    expect(found[1]!.id).toBe('carbs_alone_rough');
  });
});

describe('the section is genuinely response driven', () => {
  it('gives two Protein-Supportive members with different answers different lines', () => {
    const one = sitting('neutral', {
      fpa_q1: 'protein',
      fpa_q4: 'protein',
      fpa_q16: 'protein',
      fpa_q9: 'protein',
    });
    const two = sitting('neutral', {
      fpa_q3: 'protein',
      fpa_q5: 'protein',
      fpa_q8: 'protein',
      fpa_q12: 'protein',
      fpa_q13: 'protein',
    });
    expect(ids(one, 'protein_supportive')).not.toEqual(ids(two, 'protein_supportive'));
  });

  it('is deterministic: the same answers always produce the same lines in the same order', () => {
    const responses = sitting('protein', { fpa_q10: 'neutral', fpa_q13: 'carb' });
    const first = ids(responses, 'protein_supportive');
    for (let i = 0; i < 5; i += 1) {
      expect(ids(responses, 'protein_supportive')).toEqual(first);
    }
  });

  it('names, for every line it shows, the stored answers that put it there', () => {
    const responses = sitting('neutral', { fpa_q1: 'protein', fpa_q4: 'protein' });
    const [observation] = selectFpaObservations(responses, 'protein_supportive');
    // Only one line qualifies here, so the section would print the honest
    // line instead. What matters is that the support is nameable.
    const support = qualifyingFpaObservations(responses, 'protein_supportive')[0]!;
    expect(observation).toBeUndefined();
    expect(support.supporting).toEqual(['fpa_q1', 'fpa_q4']);
    for (const key of support.supporting) {
      const described = describeFpaSupport(responses, key);
      expect(described.weight).toBe('protein');
      expect(described.answer.length).toBeGreaterThan(0);
      expect(described.prompt.length).toBeGreaterThan(0);
    }
  });
});

describe('a real sitting, scored and read together', () => {
  it('an all "it varies" sitting reads Flexible Fuel and says so honestly', () => {
    const responses = sitting('neutral');
    const scoring = computeFpaScoring(responses);
    expect(scoring.pattern).toBe('flexible_fuel');
    const shown = selectFpaObservations(responses, scoring.pattern).map((o) => o.id);
    expect(shown).toContain('honest_variation');
    expect(shown).toContain('no_extreme');
  });

  it('a protein leaning sitting reads Protein-Supportive and shows only protein evidence', () => {
    const responses = sitting('protein');
    const scoring = computeFpaScoring(responses);
    expect(scoring.pattern).toBe('protein_supportive');
    const shown = selectFpaObservations(responses, scoring.pattern).map((o) => o.id);
    for (const contradiction of [
      'carbs_steady',
      'lighter_meals',
      'long_gaps_fine',
      'fat_sits_heavy',
      'no_extreme',
      'honest_variation',
    ]) {
      expect(shown, contradiction).not.toContain(contradiction);
    }
  });
});
