/**
 * The one question every surface in this feature asks: what is this
 * member's Your Own Company state right now.
 *
 * Three answers, and only three:
 *
 *   null       not offered. Her coach has not assigned it and she has never
 *              finished one. The pop-up chain, Home and the route all treat
 *              this identically, which is what makes the assignment the
 *              whole gate rather than three gates that could drift.
 *   pending    assigned and unfinished. Carries the assignment id the
 *              submit will answer, whatever she has already written, and
 *              whatever she has already picked.
 *   completed  finished. Carries her answers and her picks.
 *
 * ONE COMPOSITION, ONE ANSWER. Home renders the pop-up chain and the
 * persistent card in the same pass, and every server action re-asks the
 * same question before it writes. ./view.ts memoizes this per request so
 * all of them are handed the identical object rather than each running its
 * own queries and each reaching its own conclusion.
 *
 * READS ONLY. Nothing in this path writes anything, including the draft
 * row. See ./data.ts's header.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveYocAccess } from './access';
import {
  fetchYocSessionForAssignment,
  fetchPendingYocAssignment,
  listYocSessions,
  type YocSessionRecord,
} from './data';
import { YOC_QUESTIONS_VERSION, type YocDraft } from './questions';
import { YOC_EMPTY_INSTINCT, type YocInstinctState } from './instinct';

export type YocState =
  | {
      status: 'pending';
      assignmentId: string;
      assignedAt: string;
      questionsVersion: number;
      /** What she has written so far, empty when she has not started. */
      draft: YocDraft;
      /** What she has picked so far, empty when she has not started. */
      instinct: YocInstinctState;
    }
  | {
      status: 'completed';
      session: YocSessionRecord;
    };

export async function buildYocState(
  supabase: SupabaseClient,
  memberId: string
): Promise<YocState | null> {
  const assignmentRead = await fetchPendingYocAssignment(supabase, memberId);

  // Her history is only read when there is no open assignment. A member her
  // coach has just assigned is the common case on Home's critical path and
  // her answer does not depend on what she finished last month.
  const sessionRead =
    assignmentRead.ok && !assignmentRead.assignment
      ? await listYocSessions(supabase, memberId, 1)
      : { ok: true, records: [] };

  // ONE DECISION, MADE IN ONE PLACE. This function does not re-check
  // anything resolveYocAccess already decides; it only turns that decision
  // into the shape the surfaces render.
  const access = resolveYocAccess({ assignmentRead, sessionRead });
  switch (access.kind) {
    case 'assigned': {
      // Only now, on the route that is genuinely about to show her the
      // questions, is the draft read. Home's card and the pop-up need the
      // assignment id and nothing else, and this is one extra query on a
      // path a member is waiting on.
      const draftRow = await fetchYocSessionForAssignment(
        supabase,
        memberId,
        access.assignment.id
      );
      const resumable = draftRow && !draftRow.completedAt ? draftRow : null;

      return {
        status: 'pending',
        assignmentId: access.assignment.id,
        assignedAt: access.assignment.createdAt,
        questionsVersion: YOC_QUESTIONS_VERSION,
        draft: resumable?.draft ?? {},
        instinct: resumable?.instinct ?? YOC_EMPTY_INSTINCT,
      };
    }
    case 'completed':
      return { status: 'completed', session: access.session };
    case 'none':
      return null;
  }
}
