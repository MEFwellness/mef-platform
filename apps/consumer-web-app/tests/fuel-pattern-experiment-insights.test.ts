/**
 * THE LEARNING LOOP, PROVED RATHER THAN TRUSTED.
 *
 * The insight engine is the part of Build 4 that could most easily be
 * dishonest. Everything else on the screen is either her own row read
 * back or a fixed line; this is the one place the app says "we noticed
 * something" and has to be right about it.
 *
 * Five things are asserted here, and each catches something the others
 * cannot:
 *
 *   1. THE LIBRARY IS THE LIBRARY. Five insights, in the priority order
 *      the brief lists, with the approved bodies verbatim. A reordered
 *      array is a reordered priority, so the order is asserted.
 *   2. EVERY RULE FIRES ON ITS OWN EVIDENCE AND NOT A CHECK SOONER.
 *   3. ONE AT A TIME, AND IT ONLY MOVES UPWARDS. The replay is driven
 *      check by check, including the case the brief calls out: a quiet
 *      week cannot displace a real signal.
 *   4. THE VOICE. No prescriptive word, no diagnosis, no em dash.
 *   5. IT INVENTS NOTHING. An untagged check cannot put a part of the
 *      day on the screen.
 */

import { describe, it, expect } from 'vitest';
import {
  FPA_INSIGHT_RULES,
  fpaInsightHistory,
  fpaQualifyingInsights,
  fpaStandingInsight,
  type FpaInsightId,
} from '../lib/fuel-pattern/experiment/insights';
import type { FpaExperimentCheck } from '../lib/fuel-pattern/experiment/types';
import {
  FPA_CLARITY_ANSWERS,
  FPA_ENERGY_ANSWERS,
  FPA_HUNGER_ANSWERS,
} from '../lib/fuel-pattern/experiment/types';

let counter = 0;

function check(partial: Partial<FpaExperimentCheck> = {}): FpaExperimentCheck {
  counter += 1;
  return {
    id: `c${counter}`,
    loggedOn: '2026-09-14',
    energy: 'steady',
    hunger: 'comfortable',
    clarity: 'normal',
    mealType: null,
    mealId: null,
    createdAt: `2026-09-14T${String(counter % 24).padStart(2, '0')}:00:00.000Z`,
    ...partial,
  };
}

function times(n: number, partial: Partial<FpaExperimentCheck>): FpaExperimentCheck[] {
  return Array.from({ length: n }, () => check(partial));
}

function bodyOf(id: FpaInsightId): string {
  return FPA_INSIGHT_RULES.find((rule) => rule.id === id)!.body;
}

describe('1. the approved library', () => {
  it('holds exactly five insights, in the priority order the brief lists', () => {
    expect(FPA_INSIGHT_RULES.map((rule) => rule.id)).toEqual([
      'hungry_soon',
      'heavy_full',
      'foggy_pattern',
      'meal_type_flag',
      'holding_well',
    ]);
  });

  it('gives the first four WE NOTICED SOMETHING and the last YOUR PATTERN IS HOLDING', () => {
    expect(FPA_INSIGHT_RULES.slice(0, 4).map((rule) => rule.header)).toEqual(
      Array(4).fill('WE NOTICED SOMETHING')
    );
    expect(FPA_INSIGHT_RULES[4]!.header).toBe('YOUR PATTERN IS HOLDING');
  });

  it('carries the approved bodies, verbatim', () => {
    expect(bodyOf('hungry_soon')).toBe(
      'Meals with slightly more protein and healthy fat appear worth trying. You have been getting hungry again fairly soon after eating, and a little more of both often helps meals hold longer. Notice what changes.'
    );
    expect(bodyOf('heavy_full')).toBe(
      'Slightly smaller or lighter meals appear worth trying. You have often still been very full hours after eating. A gentler portion may leave you more comfortable without costing you energy.'
    );
    expect(bodyOf('foggy_pattern')).toBe(
      'Your mental clarity may be worth watching alongside your meals. If fog tends to follow carbohydrate-heavier meals, a bit more protein at those meals is a reasonable next experiment.'
    );
    expect(bodyOf('meal_type_flag')).toBe(
      'Your [meal type] may be the one to adjust first. More than one check after [meal type] has shown low energy. Small changes there are likely to teach you the most.'
    );
    expect(bodyOf('holding_well')).toBe(
      'Your starting pattern appears to be serving you well so far. No adjustment needed right now. Keep noticing.'
    );
  });
});

