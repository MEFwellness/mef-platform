/**
 * Primal Pattern Assessment — premium results content. Presentation-layer
 * configuration only: nothing here is read by the scoring engine
 * (lib/primal-pattern/scoring.ts) or persisted anywhere, and none of it
 * changes what a member's Polar/Variable/Equatorial result *is* — see
 * Prompt 1's architecture, which this prompt is explicitly told not to
 * touch. This file is the "config in code" home for everything the
 * premium results dashboard renders beyond the raw record.
 *
 * IMPORTANT: no finalized, practitioner-approved macro/portion ruleset
 * exists yet for this product. Every numeric value below (macro splits,
 * portion counts, meal examples) is a clearly-labeled educational
 * illustration of the *shape* of guidance a result tends to produce, not
 * a clinical prescription — every UI surface that renders these values
 * must keep that disclaimer visible, not just this comment. Swap this
 * file's values for an approved dataset when one exists; nothing else
 * needs to change (every component here reads through this config, never
 * a hardcoded number of its own).
 */

import type { PrimalPatternResult } from '../types';

export const EDUCATIONAL_EXAMPLE_DISCLAIMER =
  'Educational example, not a personalized prescription. Your coach will help tailor this to you.';

// ---------------------------------------------------------------------------
// Visual Fuel Balance — Protein / Healthy Fat / Carbohydrate
// ---------------------------------------------------------------------------

export type FuelMacro = 'protein' | 'fat' | 'carbohydrate';

export type FuelBalance = {
  protein: number;
  fat: number;
  carbohydrate: number;
};

/** Deep Forest / Gold / Amber, in that order, matching the macro order requested. */
export const FUEL_MACRO_COLOR: Record<FuelMacro, string> = {
  protein: '#1B3A2D', // Deep Forest
  fat: '#C9A227', // Gold
  carbohydrate: '#F59E0B', // Amber
};

export const FUEL_MACRO_LABEL: Record<FuelMacro, string> = {
  protein: 'Protein',
  fat: 'Healthy Fat',
  carbohydrate: 'Carbohydrates',
};

/** Illustrative relative emphasis per result, not a prescribed macro target. Each row sums to 100 for a readable bar chart. */
export const FUEL_BALANCE_BY_RESULT: Record<PrimalPatternResult, FuelBalance> = {
  polar: { protein: 40, fat: 35, carbohydrate: 25 },
  variable: { protein: 30, fat: 30, carbohydrate: 40 },
  equatorial: { protein: 20, fat: 20, carbohydrate: 60 },
};

// ---------------------------------------------------------------------------
// Daily Plate Guide — meal frequency
// ---------------------------------------------------------------------------

export type MealFrequencyOption = 3 | 4 | 5;

export type PlateGuideMeal = {
  label: string;
  proteinPortion: string;
  fatPortion: string;
  carbPortion: string;
  vegetablePortion: string;
};

/** One entry per supported meal frequency. Portion language intentionally mirrors the Hand Portion Guide below, so the two sections read as one system. */
export const DAILY_PLATE_GUIDE: Record<MealFrequencyOption, PlateGuideMeal[]> = {
  3: [
    {
      label: 'Breakfast',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '1 fist',
    },
    {
      label: 'Lunch',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '2 fists',
    },
    {
      label: 'Dinner',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '2 fists',
    },
  ],
  4: [
    {
      label: 'Breakfast',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '1 fist',
    },
    {
      label: 'Midday Meal',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '2 fists',
    },
    {
      label: 'Afternoon Meal',
      proteinPortion: '1/2 palm',
      fatPortion: '1/2 thumb',
      carbPortion: '1/2 cupped hand',
      vegetablePortion: '1 fist',
    },
    {
      label: 'Dinner',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '2 fists',
    },
  ],
  5: [
    {
      label: 'Breakfast',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '1 fist',
    },
    {
      label: 'Mid-Morning',
      proteinPortion: '1/2 palm',
      fatPortion: '1/2 thumb',
      carbPortion: '1/2 cupped hand',
      vegetablePortion: '1 fist',
    },
    {
      label: 'Lunch',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '2 fists',
    },
    {
      label: 'Afternoon Meal',
      proteinPortion: '1/2 palm',
      fatPortion: '1/2 thumb',
      carbPortion: '1/2 cupped hand',
      vegetablePortion: '1 fist',
    },
    {
      label: 'Dinner',
      proteinPortion: '1 palm',
      fatPortion: '1 thumb',
      carbPortion: '1 cupped hand',
      vegetablePortion: '2 fists',
    },
  ],
};

export const MEAL_FREQUENCY_OPTIONS: MealFrequencyOption[] = [3, 4, 5];

/** Maps the Nutrition Intelligence Service's mealFrequency guidance onto a default plate-guide selection, so a member's own result opens on a sensible starting frequency rather than always defaulting to 3. */
export function defaultMealFrequencyFor(mealFrequency: string): MealFrequencyOption {
  if (mealFrequency === '4_to_5_smaller_meals') return 5;
  if (mealFrequency === '3_to_4_balanced_meals') return 4;
  return 3;
}

// ---------------------------------------------------------------------------
// Hand Portion Guide
// ---------------------------------------------------------------------------

export type HandPortionShape = 'palm' | 'thumb' | 'cupped-hand' | 'two-fists';

export type HandPortionGuideEntry = {
  shape: HandPortionShape;
  title: string;
  represents: string;
  description: string;
};

