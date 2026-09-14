/**
 * The migration's own question rows, built from the authored content.
 *
 * ONE AUTHORED SOURCE, TWO READERS. questionContent.ts is where the 24
 * questions are written. This module turns them into exactly the VALUES
 * block migration 236 ships, `scripts/print-fuel-pattern-sql.mjs` prints
 * it, and tests/fuel-pattern-content.test.ts regenerates it and asserts
 * the shipped migration still contains it character for character. A
 * question edited in one place and not the other fails the suite instead
 * of shipping an option that scores nothing.
 */

import { FPA_QUESTIONS, FPA_SECTIONS, type FpaOption } from './questionContent';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function optionJson(option: FpaOption): Record<string, string> {
  const row: Record<string, string> = { value: option.value, label: option.label };
  if (option.detail) row.detail = option.detail;
  return row;
}

export function buildFpaSectionRowsSql(): string {
  return FPA_SECTIONS.map(
    (section) => `    (${quote(section.title)}, null, ${section.order})`
  ).join(',\n');
}

export function buildFpaQuestionRowsSql(): string {
  return FPA_QUESTIONS.map((question) => {
    const options = JSON.stringify(question.options.map(optionJson));
    const description = question.description ? quote(question.description) : 'null';
    return [
      `  (${quote(question.section)}, ${quote(question.key)}, ${question.order},`,
      `   ${quote(question.prompt)},`,
      `   ${description}, 'single_select',`,
      `   ${quote(options)}::jsonb)`,
    ].join('\n');
  }).join(',\n');
}
