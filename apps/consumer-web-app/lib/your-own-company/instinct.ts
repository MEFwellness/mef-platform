/**
 * Everything on this template that is a choice rather than a sentence: her
 * instinct picks, her five answers in the rapid round, the lines she wrote
 * at question three, and the one she said cuts deepest.
 *
 * WHAT THIS FILE IS FOR. Five of this template's nine questions open with
 * something that is not writing. This is the one place that knows the shape
 * of those answers, so the screen, the two server actions, the closing, the
 * coach's card and the stored column can never disagree about what a pick
 * is.
 *
 * IT KNOWS NOTHING ABOUT THE INSTRUMENT. Which questions carry a pair, and
 * which five phrases the round is made of, are the QUESTIONS, and they live
 * in ./questions.ts. Every function here is handed the list of keys it is
 * allowed to accept. That is what lets this file be the one place a stored
 * choice is validated without it also becoming a second copy of the
 * question list.
 *
 * EVERY LINE IS ONE SHE WROTE, AND NOTHING ELSE IS EVER A LINE. The list is
 * DERIVED from the text of her question three answer, every time, including
 * on the server before anything is stored. It is never taken from the
 * client. So a hand-built request cannot put a sentence in front of her
 * that she did not type, and the sentence her question eight prompt quotes,
 * her closing prints and her coach reads can only ever be her own words.
 * That is the accuracy rule for this template, enforced rather than
 * intended.
 *
 * HER WORDS ARE NOT EDITED. hddLinesToCardTexts splits on the line breaks
 * she typed, trims the whitespace off each end so a stray trailing space is
 * not a different line, and drops the empty lines. Nothing is shortened,
 * re-wrapped, capitalised, split at punctuation or merged.
 *
 * SHE MAY GO BACK AND CHANGE HER MIND. Question three is a writing box like
 * any other, and Back reaches it, so the lines can change under a pick she
 * has already made. Reconciling is done by TEXT, not by position: a line
 * she still has keeps her pick, and a line she deleted takes it with it.
 * The alternative, index based ids, would have silently moved her
 * deepest-cut pick onto a different sentence the moment she inserted a line
 * above it.
 *
 * NOTHING HERE IS SCORED. Neither side of any pair is the right one, no
 * combination of picks means anything, and the only thing ever computed on
 * top of them is a COUNT of her own taps, put back into a sentence
 * (hddRoundTallySentence).
 *
 * PURE. No I/O, no dates, no randomness.
 */

import {
  hddIsInstinctSide,
  hddLinesToCardTexts,
  hddRoundTallySentence,
  type HddInstinctSide,
} from '../happiness-deep-dive/interactive';

/** One of her question three lines: an id that only means something inside this sitting, and her words. */
export type YocInstinctLine = { id: string; text: string };

export type YocInstinctState = {
  /** One line per non-empty line of her question three answer, in the order she wrote them. */
  lines: YocInstinctLine[];
  /** Her pick on each this-or-that question, keyed by that question's own key. */
  picks: Record<string, HddInstinctSide>;
  /** Her answer to each phrase in the rapid round, keyed by the phrase's id. */
  rapid: Record<string, HddInstinctSide>;
  /** Question eight: the line she said cuts deepest to read back. */
  deepestCutLineId: string | null;
};

export const YOC_EMPTY_INSTINCT: YocInstinctState = {
  lines: [],
  picks: {},
  rapid: {},
  deepestCutLineId: null,
};

/** A line's id inside one sitting. Positional, and reconciled by text whenever her lines change. */
function lineId(index: number): string {
  return `l${index}`;
}

/** The lines her question three answer produces, in the order she wrote them. */
export function yocLinesFrom(text: string): YocInstinctLine[] {
  return hddLinesToCardTexts(text).map((line, index) => ({ id: lineId(index), text: line }));
}

/**
 * A stored state, re-hung on the lines her CURRENT question three answer
 * produces.
 *
 * Matching is by text, first unused occurrence first, so a duplicated line
 * is two lines and editing one of them does not quietly reassign the other
 * one's pick. Anything pointing at a line she no longer has is dropped
 * rather than repointed at a neighbour.
 *
 * Her picks and her round are untouched by any of this: they are answers to
 * fixed questions and have nothing to do with what she typed at question
 * three.
 */
export function yocReconcileInstinct(
  previous: YocInstinctState,
  text: string
): YocInstinctState {
  const lines = yocLinesFrom(text);

  const remaining = [...previous.lines];
  const oldToNew = new Map<string, string>();
  for (const line of lines) {
    const at = remaining.findIndex((old) => old.text === line.text);
    if (at === -1) continue;
    const [old] = remaining.splice(at, 1);
    if (old) oldToNew.set(old.id, line.id);
  }

  const known = new Set(lines.map((line) => line.id));
  const deepest = previous.deepestCutLineId
    ? (oldToNew.get(previous.deepestCutLineId) ?? null)
    : null;

  return {
    lines,
    picks: { ...previous.picks },
    rapid: { ...previous.rapid },
    deepestCutLineId: deepest && known.has(deepest) ? deepest : null,
  };
}