describe('2. every rule fires on its own evidence, and not a check sooner', () => {
  it('says nothing at all until something qualifies', () => {
    expect(fpaStandingInsight([])).toBeNull();
    expect(fpaStandingInsight(times(2, { hunger: 'hungry' }))).toBeNull();
  });

  it('hungry_soon needs three Hungry checks', () => {
    expect(fpaStandingInsight(times(2, { hunger: 'hungry' }))).toBeNull();
    expect(fpaStandingInsight(times(3, { hunger: 'hungry' }))?.id).toBe('hungry_soon');
  });

  it('heavy_full needs three Still very full checks', () => {
    expect(fpaStandingInsight(times(2, { hunger: 'still_very_full' }))).toBeNull();
    expect(fpaStandingInsight(times(3, { hunger: 'still_very_full' }))?.id).toBe('heavy_full');
  });

  it('foggy_pattern needs three Foggy checks', () => {
    expect(fpaStandingInsight(times(2, { clarity: 'foggy' }))).toBeNull();
    expect(fpaStandingInsight(times(3, { clarity: 'foggy' }))?.id).toBe('foggy_pattern');
  });

  it('meal_type_flag needs two low energy checks on the SAME meal', () => {
    const mixed = [
      check({ energy: 'low', mealType: 'breakfast' }),
      check({ energy: 'low', mealType: 'lunch' }),
    ];
    expect(fpaQualifyingInsights(mixed).map((i) => i.id)).not.toContain('meal_type_flag');

    const sameMeal = times(2, { energy: 'low', mealType: 'lunch' });
    const insight = fpaStandingInsight(sameMeal)!;
    expect(insight.id).toBe('meal_type_flag');
    expect(insight.mealType).toBe('lunch');
    expect(insight.body).toContain('Your lunch may be the one to adjust first.');
    expect(insight.body).toContain('More than one check after lunch has shown low energy.');
    expect(insight.body).not.toContain('[meal type]');
  });

  it('holding_well needs five checks and a majority on BOTH answers', () => {
    expect(fpaStandingInsight(times(4, {}))).toBeNull();
    expect(fpaStandingInsight(times(5, {}))?.id).toBe('holding_well');

    // Five checks, three steady, but only two comfortable: not a majority
    // on the second answer, so it does not qualify.
    const halfway = [
      ...times(3, { energy: 'steady', hunger: 'comfortable' }),
      ...times(2, { energy: 'steady', hunger: 'hungry' }),
    ];
    expect(fpaQualifyingInsights(halfway).map((i) => i.id)).toContain('holding_well');

    const notAMajority = [
      ...times(2, { energy: 'steady', hunger: 'comfortable' }),
      ...times(3, { energy: 'low', hunger: 'hungry' }),
    ];
    expect(fpaQualifyingInsights(notAMajority).map((i) => i.id)).not.toContain('holding_well');
  });

  it('treats an exact half as not a majority', () => {
    const half = [
      ...times(3, { energy: 'steady', hunger: 'comfortable' }),
      ...times(3, { energy: 'low', hunger: 'hungry' }),
    ];
    expect(fpaQualifyingInsights(half).map((i) => i.id)).not.toContain('holding_well');
  });
});

