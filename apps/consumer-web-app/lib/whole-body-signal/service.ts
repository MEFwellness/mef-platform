/**
 * The one question every surface in this feature asks: what is this
 * member's MEF Whole-Body Signal Assessment state right now.
 *
 * Four answers, and only four: not offered, pending, in progress, or
 * completed.
 *
 * ONE COMPOSITION, ONE ANSWER. Home renders the pop-up chain and the
 * persistent card in the same pass, and the server actions re-ask the same
 * question before they write. ./view.ts memoizes this per request so all of
 * them are handed the identical object.
 *
 * READS ONLY. Nothing in this path writes anything, including on the
 * render that produces the pop-up.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { WBS_CONTENT_VERSION } from './constants';
import { resolveWbsAccess } from './access';
import {
  fetchPendingWbsAssignment,
  fetchWbsSessionForAssignment,
  listWbsSessions,
  type WbsSessionRecord,
} from './data';

export type WbsState =
  | { status: 'pending'; assignmentId: string; assignedAt: string; contentVersion: number }
  | {
      status: 'in_progress';
      assignmentId: string;
      assignedAt: string;
      contentVersion: number;
      session: WbsSessionRecord;
    }
  | { status: 'completed'; session: WbsSessionRecord };

export async function buildWbsState(
  supabase: SupabaseClient,
  memberId: string
): Promise<WbsState | null> {
  const assignmentRead = await fetchPendingWbsAssignment(supabase, memberId);

  // Her history is only read when there is no open assignment. A member her
  // coach has just assigned is the common case on Home's critical path.
  const sessionRead =
    assignmentRead.ok && !assignmentRead.assignment
      ? await listWbsSessions(supabase, memberId, 1)
      : { ok: true, records: [] };

  const access = resolveWbsAccess({ assignmentRead, sessionRead });

  switch (access.kind) {
    case 'assigned': {
      const open = await fetchWbsSessionForAssignment(supabase, memberId, access.assignment.id);

      // A finished sitting on the OPEN assignment happens for one moment
      // only: between her submit landing and migration 144's trigger
      // closing the assignment out. Reporting it as completed rather than
      // as in progress is what keeps her results screen standing through
      // that moment rather than throwing her back to the first question.
      if (open?.completedAt) return { status: 'completed', session: open };

      const shared = {
        assignmentId: access.assignment.id,
        assignedAt: access.assignment.createdAt,
        contentVersion: WBS_CONTENT_VERSION,
      };
      return open ? { status: 'in_progress', ...shared, session: open } : { status: 'pending', ...shared };
    }
    case 'completed':
      return { status: 'completed', session: access.session };
    case 'none':
      return null;
  }
}
