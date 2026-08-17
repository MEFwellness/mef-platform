/**
 * Honesty guard: a section heading may not render with nothing under it.
 *
 * The audit caught "WHY THIS SESSION WAS SELECTED" sitting on the Movement
 * screen with no body at all, and it is not a one-off. The shape that
 * produces it is everywhere in this codebase and is easy to write by
 * accident: a heading rendered unconditionally, immediately followed by
 * `items.map(...)` over an array that is sometimes empty. When the array
 * empties, the heading survives and the member is left reading a promise
 * of content that is not there.
 *
 * This is the one place that rule is expressed. Wrap the heading AND its
 * body together, so the two can only ever appear as a pair:
 *
 *   <WhenNotEmpty items={reasons}>
 *     {(reasons) => (
 *       <>
 *         <p>Why this session was selected</p>
 *         <ul>{reasons.map(...)}</ul>
 *       </>
 *     )}
 *   </WhenNotEmpty>
 *
 * The callback receives a `NonEmptyArray`, so a caller cannot reach the
 * body branch with an empty list even by mistake. Nothing is rendered at
 * all when the list is empty, not an empty box and not a placeholder: a
 * section with nothing to say says nothing, which is the same rule
 * lib/coaching-engine/morningBrief.ts already holds itself to.
 *
 * This guard is deliberately NOT an empty state. An empty state is a
 * designed thing a screen chooses to show ("I don't have anything to tell
 * you yet"), and several screens rightly have one. This is for the case
 * where nobody chose anything and a heading was simply left behind.
 *
 * tests/empty-section-headings.test.ts sweeps every member-facing screen
 * for the unguarded shape and fails the build on a new one, treating
 * either this component or an explicit length check as a real guard.
 */

import type { ReactNode } from 'react';

/** An array proven to have at least one element. */
export type NonEmptyArray<T> = [T, ...T[]];

export function isNotEmpty<T>(items: readonly T[] | null | undefined): items is NonEmptyArray<T> {
  return Array.isArray(items) && items.length > 0;
}

export function WhenNotEmpty<T>({
  items,
  children,
}: {
  items: readonly T[] | null | undefined;
  /** Rendered only when `items` has at least one element. Put the heading in here too, not outside. */
  children: (items: NonEmptyArray<T>) => ReactNode;
}) {
  if (!isNotEmpty(items)) return null;
  return <>{children(items)}</>;
}
