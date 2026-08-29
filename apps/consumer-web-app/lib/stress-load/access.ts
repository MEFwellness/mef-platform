/**
 * Who the Stress & Load Deep-Dive is for. One rule, and every surface in
 * the feature is on one side of it.
 *
 * THE ASSIGNMENT IS THE WHOLE GATE. A coach assigned it to this member, or
 * she is not offered it. There is no tier lock on top, no visibility layer
 * key, no grant column and no second flag. That is the standing rule
 * applied at full strength: `membership.minLevel` decides what a PLAN
 * opens, and an assignment is the one thing that can open one more thing
 * for one member. Here there is no plan half at all, so the assignment is
 * not a second lock, it is the only one.
 *
 * FAILS SHUT, the same direction lib/weekly-reflection/access.ts fails.
 * A failed read of her assignments resolves to "not offered" rather than to
 * "offered", because the cost of being wrong the other way is handing a
 * member an experience her coach never gave her.
 *
 * NOT A SECURITY BOUNDARY. Row level security is what decides which rows
 * any account may read or write, and migration 190's insert policy requires
 * a pending assignment of her own before a sitting can be written at all.
 * This is what decides what is OFFERED. Both are checked: the route re-asks
 * before it renders, and the server action re-asks before it writes.
 */

import type { StressLoadAssignment, StressLoadSessionRecord } from './data';

export type StressLoadAccess =
  /** She has an open assignment and has not finished it. */
  | { kind: 'assigned'; assignment: StressLoadAssignment }
  /** No open assignment, but she has finished at least one sitting before. */
  | { kind: 'completed'; session: StressLoadSessionRecord }
  /** Never assigned, or the read failed. Nothing is shown anywhere, and the route turns her away. */
  | { kind: 'none' };

/**
 * The one function three surfaces ask: the pop-up chain, Home's card and
 * the route itself.
 *
 * `assignmentRead.ok === false` or `sessionRead.ok === false` both resolve
 * to 'none', which is the fail-shut direction. A member whose reads are
 * broken simply does not get the invitation until they work again, and she
 * still has the whole rest of her app.
 */
export function resolveStressLoadAccess(input: {
  assignmentRead: { ok: boolean; assignment: StressLoadAssignment | null };
  sessionRead: { ok: boolean; records: StressLoadSessionRecord[] };
}): StressLoadAccess {
  if (!input.assignmentRead.ok) return { kind: 'none' };

  if (input.assignmentRead.assignment) {
    return { kind: 'assigned', assignment: input.assignmentRead.assignment };
  }

  if (!input.sessionRead.ok) return { kind: 'none' };
  const latest = input.sessionRead.records[0];
  if (latest) return { kind: 'completed', session: latest };

  return { kind: 'none' };
}
