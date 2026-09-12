/**
 * LAYER 1. The validated instrument, asserted item by item.
 *
 * WHY THIS FILE IS DELIBERATELY LITERAL. Every other content test in this
 * repository parses the migration, because the content it tests is rows
 * and a fixture typed by hand would be a second copy that could drift.
 * This one is the opposite case on purpose: the instrument is a frozen
 * constant precisely so that it cannot be edited without review, and the
 * way to enforce that is to write down what it is supposed to be and fail
 * when the code stops matching. A change to any of the sixteen prompts,
 * any of the five labels, any point value or the maximum breaks this
 * suite, which is the intended alarm rather than an inconvenience.
 *
 * IF YOU ARE HERE BECAUSE THIS FAILED: the instrument changed. That is
 * allowed only as a reviewed, approved change, and it also has to bump
 * BPC_CONTENT_VERSION, because two sittings filed under one version have
 * to be genuinely comparable.
 */

import { describe, it, expect } from 'vitest';
import {
  BPC_ITEMS,
  BPC_ITEM_COUNT,
  BPC_MAX_ITEM_POINTS,
  BPC_MAX_SCORE,
  BPC_REFERENCE_THRESHOLD,
  BPC_SCALE,
  answeredBpcCount,
  bpcOption,
  isBpcComplete,
  parseBpcResults,
  sanitizeBpcAnswers,
  scoreBpcAnswers,
  unansweredBpcItems,
  type BpcAnswers,
} from '../lib/breathing-check-in/instrument';
import { BPC_CONTENT_VERSION } from '../lib/breathing-check-in/constants';

/** The sixteen, in the instrument's own order. */
const EXPECTED_PROMPTS = [
  'Chest pain',
  'Feeling tense',
  'Blurred vision',
  'Dizzy spells',
  'Feeling confused',
  'Faster or deeper breathing',
  'Short of breath',
  'Tight feelings in chest',
  'Bloated feeling in stomach',
  'Tingling fingers',
  'Unable to breathe deeply',
  'Stiff fingers or arms',
  'Tight feelings round mouth',
  'Cold hands or feet',
  'Palpitations',
  'Feelings of anxiety',
];

/** The five, in order, with their published point values. */
const EXPECTED_SCALE: [string, string, number][] = [
  ['never', 'Never', 0],
  ['rarely', 'Rarely', 1],
  ['sometimes', 'Sometimes', 2],
  ['often', 'Often', 3],
  ['very_often', 'Very often', 4],
];

