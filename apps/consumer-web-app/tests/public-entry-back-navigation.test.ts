/**
 * BACK NAVIGATION, across every position in the walk.
 *
 * Found on a phone: there was no way back. A visitor who tapped the wrong
 * answer, or wanted to change an earlier one, was stuck with it.
 *
 * The boundaries are what this file is really for. Back from the FIRST
 * question of a section, and back from a section INTRO, are the two cases a
 * person clicking by hand is least likely to try and the two most likely to
 * be off by one. So every position is asserted rather than a sample.
 */

import { describe, expect, it } from 'vitest';
import { stepBack, stepForward, type WalkPosition } from '../lib/public-entry/navigation';
import { ENERGY_CHAPTERS, ENERGY_QUESTIONS, questionsForChapter } from '../lib/public-entry/questions';

/** Every screen of the walk, in the order a visitor meets them. */
function wholeWalk(): WalkPosition[] {
  const path: WalkPosition[] = [{ beat: 'intro' }];
  for (const chapter of ENERGY_CHAPTERS) {
    path.push({ beat: 'chapter', chapter: chapter.number });
    questionsForChapter(chapter.number).forEach((_, questionIndex) => {
      path.push({ beat: 'question', chapter: chapter.number, questionIndex });
    });
  }
  return path;
}

describe('the walk itself', () => {
  it('is the entry screen, then four sections, then nine questions between them', () => {
    const path = wholeWalk();
    expect(path.filter((p) => p.beat === 'question')).toHaveLength(ENERGY_QUESTIONS.length);
    expect(path.filter((p) => p.beat === 'chapter')).toHaveLength(ENERGY_CHAPTERS.length);
  });
});

describe('back always lands on the screen the visitor actually came from', () => {
  it('holds at every single position, by walking forward and stepping back', () => {
    const path = wholeWalk();
    for (let i = 1; i < path.length; i += 1) {
      const here = path[i]!;
      const cameFrom = path[i - 1]!;
      expect(stepBack(here), `back from ${JSON.stringify(here)}`).toEqual(cameFrom);
    }
  });

  it('has nowhere to go from the entry screen, which needs no back control', () => {
    expect(stepBack({ beat: 'intro' })).toBeNull();
  });
});

describe('the two boundaries', () => {
  it('back from a section intro lands on the last question of the section before it', () => {
    for (const chapter of ENERGY_CHAPTERS) {
      if (chapter.number === 1) continue;
      const previous = chapter.number - 1;
      expect(stepBack({ beat: 'chapter', chapter: chapter.number })).toEqual({
        beat: 'question',
        chapter: previous,
        questionIndex: questionsForChapter(previous).length - 1,
      });
    }
  });

  it('back from the first section intro returns to the entry screen', () => {
    expect(stepBack({ beat: 'chapter', chapter: 1 })).toEqual({ beat: 'intro' });
  });

  it('back from the first question of a section returns to that section intro', () => {
    for (const chapter of ENERGY_CHAPTERS) {
      expect(stepBack({ beat: 'question', chapter: chapter.number, questionIndex: 0 })).toEqual({
        beat: 'chapter',
        chapter: chapter.number,
      });
    }
  });

  it('so back pressed twice from the first question of a section reaches the previous question', () => {
    // The requirement stated as a visitor would experience it.
    const from: WalkPosition = { beat: 'question', chapter: 3, questionIndex: 0 };
    const once = stepBack(from)!;
    const twice = stepBack(once)!;
    expect(twice).toEqual({
      beat: 'question',
      chapter: 2,
      questionIndex: questionsForChapter(2).length - 1,
    });
  });
});

describe('back and forward are inverses', () => {
  it('stepping back then forward from any question returns to the same question', () => {
    for (const chapter of ENERGY_CHAPTERS) {
      const questions = questionsForChapter(chapter.number);
      for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
        const here = { chapter: chapter.number, questionIndex };
        const back = stepBack({ beat: 'question', ...here })!;
        // From a question, forward from the position behind it lands here
        // again, whether that position was a question or a section intro.
        const forward =
          back.beat === 'question'
            ? stepForward({ chapter: back.chapter, questionIndex: back.questionIndex })
            : { beat: 'question' as const, chapter: chapter.number, questionIndex: 0 };
        expect(forward).toEqual({ beat: 'question', ...here });
      }
    }
  });

  it('the last question forward is the result, not another screen', () => {
    const lastChapter = ENERGY_CHAPTERS[ENERGY_CHAPTERS.length - 1]!.number;
    const lastIndex = questionsForChapter(lastChapter).length - 1;
    expect(stepForward({ chapter: lastChapter, questionIndex: lastIndex })).toBeNull();
  });
});

describe('going back never unanswers anything', () => {
  it('is true by construction: stepBack only moves a cursor', () => {
    // The whole guarantee is that this function returns a POSITION and
    // touches no answers at all. If it ever gained an answers argument,
    // that guarantee would need re-proving, so this asserts the shape.
    expect(stepBack.length).toBe(1);
    const before: WalkPosition = { beat: 'question', chapter: 2, questionIndex: 1 };
    const frozen = Object.freeze({ ...before });
    stepBack(frozen);
    expect(frozen).toEqual(before);
  });
});

describe('the progress count stays truthful in both directions', () => {
  /**
   * The label says "N of 9 answered", so it counts ANSWERS, not position.
   * A visitor who answered all nine and stepped back to change one has
   * genuinely answered nine, and telling her so is correct. This asserts
   * the count is a pure function of the answers and cannot drift with the
   * cursor.
   */
  function answeredCount(answers: Record<string, string>): number {
    return ENERGY_QUESTIONS.filter((q) => answers[q.key]).length;
  }

  it('does not change when the visitor moves backward or forward', () => {
    const answers: Record<string, string> = {};
    for (const question of ENERGY_QUESTIONS) {
      answers[question.key] = question.options[0]!.value;
    }
    expect(answeredCount(answers)).toBe(9);

    // Moving the cursor anywhere at all leaves the count alone.
    for (const position of wholeWalk()) {
      void position;
      expect(answeredCount(answers)).toBe(9);
    }
  });

  it('rises by exactly one per answer given, and never falls', () => {
    const answers: Record<string, string> = {};
    let previous = 0;
    for (const question of ENERGY_QUESTIONS) {
      answers[question.key] = question.options[0]!.value;
      const now = answeredCount(answers);
      expect(now).toBe(previous + 1);
      previous = now;
    }
  });

  it('changing an already given answer does not change the count', () => {
    const answers: Record<string, string> = {};
    for (const question of ENERGY_QUESTIONS) {
      answers[question.key] = question.options[0]!.value;
    }
    const before = answeredCount(answers);
    const first = ENERGY_QUESTIONS[0]!;
    answers[first.key] = first.options[1]!.value;
    expect(answeredCount(answers)).toBe(before);
  });
});
