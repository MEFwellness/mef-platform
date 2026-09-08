/**
 * Her three marks: where she put herself between two words, on each of the
 * three lines this template asks her to stand on.
 *
 * WHAT THIS FILE IS FOR. Three of this template's nine questions do not
 * open with writing. They open with a position, and this is the one place
 * that knows the shape of a position, so the screen, the two server
 * actions, the closing composition, the coach's card and the stored column
 * can never disagree about what a mark is.
 *
 * A POSITION IS A WHOLE NUMBER FROM 0 TO 100, and nothing else. 0 is the
 * near pole and 100 is the far one, per question. Which two words those
 * poles carry is authored beside the question (./questions.ts), not stored
 * here, because a stored number is meaningless without its question and its
 * question already carries its own two words.
 *
 * NOTHING HERE IS SCORED, RANKED OR COMBINED. There is no total, no average
 * of the three, no band, no threshold and no adjective. A position is a
 * position. The only thing ever built on top of one is putting it back into
 * WORDS (hddPolePositionInWords, shared with every template in this
 * family), so a coach reads a sentence rather than the number 78, and she
 * and her member are always reading the same sentence.
 *
 * NULL IS NOT ZERO, AND THAT IS THE WHOLE POINT OF THE TYPE. A slider that
 * arrives already answered has collected a default rather than a decision,
 * so a mark she has not placed is absent, and the writing that asks her why
 * does not exist until it is there.
 *
 * ONLY THIS TEMPLATE'S OWN THREE KEYS ARE EVER STORED. A posted state is
 * filtered against the list of keys this template actually asks, so a
 * hand-built request cannot file a position under one of the seven other
 * templates' question keys, or under a key nothing asks.
 *
 * PURE. No I/O, no dates, no randomness.
 */

/** Where she put her mark on each line she has answered. Keyed by question. */
export type TlybSliderState = {
  positions: Record<string, number>;
};

export const TLYB_EMPTY_SLIDERS: TlybSliderState = { positions: {} };

/** The two ends of one line. The near word is 0, the far word is 100. */
export type TlybPoles = { near: string; far: string };

/**
 * A stored or posted state, reduced to positions this template actually
 * asks for.
 *
 * Returns a state for any input at all, including nonsense: an unusable
 * state is an empty one, never a thrown error, because this runs inside a
 * server action a member reached by tapping Continue.
 *
 * A float, a string, a boolean or a number off the line is not a position
 * she could have set, and is dropped rather than clamped, because clamping
 * would invent a decision she did not make.
 */
export function sanitizeTlybSliders(
  input: unknown,
  allowedKeys: readonly string[]
): TlybSliderState {
  const allowed = new Set(allowedKeys);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { positions: {} };
  const source = input as Record<string, unknown>;
  const raw = source.positions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { positions: {} };

  const positions: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value < 0 || value > 100) continue;
    positions[key] = Math.round(value);
  }
  return { positions };
}

/** The stored state on a row, rebuilt against this template's own question list. */
export function readTlybSliders(
  input: unknown,
  allowedKeys: readonly string[]
): TlybSliderState {
  return sanitizeTlybSliders(input, allowedKeys);
}

/** Where she put her mark on one line, or null when she has not placed it. */
export function tlybPositionFor(state: TlybSliderState, key: string): number | null {
  const value = state.positions[key];
  return typeof value === 'number' ? value : null;
}

/** True once she has committed to a position on this line. */
export function tlybPositionSet(state: TlybSliderState, key: string): boolean {
  return tlybPositionFor(state, key) !== null;
}

/** Her mark moved, with everything else left exactly where it was. */
export function tlybWithPosition(
  state: TlybSliderState,
  key: string,
  value: number
): TlybSliderState {
  return { positions: { ...state.positions, [key]: value } };
}

/** True once every line this template asks about carries a mark. */
export function tlybAllPlaced(state: TlybSliderState, keys: readonly string[]): boolean {
  return keys.length > 0 && keys.every((key) => tlybPositionSet(state, key));
}

/** How many of the lines she has placed, for a screen that has to say where she is. */
export function tlybPlacedCount(state: TlybSliderState, keys: readonly string[]): number {
  return keys.filter((key) => tlybPositionSet(state, key)).length;
}
