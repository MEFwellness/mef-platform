/**
 * The 3-5 tappable quick-reply buttons offered alongside each follow-up
 * question — purely presentational data, decided by topic + stage, never
 * by the LLM. The free-text input stays visible and usable regardless of
 * what's returned here (public/lead-widget.js never hides it); a button
 * tap and a typed answer are handled identically by every downstream
 * consumer (flow.ts's classification, pattern.ts's rules), since both are
 * just the plain text of the button's own label.
 *
 * The buttons below are read from followUpScript.ts — the single source
 * of truth it shares with fallback.ts's question text — rather than being
 * hand-duplicated here. insight_capture has no buttons: the reply there is
 * a name + email, which isn't a multiple-choice answer.
 */

import type { LeadConversationStage, LeadTopic } from '@mef/shared-types-contracts';
import { FOLLOW_UP_SCRIPT } from './followUpScript';

/** Returns null when a stage has no buttons at all (opening's five topics are handled by the caller, since there's no incoming topic yet). */
export function getQuickReplies(
  stage: LeadConversationStage,
  topic: LeadTopic
): string[] | null {
  switch (stage) {
    case 'follow_up_1':
    case 'follow_up_2':
    case 'follow_up_3':
    case 'follow_up_4':
      return FOLLOW_UP_SCRIPT[stage][topic].buttons;
    default:
      return null;
  }
}
