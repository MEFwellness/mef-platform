/**
 * Section 16's fallback experience — if the LLM provider is unavailable
 * or fails, the member must never see a broken blank chat. This builds a
 * calm, honest reply from the same real Coaching Brain decision every
 * other surface already shows (never a fabricated generic message), and
 * server.ts always offers a retry + coach handoff alongside it.
 */

import type { ConversationContext } from './context';

/**
 * The shared reply used when a safety evaluation blocks a generated
 * message entirely (lib/conversation-coach/safety.ts's guardConversationReply)
 * and when a member's own message is itself blocked before any reply is
 * generated (lib/conversation-coach/service.ts's NO_LLM_LEVELS branch,
 * when there is no approved safety_message_templates row to show
 * instead). A single exported constant so both call sites stay in sync
 * and the copy is unit-testable in one place.
 */
export const SAFETY_BLOCKED_REPLY_FALLBACK =
  "I want to make sure you get the right support for this. Let's bring your assigned coach into this conversation.";

export function buildFallbackReply(context: ConversationContext): string {
  const action = context.todaysAction
    ? ` In the meantime, here's one thing worth trying: ${context.todaysAction.charAt(0).toLowerCase()}${context.todaysAction.slice(1)}`
    : '';

  return (
    `Give me just a moment, I'm having a little trouble connecting right now. ` +
    `Your focus for today is still ${context.focusLabel.toLowerCase()}.${action} ` +
    `Try sending that again in a bit and we'll keep going, or ask your assigned coach to take a look.`
  );
}
