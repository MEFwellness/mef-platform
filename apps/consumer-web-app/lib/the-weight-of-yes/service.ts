/**
 * The one question every surface in this feature asks: what is this
 * member's The Weight of Yes state right now.
 *
 * Three answers, and only three:
 *
 *   null       not offered. Her coach has not assigned it and she has never
 *              finished one. The pop-up chain, Home and the route all treat
 *              this identically, which is what makes the assignment the
 *              whole gate rather than three gates that could drift.
 *   pending    assigned and unfinished. Carries the assignment id the
 *              submit will answer, whatever she has already written, and
 *              which version of question one she is being shown.
 *   completed  finished. Carries her nine answers.
 *
 * THE FOLLOW-UP IS RESOLVED HERE AND NOWHERE ELSE ON THE READ PATH, in two
 * different ways depending on whether her sitting exists yet:
 *
 *   no row yet   the question is asked live, so a member who finished the
 *                earlier template after the assignment landed but before
 *                she opened this one still gets the follow-up. That is the
 *                delivery-time check.
 *   row exists   the STORED flag decides, because it records the version
 *                of question one she was actually shown. Nothing that
 *                happens mid-sitting rewrites a question she has answered.
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
import { resolveTwoyAccess } from './access';
import {
  fetchTwoySessionForAssignment,
  fetchPendingTwoyAssignment,
  listTwoySessions,
  type TwoySessionRecord,
} from './data';
import { resolveTwoyFollowUp, resolveTwoyFollowUpForRow, type TwoyFollowUp } from './followUp';
import { TWOY_QUESTIONS_VERSION, type TwoyDraft } from './questions';

export type TwoyState =
  | {
      status: 'pending';
      assignmentId: string;
      assignedAt: string;
      questionsVersion: number;
      /** What she has written so far, empty when she has not started. */
      draft: TwoyDraft;
      /**
       * Set only when question one runs in its follow-up version. Null is
       * the standalone version, and a null here means the screens say
       * nothing at all about any other experience.
       */
      followUp: TwoyFollowUp | null;
    }
  | {
      status: 'completed';
      session: TwoySessionRecord;
    };

export async function buildTwoyState(
  supabase: SupabaseClient,
  memberId: string
): Promise<TwoyState | null> {
  const assignmentRead = await fetchPendingTwoyAssignment(supabase, memberId);

  // Her history is only read when there is no open assignment. A member her
  // coach has just assigned is the common case on Home's critical path and
  // her answer does not depend on what she finished last month.
  const sessionRead =
    assignmentRead.ok && !assignmentRead.assignment
      ? await listTwoySessions(supabase, memberId, 1)
      : { ok: true, records: [] };

  // ONE DECISION, MADE IN ONE PLACE. This function does not re-check
  // anything resolveTwoyAccess already decides; it only turns that decision
  // into the shape the surfaces render. In particular the follow-up below
  // is resolved AFTER the gate has already said yes, so it can never be
  // part of the gate.
  const access = resolveTwoyAccess({ assignmentRead, sessionRead });
  switch (access.kind) {
    case 'assigned': {
      // Only now, on the route that is genuinely about to show her the
      // questions, is the draft read. Home's card and the pop-up need the
      // assignment id and nothing else, and this is one extra query on a
      // path a member is waiting on.
      const draftRow = await fetchTwoySessionForAssignment(
        supabase,
        memberId,
        access.assignment.id
      );

      const followUp = draftRow
        ? await resolveTwoyFollowUpForRow(
            supabase,
            memberId,
            draftRow.followUpSourceExperienceKey
          )
        : await resolveTwoyFollowUp(supabase, memberId);

      return {
        status: 'pending',
        assignmentId: access.assignment.id,
        assignedAt: access.assignment.createdAt,
        questionsVersion: TWOY_QUESTIONS_VERSION,
        draft: draftRow?.completedAt ? {} : (draftRow?.draft ?? {}),
        followUp,
      };
    }
    case 'completed':
      return { status: 'completed', session: access.session };
    case 'none':
      return null;
  }
}
