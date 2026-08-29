/**
 * The one question every surface in this feature asks: what is this
 * member's Stress & Load Deep-Dive state right now.
 *
 * Three answers, and only three:
 *
 *   null       not offered. Her coach has not assigned it and she has
 *              never finished one. The pop-up chain, Home and the route all
 *              treat this identically, which is what makes the assignment
 *              the whole gate rather than three gates that could drift.
 *   pending    assigned and unfinished. Carries the assignment id the
 *              submit will answer.
 *   completed  finished. Carries the stored answers and the stored reading.
 *
 * ONE COMPOSITION, ONE ANSWER. Home renders the pop-up chain and the
 * persistent card in the same pass, and the server action re-asks the same
 * question before it writes. ./view.ts memoizes this per request so all of
 * them are handed the identical object rather than each running its own
 * queries and each reaching its own conclusion.
 *
 * READS ONLY. Nothing in this path writes anything, including on the render
 * that produces the pop-up. See ./data.ts's header.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStressLoadAccess } from './access';
import {
  fetchPendingStressLoadAssignment,
  listStressLoadSessions,
  type StressLoadSessionRecord,
} from './data';
import { STRESS_LOAD_QUESTIONS_VERSION } from './questions';

export type StressLoadState =
  | {
      status: 'pending';
      assignmentId: string;
      assignedAt: string;
      questionsVersion: number;
    }
  | {
      status: 'completed';
      session: StressLoadSessionRecord;
    };

export async function buildStressLoadState(
  supabase: SupabaseClient,
  memberId: string
): Promise<StressLoadState | null> {
  const assignmentRead = await fetchPendingStressLoadAssignment(supabase, memberId);

  // Her history is only read when there is no open assignment. A member her
  // coach has just assigned is the common case on Home's critical path and
  // her answer does not depend on what she finished last month.
  const sessionRead =
    assignmentRead.ok && !assignmentRead.assignment
      ? await listStressLoadSessions(supabase, memberId, 1)
      : { ok: true, records: [] };

  // ONE DECISION, MADE IN ONE PLACE. This function does not re-check
  // anything resolveStressLoadAccess already decides; it only turns that
  // decision into the shape the surfaces render. A second copy of the rule
  // here is exactly how "why can she not see it" stops having one answer.
  const access = resolveStressLoadAccess({ assignmentRead, sessionRead });
  switch (access.kind) {
    case 'assigned':
      return {
        status: 'pending',
        assignmentId: access.assignment.id,
        assignedAt: access.assignment.createdAt,
        questionsVersion: STRESS_LOAD_QUESTIONS_VERSION,
      };
    case 'completed':
      return { status: 'completed', session: access.session };
    case 'none':
      return null;
  }
}