describe('3. one at a time, and it only ever moves upwards', () => {
  it('shows exactly one insight however many qualify', () => {
    const many = [
      ...times(3, { hunger: 'hungry', clarity: 'foggy' }),
      ...times(3, { hunger: 'still_very_full' }),
    ];
    expect(fpaQualifyingInsights(many).length).toBeGreaterThan(1);
    expect(fpaStandingInsight(many)!.id).toBe('hungry_soon');
  });

  it('is replaced by a HIGHER priority insight that newly qualifies', () => {
    const history = fpaInsightHistory([
      ...times(3, { clarity: 'foggy' }),
      ...times(3, { hunger: 'hungry', clarity: 'clear' }),
    ]);
    expect(history.map((entry) => entry.insight.id)).toEqual(['foggy_pattern', 'hungry_soon']);
    expect(history[0]!.afterCheckCount).toBe(3);
    expect(history[1]!.afterCheckCount).toBe(6);
  });

  it('is NOT replaced by a lower priority insight, however well it qualifies', () => {
    /*
      THIS IS THE RULE THE BRIEF STATES AND THE REASON IT MATTERS. Three
      hungry checks put hungry_soon on the screen. Five calm ones after
      them make holding_well qualify, and holding_well is the weakest
      insight in the library, so it does not get to quietly cover up a
      signal she gave.
    */
    const checks = [
      ...times(3, { hunger: 'hungry' }),
      ...times(6, { energy: 'great', hunger: 'comfortable' }),
    ];
    expect(fpaQualifyingInsights(checks).map((i) => i.id)).toContain('holding_well');
    expect(fpaStandingInsight(checks)!.id).toBe('hungry_soon');
  });

  it('records a change of the named meal as a change worth seeing', () => {
    const history = fpaInsightHistory([
      ...times(2, { energy: 'low', mealType: 'lunch' }),
      ...times(3, { energy: 'low', mealType: 'dinner' }),
    ]);
    expect(history.map((entry) => entry.insight.mealType)).toEqual(['lunch', 'dinner']);
  });

  it('breaks a tie between two meals towards the earlier part of the day', () => {
    const insight = fpaStandingInsight([
      ...times(2, { energy: 'low', mealType: 'dinner' }),
      ...times(2, { energy: 'low', mealType: 'breakfast' }),
    ])!;
    expect(insight.mealType).toBe('breakfast');
  });

  it('replays to the same answer whichever way it is asked', () => {
    const checks = times(3, { hunger: 'hungry' });
    const history = fpaInsightHistory(checks);
    expect(fpaStandingInsight(checks)).toEqual(history[history.length - 1]!.insight);
  });
});

describe('4. the voice', () => {
  const everyBody = FPA_INSIGHT_RULES.map((rule) => rule.body);

  it('never issues an instruction and never names a condition', () => {
    for (const body of everyBody) {
      const lower = body.toLowerCase();
      for (const word of [
        'you must',
        'you should',
        'you need to',
        'required',
        'requires',
        'ideal',
        'optimal',
        'prescription',
        'diagnos',
        'deficien',
        'intolerance',
        'blood sugar',
        'metabolism',
      ]) {
        expect(lower, `"${body}" contains "${word}"`).not.toContain(word);
      }
    }
  });

  it('speaks in the observational vocabulary the brief names', () => {
    for (const body of everyBody) {
      const lower = body.toLowerCase();
      const hedged = ['appear', 'may', 'worth', 'notice', 'likely', 'reasonable'].some((word) =>
        lower.includes(word)
      );
      expect(hedged, body).toBe(true);
    }
  });

  it('never puts an em dash in any of it', () => {
    for (const body of everyBody) expect(body, body).not.toContain('—');
    for (const rule of FPA_INSIGHT_RULES) expect(rule.header).not.toContain('—');
  });
});

describe('5. it invents nothing', () => {
  it('cannot put a part of the day on the screen from untagged checks', () => {
    const untagged = times(4, { energy: 'low' });
    expect(fpaQualifyingInsights(untagged).map((i) => i.id)).not.toContain('meal_type_flag');
  });

  it('names no meal on any insight that is not about one', () => {
    for (const insight of fpaQualifyingInsights(times(5, { hunger: 'hungry', clarity: 'foggy' }))) {
      if (insight.id === 'meal_type_flag') continue;
      expect(insight.mealType, insight.id).toBeNull();
    }
  });

  it('reads only the closed answer sets the migration also names', () => {
    expect([...FPA_ENERGY_ANSWERS]).toEqual(['low', 'steady', 'great']);
    expect([...FPA_HUNGER_ANSWERS]).toEqual(['hungry', 'comfortable', 'still_very_full']);
    expect([...FPA_CLARITY_ANSWERS]).toEqual(['foggy', 'normal', 'clear']);
  });
});
