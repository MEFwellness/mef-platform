/**
 * Pure decision logic for the Lead Capture Agent's conversation flow —
 * deliberately kept free of any Supabase/network call so it's directly
 * unit-testable. The route handler (app/api/lead-capture/route.ts) is the
 * only caller; it wires these decisions to persistence and the LLM call.
 *
 * Flow: opening (quick replies) -> 4 short, button-first follow-ups (where
 * / how long / what they've tried / their goal) -> a two-part insight —
 * part one names the visitor's pattern (pattern.ts) and combines it with
 * the email ask, part two is the payoff delivered only after email capture
 * -> email/name capture (up to 2 retries) -> routed to the Discovery
 * Assessment or the quiz/guide.
 */

import type { LeadConversationStage, LeadTopic, LeadTemperature, LeadRoutingDestination } from '@mef/shared-types-contracts';

const MAX_EMAIL_RETRIES = 2;

const TOPIC_KEYWORDS: Record<Exclude<LeadTopic, 'general'>, string[]> = {
  pain: ['pain', 'hurt', 'ache', 'sore', 'injur', 'stiff'],
  energy: ['energy', 'tired', 'fatigue', 'exhaust', 'sluggish'],
  sleep: ['sleep', 'insomnia', 'awake', 'rest'],
  stress: ['stress', 'anxious', 'anxiety', 'overwhelm', 'burnt out', 'burnout'],
};

/** Maps a quick-reply tap or free-typed opening message to a topic. Falls back to 'general' rather than guessing wrong. */
export function classifyTopic(input: string): LeadTopic {
  const normalized = input.trim().toLowerCase();
  for (const topic of ['pain', 'energy', 'sleep', 'stress'] as const) {
    if (normalized === topic) return topic;
  }
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS) as [
    Exclude<LeadTopic, 'general'>,
    string[],
  ][]) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return topic;
  }
  return 'general';
}

/**
 * The next stage once the current stage's turn is complete. 'insight_capture'
 * is handled separately by the route (it can loop back onto itself, up to
 * MAX_EMAIL_RETRIES times, if no valid email is found yet) rather than
 * always advancing linearly, so it isn't included in this switch's
 * forward path.
 */
export function nextStage(current: LeadConversationStage): LeadConversationStage {
  switch (current) {
    case 'opening':
      return 'follow_up_1';
    case 'follow_up_1':
      return 'follow_up_2';
    case 'follow_up_2':
      return 'follow_up_3';
    case 'follow_up_3':
      return 'follow_up_4';
    case 'follow_up_4':
      return 'insight_capture';
    case 'insight_capture':
      return 'routed';
    case 'routed':
      return 'routed';
  }
}

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** Best-effort split of a single free-text reply like "John, john@email.com" into a first name and an email. Either half can be missing. */
export function extractNameAndEmail(message: string): { name: string | null; email: string | null } {
  const emailMatch = message.match(EMAIL_PATTERN);
  const email = emailMatch ? emailMatch[0] : null;

  const withoutEmail = email ? message.replace(email, '') : message;
  const name = withoutEmail
    .replace(/[^a-zA-Z\s'-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)[0];

  return {
    email,
    name: name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : null,
  };
}

const READINESS_KEYWORDS = [
  'ready',
  'book',
  'schedule',
  "let's do",
  'sign me up',
  'when can',
  'yes please',
  'sooner',
  'asap',
];

/** High-intent = pain topic + at least one message expressing readiness to act now. Everything else is a softer, still-valuable lead. */
export function determineLeadTemperature(topic: LeadTopic, leadMessages: string[]): LeadTemperature {
  const expressedReadiness = leadMessages.some((message) => {
    const normalized = message.toLowerCase();
    return READINESS_KEYWORDS.some((keyword) => normalized.includes(keyword));
  });
  return topic === 'pain' && expressedReadiness ? 'hot' : 'warm';
}

export function determineRoutingDestination(temperature: LeadTemperature): LeadRoutingDestination {
  return temperature === 'hot' ? 'discovery_call' : 'quiz_guide';
}

export function shouldRetryEmailCapture(retryCount: number): boolean {
  return retryCount < MAX_EMAIL_RETRIES;
}

export { MAX_EMAIL_RETRIES };
