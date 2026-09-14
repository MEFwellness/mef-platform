/**
 * Rooted Reset Fuel Pattern Assessment — the 24 questions, authored once.
 *
 * WHY THE CONTENT IS HERE AS WELL AS IN THE DATABASE. The instrument runs
 * on the Unified Adaptive Assessment Runtime, so the rows a member
 * actually answers live in unified_assessment_questions (migration 236)
 * and the taker reads them from there, exactly like Core Values Snapshot
 * and Readiness Pulse. But the scoring weight map has to name every
 * option value, and a weight map that names a value the database does not
 * have is a silently unscored answer.
 *
 * So this file is the single authored source, the migration's own insert
 * block is GENERATED from it (scripts/generate-fuel-pattern-sql.mjs), and
 * tests/fuel-pattern-content.test.ts regenerates that block and asserts
 * the shipped migration still matches character for character. Editing
 * one without the other fails the suite rather than shipping a question
 * whose answers score nothing.
 *
 * No em dash anywhere, by the standing rule, in a file whose strings are
 * read by a member on a screen and stored in the database.
 */

import type { FpaWeightClass } from './types';

export type FpaOption = {
  value: string;
  label: string;
  /** A second line under the label. Only the plate question uses one. */
  detail?: string;
  weight: FpaWeightClass;
  /** Set on every 'tendency' option. The code stored on her result row. */
  tendency?: string;
};

export type FpaQuestion = {
  key: string;
  /** 1 to 24, and also the display_order in the database. */
  order: number;
  section: string;
  prompt: string;
  /** Supporting text under the prompt. */
  description?: string;
  options: FpaOption[];
};

export const FPA_SECTIONS = [
  { title: 'Fuel and Satiety', order: 1 },
  { title: 'Meals Through the Day', order: 2 },
  { title: 'Appetite and Portions', order: 3 },
  { title: 'The Whole Picture', order: 4 },
] as const;

