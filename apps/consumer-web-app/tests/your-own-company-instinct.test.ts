/**
 * The picks, as a piece of state: what becomes a line she can choose
 * between, what happens when she changes her mind, and the arithmetic of
 * the one number this experience prints.
 *
 * WHY THIS IS ITS OWN FILE. The gate test proves the state cannot be made
 * to hold a sentence she did not write. This one proves the part that is
 * about a member rather than about an attacker: she wrote three lines, went
 * back, deleted one and added two, and the line she named as cutting
 * deepest has to end up on the right sentence afterwards. Index based ids
 * would pass every assertion in the gate test and silently move her pick
 * one line down.
 *
 * AND THE TALLY IS ARITHMETIC, so it is tested as arithmetic. It is the
 * only number any of these templates shows a member, it is read by her
 * screen and by her coach's card from one function, and the way it fails is
 * by being off by one or by naming the wrong side, neither of which any
 * type or render would catch.
 *
 * ALL PURE. No database, no rendering, no dates.
 */

import { describe, it, expect } from 'vitest';
import {
  hddIsInstinctSide,
  hddLinesToCardTexts,
  hddRoundTallySentence,
} from '@/lib/happiness-deep-dive/interactive';
import {
  YOC_EMPTY_INSTINCT,
  sanitizeYocInstinct,
  yocDeepestCutChosen,
  yocLineText,
  yocLinesFrom,
  yocPickMade,
  yocRapidAnswered,
  yocRapidCounts,
  yocRapidDone,
  yocReconcileInstinct,
} from '@/lib/your-own-company/instinct';
import {
  YOC_ALLOWED,
  YOC_QUESTIONS,
  YOC_RAPID_IDS,
  YOC_RAPID_PAIR,
  YOC_RAPID_PHRASES,
  sanitizeYocInstinctState,
  yocInteractionDone,
  yocPickText,
  yocPromptFor,
  yocTallySentence,
  questionFor,
} from '@/lib/your-own-company/questions';

const THREE = 'You should have known better\nYou are so behind\nEveryone can tell';

/** Her state with every phrase in the round answered the given way. */
function roundOf(sides: Array<'a' | 'b'>) {
  const rapid: Record<string, 'a' | 'b'> = {};
  YOC_RAPID_PHRASES.forEach((phrase, index) => {
    const side = sides[index];
    if (side) rapid[phrase.id] = side;
  });
  return { ...YOC_EMPTY_INSTINCT, rapid };
}

describe('what becomes a line she can choose between', () => {
  it('is one line per line she typed, in her order', () => {
    expect(yocLinesFrom(THREE).map((line) => line.text)).toEqual([
      'You should have known better',
      'You are so behind',
      'Everyone can tell',
    ]);
  });

  it('is her words exactly, with only the whitespace at the ends taken off', () => {
    expect(yocLinesFrom('  she never finishes  ')[0]?.text).toBe('she never finishes');
    // Not re-punctuated, not capitalised, not split at a sentence end.
    expect(yocLinesFrom('you are late. again')[0]?.text).toBe('you are late. again');
    expect(yocLinesFrom(THREE)).toHaveLength(3);
  });

  it('drops the empty lines she left between them, and nothing else', () => {
    expect(yocLinesFrom('one\n\n\ntwo').map((line) => line.text)).toEqual(['one', 'two']);
    expect(hddLinesToCardTexts('one\n\n\ntwo')).toEqual(['one', 'two']);
  });

  it('a single line answer is one line, and Root never invents a second', () => {
    expect(yocLinesFrom('you always do this')).toHaveLength(1);
  });

  it('nothing written is no lines, rather than one empty one', () => {
    expect(yocLinesFrom('')).toEqual([]);
    expect(yocLinesFrom('   \n  \n')).toEqual([]);
  });
});

describe('she goes back and changes question three', () => {
  const chosen = sanitizeYocInstinctState(
    { picks: { whose_standards: 'a' }, rapid: { known_better: 'b' }, deepestCutLineId: 'l1' },
    THREE
  );

  it('her pick follows the SENTENCE, not the position, when a line above it is deleted', () => {
    const after = yocReconcileInstinct(chosen, 'You are so behind\nEveryone can tell');
    expect(yocLineText(after, after.deepestCutLineId)).toBe('You are so behind');
    // Which is now l0 rather than l1, and that is the whole point.
    expect(after.deepestCutLineId).toBe('l0');
  });

  it('and when a line is inserted above it', () => {
    const after = yocReconcileInstinct(chosen, `a brand new one\n${THREE}`);
    expect(yocLineText(after, after.deepestCutLineId)).toBe('You are so behind');
    expect(after.deepestCutLineId).toBe('l2');
  });

  it('a line she deleted takes her pick with it rather than moving it to a neighbour', () => {
    const after = yocReconcileInstinct(
      chosen,
      'You should have known better\nEveryone can tell'
    );
    expect(after.deepestCutLineId).toBeNull();
    expect(yocDeepestCutChosen(after)).toBe(false);
  });

  it('a duplicated line is two lines, and editing one does not reassign the other one’s pick', () => {
    const doubled = 'same sentence\nsame sentence';
    const picked = sanitizeYocInstinctState({ deepestCutLineId: 'l1' }, doubled);
    const after = yocReconcileInstinct(picked, 'same sentence\nsame sentence\nand a third');
    expect(after.deepestCutLineId).toBe('l1');
    expect(after.lines).toHaveLength(3);
  });

  it('her picks and her round are untouched by anything she does to question three', () => {
    const after = yocReconcileInstinct(chosen, 'completely different\nlines entirely');
    expect(after.picks).toEqual({ whose_standards: 'a' });
    expect(after.rapid).toEqual({ known_better: 'b' });
  });

  it('erasing question three erases the list and the pick, and throws nothing', () => {
    const after = yocReconcileInstinct(chosen, '');
    expect(after.lines).toEqual([]);
    expect(after.deepestCutLineId).toBeNull();
  });
});