export const HAND_PORTION_GUIDE: HandPortionGuideEntry[] = [
  {
    shape: 'palm',
    title: 'Palm',
    represents: 'Protein',
    description:
      'One palm-sized, palm-thick portion of protein (meat, fish, eggs, or a plant-based equivalent).',
  },
  {
    shape: 'thumb',
    title: 'Thumb',
    represents: 'Healthy Fat',
    description: 'One thumb-sized portion of healthy fat (oil, nuts, seeds, or avocado).',
  },
  {
    shape: 'cupped-hand',
    title: 'Cupped Hand',
    represents: 'Carbohydrates',
    description:
      'One cupped-hand portion of carbohydrate-dense food (grains, starchy vegetables, or fruit).',
  },
  {
    shape: 'two-fists',
    title: 'Two Fists',
    represents: 'Vegetables',
    description: 'Two fists worth of non-starchy vegetables, the base of most meals.',
  },
];

// ---------------------------------------------------------------------------
// Meal Examples — configurable, expandable templates (never hardcoded per-meal-type UI)
// ---------------------------------------------------------------------------

export type MealExample = {
  slot: string;
  title: string;
  description: string;
};

/** Keyed by result so future expansion (a new meal slot, a new result) is additive. */
export const MEAL_EXAMPLES_BY_RESULT: Record<PrimalPatternResult, MealExample[]> = {
  polar: [
    {
      slot: 'Breakfast',
      title: 'Eggs with vegetables and avocado',
      description: 'A protein and healthy-fat forward start to the day.',
    },
    {
      slot: 'Lunch',
      title: 'Grilled chicken or fish with roasted vegetables',
      description: 'Protein-centered, lighter on carbohydrates.',
    },
    {
      slot: 'Dinner',
      title: 'Salmon with leafy greens and olive oil',
      description: 'A satisfying, protein and fat forward evening meal.',
    },
  ],
  variable: [
    {
      slot: 'Breakfast',
      title: 'Greek yogurt with berries and nuts',
      description: 'A balanced mix of protein, fat, and carbohydrate.',
    },
    {
      slot: 'Lunch',
      title: 'Grain bowl with protein and vegetables',
      description: 'An even split across all three macronutrients.',
    },
    {
      slot: 'Dinner',
      title: 'Lean protein with a grain and vegetables',
      description: 'A balanced plate to close out the day.',
    },
  ],
  equatorial: [
    {
      slot: 'Breakfast',
      title: 'Oatmeal with fruit and a light protein',
      description: 'Carbohydrate-forward, energizing start to the day.',
    },
    {
      slot: 'Lunch',
      title: 'Rice or quinoa bowl with vegetables and lean protein',
      description: 'Higher carbohydrate, lighter on fat.',
    },
    {
      slot: 'Dinner',
      title: 'Whole grain pasta with vegetables and a light protein',
      description: 'A carbohydrate-forward evening meal.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Education — expandable topic cards. Placeholder copy per this prompt's
// explicit instruction to prioritize structure over final wording.
// ---------------------------------------------------------------------------

export type EducationTopic = {
  id: string;
  title: string;
  summary: string;
  body: string;
};

export const EDUCATION_TOPICS: EducationTopic[] = [
  {
    id: 'energy',
    title: 'Energy',
    summary: 'How your fuel mix shapes how you feel through the day.',
    body: 'Placeholder: how the balance of protein, fat, and carbohydrate in your meals tends to affect steady energy versus energy dips throughout the day.',
  },
  {
    id: 'recovery',
    title: 'Recovery',
    summary: 'Why protein and fat support how your body repairs and rebuilds.',
    body: 'Placeholder: the general role protein and healthy fat play in recovery after activity and everyday stress.',
  },
  {
    id: 'meal-timing',
    title: 'Meal Timing',
    summary: 'How often and when you eat matters, not just what you eat.',
    body: 'Placeholder: how meal frequency and timing relate to your Primal Pattern result and everyday consistency.',
  },
  {
    id: 'satiety',
    title: 'Satiety',
    summary: 'What tends to keep you satisfied between meals.',
    body: 'Placeholder: how protein, fat, and fiber-rich carbohydrates each contribute differently to feeling satisfied after eating.',
  },
  {
    id: 'food-quality',
    title: 'Food Quality',
    summary: 'Why the source and quality of your food matters alongside the ratio.',
    body: 'Placeholder: whole, minimally processed sources of each macronutrient tend to serve this pattern better than processed alternatives.',
  },
];

// ---------------------------------------------------------------------------
// Next Steps — natural continuation into future assessments, not ads.
// ---------------------------------------------------------------------------

export type NextStepCard = {
  id: string;
  title: string;
  description: string;
  status: 'available' | 'coming_soon';
};

export const NEXT_STEP_CARDS: NextStepCard[] = [
  {
    id: 'sleep',
    title: 'Sleep',
    description: 'Understand how your sleep patterns support (or work against) your nutrition.',
    status: 'coming_soon',
  },
  {
    id: 'stress',
    title: 'Stress',
    description: 'See how everyday stress is showing up, and where to focus first.',
    status: 'coming_soon',
  },
  {
    id: 'digestion',
    title: 'Digestion',
    description: 'A closer look at how your body is responding to what you eat.',
    status: 'coming_soon',
  },
  {
    id: 'movement',
    title: 'Movement',
    description: 'Connect how you move with how you fuel.',
    status: 'coming_soon',
  },
  {
    id: 'health-history',
    title: 'Health History',
    description: 'Give your coach the fuller picture behind your results.',
    status: 'coming_soon',
  },
];
