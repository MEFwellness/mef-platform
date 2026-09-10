/**
 * The red flag layer. Its own screens, its own column, its own module, and
 * no path from any of it into a number.
 *
 * A YES CHANGES NOTHING ABOUT ANY SCORE, in either direction. Nothing here
 * is imported by ./scoring.ts, and ./scoring.ts takes no argument this
 * module could reach. That is the enforcement: not a rule somebody has to
 * remember, but an absence of the wire that would let it happen.
 *
 * THE MEMBER SEES THE RESPONSE IMMEDIATELY AND AUTOMATICALLY. There is no
 * coach approval step anywhere in this file or in the screen that renders
 * it. `safetyResponseFor` is a pure lookup, so the sentence is on screen
 * in the same frame as her tap.
 *
 * THE COACH SEES THE FLAGGED ANSWER PINNED, separately from everything
 * else. `firedRedFlags` is what the coach panel pins, in the flags' own
 * order with their own level, above every band and every association.
 */

import type {
  BodySystemsRedFlag,
  BodySystemsRedFlagAnswers,
  BodySystemsSafetyLevel,
} from './types';

export type FiredRedFlag = {
  flagKey: string;
  prompt: string;
  level: 1 | 2;
  /** The level's name, for the coach's pin. */
  levelLabel: string;
  /** The exact words she was shown the instant she answered Yes. */
  memberResponse: string;
};

/** The response for one level, or null when the level has no stored row. */
export function safetyResponseFor(
  levels: readonly BodySystemsSafetyLevel[],
  level: 1 | 2
): BodySystemsSafetyLevel | null {
  return levels.find((entry) => entry.level === level) ?? null;
}

/**
 * Every flag she answered Yes to, in the flags' own fixed order.
 *
 * Only a literal `true` counts. An unanswered flag, a missing key and any
 * other stored value all read as No, which is the direction that never
 * invents a safety event that did not happen.
 */
export function firedRedFlags(
  flags: readonly BodySystemsRedFlag[],
  levels: readonly BodySystemsSafetyLevel[],
  answers: BodySystemsRedFlagAnswers
): FiredRedFlag[] {
  return flags
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((flag) => answers[flag.flagKey] === true)
    .map((flag) => {
      const level = safetyResponseFor(levels, flag.level);
      return {
        flagKey: flag.flagKey,
        prompt: flag.prompt,
        level: flag.level,
        levelLabel: level?.label ?? '',
        memberResponse: level?.memberResponse ?? '',
      };
    });
}

/** Only readable Yes or No values survive, so a hand made request cannot store anything else. */
export function sanitizeRedFlagAnswers(
  flags: readonly BodySystemsRedFlag[],
  raw: unknown
): BodySystemsRedFlagAnswers {
  const clean: BodySystemsRedFlagAnswers = {};
  if (!raw || typeof raw !== 'object') return clean;
  const source = raw as Record<string, unknown>;
  for (const flag of flags) {
    const value = source[flag.flagKey];
    if (typeof value === 'boolean') clean[flag.flagKey] = value;
  }
  return clean;
}