describe('a pick is one of exactly two sides', () => {
  it('and nothing else is ever accepted as one', () => {
    expect(hddIsInstinctSide('a')).toBe(true);
    expect(hddIsInstinctSide('b')).toBe(true);
    for (const bad of ['A', 'left', 'yes', 0, 1, true, null, undefined, {}, ['a']]) {
      expect(hddIsInstinctSide(bad), String(bad)).toBe(false);
    }
  });

  it('is only stored under a key this template actually asks about', () => {
    const state = sanitizeYocInstinct(
      {
        picks: {
          whose_standards: 'a',
          // Another template's key, and a key that is no question at all.
          held_sentence: 'b',
          invented: 'a',
          // A real question of this template's, but not one that carries a pair.
          greatest_hits: 'b',
        },
      },
      THREE,
      YOC_ALLOWED
    );
    expect(state.picks).toEqual({ whose_standards: 'a' });
  });

  it('and a round answer only under one of the five phrase ids', () => {
    const state = sanitizeYocInstinct(
      { rapid: { known_better: 'b', made_up: 'a', whose_standards: 'a' } },
      THREE,
      YOC_ALLOWED
    );
    expect(state.rapid).toEqual({ known_better: 'b' });
  });

  it('nonsense in, empty state out, and never a thrown error', () => {
    for (const bad of [null, undefined, 'state', 7, [], { picks: 'no', rapid: 3 }]) {
      expect(() => sanitizeYocInstinct(bad, THREE, YOC_ALLOWED)).not.toThrow();
      const state = sanitizeYocInstinct(bad, THREE, YOC_ALLOWED);
      expect(state.picks).toEqual({});
      expect(state.rapid).toEqual({});
      expect(state.deepestCutLineId).toBeNull();
      // Her own lines are still rebuilt, because they come from her writing
      // rather than from the posted object.
      expect(state.lines).toHaveLength(3);
    }
  });

  it('a line she never wrote can never be the one that cuts deepest', () => {
    expect(
      sanitizeYocInstinct({ deepestCutLineId: 'l9' }, THREE, YOC_ALLOWED).deepestCutLineId
    ).toBeNull();
    expect(
      sanitizeYocInstinct({ deepestCutLineId: 'l2' }, THREE, YOC_ALLOWED).deepestCutLineId
    ).toBe('l2');
  });

  it('no card on this template is ever a sentence Root wrote', () => {
    const state = sanitizeYocInstinct(
      { lines: [{ id: 'l0', text: 'a sentence Root invented' }] },
      THREE,
      YOC_ALLOWED
    );
    expect(state.lines.map((line) => line.text)).toEqual([
      'You should have known better',
      'You are so behind',
      'Everyone can tell',
    ]);
  });
});