describe('the sixteen questions have not moved', () => {
  it('is sixteen of them', () => {
    expect(BPC_ITEMS).toHaveLength(16);
    expect(BPC_ITEM_COUNT).toBe(16);
  });

  it('is these sixteen, in this order, worded exactly this way', () => {
    expect(BPC_ITEMS.map((item) => item.prompt)).toEqual(EXPECTED_PROMPTS);
  });

  it('numbers them one to sixteen with no gap and no repeat', () => {
    expect(BPC_ITEMS.map((item) => item.position)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1)
    );
  });

  it('gives every one a distinct permanent id, because renaming one orphans stored answers', () => {
    const ids = BPC_ITEMS.map((item) => item.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the five responses have not moved', () => {
  it('is these five, in this order, worth these points', () => {
    expect(BPC_SCALE.map((option) => [option.valueKey, option.label, option.points])).toEqual(
      EXPECTED_SCALE
    );
  });

  it('tops out at four points a question', () => {
    expect(BPC_MAX_ITEM_POINTS).toBe(4);
  });
});

describe('the arithmetic has not moved', () => {
  it('is out of sixty four', () => {
    expect(BPC_MAX_SCORE).toBe(64);
  });

  it('names twenty three as the traditional reference threshold', () => {
    expect(BPC_REFERENCE_THRESHOLD).toBe(23);
  });

  it('is filed under content version one until the instrument itself changes', () => {
    expect(BPC_CONTENT_VERSION).toBe(1);
  });
});

describe('scoring', () => {
  function answerEveryItem(valueKey: string): BpcAnswers {
    return Object.fromEntries(BPC_ITEMS.map((item) => [item.itemId, valueKey]));
  }

  it('scores an all Never sitting as nought', () => {
    const results = scoreBpcAnswers(answerEveryItem('never'));
    expect(results.totalScore).toBe(0);
    expect(results.answeredCount).toBe(16);
  });

  it('scores an all Very often sitting as sixty four', () => {
    const results = scoreBpcAnswers(answerEveryItem('very_often'));
    expect(results.totalScore).toBe(64);
    expect(results.maxScore).toBe(64);
  });

  it('scores each response at its own value', () => {
    expect(scoreBpcAnswers(answerEveryItem('rarely')).totalScore).toBe(16);
    expect(scoreBpcAnswers(answerEveryItem('sometimes')).totalScore).toBe(32);
    expect(scoreBpcAnswers(answerEveryItem('often')).totalScore).toBe(48);
  });

  it('counts an unanswered question as nothing, and says how many were answered', () => {
    const partial: BpcAnswers = { chest_pain: 'very_often', feeling_tense: 'often' };
    const results = scoreBpcAnswers(partial);
    expect(results.totalScore).toBe(7);
    expect(results.answeredCount).toBe(2);
    // The distinction that matters: a low total on an unfinished sitting is
    // not a low burden, and the coach card says so from this number.
    expect(results.answeredCount).not.toBe(16);
  });

  it('records every answered item its own points, which is what the coach column reads', () => {
    const results = scoreBpcAnswers({ chest_pain: 'often', palpitations: 'never' });
    expect(results.itemScores).toEqual({ chest_pain: 3, palpitations: 0 });
  });
});

describe('a hand made POST cannot widen the instrument', () => {
  it('drops an item id the instrument does not hold', () => {
    expect(sanitizeBpcAnswers({ not_a_question: 'often', chest_pain: 'often' })).toEqual({
      chest_pain: 'often',
    });
  });

  it('drops a response the scale does not hold', () => {
    expect(sanitizeBpcAnswers({ chest_pain: 'constantly' })).toEqual({});
    expect(sanitizeBpcAnswers({ chest_pain: 4 })).toEqual({});
    expect(sanitizeBpcAnswers({ chest_pain: null })).toEqual({});
  });

  it('drops everything when handed something that is not an object', () => {
    expect(sanitizeBpcAnswers('often')).toEqual({});
    expect(sanitizeBpcAnswers(null)).toEqual({});
    expect(sanitizeBpcAnswers(42)).toEqual({});
  });

  it('cannot be made to score more than sixty four', () => {
    const inflated: Record<string, string> = { ...Object.fromEntries(
      BPC_ITEMS.map((item) => [item.itemId, 'very_often'])
    ) };
    for (let extra = 0; extra < 40; extra += 1) inflated[`invented_${extra}`] = 'very_often';
    expect(scoreBpcAnswers(inflated).totalScore).toBe(64);
  });
});

describe('resume arithmetic', () => {
  it('names every question she has not answered, in the instrument order', () => {
    const answers: BpcAnswers = { chest_pain: 'never', blurred_vision: 'often' };
    const outstanding = unansweredBpcItems(answers);
    expect(outstanding).toHaveLength(14);
    expect(outstanding[0]!.itemId).toBe('feeling_tense');
  });

  it('is complete only when all sixteen carry a usable answer', () => {
    const almost = Object.fromEntries(
      BPC_ITEMS.slice(0, 15).map((item) => [item.itemId, 'never'])
    );
    expect(answeredBpcCount(almost)).toBe(15);
    expect(isBpcComplete(almost)).toBe(false);
    expect(isBpcComplete({ ...almost, feelings_of_anxiety: 'never' })).toBe(true);
  });
});

describe('reading a stored result back', () => {
  it('reads one it wrote', () => {
    const written = scoreBpcAnswers({ chest_pain: 'often' });
    expect(parseBpcResults(written)).toEqual(written);
  });

  it('refuses a row that is not a result rather than guessing at one', () => {
    expect(parseBpcResults(null)).toBeNull();
    expect(parseBpcResults({})).toBeNull();
    expect(parseBpcResults({ totalScore: 'twelve', maxScore: 64, answeredCount: 3 })).toBeNull();
  });

  it('drops a per item score for a question the instrument does not hold', () => {
    const parsed = parseBpcResults({
      totalScore: 3,
      maxScore: 64,
      answeredCount: 1,
      itemScores: { chest_pain: 3, not_a_question: 4 },
    });
    expect(parsed?.itemScores).toEqual({ chest_pain: 3 });
  });
});

describe('bpcOption', () => {
  it('resolves a real response and refuses everything else', () => {
    expect(bpcOption('often')?.points).toBe(3);
    expect(bpcOption('OFTEN')).toBeNull();
    expect(bpcOption(3)).toBeNull();
    expect(bpcOption(undefined)).toBeNull();
  });
});