export const FPA_QUESTIONS: FpaQuestion[] = [
  {
    key: 'fpa_q1',
    order: 1,
    section: 'Fuel and Satiety',
    prompt:
      'After a meal that feels especially satisfying, how long can you usually go before becoming genuinely hungry again?',
    options: [
      { value: 'under_2h', label: 'Less than 2 hours', weight: 'protein' },
      { value: 'two_to_three_h', label: 'Around 2 to 3 hours', weight: 'balanced' },
      { value: 'three_to_four_h', label: 'Around 3 to 4 hours', weight: 'balanced' },
      { value: 'over_4h', label: '4+ hours', weight: 'carb' },
      { value: 'not_sure', label: "It varies, I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q2',
    order: 2,
    section: 'Fuel and Satiety',
    prompt: 'Which kind of meal tends to keep your energy most stable?',
    options: [
      { value: 'protein_veg_fat', label: 'Protein-rich with vegetables and some healthy fat', weight: 'protein' },
      { value: 'balanced_mix', label: 'A balanced mix of protein, carbohydrate and fat', weight: 'balanced' },
      { value: 'carb_plus_protein', label: 'A meal with plenty of carbohydrate plus some protein', weight: 'carb' },
      { value: 'no_difference', label: "I haven't noticed a difference", weight: 'neutral' },
      { value: 'depends_on_day', label: 'It depends on the day', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q3',
    order: 3,
    section: 'Fuel and Satiety',
    prompt:
      'After a carbohydrate-heavy meal such as pasta, rice, bread or cereal, how do you usually feel?',
    options: [
      { value: 'energized', label: 'Energized and satisfied', weight: 'carb' },
      { value: 'steady', label: 'Fine and fairly steady', weight: 'balanced' },
      { value: 'hungry_soon', label: 'Hungry again fairly quickly', weight: 'protein' },
      { value: 'sleepy_foggy', label: 'Sleepy, foggy or sluggish', weight: 'protein' },
      { value: 'not_sure', label: "It varies, I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q4',
    order: 4,
    section: 'Fuel and Satiety',
    prompt: 'After a protein-rich meal, how do you usually feel?',
    options: [
      { value: 'very_satisfied', label: 'Very satisfied and steady', weight: 'protein' },
      { value: 'want_carb', label: 'Good, but I still want some carbohydrate', weight: 'balanced' },
      { value: 'too_heavy', label: 'Too heavy or overly full', weight: 'carb' },
      { value: 'no_difference', label: 'Not much different', weight: 'neutral' },
      { value: 'not_sure', label: "It varies, I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q5',
    order: 5,
    section: 'Fuel and Satiety',
    prompt: 'When you have something sweet by itself, what usually happens afterward?',
    options: [
      { value: 'crash', label: 'I feel good briefly, then crash or get hungry', weight: 'protein' },
      { value: 'small_boost', label: 'I notice a small boost, then return to normal', weight: 'balanced' },
      { value: 'fairly_steady', label: 'I feel fairly steady', weight: 'balanced' },
      { value: 'tolerate_well', label: 'I generally tolerate it well', weight: 'carb' },
      { value: 'not_sure', label: "It varies, I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q6',
    order: 6,
    section: 'Fuel and Satiety',
    prompt: 'When you become very hungry, what do you tend to want first?',
    options: [
      { value: 'savory_protein', label: 'Meat, eggs, cheese or another savory protein-rich food', weight: 'protein' },
      { value: 'complete_meal', label: 'A complete balanced meal', weight: 'balanced' },
      { value: 'starch_or_sweet', label: 'Bread, rice, pasta, fruit or something sweet', weight: 'carb' },
      { value: 'salty_crunchy', label: 'Something salty or crunchy', weight: 'tendency', tendency: 'salty_crunchy_craving' },
      { value: 'no_pattern', label: 'No consistent pattern', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q7',
    order: 7,
    section: 'Meals Through the Day',
    prompt: 'Which breakfast tends to keep you feeling best?',
    options: [
      { value: 'protein_fat_small_carb', label: 'Protein + healthy fat + smaller amount of carbohydrate', weight: 'protein' },
      { value: 'protein_plus_carb', label: 'Protein + fruit or whole-food carbohydrate', weight: 'balanced' },
      { value: 'carb_centered', label: 'Oatmeal, fruit, toast or another carbohydrate-centered breakfast', weight: 'carb' },
      { value: 'skips_breakfast', label: "I usually don't eat breakfast", weight: 'tendency', tendency: 'skips_breakfast' },
      { value: 'varies', label: 'It varies', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q8',
    order: 8,
    section: 'Meals Through the Day',
    prompt: 'If breakfast is mostly carbohydrate, how do you usually feel afterward?',
    options: [
      { value: 'hungry_quickly', label: 'Hungry again quickly', weight: 'protein' },
      { value: 'energetic_then_fade', label: 'Energetic initially, then I fade', weight: 'protein' },
      { value: 'good_stable', label: 'Pretty good and stable', weight: 'balanced' },
      { value: 'better_than_protein', label: 'Better than I do after a heavier protein breakfast', weight: 'carb' },
      { value: 'not_sure', label: "I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q9',
    order: 9,
    section: 'Meals Through the Day',
    prompt: 'When a meal gets delayed, what tends to happen?',
    options: [
      { value: 'irritable_shaky', label: 'I become very hungry, irritable or shaky', weight: 'protein' },
      { value: 'focus_drops', label: 'My focus and energy drop noticeably', weight: 'protein' },
      { value: 'manage_comfortably', label: 'I get hungry but manage comfortably', weight: 'balanced' },
      { value: 'go_a_long_while', label: 'I can usually go quite a while without eating', weight: 'carb' },
      { value: 'depends', label: 'It depends', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q10',
    order: 10,
    section: 'Meals Through the Day',
    prompt: 'Which dinner usually leaves you feeling best afterward?',
    options: [
      { value: 'protein_centered', label: 'Protein-centered with vegetables', weight: 'protein' },
      { value: 'balanced_plate', label: 'Balanced protein, vegetables and starch', weight: 'balanced' },
      { value: 'lighter_veg_carb', label: 'A lighter meal with more vegetables and carbohydrate', weight: 'carb' },
      { value: 'no_pattern', label: "I don't notice a pattern", weight: 'neutral' },
      { value: 'varies', label: 'It varies', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q11',
    order: 11,
    section: 'Meals Through the Day',
    prompt: 'Which type of dinner tends to support your best sleep?',
    options: [
      { value: 'protein_and_fat', label: 'More protein and healthy fat', weight: 'protein' },
      { value: 'balanced_meal', label: 'A balanced meal', weight: 'balanced' },
      { value: 'more_carb', label: 'A little more carbohydrate', weight: 'carb' },
      { value: 'no_effect', label: "Meal composition doesn't seem to affect my sleep", weight: 'neutral' },
      { value: 'not_sure', label: "I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q12',
    order: 12,
    section: 'Meals Through the Day',
    prompt: 'How do you usually feel after a very low-fat meal?',
    options: [
      { value: 'unsatisfied', label: 'Unsatisfied or still hungry', weight: 'protein' },
      { value: 'fine_with_protein', label: 'Fine if there is enough protein', weight: 'balanced' },
      { value: 'light_energized', label: 'Light and energized', weight: 'carb' },
      { value: 'no_difference', label: 'No noticeable difference', weight: 'neutral' },
      { value: 'varies', label: 'It varies', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q13',
    order: 13,
    section: 'Meals Through the Day',
    prompt: 'How do you usually feel after a higher-fat meal?',
    options: [
      { value: 'more_satisfied', label: 'More satisfied and steady', weight: 'protein' },
      { value: 'fine_if_portioned', label: 'Comfortable as long as the portion is reasonable', weight: 'balanced' },
      { value: 'heavy_sluggish', label: 'Heavy or sluggish', weight: 'carb' },
      { value: 'no_difference', label: 'No noticeable difference', weight: 'neutral' },
      { value: 'varies', label: 'It varies', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q14',
    order: 14,
    section: 'Meals Through the Day',
    prompt: 'After exercise, what sounds most appealing?',
    options: [
      { value: 'savory_protein', label: 'Protein-rich savory food', weight: 'protein' },
      { value: 'balanced_meal', label: 'A balanced meal', weight: 'balanced' },
      { value: 'fruit_or_grains', label: 'Fruit, grains or another carbohydrate source', weight: 'carb' },
      { value: 'nothing_particular', label: 'Nothing in particular', weight: 'tendency', tendency: 'no_post_exercise_appetite' },
      { value: 'depends_on_workout', label: 'It depends on the workout', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q15',
    order: 15,
    section: 'Meals Through the Day',
    prompt: 'What best describes your afternoon energy?',
    options: [
      { value: 'steadier_with_protein', label: 'More stable when lunch contains plenty of protein', weight: 'protein' },
      { value: 'best_after_balanced', label: 'Best after a balanced lunch', weight: 'balanced' },
      { value: 'better_with_carb', label: 'Better when lunch contains enough carbohydrate', weight: 'carb' },
      { value: 'dip_regardless', label: 'I often experience an afternoon dip regardless', weight: 'tendency', tendency: 'afternoon_dip_regardless' },
      { value: 'varies', label: 'It varies', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q16',
    order: 16,
    section: 'Meals Through the Day',
    prompt: 'Which type of snack tends to satisfy you longest?',
    options: [
      { value: 'protein_fat', label: 'Protein/fat such as yogurt, eggs, nuts or cheese', weight: 'protein' },
      { value: 'protein_plus_carb', label: 'Protein plus fruit or another carbohydrate', weight: 'balanced' },
      { value: 'carb_snack', label: 'Fruit, crackers or another carbohydrate', weight: 'carb' },
      { value: 'snacks_rarely_satisfy', label: 'Snacks rarely satisfy me', weight: 'tendency', tendency: 'snacks_rarely_satisfy' },
      { value: 'varies', label: 'It varies', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q17',
    order: 17,
    section: 'Appetite and Portions',
    prompt: 'How would you describe your appetite most days?',
    options: [
      { value: 'strong', label: 'Strong', weight: 'protein' },
      { value: 'moderate', label: 'Moderate', weight: 'balanced' },
      { value: 'light', label: 'Light', weight: 'carb' },
      { value: 'highly_variable', label: 'Highly variable', weight: 'tendency', tendency: 'highly_variable_appetite' },
      { value: 'hard_to_tell', label: 'Hard to tell', weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q18',
    order: 18,
    section: 'Appetite and Portions',
    prompt: 'Which meal size usually feels best for you?',
    options: [
      { value: 'substantial', label: 'More substantial meals', weight: 'protein' },
      { value: 'moderate', label: 'Moderate meals', weight: 'balanced' },
      { value: 'smaller_lighter', label: 'Smaller, lighter meals', weight: 'carb' },
      { value: 'changes_through_day', label: 'It changes throughout the day', weight: 'tendency', tendency: 'meal_size_changes_through_day' },
      { value: 'not_sure', label: "I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q19',
    order: 19,
    section: 'Appetite and Portions',
    prompt: 'How does a very large meal usually affect you?',
    options: [
      { value: 'satisfied_calm', label: 'Satisfied and calm', weight: 'protein' },
      { value: 'fine_if_balanced', label: 'Fine if it is balanced', weight: 'balanced' },
      { value: 'heavy_sleepy', label: 'Heavy or sleepy', weight: 'carb' },
      { value: 'depends_on_food', label: 'It depends heavily on what I ate', weight: 'neutral' },
      { value: 'not_sure', label: "I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q20',
    order: 20,
    section: 'Appetite and Portions',
    prompt: 'When you are under stress, what usually happens to your eating?',
    options: [
      { value: 'hungrier_substantial', label: 'I become hungrier and want substantial food', weight: 'protein' },
      { value: 'crave_sweets_starches', label: 'I crave sweets or starches', weight: 'carb' },
      { value: 'appetite_decreases', label: 'My appetite decreases', weight: 'tendency', tendency: 'appetite_decreases_under_stress' },
      { value: 'unpredictable', label: 'My eating becomes unpredictable', weight: 'tendency', tendency: 'eating_unpredictable_under_stress' },
      { value: 'no_effect', label: "Stress doesn't affect it much", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q21',
    order: 21,
    section: 'The Whole Picture',
    prompt: 'Which statement best describes your digestion after your usual meals?',
    options: [
      { value: 'best_with_protein_fat', label: 'I tend to feel best when meals include enough protein and fat', weight: 'protein' },
      { value: 'best_balanced', label: 'I tend to feel best with balanced mixed meals', weight: 'balanced' },
      { value: 'best_lighter_plants', label: 'I tend to feel best with lighter meals containing more plant foods and carbohydrate', weight: 'carb' },
      { value: 'discomfort_regardless', label: 'I frequently experience digestive discomfort regardless', weight: 'unscored' },
      { value: 'havent_noticed', label: "I haven't noticed", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q22',
    order: 22,
    section: 'The Whole Picture',
    prompt:
      'Thinking about your energy across an entire day, which pattern sounds most familiar?',
    options: [
      { value: 'need_substantial', label: 'I need substantial meals to stay steady', weight: 'protein' },
      { value: 'balanced_consistent', label: 'Balanced meals keep me fairly consistent', weight: 'balanced' },
      { value: 'better_lighter', label: 'I generally feel better eating lighter meals', weight: 'carb' },
      { value: 'changes_regardless', label: 'My energy changes considerably regardless of food', weight: 'tendency', tendency: 'energy_changes_regardless_of_food' },
      { value: 'not_sure', label: "I'm not sure", weight: 'neutral' },
    ],
  },
  {
    key: 'fpa_q23',
    order: 23,
    section: 'The Whole Picture',
    prompt: 'How would you describe your overall sense of physical vitality lately?',
    description:
      'This can include general energy, motivation, physical drive and interest in intimacy. Answer only what feels comfortable.',
    options: [
      { value: 'strong_consistent', label: 'Strong and consistent', weight: 'unscored' },
      { value: 'generally_good', label: 'Generally good', weight: 'unscored' },
      { value: 'comes_and_goes', label: 'Comes and goes', weight: 'unscored' },
      { value: 'noticeably_lower', label: 'Noticeably lower than usual', weight: 'unscored' },
      { value: 'very_low', label: 'Very low lately', weight: 'unscored' },
      { value: 'prefer_not_to_answer', label: 'Prefer not to answer', weight: 'unscored' },
    ],
  },
  {
    key: 'fpa_q24',
    order: 24,
    section: 'The Whole Picture',
    prompt:
      'If you had no nutrition rules to follow, which plate would naturally appeal to you most?',
    options: [
      {
        value: 'protein_forward',
        label: 'Protein-forward',
        detail: 'Protein, vegetables, healthy fat and a smaller starch portion',
        weight: 'protein',
      },
      {
        value: 'balanced',
        label: 'Balanced',
        detail: 'Protein, vegetables, a moderate starch portion and healthy fat',
        weight: 'balanced',
      },
      {
        value: 'carb_forward',
        label: 'Carbohydrate-forward',
        detail: 'Vegetables, a larger whole-food carbohydrate portion and moderate protein',
        weight: 'carb',
      },
      { value: 'really_depends', label: 'It really depends.', weight: 'neutral' },
    ],
  },
];

export function fpaQuestion(key: string): FpaQuestion | undefined {
  return FPA_QUESTIONS.find((q) => q.key === key);
}

export function fpaOption(questionKey: string, value: string): FpaOption | undefined {
  return fpaQuestion(questionKey)?.options.find((o) => o.value === value);
}
