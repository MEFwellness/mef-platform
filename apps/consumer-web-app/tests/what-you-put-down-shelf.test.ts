/**
 * The shelf, as a piece of state: what becomes a card, what happens when she
 * changes her mind, and the words a position is read back in.
 *
 * WHY THIS IS ITS OWN FILE. The gate test proves the shelf cannot be made to
 * hold a sentence she did not write. This one proves the part that is about
 * a member rather than about an attacker: she wrote six lines, went back,
 * deleted one and added two, and the marks she had already made have to end
 * up on the right sentences afterwards. Index based ids would pass every
 * assertion in the gate test and silently move her sting pick one line down.
 *
 * ALL PURE. No database, no rendering, no dates.
 */

import { describe, it, expect } from 'vitest';
import {
  hddLinesToCardTexts,
  hddPolePositionInWords,
  hddShelfCardDelayMs,
  HDD_SHELF_MAX_ARRIVAL_MS,
} from '@/lib/happiness-deep-dive/interactive';
import {
  WYPD_EMPTY_SHELF,
  WYPD_POLES,
  wypdAllPlaced,
  wypdCardText,
  wypdCardsFrom,
  wypdNextToPlace,
  wypdPlacedCards,
  wypdReconcileShelf,
  wypdShelfLiftDone,
  wypdShelfPlacingDone,
  sanitizeWypdShelf,
} from '@/lib/what-you-put-down/shelf';

const THREE = 'danced on Sundays\nread two books a week\nsaid what I thought';

describe('what becomes a card', () => {
  it('is one card per line she typed, in her order', () => {
    expect(wypdCardsFrom(THREE).map((card) => card.text)).toEqual([
      'danced on Sundays',
      'read two books a week',
      'said what I thought',
    ]);
  });

  it('drops the blank lines and the whitespace at each end, and edits nothing else', () => {
    expect(hddLinesToCardTexts('  danced  \n\n\n   \nsaid what I thought')).toEqual([
      'danced',
      'said what I thought',
    ]);
  });

  it('never splits her sentence into cards she did not write', () => {
    // One line with three sentences in it is ONE card. Splitting at
    // punctuation to make a richer shelf would be Root writing her cards.
    expect(hddLinesToCardTexts('I danced. I read. I said things.')).toHaveLength(1);
  });

  it('an answer with nothing in it is no cards, rather than one empty card', () => {
    expect(wypdCardsFrom('')).toEqual([]);
    expect(wypdCardsFrom('   \n  \n')).toEqual([]);
    expect(wypdAllPlaced(sanitizeWypdShelf({}, ''))).toBe(false);
  });

  it('a duplicated line is two cards, because she wrote it twice', () => {
    expect(wypdCardsFrom('danced\ndanced')).toHaveLength(2);
  });
});

describe('placing them', () => {
  it('hands her the next one still in her hand, in her own order', () => {
    const empty = sanitizeWypdShelf({}, THREE);
    expect(wypdNextToPlace(empty)?.text).toBe('danced on Sundays');
    const one = sanitizeWypdShelf({ placed: ['c0'] }, THREE);
    expect(wypdNextToPlace(one)?.text).toBe('read two books a week');
    const all = sanitizeWypdShelf({ placed: ['c0', 'c1', 'c2'] }, THREE);
    expect(wypdNextToPlace(all)).toBeNull();
    expect(wypdAllPlaced(all)).toBe(true);
  });

  it('the shelf reads back in the order she placed them, not the order she wrote them', () => {
    const shelf = sanitizeWypdShelf({ placed: ['c2', 'c0', 'c1'] }, THREE);
    expect(wypdPlacedCards(shelf).map((card) => card.text)).toEqual([
      'said what I thought',
      'danced on Sundays',
      'read two books a week',
    ]);
  });

  it('question two is only finished once everything is on it AND one is named', () => {
    expect(wypdShelfPlacingDone(sanitizeWypdShelf({ placed: ['c0', 'c1'] }, THREE))).toBe(false);
    expect(
      wypdShelfPlacingDone(sanitizeWypdShelf({ placed: ['c0', 'c1', 'c2'] }, THREE))
    ).toBe(false);
    expect(
      wypdShelfPlacingDone(
        sanitizeWypdShelf({ placed: ['c0', 'c1', 'c2'], stingCardId: 'c1' }, THREE)
      )
    ).toBe(true);
  });

  it('question seven is finished when one card has been lifted back off', () => {
    expect(wypdShelfLiftDone(WYPD_EMPTY_SHELF)).toBe(false);
    expect(
      wypdShelfLiftDone(sanitizeWypdShelf({ placed: ['c0'], liftedCardId: 'c0' }, THREE))
    ).toBe(true);
  });
});

