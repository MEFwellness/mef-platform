/**
 * Core Values Snapshot — Q12's dynamic two-option generation. Pure, no I/O.
 * Q12 always offers the two highest-scoring areas from Q1-Q4 alone (never
 * Q11, which hasn't been asked yet at this point in the flow) — with a
 * named tiebreak: if three or more areas are tied for the top score
 * (including the Q4 answer's own area), Q4's pick is pitted against
 * whichever other tied-or-lower area is next highest, rather than an
 * arbitrary pick among the tie.
 */

import { VALUE_AREAS, type ValueArea } from './constants';

export function generateQ12Options(
  importanceThroughQ4: Record<ValueArea, number>,
  q4Answer: ValueArea
): [ValueArea, ValueArea] {
  const maxScore = Math.max(...VALUE_AREAS.map((a) => importanceThroughQ4[a]));
  const tiedAtMax = VALUE_AREAS.filter((a) => importanceThroughQ4[a] === maxScore);

  if (tiedAtMax.length >= 3 && importanceThroughQ4[q4Answer] === maxScore) {
    const others = VALUE_AREAS.filter((a) => a !== q4Answer).sort(
      (a, b) => importanceThroughQ4[b] - importanceThroughQ4[a] || VALUE_AREAS.indexOf(a) - VALUE_AREAS.indexOf(b)
    );
    return [q4Answer, others[0]!];
  }

  const ranked = [...VALUE_AREAS].sort(
    (a, b) => importanceThroughQ4[b] - importanceThroughQ4[a] || VALUE_AREAS.indexOf(a) - VALUE_AREAS.indexOf(b)
  );
  return [ranked[0]!, ranked[1]!];
}
