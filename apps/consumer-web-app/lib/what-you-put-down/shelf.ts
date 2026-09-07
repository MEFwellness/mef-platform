/**
 * The shelf: her cards, where she put them, which one stings, how far away
 * that version of her feels, and which one she took back.
 *
 * WHAT THIS FILE IS FOR. Three of this template's nine questions are not
 * writing. They are positions and choices, and this is the one place that
 * knows their shape, so the screen, the two server actions, the closing,
 * the coach's card and the stored column can never disagree about what a
 * shelf is.
 *
 * EVERY CARD IS A LINE SHE WROTE, AND NOTHING ELSE IS EVER A CARD. The card
 * list is DERIVED from the text of her question one answer, every time,
 * including on the server before anything is stored. It is never taken from
 * the client. So a hand-built request cannot put a sentence on her shelf
 * that she did not type, and the shelf her closing screen prints and her
 * coach reads can only ever be her own words. That is the accuracy rule for
 * this template, enforced rather than intended.
 *
 * HER WORDS ARE NOT EDITED. hddLinesToCardTexts splits on the line breaks
 * she typed, trims the whitespace off each end so a stray trailing space is
 * not a different card, and drops the empty lines. Nothing is shortened,
 * re-wrapped, capitalised, split at punctuation or merged.
 *
 * SHE MAY GO BACK AND CHANGE HER MIND. Question one is a writing box like
 * any other, and Back reaches it, so the cards can change under a shelf she
 * has already filled. Reconciling is done by TEXT, not by position: a line
 * she still has keeps its place, its mark and its lift, and a line she
 * deleted takes them with it. The alternative, index based ids, would have
 * silently moved her sting pick onto a different sentence the moment she
 * inserted a line above it.
 *
 * NOTHING HERE IS SCORED. There is no order that is better, no distance
 * that is worse and no card that is right. A position is a position.
 *
 * PURE. No I/O, no dates, no randomness.
 */

import { hddLinesToCardTexts } from '../happiness-deep-dive/interactive';

/** One card: an id that only means something inside this sitting, and one line she wrote. */
export type WypdShelfCard = { id: string; text: string };

export type WypdShelfState = {
  /** One card per non-empty line of her question one answer, in the order she wrote them. */
  cards: WypdShelfCard[];
  /** The ids she has placed on the shelf, in the order she placed them. */
  placed: string[];
  /** Question two: the card that stings most to read back. */
  stingCardId: string | null;
  /** Question five: 0 is the near pole, 100 the far one. Null until she places it. */
  distance: number | null;
  /** Question seven: the card she lifted back off the shelf. */
  liftedCardId: string | null;
};

export const WYPD_EMPTY_SHELF: WypdShelfState = {
  cards: [],
  placed: [],
  stingCardId: null,
  distance: null,
  liftedCardId: null,
};

/** The two ends of question five's line, in one place so the screen and the coach's card read the same words. */
export const WYPD_POLES = { near: 'Right here', far: 'A stranger' } as const;

/** A card's id inside one sitting. Positional, and reconciled by text whenever her lines change. */
function cardId(index: number): string {
  return `c${index}`;
}

/** The cards her question one answer produces, in the order she wrote them. */
export function wypdCardsFrom(text: string): WypdShelfCard[] {
  return hddLinesToCardTexts(text).map((line, index) => ({ id: cardId(index), text: line }));
}

/**
 * A stored shelf, re-hung on the cards her CURRENT question one answer
 * produces.
 *
 * Matching is by text, first unused occurrence first, so a duplicated line
 * is two cards and editing one of them does not quietly reassign the other
 * one's mark. Anything pointing at a line she no longer has is dropped
 * rather than repointed at a neighbour.
 */
