/**
 * Migration 262's content rows, built from the authored HAQ content.
 *
 * ONE AUTHORED SOURCE, TWO READERS. questionBank.ts holds the words and
 * scoringRules.ts holds the numbers. This module turns both into exactly
 * the VALUES blocks migrations 262 and 264 ship,
 * `scripts/print-haq-sql.mjs` prints them, and tests/haq-content.test.ts
 * regenerates them and asserts the shipped migration still contains each
 * one character for character.
 *
 * Build time only. Nothing a member loads imports this file.
 */

import {
  HAQ_PARTS,
  HAQ_PRIOR_WORDINGS,
  HAQ_QUESTIONS,
  HAQ_RESPONSE_OPTIONS,
  HAQ_SECTIONS,
  haqCurrentQuestionVersion,
  haqPromptAtVersion,
} from './questionBank';
import { HAQ_HIDDEN_VALUES, HAQ_SECTION_CUTOFFS } from './scoringRules';
import type { HaqResponseType } from './types';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function nullable(value: string | null): string {
  return value === null ? 'null' : quote(value);
}

/** The option list a question row carries: values and labels, never a number. */
export function buildHaqAnswerOptionsJson(responseType: HaqResponseType): string {
  return JSON.stringify(HAQ_RESPONSE_OPTIONS[responseType].map((option) => ({ value: option.value, label: option.label })));
}

/**
 * (part_id, part_label, part_name, display_order), for migration 264.
 *
 * The Part names are the ones the member reads on a question screen and at a
 * Part boundary. The numeral stays in part_label, where nothing prints it.
 */
export function buildHaqPartRowsSql(): string {
  return HAQ_PARTS.map(
    (p) => `    (${quote(p.id)}, ${quote(p.label)}, ${quote(p.name)}, ${p.order})`
  ).join(',\n');
}

/** (section_id, part_id, part_label, section_letter, title, intro, display_order) */
export function buildHaqSectionRowsSql(): string {
  return HAQ_SECTIONS.map(
    (s) =>
      `    (${quote(s.id)}, ${quote(s.partId)}, ${quote(s.partLabel)}, ${nullable(s.sectionLetter)}, ${quote(s.title)}, ${nullable(s.intro)}, ${s.order})`
  ).join(',\n');
}

/**
 * (section_id, question_key, display_order, prompt, response_type), for
 * migration 262: every question at version 1, in the words it was first
 * seeded with. A question reworded since carries its version 1 wording here.
 */
export function buildHaqQuestionRowsSql(): string {
  return HAQ_QUESTIONS.map((q) => {
    const prompt = haqPromptAtVersion(q.key, 1) ?? q.prompt;
    return `    (${quote(q.sectionId)}, ${quote(q.key)}, ${q.order}, ${quote(prompt)}, ${quote(q.responseType)})`;
  }).join(',\n');
}

/**
 * (question_key, question_version, prompt), for a wording-only revision: each
 * question whose current version is `version`, in its current words. Its
 * section, position, response type and options are copied from the version
 * it replaces, inside the migration, so none of them can move.
 */
export function buildHaqQuestionRevisionRowsSql(version: number): string {
  const keys = new Set(HAQ_PRIOR_WORDINGS.filter((prior) => prior.version === version - 1).map((prior) => prior.key));
  return HAQ_QUESTIONS.filter((q) => keys.has(q.key) && haqCurrentQuestionVersion(q.key) === version)
    .map((q) => `    (${quote(q.key)}, ${version}, ${quote(q.prompt)})`)
    .join(',\n');
}

/** (section_id, green_max, yellow_max) */
export function buildHaqCutoffRowsSql(): string {
  return HAQ_SECTIONS.map((s) => {
    const cutoffs = HAQ_SECTION_CUTOFFS[s.id];
    if (!cutoffs) throw new Error(`No cutoffs authored for ${s.id}`);
    return `    (${quote(s.id)}, ${cutoffs.greenMax}, ${cutoffs.yellowMax})`;
  }).join(',\n');
}

/** (response_type, response_value, hidden_value, display_order) */
export function buildHaqResponseScaleRowsSql(): string {
  const rows: string[] = [];
  for (const responseType of ['frequency', 'yes_no'] as const) {
    const values = HAQ_HIDDEN_VALUES[responseType] as Record<string, number>;
    HAQ_RESPONSE_OPTIONS[responseType].forEach((option, index) => {
      const value = values[option.value];
      if (value === undefined) throw new Error(`No hidden value authored for ${responseType}/${option.value}`);
      rows.push(`    (${quote(responseType)}, ${quote(option.value)}, ${value}, ${index + 1})`);
    });
  }
  return rows.join(',\n');
}
