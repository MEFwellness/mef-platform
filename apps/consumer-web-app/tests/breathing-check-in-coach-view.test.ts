/**
 * The coach's half: the score, the threshold sentence, the
 * highest-response sort, and the language rules the whole card obeys.
 *
 * A COACH SEES THE NUMBERS AND A MEMBER DOES NOT, and this file is the
 * other side of tests/breathing-check-in-layers.test.tsx. That one proves
 * her screens carry no score. This one proves his do, from the same stored
 * result, so the two are two presentations of ONE number rather than two
 * calculations of it.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  BPC_ITEMS,
  BPC_REFERENCE_THRESHOLD,
  scoreBpcAnswers,
  type BpcAnswers,
} from '../lib/breathing-check-in/instrument';
import {
  BPC_HIGHEST_RESPONSE_MIN_SCORE,
  bpcAtOrAboveThreshold,
  bpcCoachResponses,
  bpcHighestResponses,
  bpcScoreSentence,
  buildBpcCoachReading,
} from '../lib/breathing-check-in/coachView';
import {
  BPC_COACHING_QUESTIONS,
  BPC_COACH_COPY,
  BPC_INSTRUMENT_NAME,
} from '../lib/breathing-check-in/coachCopy';

const ROOT = path.resolve(__dirname, '..');

function everyItem(valueKey: string): BpcAnswers {
  return Object.fromEntries(BPC_ITEMS.map((item) => [item.itemId, valueKey]));
}

describe('the coach reads the real score, from the stored result', () => {
  it('prints the total out of sixty four', () => {
    const answers = everyItem('often');
    const reading = buildBpcCoachReading(answers, scoreBpcAnswers(answers));
    expect(reading.totalScore).toBe(48);
    expect(bpcScoreSentence(reading)).toBe('Total Score: 48 / 64');
  });

  it('says when a sitting is unfinished, rather than reporting a low total as a low burden', () => {
    const partial: BpcAnswers = { chest_pain: 'very_often' };
    const reading = buildBpcCoachReading(partial, scoreBpcAnswers(partial));
    expect(reading.isComplete).toBe(false);
    expect(reading.answeredCount).toBe(1);
    expect(reading.itemCount).toBe(16);
  });

  it('reports whether the total reaches the published reference figure', () => {
    expect(bpcAtOrAboveThreshold(scoreBpcAnswers(everyItem('rarely')))).toBe(false); // 16
    expect(bpcAtOrAboveThreshold(scoreBpcAnswers(everyItem('sometimes')))).toBe(true); // 32
  });

  it('is exactly at the boundary, not one either side of it', () => {
    // Twenty three on the nose. Eleven items at two points and one at one.
    const answers: BpcAnswers = Object.fromEntries([
      ...BPC_ITEMS.slice(0, 11).map((item) => [item.itemId, 'sometimes']),
      [BPC_ITEMS[11]!.itemId, 'rarely'],
    ]);
    const results = scoreBpcAnswers(answers);
    expect(results.totalScore).toBe(BPC_REFERENCE_THRESHOLD);
    expect(bpcAtOrAboveThreshold(results)).toBe(true);

    const oneLess = scoreBpcAnswers({ ...answers, [BPC_ITEMS[11]!.itemId]: 'never' });
    expect(oneLess.totalScore).toBe(BPC_REFERENCE_THRESHOLD - 1);
    expect(bpcAtOrAboveThreshold(oneLess)).toBe(false);
  });
});

describe('all sixteen responses', () => {
  it('lists every question, in the instrument order, answered or not', () => {
    const answers: BpcAnswers = { chest_pain: 'often' };
    const rows = bpcCoachResponses(answers, scoreBpcAnswers(answers));
    expect(rows).toHaveLength(16);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(rows[0]).toMatchObject({ responseLabel: 'Often', score: 3 });
    // An unanswered one is named as unanswered rather than scored as nought.
    expect(rows[1]).toMatchObject({ responseLabel: null, score: null });
  });
});

describe('the highest-response list is a sort, not a finding', () => {
  it('lists only Often and Very often, strongest first', () => {
    const answers: BpcAnswers = {
      chest_pain: 'sometimes',
      feeling_tense: 'often',
      short_of_breath: 'very_often',
      dizzy_spells: 'often',
      palpitations: 'never',
    };
    const highest = bpcHighestResponses(answers, scoreBpcAnswers(answers));
    // Short of breath is four points. The other two are three each, and
    // the tie is broken by the instrument's own order, so question two
    // comes before question four.
    expect(highest.map((row) => row.prompt)).toEqual([
      'Short of breath',
      'Feeling tense',
      'Dizzy spells',
    ]);
  });

  it('leaves a quiet sitting with nothing in it rather than promoting three low answers', () => {
    const answers = everyItem('rarely');
    expect(bpcHighestResponses(answers, scoreBpcAnswers(answers))).toEqual([]);
  });

  it('breaks a tie by the instrument order, so two reads of one sitting agree', () => {
    const answers: BpcAnswers = { palpitations: 'often', chest_pain: 'often' };
    const highest = bpcHighestResponses(answers, scoreBpcAnswers(answers));
    // Chest pain is question one and palpitations is question fifteen.
    expect(highest.map((row) => row.prompt)).toEqual(['Chest pain', 'Palpitations']);
  });

  it('draws the line at Often, which is three points', () => {
    expect(BPC_HIGHEST_RESPONSE_MIN_SCORE).toBe(3);
  });
});

describe('the coaching prompts', () => {
  it('are the four approved questions, fixed, and asked of every reading', () => {
    expect(BPC_COACHING_QUESTIONS).toEqual([
      'When do you notice this sensation most?',
      'Does it tend to appear during stress, activity, rest, meals, or at another time?',
      'What happens when you intentionally slow your breathing?',
      'Do you notice tension in your jaw, neck, shoulders, chest, or abdomen when this happens?',
    ]);

    // The same four whatever came back, because a prompt list that changed
    // with the total would be the app telling a coach what it thinks is
    // going on.
    const quiet = buildBpcCoachReading(everyItem('never'), scoreBpcAnswers(everyItem('never')));
    const loud = buildBpcCoachReading(
      everyItem('very_often'),
      scoreBpcAnswers(everyItem('very_often'))
    );
    expect(quiet.coachingQuestions).toEqual(loud.coachingQuestions);
  });

  it('are questions to ask her, not conclusions about her', () => {
    for (const prompt of BPC_COACHING_QUESTIONS) {
      expect(prompt.endsWith('?'), prompt).toBe(true);
    }
  });
});

describe('the language the coach card is allowed to use', () => {
  /** Every string literal in the coach copy module, through the real parser. */
  function coachStrings(relative: string): string[] {
    const source = ts.createSourceFile(
      relative,
      fs.readFileSync(path.join(ROOT, relative), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const out: string[] = [];
    const walk = (node: ts.Node): void => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        out.push(node.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
    return out;
  }

  it('names the underlying instrument, because a coach needs to know what produced the number', () => {
    expect(BPC_INSTRUMENT_NAME).toBe('Nijmegen Questionnaire');
    expect(BPC_COACH_COPY.instrumentHeading).toBe(BPC_INSTRUMENT_NAME);
  });

  it('says the threshold is a reference figure, and never that it diagnoses anything', () => {
    expect(BPC_COACH_COPY.thresholdLabel).toBe(
      `Traditional reference threshold: ${BPC_REFERENCE_THRESHOLD}+`
    );
    const note = BPC_COACH_COPY.thresholdNote.toLowerCase();
    expect(note).toContain('may indicate');
    expect(note).toContain('interpreted alongside history and clinical context');
    // THE FORBIDDEN READING. The figure does not diagnose, identify or
    // confirm anything, and the sentence may not say it does.
    for (const word of ['diagnos', 'identifies', 'confirms', 'indicates that she has']) {
      expect(note, word).not.toContain(word);
    }
    expect(note).not.toContain('dysfunctional breathing');
  });

  it('claims no causation anywhere on the card', () => {
    const CAUSAL = ['cause', 'caused', 'causing', 'because', 'leads to', 'due to', 'explains'];
    for (const text of coachStrings('lib/breathing-check-in/coachCopy.ts')) {
      const lower = text.toLowerCase();
      for (const word of CAUSAL) {
        expect(lower, `${word} in: ${text}`).not.toContain(word);
      }
    }
  });

  it('says out loud that the highest-response order is not a causal order', () => {
    const note = BPC_COACH_COPY.highestNote.toLowerCase();
    expect(note).toContain('order says nothing');
  });
});