export function wypdReconcileShelf(previous: WypdShelfState, text: string): WypdShelfState {
  const cards = wypdCardsFrom(text);

  const remaining = [...previous.cards];
  const oldToNew = new Map<string, string>();
  for (const card of cards) {
    const at = remaining.findIndex((old) => old.text === card.text);
    if (at === -1) continue;
    const [old] = remaining.splice(at, 1);
    if (old) oldToNew.set(old.id, card.id);
  }

  const known = new Set(cards.map((card) => card.id));
  const placed: string[] = [];
  for (const id of previous.placed) {
    const next = oldToNew.get(id);
    if (!next || !known.has(next) || placed.includes(next)) continue;
    placed.push(next);
  }

  const sting = previous.stingCardId ? (oldToNew.get(previous.stingCardId) ?? null) : null;
  const lifted = previous.liftedCardId ? (oldToNew.get(previous.liftedCardId) ?? null) : null;

  return {
    cards,
    placed,
    // The mark only means something on a card that is actually on the
    // shelf, which is the order this template asks for: place everything,
    // then name one.
    stingCardId: sting && placed.includes(sting) ? sting : null,
    distance: previous.distance,
    liftedCardId: lifted && known.has(lifted) ? lifted : null,
  };
}

/**
 * A shelf that is safe to store, rebuilt from her own words.
 *
 * `text` is her question one answer, and it is the ONLY source of cards.
 * Everything else on the input is treated as a set of references into that
 * list and dropped when it does not resolve.
 *
 * Returns a shelf for any input at all, including nonsense: an unusable
 * shelf is an empty shelf, never a thrown error, because this runs inside a
 * server action a member reached by tapping Continue.
 */
export function sanitizeWypdShelf(input: unknown, text: string): WypdShelfState {
  const cards = wypdCardsFrom(text);
  const known = new Set(cards.map((card) => card.id));
  const empty: WypdShelfState = { ...WYPD_EMPTY_SHELF, cards };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return empty;
  const source = input as Record<string, unknown>;

  const placed: string[] = [];
  if (Array.isArray(source.placed)) {
    for (const id of source.placed) {
      if (typeof id !== 'string' || !known.has(id) || placed.includes(id)) continue;
      placed.push(id);
    }
  }

  const stingCardId =
    typeof source.stingCardId === 'string' && placed.includes(source.stingCardId)
      ? source.stingCardId
      : null;

  const liftedCardId =
    typeof source.liftedCardId === 'string' && known.has(source.liftedCardId)
      ? source.liftedCardId
      : null;

  // A whole number between the two poles, or nothing. A float, a string or
  // a value off the line is not a position she could have set.
  const raw = source.distance;
  const distance =
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100
      ? Math.round(raw)
      : null;

  return { cards, placed, stingCardId, distance, liftedCardId };
}

/** The stored shelf on a row, rebuilt from her own question one answer. */
export function readWypdShelf(input: unknown, text: string): WypdShelfState {
  return sanitizeWypdShelf(input, text);
}

/** Her cards in the order she shelved them. The closing screen and the coach's card both read this. */
export function wypdPlacedCards(shelf: WypdShelfState): WypdShelfCard[] {
  const byId = new Map(shelf.cards.map((card) => [card.id, card]));
  return shelf.placed
    .map((id) => byId.get(id))
    .filter((card): card is WypdShelfCard => Boolean(card));
}

/** The next card still in her hand, or null when the shelf is full. */
export function wypdNextToPlace(shelf: WypdShelfState): WypdShelfCard | null {
  return shelf.cards.find((card) => !shelf.placed.includes(card.id)) ?? null;
}

/** True once every card she wrote is on the shelf, and she wrote at least one. */
export function wypdAllPlaced(shelf: WypdShelfState): boolean {
  return shelf.cards.length > 0 && shelf.placed.length === shelf.cards.length;
}

/** One card's words, for a question that quotes her back to herself. */
export function wypdCardText(shelf: WypdShelfState, id: string | null): string | null {
  if (!id) return null;
  return shelf.cards.find((card) => card.id === id)?.text ?? null;
}

/** Question two is finished when every card is shelved and she has named the one that stings. */
export function wypdShelfPlacingDone(shelf: WypdShelfState): boolean {
  return wypdAllPlaced(shelf) && Boolean(wypdCardText(shelf, shelf.stingCardId));
}

/** Question seven is finished when one card has been lifted back off. */
export function wypdShelfLiftDone(shelf: WypdShelfState): boolean {
  return Boolean(wypdCardText(shelf, shelf.liftedCardId));
}

/** Question five's half that is not writing: she has placed her mark somewhere on the line. */
export function wypdDistanceSet(shelf: WypdShelfState): boolean {
  return shelf.distance !== null;
}
