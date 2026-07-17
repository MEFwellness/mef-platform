/**
 * Bump this whenever coachingNarrative.ts's system prompt changes in a way
 * that could change what Root says about a restaurant meal entry. Every
 * restaurant_meal_entries row's `analysis` is overwritten only by a fresh
 * re-analysis (never silently edited), so this constant documents the
 * prompt's history for whoever revises it next — same discipline as
 * lib/food-products/coachingNarrativePromptVersion.ts.
 *
 * v1: initial version — Root explains a menu item's deterministic
 * keyword/description heuristics (lib/restaurant/menuItemHeuristics.ts) in
 * the Supports You / Mindful Of / Modifications / Pairings / Better-Fit
 * Alternatives / Portion Guidance format, always naming the estimate_basis
 * so the member knows how much to trust the analysis.
 */
export const RESTAURANT_COACHING_PROMPT_VERSION = 'restaurant-coaching-prompt-v1';
