/**
 * Builds real HAQ answer sets that reach a chosen section total, using only
 * the approved responses and the values the specification gives them
 * (tests/haq-spec.ts), never the engine under test.
 */
import { HAQ_QUESTIONS, HAQ_SECTIONS } from '../lib/haq/questionBank';
import type { HaqQuestion } from '../lib/haq/types';
import { SPEC_HIDDEN_VALUES } from './haq-spec';

function choicesFor(question: HaqQuestion): Array<[string, number]> {
  return SPEC_HIDDEN_VALUES.filter(([type]) => type === question.responseType).map(([, response, value]) => [
    response,
    value,
  ]);
}

/**
 * One answer for every question in the section, summing to exactly `target`.
 * Prefers the largest value first so most questions stay at zero. Throws when
 * the section cannot reach the total with approved answers.
 */
export function answersForSectionTotal(sectionId: string, target: number): Record<string, string> {
  const questions = HAQ_QUESTIONS.filter((q) => q.sectionId === sectionId);
  const memo = new Map<string, Record<string, string> | null>();

  const solve = (index: number, remaining: number): Record<string, string> | null => {
    if (index === questions.length) return remaining === 0 ? {} : null;
    const memoKey = `${index}:${remaining}`;
    if (memo.has(memoKey)) return memo.get(memoKey)!;
    const question = questions[index]!;
    const options = [...choicesFor(question)].sort((a, b) => b[1] - a[1]);
    let found: Record<string, string> | null = null;
    for (const [response, value] of options) {
      if (value > remaining) continue;
      const rest = solve(index + 1, remaining - value);
      if (rest) {
        found = { [question.key]: response, ...rest };
        break;
      }
    }
    memo.set(memoKey, found);
    return found;
  };

  const answers = solve(0, target);
  if (!answers) throw new Error(`${sectionId} cannot reach a total of ${target} with approved answers`);
  return answers;
}

/** Every question answered Never or rarely / No. */
export function allZeroAnswers(): Record<string, string> {
  return Object.fromEntries(
    HAQ_QUESTIONS.map((q) => [q.key, q.responseType === 'frequency' ? 'never_or_rarely' : 'no'])
  );
}

/** Every question answered Very often / Yes. */
export function allHighestAnswers(): Record<string, string> {
  return Object.fromEntries(HAQ_QUESTIONS.map((q) => [q.key, q.responseType === 'frequency' ? 'very_often' : 'yes']));
}

/** A whole instance whose every section sits at its own chosen total. */
export function answersForSectionTotals(totals: Record<string, number>): Record<string, string> {
  return Object.assign({}, ...HAQ_SECTIONS.map((section) => answersForSectionTotal(section.id, totals[section.id]!)));
}
