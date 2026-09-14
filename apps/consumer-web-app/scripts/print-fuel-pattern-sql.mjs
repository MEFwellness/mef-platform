/**
 * Prints migration 236's section and question VALUES blocks from the
 * authored content in lib/fuel-pattern/questionContent.ts. Run with
 * `npx tsx apps/consumer-web-app/scripts/print-fuel-pattern-sql.mjs` from
 * the repo root after editing a question, and paste the output into the
 * migration. tests/fuel-pattern-content.test.ts proves the two agree.
 */
import { buildFpaSectionRowsSql, buildFpaQuestionRowsSql } from '../lib/fuel-pattern/sql.ts';

console.log('-- SECTIONS --');
console.log(buildFpaSectionRowsSql());
console.log('-- QUESTIONS --');
console.log(buildFpaQuestionRowsSql());
