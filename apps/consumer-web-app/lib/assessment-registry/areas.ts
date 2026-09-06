/**
 * What AREA of wellness one questionnaire belongs to, said in words a
 * coach reads, in one place.
 *
 * WHY THIS EXISTS. Every registry entry already carries a `category`
 * ('nutrition_lifestyle', 'whole_body_systems', ...). That is a stable
 * internal key, chosen so gating and grouping never depend on a display
 * label, and it is exactly the kind of string the standing rules forbid
 * putting in front of a person. The coach's search field needs to match on
 * the area a template sits in, and a search that matched the raw key would
 * make "whole_body_systems" the word a coach has to type.
 *
 * ONE SOURCE OF TRUTH, and no derived fallback. There is deliberately no
 * "title-case the key" escape hatch: a category with no entry here throws,
 * and `tests/coach-assessment-search.test.ts` walks the whole registry and
 * fails the build the moment a new questionnaire arrives carrying a
 * category nobody named. The library is growing, so the guard has to be
 * the thing that notices, not a reader spotting an ugly label on a screen.
 */

import { listAssessmentRegistryEntries } from './registry';

/** Every category the registry uses today, and the words a coach reads for it. */
const AREA_LABELS: Record<string, string> = {
  behavior_change: 'Behavior Change',
  body_signals: 'Body Signals',
  health_history: 'Health History',
  holistic_balance: 'Holistic Balance',
  movement: 'Movement',
  nutrition_lifestyle: 'Nutrition and Lifestyle',
  values_alignment: 'Values and Alignment',
  whole_body_systems: 'Whole-Body Systems',
};

/**
 * The area label for one registry category.
 *
 * Throws rather than guessing. A missing entry is a build-time fact worth
 * failing on, not a screen that quietly prints an internal key.
 */
export function assessmentAreaLabel(category: string): string {
  const label = AREA_LABELS[category];
  if (!label) {
    throw new Error(
      `No area label for assessment category "${category}". Add one in lib/assessment-registry/areas.ts.`
    );
  }
  return label;
}

/** Every category the registry actually uses, for the guard test. */
export function assessmentCategoriesInUse(): string[] {
  return [...new Set(listAssessmentRegistryEntries().map((entry) => entry.category))].sort();
}

/** The labels this map knows, for the guard test. */
export function knownAreaCategories(): string[] {
  return Object.keys(AREA_LABELS).sort();
}
