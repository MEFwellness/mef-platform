/**
 * The one question every surface in this feature asks: what is this
 * member's MEF Body Systems Survey state right now.
 *
 * Four answers, and only four:
 *
 *   null        not offered. Her coach has not assigned it and she has
 *               never finished one.
 *   pending     assigned, and she has not started it. Carries the
 *               assignment id her first Continue will answer.
 *   in_progress assigned, started, unfinished. Carries the sitting so the
 *               route can put her back where she was.
 *   completed   finished. Carries the stored answers and the stored
 *               results.
 *
 * ONE COMPOSITION, ONE ANSWER. Home renders the pop-up chain and the
 * persistent card in the same pass, and the server actions re-ask the same
 * question before they write. ./view.ts memoizes this per request so all
 * of them are handed the identical object.
 *
 * READS ONLY. Nothing in this path writes anything, including on the
 * render that produces the pop-up.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BODY_SYSTEMS_CONTENT_VERSION } from './constants';
import { resolveBodySystemsAccess } from './access';
import {
  fetchBodySystemsSessionForAssignment,
  fetchMemberBranch,
  fetchPendingBodySystemsAssignment,
  listBodySystemsSessions,
  type BodySystemsSessionRecord,
} from './data';
import type { BodySystemsBranch } from './types';

export type BodySystemsState =
  | {
      status: 'pending';
      assignmentId: string;
      assignedAt: string;
      contentVersion: number;
      /** Her remembered branch, so the branch question is never re-asked. Null before her first sitting. */
      rememberedBranch: BodySystemsBranch | null;
    }
  | {
      status: 'in_progress';
      assignmentId: string;
      assignedAt: string;
      contentVersion: number;
      rememberedBranch: BodySystemsBranch | null;
      session: BodySystemsSessionRecord;
    }
  | {
      status: 'completed';
      session: BodySystemsSessionRecord;
    };

export async function buildBodySystemsState(
  supabase: SupabaseClient,
  memberId: string
): Promise<BodySystemsState | null> {
  const assignmentRead = await fetchPendingBodySystemsAssignment(supabase, memberId);

  // Her history is only read when there is no open assignment. A member her
  // coach has just assigned is the common case on Home's critical path.
  const sessionRead =
    assignmentRead.ok && !assignmentRead.assignment
      ? await listBodySystemsSessions(supabase, memberId, 1)
      : { ok: true, records: [] };

  const access = resolveBodySystemsAccess({ assignmentRead, sessionRead });

  switch (access.kind) {
    case 'assigned': {
      const [open, rememberedBranch] = await Promise.all([
        fetchBodySystemsSessionForAssignment(supabase, memberId, access.assignment.id),
        fetchMemberBranch(supabase, memberId),
      ]);

      // A finished sitting on the OPEN assignment happens for one moment
      // only: between her submit landing and migration 144's trigger
      // closing the assignment out. Reporting it as completed rather than
      // as in progress is what keeps her results screen standing through
      // that moment rather than throwing her back to the first question.
      if (open?.completedAt) return { status: 'completed', session: open };

      const shared = {
        assignmentId: access.assignment.id,
        assignedAt: access.assignment.createdAt,
        contentVersion: BODY_SYSTEMS_CONTENT_VERSION,
        rememberedBranch,
      };
      return open ? { status: 'in_progress', ...shared, session: open } : { status: 'pending', ...shared };
    }
    case 'completed':
      return { status: 'completed', session: access.session };
    case 'none':
      return null;
  }
}
