/**
 * Prints migration 262's content VALUES blocks from the authored HAQ
 * content in lib/haq/questionBank.ts and lib/haq/scoringRules.ts. Run with
 * `npx tsx apps/consumer-web-app/scripts/print-haq-sql.mjs` from the repo
 * root. tests/haq-content.test.ts proves the migration and the content agree.
 */
import {
  buildHaqAnswerOptionsJson,
  buildHaqCutoffRowsSql,
  buildHaqQuestionRowsSql,
  buildHaqResponseScaleRowsSql,
  buildHaqSectionRowsSql,
} from '../lib/haq/sql.ts';

console.log('-- RESPONSE SCALE --');
console.log(buildHaqResponseScaleRowsSql());
console.log('-- SECTIONS --');
console.log(buildHaqSectionRowsSql());
console.log('-- CUTOFFS --');
console.log(buildHaqCutoffRowsSql());
console.log('-- FREQUENCY OPTIONS --');
console.log(buildHaqAnswerOptionsJson('frequency'));
console.log('-- YES NO OPTIONS --');
console.log(buildHaqAnswerOptionsJson('yes_no'));
console.log('-- QUESTIONS --');
console.log(buildHaqQuestionRowsSql());
