/**
 * Pantry coaching suggestions — product requirement §9's "simple meal
 * combinations using available foods." Deterministic and reviewable, no LLM
 * call, matching this codebase's "coaching judgment is deterministic, an
 * LLM only narrates when truly needed" discipline (see
 * lib/food-products/rulesEngine's header). Suggestions are built entirely
 * from which food categories are actually present among the member's
 * *active* pantry items and which specific items represent them — never a
 * static canned sentence, and never a health/quality verdict on the items
 * themselves (this module only observes what combination of categories is
 * on hand, the same restraint fatQuality.ts and ingredientQuality.ts apply
 * to a single product).
 *
 * Only 'protein' | 'carb' | 'fat' | 'vegetable' items participate — an item
 * categorized 'mixed' or 'unknown' (or with no category at all) doesn't
 * represent a clean single-category signal, so it's left out of combo-
 * building rather than guessed into a bucket. Fewer than two distinct
 * categories present yields no suggestions at all: a single food doesn't
 * make a "combination," and forcing one for e.g. "just eggs" would be
 * exactly the "generic filler" this feature is supposed to avoid.
 */

import type { FoodLensFoodCategory } from '@mef/shared-types-contracts';

export type PantrySuggestionItem = {
  name: string;
  category: FoodLensFoodCategory | null;
};

type ComboCategory = 'protein' | 'carb' | 'fat' | 'vegetable';

const COMBO_CATEGORIES: ComboCategory[] = ['protein', 'carb', 'fat', 'vegetable'];

function isComboCategory(category: FoodLensFoodCategory | null): category is ComboCategory {
  return (
    category === 'protein' || category === 'carb' || category === 'fat' || category === 'vegetable'
  );
}

function listNames(items: PantrySuggestionItem[]): string {
  const names = items.map((i) => i.name);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(', ')}, and ${last}`;
}

type ComboRule = {
  categories: ComboCategory[];
  build: (picks: Record<ComboCategory, PantrySuggestionItem>) => string;
};

// Ordered richest-combo-first so a 3-category match is preferred over a
// 2-category subset of the same items (see the subset-skip logic below).
const RULES: ComboRule[] = [
  {
    categories: ['protein', 'vegetable', 'fat'],
    build: (p) =>
      `You already have ${listNames([p.protein, p.vegetable, p.fat])} available. These could create a protein-rich meal with whole-food fats and vegetables.`,
  },
  {
    categories: ['protein', 'carb', 'vegetable'],
    build: (p) =>
      `${listNames([p.protein, p.carb, p.vegetable])} are all on hand — enough for a balanced plate covering protein, a carbohydrate source, and vegetables.`,
  },
  {
    categories: ['protein', 'carb', 'fat'],
    build: (p) =>
      `With ${listNames([p.protein, p.carb, p.fat])} in your pantry, you have what you'd need for a filling meal that covers protein, carbohydrate, and fat.`,
  },
  {
    categories: ['carb', 'vegetable', 'fat'],
    build: (p) =>
      `${listNames([p.carb, p.vegetable, p.fat])} could come together as a simple plant-forward meal.`,
  },
  {
    categories: ['protein', 'vegetable'],
    build: (p) =>
      `You have ${p.protein.name} and ${p.vegetable.name} on hand — a quick base for a protein-and-vegetable plate.`,
  },
  {
    categories: ['protein', 'fat'],
    build: (p) =>
      `${p.protein.name} and ${p.fat.name} are both available — a simple pairing if you want something protein-forward with a satisfying fat source.`,
  },
  {
    categories: ['protein', 'carb'],
    build: (p) =>
      `${p.protein.name} and ${p.carb.name} are both in your pantry — a straightforward base for a filling meal.`,
  },
  {
    categories: ['carb', 'fat'],
    build: (p) =>
      `${p.carb.name} and ${p.fat.name} are on hand for a simple, energy-dense combination.`,
  },
  {
    categories: ['carb', 'vegetable'],
    build: (p) =>
      `${p.carb.name} and ${p.vegetable.name} are both available for a simple plant-forward side or light meal.`,
  },
  {
    categories: ['vegetable', 'fat'],
    build: (p) =>
      `${p.vegetable.name} and ${p.fat.name} are on hand — enough for a simple dressed vegetable dish.`,
  },
];

function isSubset(subset: ComboCategory[], superset: Set<ComboCategory>): boolean {
  return subset.every((c) => superset.has(c));
}

/**
 * Builds 0–3 suggestion strings from the member's active pantry items.
 * Picks one representative item per category (the first one in the input
 * order — callers pass items already ordered however they want ties
 * broken, e.g. most-recently-added first) and evaluates combo rules from
 * most to least specific, skipping any rule whose categories are a strict
 * subset of a combo already emitted (no redundant "you also have X and Y"
 * once the richer "X, Y, and Z" suggestion already named the same items).
 */
export function generatePantrySuggestions(items: PantrySuggestionItem[]): string[] {
  const byCategory = new Map<ComboCategory, PantrySuggestionItem>();
  for (const item of items) {
    if (!isComboCategory(item.category)) continue;
    if (!byCategory.has(item.category)) byCategory.set(item.category, item);
  }

  const present = COMBO_CATEGORIES.filter((c) => byCategory.has(c));
  if (present.length < 2) return [];

  const suggestions: string[] = [];
  const emittedCombos: Array<Set<ComboCategory>> = [];

  for (const rule of RULES) {
    if (suggestions.length >= 3) break;
    if (!rule.categories.every((c) => byCategory.has(c))) continue;
    if (emittedCombos.some((emitted) => isSubset(rule.categories, emitted))) continue;

    const picks = {} as Record<ComboCategory, PantrySuggestionItem>;
    for (const c of rule.categories) picks[c] = byCategory.get(c)!;
    suggestions.push(rule.build(picks));
    emittedCombos.push(new Set(rule.categories));
  }

  return suggestions;
}