/**
 * A state that is safe to store, rebuilt from her own words and from the
 * question list this template actually asks.
 *
 * `text` is her question three answer, and it is the ONLY source of lines.
 * `allowed` is the set of keys a pick may be filed under, handed in by
 * ./questions.ts, so a request inventing a question key stores nothing
 * under it.
 *
 * Returns a state for any input at all, including nonsense: an unusable
 * state is an empty one, never a thrown error, because this runs inside a
 * server action she reached by tapping Continue.
 */
export function sanitizeYocInstinct(
  input: unknown,
  text: string,
  allowed: { pickKeys: readonly string[]; rapidIds: readonly string[] }
): YocInstinctState {
  const lines = yocLinesFrom(text);
  const known = new Set(lines.map((line) => line.id));
  const empty: YocInstinctState = { ...YOC_EMPTY_INSTINCT, lines };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return empty;
  const source = input as Record<string, unknown>;

  const picks = readSides(source.picks, allowed.pickKeys);
  const rapid = readSides(source.rapid, allowed.rapidIds);

  const deepest =
    typeof source.deepestCutLineId === 'string' && known.has(source.deepestCutLineId)
      ? source.deepestCutLineId
      : null;

  return { lines, picks, rapid, deepestCutLineId: deepest };
}

/**
 * The subset of a posted object that is genuinely one of the two sides,
 * filed under a key this template actually asks about.
 *
 * Everything else is dropped rather than coerced: 'left', 0, true and a key
 * belonging to a different template are all "no answer", which is the same
 * thing an empty object means.
 */
function readSides(
  input: unknown,
  allowedKeys: readonly string[]
): Record<string, HddInstinctSide> {
  const clean: Record<string, HddInstinctSide> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return clean;
  const source = input as Record<string, unknown>;
  for (const key of allowedKeys) {
    const value = source[key];
    if (hddIsInstinctSide(value)) clean[key] = value;
  }
  return clean;
}

/** The stored state on a row, rebuilt from her own question three answer. */
export function readYocInstinct(
  input: unknown,
  text: string,
  allowed: { pickKeys: readonly string[]; rapidIds: readonly string[] }
): YocInstinctState {
  return sanitizeYocInstinct(input, text, allowed);
}

/** One line's words, for a question that quotes her back to herself. */
export function yocLineText(state: YocInstinctState, id: string | null): string | null {
  if (!id) return null;
  return state.lines.find((line) => line.id === id)?.text ?? null;
}

/** True once she has picked a side on this question. */
export function yocPickMade(state: YocInstinctState, questionKey: string): boolean {
  return Boolean(state.picks[questionKey]);
}

/** How many of the round's phrases she has answered so far. */
export function yocRapidAnswered(
  state: YocInstinctState,
  rapidIds: readonly string[]
): number {
  return rapidIds.filter((id) => Boolean(state.rapid[id])).length;
}

/** True once every phrase in the round has an answer. */
export function yocRapidDone(state: YocInstinctState, rapidIds: readonly string[]): boolean {
  return rapidIds.length > 0 && yocRapidAnswered(state, rapidIds) === rapidIds.length;
}

/**
 * Her count on each side of the round.
 *
 * ONE PLACE, so the sentence she reads on the screen and the sentence her
 * coach reads on the client card are the same arithmetic rather than two
 * versions of it. Only the phrases this round actually asked are counted,
 * so a stale answer left behind by an edited question list can never
 * inflate a total.
 */
export function yocRapidCounts(
  state: YocInstinctState,
  rapidIds: readonly string[]
): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const id of rapidIds) {
    const answer = state.rapid[id];
    if (answer === 'a') a += 1;
    if (answer === 'b') b += 1;
  }
  return { a, b };
}

/**
 * Her count of her own taps, in a sentence.
 *
 * The one number this experience prints, and it is hers: the side she chose
 * more often, how many times she chose it, out of the whole round. Nothing
 * is said about what that means, here or anywhere else.
 *
 * An unfinished round still returns a true sentence about what she has
 * answered so far, because the alternative is a caller inventing one.
 */
export function yocRapidTallySentence(
  state: YocInstinctState,
  rapidIds: readonly string[],
  labels: { a: string; b: string }
): string {
  return hddRoundTallySentence(yocRapidCounts(state, rapidIds), labels);
}

/** True once she has named the line that cuts deepest, and it is one she wrote. */
export function yocDeepestCutChosen(state: YocInstinctState): boolean {
  return Boolean(yocLineText(state, state.deepestCutLineId));
}
