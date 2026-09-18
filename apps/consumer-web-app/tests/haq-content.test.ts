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
  HAQ_PARTS,
  HAQ_QUESTION_COUNT,
  HAQ_QUESTIONS,
  HAQ_RESPONSE_OPTIONS,
  HAQ_SECTION_COUNT,
  HAQ_SECTIONS,
  HAQ_PRIOR_WORDINGS,
  HAQ_VERSION,
  haqCurrentQuestionVersion,
  haqPartOf,
  haqPromptAtVersion,
} from '../lib/haq/questionBank';
import { haqHiddenValue } from '../lib/haq/scoringRules';
import {
  buildHaqAnswerOptionsJson,
  buildHaqCutoffRowsSql,
  buildHaqPartRowsSql,
  buildHaqQuestionRevisionRowsSql,
  buildHaqQuestionRowsSql,
  buildHaqResponseScaleRowsSql,
  buildHaqSectionRowsSql,
} from '../lib/haq/sql';
import {
  SPEC_REVISED_WORDINGS,
  SPEC_SECTION_QUESTION_COUNTS,
  SPEC_SPOT_CHECKS,
  SPEC_YES_NO_KEYS,
  specQuestionKeys,
} from './haq-spec';

const MIGRATION = path.resolve(
  __dirname,
  '../../../supabase/migrations/00000000000262_rooted_reset_haq_foundation.sql'
);
const migrationSql = fs.readFileSync(MIGRATION, 'utf8');

const PARTS_MIGRATION = path.resolve(
  __dirname,
  '../../../supabase/migrations/00000000000264_rooted_reset_haq_part_names.sql'
);
const partsMigrationSql = fs.readFileSync(PARTS_MIGRATION, 'utf8');

const WORDING_V2_MIGRATION = path.resolve(
  __dirname,
  '../../../supabase/migrations/00000000000265_rooted_reset_haq_wording_v2.sql'
);
const wordingV2MigrationSql = fs.readFileSync(WORDING_V2_MIGRATION, 'utf8');

/**
 * A SECOND, INDEPENDENT COPY OF THE TEN PART NAMES, taken from the build
 * prompt rather than from the bank, so a name typed wrongly in the bank (and
 * therefore in the generated migration too) fails here instead of agreeing
 * with itself.
 */
