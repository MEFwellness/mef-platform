/**
 * Bump this whenever the system prompt built by coachingNarrative.ts
 * changes in a way that could change what Root says about a scan. Every
 * food_lens_pattern_comparisons row is written once and never edited, so
 * there is no per-row version column to stamp (unlike conversation_messages,
 * which is written on every turn) — this constant instead documents the
 * prompt's history for whoever revises it next, same discipline as
 * lib/conversation-coach/promptVersion.ts.
 *
 * v1: initial version — hybrid approach (product decision): food
 * identification, macro estimation, confidence, and comparison signals stay
 * deterministic; only the coaching sentence is generated, from those
 * signals plus the member's real history/goals/Primal Pattern, grounded
 * and scope-limited the same way the main Conversation Coach prompt is.
 *
 * v2: Nutrition Intelligence Service integration — the prompt now also
 * receives the member's self-reported Primal Pattern Assessment result
 * (via lib/nutrition-intelligence/service.ts), an explicit low-confidence
 * disclosure instruction, and the shared nutrition-coaching hard rules
 * (lib/nutrition-intelligence/coachingGuardrails.ts: expanded forbidden
 * phrase list, no bare carb/protein/fat directives). Generation is now
 * also short-circuited (no LLM call) for a member with an active
 * Nutrition Safety Override — see buildHealthSafetyPriorityMessage.
 */
export const FOOD_LENS_NARRATIVE_PROMPT_VERSION = 'food-lens-narrative-prompt-v2';
