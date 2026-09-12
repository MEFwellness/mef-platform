/**
 * Who the Health & Lifestyle Intake is for. One rule, and every surface in
 * the feature is on one side of it.
 *
 * THE ASSIGNMENT IS THE WHOLE GATE. A coach assigned it to this member, or
 * she is not offered it. No tier lock, no visibility layer key, no grant
 * column, no second flag, and it appears in no self-serve list. Same rule
 * as every coach assigned experience beside it.
 *
 * FAILS SHUT. A failed read of her assignments resolves to "not offered"
 * rather than to "offered".
 *
 * NOT A SECURITY BOUNDARY. Row level security decides which rows an account
 * may read or write, and migration 230's insert policy requires a pending
 * assignment of her own before a sitting can be written at all. This
 * decides what is OFFERED. Both are checked: the route re-asks before it
 * renders, and every server action re-asks before it writes.
 */

import type { HliAssignment, HliSessionRecord } from './data';

export type HliAccess =
  | { kind: 'assigned'; assignment: HliAssignment }
  | { kind: 'completed'; session: HliSessionRecord }
  | { kind: 'none' };

export function resolveHliAccess(input: {
  assignmentRead: { ok: boolean; assignment: HliAssignment | null };
  sessionRead: { ok: boolean; records: HliSessionRecord[] };
}): HliAccess {
  if (!input.assignmentRead.ok) return { kind: 'none' };
  if (input.assignmentRead.assignment) {
    return { kind: 'assigned', assignment: input.assignmentRead.assignment };
  }
  if (!input.sessionRead.ok) return { kind: 'none' };
  const latest = input.sessionRead.records[0];
  if (latest) return { kind: 'completed', session: latest };
  return { kind: 'none' };
}
