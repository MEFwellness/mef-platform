/**
 * The Rooted Reset Fuel Pattern Assessment's questions, and the one thing
 * that can silently break them.
 *
 * THE FAILURE THIS EXISTS TO CATCH. The 24 questions are authored in
 * lib/fuel-pattern/questionContent.ts, the rows a member actually answers
 * live in unified_assessment_questions (migration 236), and the scoring
 * weight map names option values. Edit a value in one place and not the
 * other and there is no error anywhere: the answer simply scores nothing,
 * quietly, for every member who picks it. So the migration's own VALUES
 * block is regenerated here from the authored content and compared
 * against the shipped file character for character.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FPA_QUESTIONS, FPA_SECTIONS } from '../lib/fuel-pattern/questionContent';
import { buildFpaQuestionRowsSql, buildFpaSectionRowsSql } from '../lib/fuel-pattern/sql';
import {
  FPA_DIGESTION_QUESTION_KEY,
  FPA_DIGESTIVE_DISCOMFORT_VALUE,
  FPA_QUESTION_COUNT,
  FPA_QUESTION_KEYS,
  FPA_PLATE_QUESTION_KEY,
  FPA_VITALITY_QUESTION_KEY,
} from '../lib/fuel-pattern/constants';
import { PLATE_SHAPES } from '../components/fuel-pattern/PlateIllustration';
import {
  FPA_CONTINUE_LABEL,
  FPA_INTRO_COPY,
  FPA_RANGE_FOOTNOTE,
  FPA_REVEAL_COPY,
  FPA_SECTION_HEADERS,
  FPA_STARTING_RANGE,
  FUEL_PATTERN_INTERPRETATION,
  FUEL_PATTERN_LABEL,
  fpaWatchForCopy,
} from '../lib/fuel-pattern/copy';
import { FPA_NO_OBSERVATIONS_LINE, FPA_OBSERVATION_RULES } from '../lib/fuel-pattern/observations';
import { FPA_PLATE_GUIDE } from '../lib/fuel-pattern/plate';
import type { FuelPattern } from '../lib/fuel-pattern/types';

const PATTERNS: FuelPattern[] = [
  'protein_supportive',
  'balanced_fuel',
  'carb_supportive',
  'flexible_fuel',
];

const MIGRATION = path.resolve(
  __dirname,
  '../../../supabase/migrations/00000000000236_rooted_reset_fuel_pattern.sql'
);

const migrationSql = fs.readFileSync(MIGRATION, 'utf8');

describe('Fuel Pattern content and the migration agree', () => {
  it('ships exactly the question rows the authored content produces', () => {
    expect(migrationSql).toContain(buildFpaQuestionRowsSql());
  });

  it('ships exactly the section rows the authored content produces', () => {
    expect(migrationSql).toContain(buildFpaSectionRowsSql());
  });

  it('is 24 questions, in order, with the keys the rest of the build names', () => {
    expect(FPA_QUESTIONS).toHaveLength(FPA_QUESTION_COUNT);
    expect(FPA_QUESTIONS.map((q) => q.key)).toEqual([...FPA_QUESTION_KEYS]);
    expect(FPA_QUESTIONS.map((q) => q.order)).toEqual(
      Array.from({ length: FPA_QUESTION_COUNT }, (_, i) => i + 1)
    );
  });

  it('files every question under a real section', () => {
    const titles = new Set<string>(FPA_SECTIONS.map((s) => s.title));
    for (const question of FPA_QUESTIONS) {
      expect(titles.has(question.section), question.key).toBe(true);
    }
  });

  it('gives every option in a question its own value', () => {
    for (const question of FPA_QUESTIONS) {
      const values = question.options.map((o) => o.value);
      expect(new Set(values).size, question.key).toBe(values.length);
    }
  });

  it('never puts an em dash in anything a member reads or the database stores', () => {
    for (const question of FPA_QUESTIONS) {
      expect(question.prompt).not.toContain('—');
      expect(question.description ?? '').not.toContain('—');
      for (const option of question.options) {
        expect(option.label, `${question.key}/${option.value}`).not.toContain('—');
        expect(option.detail ?? '').not.toContain('—');
      }
    }
    expect(migrationSql).not.toContain('—');
  });
});

describe('the two questions that are deliberately not scored', () => {
  it('scores nothing at all on the vitality question', () => {
    const q23 = FPA_QUESTIONS.find((q) => q.key === FPA_VITALITY_QUESTION_KEY)!;
    expect(q23.options.every((o) => o.weight === 'unscored')).toBe(true);
    expect(q23.options.map((o) => o.value)).toContain('prefer_not_to_answer');
  });

  it('offers the vitality question its own supporting line, in the words it was written in', () => {
    const q23 = FPA_QUESTIONS.find((q) => q.key === FPA_VITALITY_QUESTION_KEY)!;
    expect(q23.description).toBe(
      'This can include general energy, motivation, physical drive and interest in intimacy. Answer only what feels comfortable.'
    );
  });

  it('never asks about performance, frequency or libido', () => {
    const q23 = FPA_QUESTIONS.find((q) => q.key === FPA_VITALITY_QUESTION_KEY)!;
    const allText = [q23.prompt, q23.description ?? '', ...q23.options.map((o) => o.label)]
      .join(' ')
      .toLowerCase();
    for (const word of ['libido', 'sex', 'sexual', 'performance', 'how often', 'frequency']) {
      expect(allText, word).not.toContain(word);
    }
  });

  it('scores nothing on the digestive discomfort option, and scores the other three', () => {
    const q21 = FPA_QUESTIONS.find((q) => q.key === FPA_DIGESTION_QUESTION_KEY)!;
    const discomfort = q21.options.find((o) => o.value === FPA_DIGESTIVE_DISCOMFORT_VALUE)!;
    expect(discomfort.weight).toBe('unscored');
    expect(q21.options.filter((o) => o.weight === 'protein' || o.weight === 'balanced' || o.weight === 'carb')).toHaveLength(3);
  });
});

describe('the plate question', () => {
  it('has a drawn plate for each of its three plate answers, and none for the fourth', () => {
    const q24 = FPA_QUESTIONS.find((q) => q.key === FPA_PLATE_QUESTION_KEY)!;
    const withPlates = q24.options.filter((o) => PLATE_SHAPES[o.value]);
    expect(withPlates.map((o) => o.value)).toEqual(['protein_forward', 'balanced', 'carb_forward']);
    expect(q24.options.filter((o) => !PLATE_SHAPES[o.value]).map((o) => o.value)).toEqual(['really_depends']);
  });

  it('draws a whole plate every time', () => {
    for (const [key, shape] of Object.entries(PLATE_SHAPES)) {
      const total = shape.reduce((sum, slice) => sum + slice.share, 0);
      expect(total, key).toBeCloseTo(1, 6);
    }
  });

  it('gives each plate a detail line and each non-plate answer none', () => {
    const q24 = FPA_QUESTIONS.find((q) => q.key === FPA_PLATE_QUESTION_KEY)!;
    for (const option of q24.options) {
      if (PLATE_SHAPES[option.value]) expect(option.detail, option.value).toBeTruthy();
      else expect(option.detail).toBeUndefined();
    }
  });
});

describe('the migration itself', () => {
  it('creates the results table with the columns the coach view in Build 2 will read', () => {
    for (const column of [
      'pattern text not null',
      'confidence text not null',
      'protein_score int not null',
      'balanced_score int not null',
      'carb_score int not null',
      'scored_question_count int not null',
      'zero_weight_count int not null',
      'responses jsonb not null',
      'response_tendencies text[] not null',
      'digestive_discomfort boolean not null',
      'vitality_response text',
    ]) {
      expect(migrationSql, column).toContain(column);
    }
  });

  it('holds one result per sitting with a real unique index, not just a read before the write', () => {
    expect(migrationSql).toContain('create unique index fuel_pattern_results_one_per_session');
  });

  it('never deletes or rewrites a single row of Primal Pattern data', () => {
    expect(migrationSql).not.toMatch(/delete\s+from/i);
    expect(migrationSql).not.toMatch(/drop\s+table/i);
    expect(migrationSql).not.toMatch(/update\s+primal_pattern/i);
  });
});

/**
 * THE VOICE, ENFORCED RATHER THAN INTENDED.
 *
 * Every string a member can read on this instrument goes through here:
 * the intro, the twenty four questions and all their answers, the four
 * pattern names and the four sentences under them, and the reveal's own
 * copy. Observational, never prescriptive, and never a claim about her
 * biology.
 */
