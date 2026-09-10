/**
 * Who the MEF Body Systems Survey is for. One rule, and every surface in
 * the feature is on one side of it.
 *
 * THE ASSIGNMENT IS THE WHOLE GATE. A coach assigned it to this member, or
 * she is not offered it. No tier lock, no visibility layer key, no grant
 * column, no second flag.
 *
 * FAILS SHUT. A failed read of her assignments resolves to "not offered"
 * rather than to "offered", because the cost of being wrong the other way
 * is handing a member an experience her coach never gave her.
 *
 * NOT A SECURITY BOUNDARY. Row level security decides which rows an
 * account may read or write, and migration 220's insert policy requires a
 * pending assignment of her own before a sitting can be written at all.
 * This decides what is OFFERED. Both are checked: the route re-asks before
 * it renders, and every server action re-asks before it writes.
 */

import type { BodySystemsAssignment, BodySystemsSessionRecord } from './data';

export type BodySystemsAccess =
  /** She has an open assignment, finished or not. */
  | { kind: 'assigned'; assignment: BodySystemsAssignment }
  /** No open assignment, but she has finished at least one sitting before. */
  | { kind: 'completed'; session: BodySystemsSessionRecord }
  /** Never assigned, or the read failed. Nothing is shown, and the route turns her away. */
  | { kind: 'none' };

export function resolveBodySystemsAccess(input: {
  assignmentRead: { ok: boolean; assignment: BodySystemsAssignment | null };
  sessionRead: { ok: boolean; records: BodySystemsSessionRecord[] };
}): BodySystemsAccess {
  if (!input.assignmentRead.ok) return { kind: 'none' };
  if (input.assignmentRead.assignment) {
    return { kind: 'assigned', assignment: input.assignmentRead.assignment };
  }
  if (!input.sessionRead.ok) return { kind: 'none' };
  const latest = input.sessionRead.records[0];
  if (latest) return { kind: 'completed', session: latest };
  return { kind: 'none' };
}
