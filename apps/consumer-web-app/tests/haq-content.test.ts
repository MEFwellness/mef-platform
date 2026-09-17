/**
 * The Rooted Reset Health Appraisal Questionnaire's seed integrity.
 *
 * THE LISTS BELOW ARE A SECOND, INDEPENDENT COPY OF THE SPECIFICATION, on
 * purpose. The question bank is authored once in lib/haq/questionBank.ts
 * and the migration is generated from it, so comparing the bank with the
 * migration alone would pass a question typed wrongly in both. These lists
 * were taken from the build prompt separately: how many questions each
 * section holds, which questions are Yes / No, and four spot checked
 * wordings.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  HAQ_KEY,
  HAQ_QUESTION_COUNT,
  HAQ_QUESTIONS,
  HAQ_RESPONSE_OPTIONS,
  HAQ_SECTION_COUNT,
  HAQ_SECTIONS,
  HAQ_VERSION,
} from '../lib/haq/questionBank';
import {
  buildHaqAnswerOptionsJson,
  buildHaqCutoffRowsSql,
  buildHaqQuestionRowsSql,
  buildHaqResponseScaleRowsSql,
  buildHaqSectionRowsSql,
} from '../lib/haq/sql';
import { SPEC_SECTION_QUESTION_COUNTS, SPEC_SPOT_CHECKS, SPEC_YES_NO_KEYS, specQuestionKeys } from './haq-spec';

const MIGRATION = path.resolve(
  __dirname,
  '../../../supabase/migrations/00000000000262_rooted_reset_haq_foundation.sql'
);
const migrationSql = fs.readFileSync(MIGRATION, 'utf8');

describe('HAQ seed integrity', () => {
  it('is exactly 260 questions in exactly 21 sections', () => {
    expect(HAQ_QUESTION_COUNT).toBe(260);
    expect(HAQ_SECTION_COUNT).toBe(21);
    expect(HAQ_QUESTIONS).toHaveLength(260);
    expect(HAQ_SECTIONS).toHaveLength(21);
    expect(SPEC_SECTION_QUESTION_COUNTS.reduce((sum, [, count]) => sum + count, 0)).toBe(260);
  });

  it('carries every question id the prompt lists, exactly once, and no other', () => {
    const keys = HAQ_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(specQuestionKeys());
  });

  it('has the sections in the prompt order, each holding its own questions in printed order', () => {
    expect(HAQ_SECTIONS.map((s) => s.id)).toEqual(SPEC_SECTION_QUESTION_COUNTS.map(([id]) => id));
    expect(HAQ_SECTIONS.map((s) => s.order)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    for (const [sectionId, count] of SPEC_SECTION_QUESTION_COUNTS) {
      const questions = HAQ_QUESTIONS.filter((q) => q.sectionId === sectionId);
      expect(questions.map((q) => q.order), sectionId).toEqual(Array.from({ length: count }, (_, i) => i + 1));
      for (const question of questions) expect(question.key.startsWith(`${sectionId}_q`)).toBe(true);
    }
  });

  it('marks exactly the prompt Yes / No questions as yes_no, and every other question as frequency', () => {
    const yesNo = HAQ_QUESTIONS.filter((q) => q.responseType === 'yes_no').map((q) => q.key);
    expect(yesNo.sort()).toEqual([...SPEC_YES_NO_KEYS].sort());
    const frequency = HAQ_QUESTIONS.filter((q) => q.responseType === 'frequency');
    expect(frequency).toHaveLength(260 - SPEC_YES_NO_KEYS.length);
  });

  it.each(SPEC_SPOT_CHECKS)('%s reads exactly as specified', (key, prompt, responseType) => {
    const question = HAQ_QUESTIONS.find((q) => q.key === key);
    expect(question?.prompt).toBe(prompt);
    expect(question?.responseType).toBe(responseType);
  });

  it('stores the Dysglycemia-L introduction with its section, and no other section has one', () => {
    const withIntro = HAQ_SECTIONS.filter((s) => s.intro !== null);
    expect(withIntro.map((s) => s.id)).toEqual(['haq_p4_a']);
    expect(withIntro[0]!.intro).toBe(
      'When you miss meals or go for extended periods without food, do you experience any of the following?'
    );
  });

  it('offers only the approved responses, and the options carry no number', () => {
    expect(HAQ_RESPONSE_OPTIONS.frequency.map((o) => [o.value, o.label])).toEqual([
      ['never_or_rarely', 'Never or rarely'],
      ['sometimes', 'Sometimes'],
      ['often', 'Often'],
      ['very_often', 'Very often'],
    ]);
    expect(HAQ_RESPONSE_OPTIONS.yes_no.map((o) => [o.value, o.label])).toEqual([
      ['no', 'No'],
      ['yes', 'Yes'],
    ]);
    expect(buildHaqAnswerOptionsJson('frequency')).not.toMatch(/\d/);
    expect(buildHaqAnswerOptionsJson('yes_no')).not.toMatch(/\d/);
  });

  it('has no em dash or en dash in any question, section title or introduction, nor in the migration', () => {
    const dashes = /[\u2013\u2014]/;
    for (const q of HAQ_QUESTIONS) expect(q.prompt, q.key).not.toMatch(dashes);
    for (const s of HAQ_SECTIONS) {
      expect(s.title, s.id).not.toMatch(dashes);
      if (s.intro) expect(s.intro, s.id).not.toMatch(dashes);
    }
    expect(migrationSql).not.toMatch(dashes);
  });

  it('names the version haq_v1 under the key haq', () => {
    expect(HAQ_KEY).toBe('haq');
    expect(HAQ_VERSION).toBe('haq_v1');
  });
});

describe('the HAQ content and migration 262 agree', () => {
  it('ships exactly the question rows the authored bank produces', () => {
    expect(migrationSql).toContain(buildHaqQuestionRowsSql());
  });

  it('ships exactly the section rows the authored bank produces', () => {
    expect(migrationSql).toContain(buildHaqSectionRowsSql());
  });

  it('ships exactly the cutoff rows the scoring rules produce', () => {
    expect(migrationSql).toContain(buildHaqCutoffRowsSql());
  });

  it('ships exactly the response scale rows the scoring rules produce', () => {
    expect(migrationSql).toContain(buildHaqResponseScaleRowsSql());
  });

  it('ships exactly the answer options the bank offers', () => {
    expect(migrationSql).toContain(`'${buildHaqAnswerOptionsJson('frequency')}'::jsonb`);
    expect(migrationSql).toContain(`'${buildHaqAnswerOptionsJson('yes_no')}'::jsonb`);
  });

  it('does not touch the Health Check-In or the Body Systems Survey, and adds no catalog row', () => {
    // Statements only: the header comment names both in order to say so.
    const statements = migrationSql.replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/short[-_]haq/i);
    expect(statements).not.toMatch(/wellness_assessments/);
    expect(statements).not.toMatch(/body_systems_/);
    expect(statements).not.toMatch(/\binto\s+assessment_definitions\b/);
    expect(statements).toMatch(/'haq', null, 'Rooted Reset Health Appraisal Questionnaire'/);
  });
});
