/**
 * Human Coach Handoff (section 10) — a member-initiated request for their
 * assigned coach to review or follow up on a conversation. Distinct from
 * (but sits alongside) the Coaching Safety System's own
 * safety_review_queue: a handoff can be requested for entirely non-safety
 * reasons ("I don't feel comfortable continuing here"), so this is its own
 * lightweight record rather than shoehorned into that queue.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationHandoff, ConversationHandoffUrgency } from '@mef/shared-types-contracts';
import { resolveAssignedCoach } from '@/lib/safety/data';
import { insertMessage } from './data';
import { insertHandoff } from './data';

export async function requestHandoff(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  memberNote: string | null,
  urgency: ConversationHandoffUrgency
): Promise<ConversationHandoff | null> {
  const assignedCoachId = await resolveAssignedCoach(supabase, memberId);
  const handoff = await insertHandoff(supabase, {
    sessionId,
    memberId,
    assignedCoachId,
    memberNote,
    urgency,
  });

  if (handoff) {
    // A visible, honest record in the transcript itself — never promises
    // an immediate human response (section 10), only that the request was
    // received.
    await insertMessage(supabase, {
      sessionId,
      memberId,
      role: 'system',
      content: assignedCoachId
        ? "I've let your coach know you'd like them to follow up on this conversation. They'll respond as soon as they're able to."
        : "I've flagged this conversation for coach follow-up. A coach will be assigned to respond as soon as possible.",
      sourcePage: 'conversation_coach',
    });
  }

  return handoff;
}
