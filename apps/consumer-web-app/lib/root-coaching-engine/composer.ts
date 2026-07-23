/**
 * Coaching Message Composer (Prompt 13) — enforces the Observation ->
 * Explanation -> Action -> Encouragement shape and the length rules for
 * each surface. Pure: takes a conversation type + already-built template
 * context, returns the three surface-specific strings. Never generates an
 * essay — a defensive word-count trim backstops the templates, which are
 * already written short enough that it should never trigger in practice.
 */

import { buildTemplateParts, type TemplateContext } from './templates';
import type { ComposedCoachingMessage, ConversationType } from './types';

const MAX_COACHING_CARD_WORDS = 120;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(' ').replace(/[,.;:]+$/, '')}…`;
}

export function composeCoachingMessage(
  conversationType: ConversationType,
  ctx: TemplateContext
): ComposedCoachingMessage {
  const { observation, explanation, action, encouragement } = buildTemplateParts(conversationType, ctx);

  const dashboardLine = observation;
  const chatPreview = `${observation} ${action}`;
  const fullCard = `${observation} ${explanation} ${action} ${encouragement}`;
  const coachingCard = countWords(fullCard) > MAX_COACHING_CARD_WORDS ? trimToWordLimit(fullCard, MAX_COACHING_CARD_WORDS) : fullCard;

  return { dashboardLine, chatPreview, coachingCard };
}
