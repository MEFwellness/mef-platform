/**
 * Prints the 24 questions as JSON, so a live verification run can drive
 * the real screens against the authored content rather than against a
 * second hand-typed copy of it that could drift.
 */
import { FPA_QUESTIONS } from '../lib/fuel-pattern/questionContent.ts';
console.log(JSON.stringify(FPA_QUESTIONS, null, 0));