describe('the tally is her own count and nothing more', () => {
  it('names the side she chose more often, and counts that one, out of the whole round', () => {
    // The brief's own example: four Nevers out of five.
    expect(yocTallySentence(roundOf(['b', 'b', 'a', 'b', 'b']))).toBe(
      'You said Never 4 times out of 5.'
    );
    expect(yocTallySentence(roundOf(['a', 'a', 'a', 'b', 'a']))).toBe(
      'You said Yes 4 times out of 5.'
    );
  });

  it('never prints a zero at somebody who answered the other way every time', () => {
    expect(yocTallySentence(roundOf(['a', 'a', 'a', 'a', 'a']))).toBe(
      'You said Yes 5 times out of 5.'
    );
    expect(yocTallySentence(roundOf(['b', 'b', 'b', 'b', 'b']))).toBe(
      'You said Never 5 times out of 5.'
    );
  });

  it('says "time" once and "times" otherwise', () => {
    expect(hddRoundTallySentence({ a: 1, b: 0 }, YOC_RAPID_PAIR)).toBe(
      'You said Yes 1 time out of 1.'
    );
    expect(hddRoundTallySentence({ a: 0, b: 2 }, YOC_RAPID_PAIR)).toBe(
      'You said Never 2 times out of 2.'
    );
  });

  it('counts only the phrases this round actually asked', () => {
    const state = {
      ...roundOf(['b', 'b', 'b', 'b', 'b']),
      rapid: {
        ...roundOf(['b', 'b', 'b', 'b', 'b']).rapid,
        // A leftover from a question list that no longer exists.
        retired_phrase: 'a' as const,
      },
    };
    expect(yocRapidCounts(state, YOC_RAPID_IDS)).toEqual({ a: 0, b: 5 });
    expect(yocTallySentence(state)).toBe('You said Never 5 times out of 5.');
  });

  it('the total is always the whole round, never a subset she happened to answer', () => {
    const half = roundOf(['b', 'b']);
    expect(yocRapidAnswered(half, YOC_RAPID_IDS)).toBe(2);
    expect(yocRapidDone(half, YOC_RAPID_IDS)).toBe(false);
    expect(yocRapidDone(roundOf(['a', 'b', 'a', 'b', 'a']), YOC_RAPID_IDS)).toBe(true);
  });

  it('there are five phrases, each with its own id', () => {
    expect(YOC_RAPID_PHRASES).toHaveLength(5);
    expect(new Set(YOC_RAPID_IDS).size).toBe(5);
  });
});

describe('question eight quotes the line she named, verbatim', () => {
  const question = questionFor('the_rewrite');

  it('reproduces her sentence exactly, inside its own prompt', () => {
    const state = sanitizeYocInstinctState({ deepestCutLineId: 'l0' }, THREE);
    expect(yocPromptFor(question!, state)).toBe(
      'You wrote: "You should have known better". Rewrite it the way that kind voice would say it. Keep the true part. Drop the cruelty.'
    );
  });

  it('changes nothing about her line: not its case, its punctuation or its length', () => {
    const messy = 'i AM so, so tired of this...  and nobody cares';
    const state = sanitizeYocInstinctState({ deepestCutLineId: 'l0' }, messy);
    expect(yocPromptFor(question!, state)).toContain(`"${messy.trim()}"`);
  });

  it('invents no quotation when she has named no line', () => {
    const state = sanitizeYocInstinctState({}, THREE);
    expect(yocPromptFor(question!, state)).toBe(
      'Rewrite it the way that kind voice would say it. Keep the true part. Drop the cruelty.'
    );
    expect(yocPromptFor(question!, state)).not.toContain('You wrote');
  });

  it('is the only question that quotes her', () => {
    expect(YOC_QUESTIONS.filter((entry) => entry.quotesDeepestCut)).toHaveLength(1);
    const state = sanitizeYocInstinctState({ deepestCutLineId: 'l0' }, THREE);
    for (const entry of YOC_QUESTIONS) {
      if (entry.quotesDeepestCut) continue;
      expect(yocPromptFor(entry, state), entry.key).toBe(entry.prompt);
    }
  });
});

describe('an interactive half is finished when she has done it, and not before', () => {
  it('a plain written question has no interactive half to finish', () => {
    const written = questionFor('greatest_hits')!;
    expect(yocInteractionDone(written, YOC_EMPTY_INSTINCT)).toBe(true);
  });

  it('a pick question needs the pick', () => {
    const pick = questionFor('whose_standards')!;
    expect(yocInteractionDone(pick, YOC_EMPTY_INSTINCT)).toBe(false);
    expect(yocPickMade(YOC_EMPTY_INSTINCT, 'whose_standards')).toBe(false);
    const picked = { ...YOC_EMPTY_INSTINCT, picks: { whose_standards: 'b' as const } };
    expect(yocInteractionDone(pick, picked)).toBe(true);
    expect(yocPickText(picked, pick)).toBe('No one but me');
  });

  it('the round needs all five, not four', () => {
    const round = questionFor('the_roommate')!;
    expect(yocInteractionDone(round, roundOf(['a', 'b', 'a', 'b']))).toBe(false);
    expect(yocInteractionDone(round, roundOf(['a', 'b', 'a', 'b', 'a']))).toBe(true);
  });

  it('question eight needs a line she actually wrote', () => {
    const choose = questionFor('the_rewrite')!;
    expect(yocInteractionDone(choose, sanitizeYocInstinctState({}, THREE))).toBe(false);
    expect(
      yocInteractionDone(choose, sanitizeYocInstinctState({ deepestCutLineId: 'l1' }, THREE))
    ).toBe(true);
  });

  it('a pick with no pair on the question reads back as no pick rather than as a card', () => {
    const written = questionFor('greatest_hits')!;
    const state = { ...YOC_EMPTY_INSTINCT, picks: { greatest_hits: 'a' as const } };
    expect(yocPickText(state, written)).toBeNull();
  });
});
