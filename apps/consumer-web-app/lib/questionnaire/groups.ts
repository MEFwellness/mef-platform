/**
 * How many questions stand on one screen, and which screen a question is on.
 *
 * TWO OR THREE, NEVER ONE ALONE AND NEVER A WALL. A screen carrying ten
 * questions is a form, and a screen carrying one is a slot machine: she
 * taps, the screen changes, she taps again, and she never gets to read two
 * related things side by side. Three is the working size, and the only
 * reason a screen holds two is to stop the last screen of a section from
 * holding one.
 *
 * THE UNEVEN CASE IS THE WHOLE POINT OF THIS MODULE. A section of ten
 * questions cut greedily into threes leaves a final screen with a single
 * question on it, which looks like a mistake. So a run that would end in a
 * one is rebalanced into twos at the tail: ten becomes 3, 3, 2, 2 rather
 * than 3, 3, 3, 1, and seven becomes 3, 2, 2 rather than 3, 3, 1. A
 * section that genuinely holds one question still gets one screen, because
 * there is nothing to balance it against.
 *
 * GROUPS NEVER CROSS A SECTION. Callers chunk one section at a time, so a
 * screen is always inside a single section and the transition between two
 * sections always falls between two screens.
 *
 * PURE, AND SHARED. Both takers use this (the generic points scored
 * questionnaire and the Body Systems Survey), so the grouping is one rule
 * in one place rather than two implementations that drift.
 */

/** The working size. A screen holds this many unless the tail needs balancing. */
export const QUESTIONS_PER_SCREEN = 3;

/** The smallest a balanced screen may be when there is more than one question. */
export const MIN_QUESTIONS_PER_SCREEN = 2;

/**
 * The size of each screen for a run of `count` questions.
 *
 * Returns an empty list for a count of zero, so a caller can map over it
 * without a special case.
 */
export function groupSizes(count: number): number[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const whole = Math.floor(count);
  if (whole <= QUESTIONS_PER_SCREEN) return [whole];

  const sizes: number[] = [];
  let left = whole;
  while (left > 0) {
    // Four left would otherwise become 3 then 1. Two and two instead.
    if (left === QUESTIONS_PER_SCREEN + 1) {
      sizes.push(MIN_QUESTIONS_PER_SCREEN);
      left -= MIN_QUESTIONS_PER_SCREEN;
      continue;
    }
    const take = Math.min(QUESTIONS_PER_SCREEN, left);
    sizes.push(take);
    left -= take;
  }
  return sizes;
}

/** One run of questions, cut into the screens it will be shown on. */
export function chunkIntoGroups<T>(items: readonly T[]): T[][] {
  const groups: T[][] = [];
  let cursor = 0;
  for (const size of groupSizes(items.length)) {
    groups.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}

/**
 * Which screen the item at `itemIndex` is on.
 *
 * This is what resume is built on: a stored position is a question, and
 * the screen it belongs to is derived rather than stored a second time.
 * An index past the end lands on the last screen rather than nowhere.
 */
export function groupIndexForItem(itemCount: number, itemIndex: number): number {
  const sizes = groupSizes(itemCount);
  if (sizes.length === 0) return 0;
  if (!Number.isFinite(itemIndex) || itemIndex <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < sizes.length; index += 1) {
    seen += sizes[index]!;
    if (itemIndex < seen) return index;
  }
  return sizes.length - 1;
}

/** The number of the first question on screen `groupIndex`, counting from one. */
export function firstItemNumberInGroup(itemCount: number, groupIndex: number): number {
  const sizes = groupSizes(itemCount);
  let before = 0;
  for (let index = 0; index < groupIndex && index < sizes.length; index += 1) {
    before += sizes[index]!;
  }
  return before + 1;
}