describe('she went back and changed question one', () => {
  const before = sanitizeWypdShelf(
    { placed: ['c0', 'c1', 'c2'], stingCardId: 'c2', distance: 70, liftedCardId: 'c1' },
    THREE
  );

  it('a line she kept keeps its own mark, even when the lines above it moved', () => {
    // She inserted a new first line. Everything she had shifted down by one
    // index, so an index based reconcile would now be pointing her sting
    // pick and her lift at the wrong sentences.
    const after = wypdReconcileShelf(before, `wrote letters\n${THREE}`);
    expect(wypdCardText(after, after.stingCardId)).toBe('said what I thought');
    expect(wypdCardText(after, after.liftedCardId)).toBe('read two books a week');
    expect(after.distance).toBe(70);
  });

  it('a line she deleted takes its mark with it rather than passing it to a neighbour', () => {
    const after = wypdReconcileShelf(before, 'danced on Sundays\nread two books a week');
    expect(after.stingCardId).toBeNull();
    expect(wypdCardText(after, after.liftedCardId)).toBe('read two books a week');
    expect(wypdPlacedCards(after).map((card) => card.text)).toEqual([
      'danced on Sundays',
      'read two books a week',
    ]);
  });

  it('a brand new line is a brand new card, still in her hand', () => {
    const after = wypdReconcileShelf(before, `${THREE}\nswam in the sea`);
    expect(after.cards).toHaveLength(4);
    expect(wypdNextToPlace(after)?.text).toBe('swam in the sea');
    expect(wypdAllPlaced(after)).toBe(false);
  });

  it('two identical lines keep one mark each rather than both taking it', () => {
    const shelf = sanitizeWypdShelf(
      { placed: ['c0', 'c1'], stingCardId: 'c1' },
      'danced\ndanced'
    );
    const after = wypdReconcileShelf(shelf, 'danced\ndanced');
    expect(after.placed).toEqual(['c0', 'c1']);
    expect(after.stingCardId).toBe('c1');
  });

  it('clearing question one clears the shelf rather than leaving orphan cards standing', () => {
    const after = wypdReconcileShelf(before, '');
    expect(after.cards).toEqual([]);
    expect(after.placed).toEqual([]);
    expect(after.stingCardId).toBeNull();
    expect(after.liftedCardId).toBeNull();
  });

  it('reconciling twice changes nothing, so doing it on every render is safe', () => {
    const once = wypdReconcileShelf(before, THREE);
    expect(wypdReconcileShelf(once, THREE)).toEqual(once);
  });
});

describe('a position on the line, read back in words', () => {
  it('never returns a number or a percentage', () => {
    for (let value = 0; value <= 100; value += 1) {
      const words = hddPolePositionInWords(value, WYPD_POLES);
      expect(words, String(value)).not.toMatch(/\d/);
      expect(words, String(value)).not.toContain('%');
    }
  });

  it('says one of five things, and both ends are her pole words', () => {
    expect(hddPolePositionInWords(0, WYPD_POLES)).toBe('right here');
    expect(hddPolePositionInWords(25, WYPD_POLES)).toBe('closer to Right here');
    expect(hddPolePositionInWords(50, WYPD_POLES)).toBe(
      'halfway between Right here and A stranger'
    );
    expect(hddPolePositionInWords(75, WYPD_POLES)).toBe('closer to A stranger');
    expect(hddPolePositionInWords(100, WYPD_POLES)).toBe('a stranger');
  });

  it('describes the position and never judges it', () => {
    for (let value = 0; value <= 100; value += 1) {
      const words = hddPolePositionInWords(value, WYPD_POLES);
      expect(words).not.toMatch(/\b(?:too|very|worry|worrying|bad|good|better|worse)\b/i);
    }
  });

  it('a value off the line is clamped rather than producing nonsense', () => {
    expect(hddPolePositionInWords(-40, WYPD_POLES)).toBe('right here');
    expect(hddPolePositionInWords(400, WYPD_POLES)).toBe('a stranger');
  });
});

describe('a whole shelf arriving at once', () => {
  it('the first card is due immediately and each one after it steps', () => {
    expect(hddShelfCardDelayMs(0, 5)).toBe(0);
    expect(hddShelfCardDelayMs(2, 5)).toBeGreaterThan(hddShelfCardDelayMs(1, 5));
  });

  it('a long list arrives faster per card rather than taking longer overall', () => {
    for (const total of [1, 3, 8, 20, 60]) {
      expect(hddShelfCardDelayMs(total - 1, total), String(total)).toBeLessThanOrEqual(
        HDD_SHELF_MAX_ARRIVAL_MS
      );
    }
  });

  it('an empty list has a delay rather than a division by zero', () => {
    expect(Number.isFinite(hddShelfCardDelayMs(0, 0))).toBe(true);
  });
});
