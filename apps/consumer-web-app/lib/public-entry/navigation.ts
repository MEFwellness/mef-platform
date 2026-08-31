/**
 * Where one step backward lands, as a pure function.
 *
 * WHY THIS IS NOT INLINE IN THE COMPONENT. Back navigation across a
 * two-dimensional cursor (which section, which question inside it) is
 * exactly the shape that produces off-by-one bugs at the boundaries, and
 * the boundaries are the cases a person clicking through by hand is least
 * likely to try. Pulling it out means every position in the whole walk can
 * be asserted, forwards and backwards, in a test.
 *
 * IT RETRACES THE PATH RATHER THAN JUMPING. From the first question of a
 * section, back goes to that section's own intro, because that is the
 * screen the visitor actually came from. From a section intro, back lands
 * on the last question of the section before it. Pressing back twice from
 * the first question of section three therefore reaches the last question
 * of section two, which is what back pressed twice should do.
 */

import { ENERGY_CHAPTERS, questionsForChapter } from './questions';

/** Where the visitor is standing inside the walk. `intro` is the entry screen. */
export type WalkPosition =
  | { readonly beat: 'intro' }
  | { readonly beat: 'chapter'; readonly chapter: number }
  | { readonly beat: 'question'; readonly chapter: number; readonly questionIndex: number };

/**
 * The position one step back, or null when there is nowhere further back to
 * go (the entry screen is the start of the walk).
 */
export function stepBack(from: WalkPosition): WalkPosition | null {
  if (from.beat === 'intro') return null;

  if (from.beat === 'chapter') {
    // The section before the first one is the entry screen itself.
    if (from.chapter <= 1) return { beat: 'intro' };
    const previous = from.chapter - 1;
    return {
      beat: 'question',
      chapter: previous,
      questionIndex: questionsForChapter(previous).length - 1,
    };
  }

  if (from.questionIndex > 0) {
    return { beat: 'question', chapter: from.chapter, questionIndex: from.questionIndex - 1 };
  }
  return { beat: 'chapter', chapter: from.chapter };
}

/**
 * The position one step forward from a question that has just been
 * answered, or null when that answer was the last one and the result is
 * what comes next. The forward rule the component already followed, stated
 * here so a test can walk the whole experience in both directions against
 * one definition rather than two.
 */
export function stepForward(from: {
  chapter: number;
  questionIndex: number;
}): WalkPosition | null {
  const inChapter = questionsForChapter(from.chapter);
  const isLastInChapter = from.questionIndex === inChapter.length - 1;
  const isLastOverall = from.chapter === ENERGY_CHAPTERS.length && isLastInChapter;

  if (isLastOverall) return null;
  if (isLastInChapter) return { beat: 'chapter', chapter: from.chapter + 1 };
  return { beat: 'question', chapter: from.chapter, questionIndex: from.questionIndex + 1 };
}
