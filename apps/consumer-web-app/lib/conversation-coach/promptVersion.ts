/**
 * Bump this whenever the system prompt built by prompt.ts changes in a way
 * that could change what the Conversation Coach says. Every coach_ai
 * message stores the version that produced it (conversation_messages.
 * prompt_version), so past replies stay auditable against the exact
 * instructions that were in effect at the time, same discipline as
 * lib/safety/policy.ts's SAFETY_POLICY_VERSION.
 *
 * v2: response-style refinement (voice, structure, writing rules) per the
 * follow-up styling task; no change to safety, scope, or provider behavior.
 *
 * v3: Wellness Intelligence Core (Milestone 9) — adds this member's
 * wellness identity highlights and internal coaching-style guidance to the
 * context block; no change to safety, scope, or provider behavior.
 */
export const CONVERSATION_COACH_PROMPT_VERSION = 'conversation-coach-prompt-v3';
