/**
 * Bump this whenever coachingNarrative.ts's system prompt changes in a way
 * that could change what Root says about a packaged-food scan. Every
 * food_analysis_results row is written once and never edited, so there is
 * no per-row version column to stamp — this constant documents the
 * prompt's history for whoever revises it next, same discipline as
 * lib/food-lens/coachingNarrativePromptVersion.ts.
 *
 * v1: initial version — Root explains the MEF Nutrition Rules Engine's
 * already-computed, deterministic findings in the Supports You / Things to
 * Be Mindful Of / Best Fit / Rooted Reset Recommendation format, from those
 * findings plus real member context only. Never re-derives the findings
 * themselves.
 *
 * v2: Nutrition Intelligence Service integration — the prompt now also
 * receives the member's self-reported Primal Pattern Assessment result
 * (via lib/nutrition-intelligence/service.ts) and the shared
 * nutrition-coaching hard rules (lib/nutrition-intelligence/
 * coachingGuardrails.ts: expanded forbidden phrase list, no bare
 * carb/protein/fat directives). Generation is now also short-circuited
 * (no LLM call) for a member with an active Nutrition Safety Override.
 */
export const FOOD_PRODUCT_COACHING_PROMPT_VERSION = 'food-product-coaching-prompt-v2';
