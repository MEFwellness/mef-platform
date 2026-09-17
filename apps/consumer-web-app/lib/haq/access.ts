/**
 * Who the Health Appraisal is open to. One rule, and every surface of it is
 * on one side of it: the shelf card, the route, and every write.
 *
 * THE ASSIGNMENT IS THE WHOLE GATE. A coach assigned it to this member, or
 * she is not offered it. No plan opens it at any level, which is why it has
 * no entry in lib/assessment-registry/registry.ts (that file is the plan
 * map) and sits with the other coach assign only questionnaires instead.
 *
 *   an open assignment    she may begin, or carry on with her open instance
 *   no open assignment,   she may read the instance she finished
 *   but a finished one
 *   neither               not offered, and a direct URL sends her Home
 *
 * AN OPEN INSTANCE WITHOUT AN OPEN ASSIGNMENT IS NOT OFFERED. That happens
 * only when a coach withdraws an assignment she had started, and the
 * assignment is the gate. Finishing closes the assignment in the same
 * transaction (migrations 100 and 144), so a member who finishes never
 * passes through that state.
 *
 * FAILS SHUT. A read that did not work resolves to "not offered", because
 * handing a member something her coach never gave her is the worse mistake.
 *
 * NOT THE ONLY CHECK. The database refuses a member opening an instance
 * without a pending assignment (migration 263), and every server action
 * re-asks this before it writes.
 */

import type { HaqAssignment, HaqInstanceRow, Read } from './data';

export type HaqState =
  /** Assigned, nothing open yet. The intro screen, then Begin. */
  | { status: 'pending'; assignmentId: string; assignedAt: string; hasFinishedBefore: boolean }
  /** Assigned, and an instance is open. */
  | { status: 'in_progress'; assignmentId: string; assignedAt: string; sessionId: string }
  /** Nothing assigned, and she has finished one. */
  | { status: 'completed'; sessionId: string; completedAt: string | null };

export function resolveHaqState(input: {
  assignment: Read<HaqAssignment | null>;
  open: Read<HaqInstanceRow | null>;
  completed: Read<HaqInstanceRow | null>;
}): HaqState | null {
  if (!input.assignment.ok) return null;
  const assignment = input.assignment.value;

  if (assignment) {
    if (!input.open.ok) return null;
    if (input.open.value) {
      return {
        status: 'in_progress',
        assignmentId: assignment.id,
        assignedAt: assignment.createdAt,
        sessionId: input.open.value.id,
      };
    }
    return {
      status: 'pending',
      assignmentId: assignment.id,
      assignedAt: assignment.createdAt,
      hasFinishedBefore: input.completed.ok && input.completed.value !== null,
    };
  }

  if (!input.completed.ok || !input.completed.value) return null;
  return {
    status: 'completed',
    sessionId: input.completed.value.id,
    completedAt: input.completed.value.completedAt,
  };
}
