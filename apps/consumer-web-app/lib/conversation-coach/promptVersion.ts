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
 *
 * v4: Root rebrand — the coach now has a name (Root) instead of only a
 * generic "your MEF Coach" identity, with sharper instructions on tone
 * (calm, premium, never corporate or overly cheerful) and an explicit rule
 * against ever exposing technical/system details. No change to safety,
 * scope, or provider behavior.
 *
 * v5: Natural-conversation refinement — the fixed 6-step response
 * structure is now framed as optional ingredients, not a checklist, with
 * explicit permission (and an example) to answer a plain question
 * plainly in a sentence or two instead of always running it through the
 * full coaching structure. Adds explicit natural-continuity guidance (this
 * conversation's own recent turns, not just cross-session memory) and
 * drops habitual greetings/closing questions. No change to safety, scope,
 * or provider behavior.
 */
export const CONVERSATION_COACH_PROMPT_VERSION = 'conversation-coach-prompt-v5';