describe('the member facing voice', () => {
  const memberFacingStrings = [
    FPA_INTRO_COPY.title,
    ...FPA_INTRO_COPY.lines,
    FPA_INTRO_COPY.button,
    ...Object.values(FUEL_PATTERN_LABEL),
    ...Object.values(FUEL_PATTERN_INTERPRETATION),
    ...Object.values(FPA_REVEAL_COPY),
    ...Object.values(FPA_SECTION_HEADERS),
    FPA_RANGE_FOOTNOTE,
    FPA_CONTINUE_LABEL,
    FPA_NO_OBSERVATIONS_LINE,
    ...FPA_OBSERVATION_RULES.map((rule) => rule.text),
    ...PATTERNS.flatMap((pattern) => [
      fpaWatchForCopy(pattern),
      FPA_STARTING_RANGE[pattern].extraLine ?? '',
      ...FPA_STARTING_RANGE[pattern].rows.flatMap((row) => [row.nutrient, row.level]),
      FPA_PLATE_GUIDE[pattern].addition,
      FPA_PLATE_GUIDE[pattern].caption ?? '',
      ...FPA_PLATE_GUIDE[pattern].segments.flatMap((s) => [s.label, s.proportion]),
    ]),
    ...FPA_QUESTIONS.flatMap((q) => [
      q.prompt,
      q.description ?? '',
      ...q.options.flatMap((o) => [o.label, o.detail ?? '']),
    ]),
  ];

  it('never says any of the things this instrument is not allowed to say', () => {
    const forbidden = [
      'your metabolism',
      'your body requires',
      'you must eat',
      'you should eat',
      'your biological type',
      'metabolic type',
      'diagnos',
      'deficien',
      'you need to',
    ];
    for (const text of memberFacingStrings) {
      const lower = text.toLowerCase();
      for (const phrase of forbidden) {
        expect(lower, `"${text}" contains "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it('starts every interpretation from her responses rather than from a claim about her', () => {
    for (const sentence of Object.values(FUEL_PATTERN_INTERPRETATION)) {
      expect(sentence.startsWith('Your responses suggest that'), sentence).toBe(true);
    }
  });

  it('calls Flexible Fuel a result rather than a shortfall', () => {
    const sentence = FUEL_PATTERN_INTERPRETATION.flexible_fuel;
    for (const word of ['unclear', 'inconclusive', 'not enough', 'incomplete', 'failed', 'unable']) {
      expect(sentence.toLowerCase(), word).not.toContain(word);
    }
  });

  it('says the starting range is a starting point and will be refined', () => {
    expect(FPA_RANGE_FOOTNOTE).toContain('starting point');
    expect(FPA_RANGE_FOOTNOTE).toContain('not a prescription');
    expect(FPA_RANGE_FOOTNOTE).toContain('refined');
  });

  it('never puts an em dash in any of it', () => {
    for (const text of memberFacingStrings) {
      expect(text, text).not.toContain('—');
    }
  });

  it('names the four outcomes exactly as the brief names them', () => {
    expect(Object.values(FUEL_PATTERN_LABEL)).toEqual([
      'Protein-Supportive',
      'Balanced Fuel',
      'Carb-Supportive',
      'Flexible Fuel',
    ]);
  });
});