const SPEC_PART_NAMES: ReadonlyArray<readonly [string, string, string]> = [
  ['haq_p1', 'Part I', 'Gastrointestinal'],
  ['haq_p2', 'Part II', 'Liver / Gallbladder'],
  ['haq_p3', 'Part III', 'Endocrine'],
  ['haq_p4', 'Part IV', 'Glucose Regulation'],
  ['haq_p5', 'Part V', 'Cardiovascular'],
  ['haq_p6', 'Part VI', 'Mood'],
  ['haq_p7', 'Part VII', 'Eyes, Ears, Nose, Throat & Lungs'],
  ['haq_p8', 'Part VIII', 'Kidney & Bladder'],
  ['haq_p9', 'Part IX', 'Musculoskeletal'],
  ['haq_p10', 'Part X', 'CNS & Brain'],
];

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

  it('names the ten Parts exactly as the prompt does, in order, and gives every section one of them', () => {
    expect(HAQ_PARTS.map((part) => [part.id, part.label, part.name])).toEqual(
      SPEC_PART_NAMES.map((row) => [...row])
    );
    expect(HAQ_PARTS.map((part) => part.order)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    for (const section of HAQ_SECTIONS) {
      const part = haqPartOf(section.partId);
      // The section's own printed heading and its Part's are one thing, not two.
      expect(part.label, section.id).toBe(section.partLabel);
    }
    // Parts II, VII and VIII are the single-section Parts, which is what the
    // question screen names once rather than twice.
    const single = HAQ_SECTIONS.filter((section) => section.sectionLetter === null).map((s) => s.partId);
    expect(single).toEqual(['haq_p2', 'haq_p7', 'haq_p8']);
  });

  it('has no em dash or en dash in a Part name, nor in migration 264', () => {
    const dashes = /[\u2013\u2014]/;
    for (const part of HAQ_PARTS) expect(part.name, part.id).not.toMatch(dashes);
    expect(partsMigrationSql).not.toMatch(dashes);
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

  it('migration 264 ships exactly the Part rows the authored bank produces, and touches no scored content', () => {
    expect(partsMigrationSql).toContain(buildHaqPartRowsSql());
    const statements = partsMigrationSql.replace(/--.*$/gm, '');
    // Nothing of the instrument moves: no question, no cutoff, no value, no result.
    for (const table of [
      'unified_assessment_questions',
      'haq_questions',
      'haq_section_cutoffs',
      'haq_response_scale',
      'haq_question_responses',
      'haq_section_results',
    ]) {
      expect(statements, table).not.toMatch(new RegExp(`(insert into|update|delete from)\\s+${table}`, 'i'));
    }
    // haq_sections gains a foreign key and nothing else.
    expect(statements).not.toMatch(/update\s+haq_sections/i);
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

describe('the 2026-09-18 wording revision (migration 265)', () => {
  const revisedKeys = SPEC_REVISED_WORDINGS.map(([key]) => key);

  it.each(SPEC_REVISED_WORDINGS)('%s asks the new wording, at version 2', (key, _before, after) => {
    const question = HAQ_QUESTIONS.find((q) => q.key === key);
    expect(question?.prompt).toBe(after);
    expect(haqCurrentQuestionVersion(key)).toBe(2);
    expect(haqPromptAtVersion(key, 2)).toBe(after);
  });

  it.each(SPEC_REVISED_WORDINGS)('%s keeps its version 1 wording on record, unchanged', (key, before) => {
    expect(haqPromptAtVersion(key, 1)).toBe(before);
  });

  it.each(SPEC_REVISED_WORDINGS)(
    '%s keeps its response type and its hidden values',
    (key, _before, _after, responseType) => {
      const question = HAQ_QUESTIONS.find((q) => q.key === key)!;
      expect(question.responseType).toBe(responseType);
      expect(SPEC_YES_NO_KEYS.includes(key)).toBe(responseType === 'yes_no');
      if (responseType === 'yes_no') {
        expect(HAQ_RESPONSE_OPTIONS[question.responseType].map((o) => o.value)).toEqual(['no', 'yes']);
        expect(haqHiddenValue(question.responseType, 'no')).toBe(0);
        expect(haqHiddenValue(question.responseType, 'yes')).toBe(8);
        expect(haqHiddenValue(question.responseType, 'often')).toBeNull();
      } else {
        expect(haqHiddenValue(question.responseType, 'never_or_rarely')).toBe(0);
        expect(haqHiddenValue(question.responseType, 'very_often')).toBe(8);
        expect(haqHiddenValue(question.responseType, 'yes')).toBeNull();
      }
    }
  );

  it('rewords exactly these eleven and no other question', () => {
    expect(HAQ_PRIOR_WORDINGS.map((prior) => prior.key).sort()).toEqual([...revisedKeys].sort());
    expect(HAQ_PRIOR_WORDINGS.every((prior) => prior.version === 1)).toBe(true);
    for (const question of HAQ_QUESTIONS) {
      if (revisedKeys.includes(question.key)) continue;
      expect(haqCurrentQuestionVersion(question.key), question.key).toBe(1);
      expect(haqPromptAtVersion(question.key, 1), question.key).toBe(question.prompt);
    }
    // Migration 262 still regenerates character for character (the block
    // above), which is the whole of version 1: only these eleven differ.
    const v1Rows = buildHaqQuestionRowsSql().split('\n');
    const currentRows = HAQ_QUESTIONS.map((q) => q.prompt);
    const differing = HAQ_QUESTIONS.filter((q, index) => !v1Rows[index]!.includes(`'${currentRows[index]!.replace(/'/g, "''")}'`));
    expect(differing.map((q) => q.key).sort()).toEqual([...revisedKeys].sort());
  });

  it('ships exactly the version 2 rows the authored bank produces', () => {
    expect(wordingV2MigrationSql).toContain(buildHaqQuestionRevisionRowsSql(2));
    expect(buildHaqQuestionRevisionRowsSql(2).split('\n')).toHaveLength(11);
  });

  it('touches no scale, cutoff, result or response record, and no completed sitting', () => {
    const statements = wordingV2MigrationSql.replace(/--.*$/gm, '');
    for (const table of ['haq_section_cutoffs', 'haq_response_scale', 'haq_question_responses', 'haq_section_results']) {
      expect(statements, table).not.toMatch(new RegExp(`(insert into|update|delete from)\\s+${table}`, 'i'));
    }
    expect(statements).not.toMatch(/create or replace function/i);
    expect(statements).not.toMatch(/update\s+unified_assessment_sessions/i);
    // The one delete is an open sitting's answers to a replaced row.
    expect(statements.match(/delete from/gi)).toHaveLength(1);
    expect(statements).toMatch(/delete from unified_assessment_answers[\s\S]*?s\.status = 'in_progress';/);
    // The only update retires version 1.
    expect(statements.match(/\bupdate\s+\w+/gi)).toEqual(['update unified_assessment_questions']);
    expect(statements).toMatch(/set active = false/);
  });

  it('has no em dash or en dash in migration 265', () => {
    expect(wordingV2MigrationSql).not.toMatch(/[\u2013\u2014]/);
  });
});
