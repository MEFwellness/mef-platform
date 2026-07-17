/**
 * Weekly Nutrition Report — Part 11 of the MEF Food Intelligence Engine.
 * Pure, deterministic computation only: every branch below reads from the
 * `WeeklyReportInput` bundle a caller assembled from real rows (member_food_log,
 * food_lens_meal_quality_ratings, food_lens_detected_items, food_analysis_results,
 * movement_sessions, daily_checkins) — no I/O, no randomness, no LLM call. Given
 * the same input twice, this returns byte-identical output, which is what makes
 * it unit-testable with synthetic data (see tests/weekly-nutrition-report.test.ts)
 * and safe to run inside a server action without special-casing test vs. prod.
 *
 * Why a pure function at all: the spec's hardest requirement is "do not give
 * every member the same generic summary." The only way to make that a
 * structural guarantee (not just a hope) is to gate every sentence behind a
 * real threshold computed from real counts, so two different weeks of
 * synthetic input are *provably* going to diverge in wording wherever their
 * underlying counts diverge — see the test file's "different weeks produce
 * differently-worded reports" assertions.
 *
 * Language discipline (binding on every string this file can produce): never
 * state that a member "has" low protein/fiber/etc. as settled fact. Every
 * evaluative sentence hedges with phrasing like "based on what was logged,"
 * "a pattern worth noticing," or "your recent meals suggest" — mirroring the
 * meal-history-intelligence layer's required language elsewhere in this
 * milestone. Never diagnostic, never shaming: no "bad," "unhealthy," "should
 * not," "failure," "deficient," or disease/nutrient-deficiency language
 * anywhere in this file.
 *
 * Minimum-data threshold (documented, not just chosen): at least 3 distinct
 * days with at least one logged/scanned meal, AND at least 5 total logged
 * entries across the week. Rationale:
 *   - 3 distinct days rules out drawing a "weekly pattern" conclusion from
 *     what might just be one unusual day (a single big grocery-store trip
 *     logged all at once, for instance).
 *   - 5 total entries ensures there's enough raw material to say something
 *     honest about more than one dimension (protein *and* fiber *and*
 *     variety) without every dimension collapsing onto the same one or two
 *     data points.
 *   Both numbers are deliberately low. Food Lens logging is still a forming
 *   habit for most members; a stricter bar would mean most members never see
 *   a report in their first months, which contradicts "lead with meaningful
 *   patterns" — an early, modest, honest report beats a delayed, more
 *   "statistically confident" one nobody gets to read.
 */

import type {
  FoodLensAddedSugarLevel,
  FoodLensFoodCategory,
  FoodLensMealQualityRatingValue,
  FoodLensNutrientDensity,
  FoodLensProcessingLevel,
  MealCategory,
  WeeklyNutritionReportBody,
} from '@mef/shared-types-contracts';

export const MIN_DISTINCT_DAYS_LOGGED = 3;
export const MIN_TOTAL_ENTRIES_LOGGED = 5;

export const INSUFFICIENT_DATA_MESSAGE =
  'There is not enough logged information for a reliable weekly report yet. Logging a few more meals will help Root understand your patterns.';

// ---------------------------------------------------------------------------
// Input shapes — one entry per real row the data-access layer read. Every
// field here is either a raw fact (a date, a boolean already computed by the
// meal-quality rater or rules engine) or a member-local date string; no
// interpretation happens before this function sees the data.
// ---------------------------------------------------------------------------

/** food_analysis_results.rules_result judgments for a logged packaged/labeled product — reused exactly as the Nutrition Rules Engine already computed them, never re-derived here. */
export interface WeeklyReportPackagedFoodSignal {
  processingLabel: 'minimally_processed' | 'lightly_processed' | 'moderately_processed' | 'highly_processed';
  isMeaningfulProtein: boolean;
  fiberG: number | null;
  addedSugarG: number | null;
}

/** One member_food_log row (a packaged/labeled product the member logged). */
export interface WeeklyReportLogEntry {
  localDate: string; // YYYY-MM-DD, member-local
  mealCategory: MealCategory;
  /** Present only when this log entry's scan has a completed rules-engine analysis. */
  packagedFoodSignal?: WeeklyReportPackagedFoodSignal | null;
}

/** One food_lens_meal_quality_ratings row for a rated meal-photo scan this week. */
export interface WeeklyReportMealQualityRating {
  localDate: string;
  rating: FoodLensMealQualityRatingValue;
  nutrientDensity: FoodLensNutrientDensity;
  addedSugarLevel: FoodLensAddedSugarLevel;
  processingLevel: FoodLensProcessingLevel;
  hasMeaningfulProtein: boolean;
  hasMeaningfulFiber: boolean;
  hasHealthyFat: boolean;
  isBeverage: boolean;
}

/** One confirmed food_lens_detected_items row from a meal-photo scan this week. */
export interface WeeklyReportDetectedItem {
  localDate: string;
  label: string;
  category: FoodLensFoodCategory;
}

export interface WeeklyReportInput {
  weekStart: string; // inclusive, YYYY-MM-DD
  weekEnd: string; // exclusive upper bound, YYYY-MM-DD
  logEntries: WeeklyReportLogEntry[];
  mealQualityRatings: WeeklyReportMealQualityRating[];
  detectedItems: WeeklyReportDetectedItem[];
  /** Distinct member-local dates a movement_sessions row reached status='completed'. Empty when Movement Intelligence data isn't available/wired for this member — never fabricated. */
  completedWorkoutLocalDates: string[];
  /** member-local date -> daily_checkins.water_cups, only for dates a check-in actually recorded a value. Empty when hydration isn't tracked for this member. */
  waterCupsByLocalDate: Record<string, number>;
}

export type WeeklyReportResult = WeeklyNutritionReportBody | { insufficientData: true };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

// Mirrors the already-established defaults elsewhere in this codebase
// (nutrition_rule_thresholds seed rows in migration 59) rather than
// inventing new numbers: meaningful_fiber_g = 3, meaningful_protein_g = 5 is
// the fiber side of that pair; high_added_sugar_g = 10 is used verbatim.
const MEANINGFUL_FIBER_G = 3;
const HIGH_ADDED_SUGAR_G = 10;

interface Candidate {
  /** Fixed priority order tiebreaker — lower sorts first when strength ties. */
  priority: number;
  /** 0..1, how strongly this candidate's signal stands out — used to pick the single "win" / "focus" item. */
  strength: number;
  sentence: string;
  /** A short, forward-looking rephrasing — only populated for pattern candidates, used to build rootedFocusForNextWeek. */
  focusSentence?: string;
  /** A short "build on this" rephrasing — only populated for support candidates, used to build winToBuildOn. */
  winSentence?: string;
}

/**
 * Computes the Weekly Nutrition Report for one member-week. Returns
 * `{ insufficientData: true }` when the minimum-data threshold isn't met —
 * callers store that as status='insufficient_data' with the exact fallback
 * sentence, never attempting to spin a narrative out of too little data.
 */
export function computeWeeklyNutritionReport(input: WeeklyReportInput): WeeklyReportResult {
  const loggedDaySet = uniq([
    ...input.logEntries.map((e) => e.localDate),
    ...input.mealQualityRatings.map((r) => r.localDate),
  ]);
  const daysLogged = loggedDaySet.length;
  const mealsLogged = input.logEntries.length + input.mealQualityRatings.length;

  if (daysLogged < MIN_DISTINCT_DAYS_LOGGED || mealsLogged < MIN_TOTAL_ENTRIES_LOGGED) {
    return { insufficientData: true };
  }

  // ---- Logging consistency (basis for "Your Week in Food") ----
  const dayFraction = daysLogged / 7;
  let consistencyPhrase: string;
  if (dayFraction >= 6 / 7) {
    consistencyPhrase = `You logged food on ${daysLogged} of 7 days this week — a consistent habit that gives Root a clear picture.`;
  } else if (dayFraction >= 4 / 7) {
    consistencyPhrase = `You logged food on ${daysLogged} of 7 days this week, more than half the week, which is enough for a few real patterns to show.`;
  } else {
    consistencyPhrase = `You logged food on ${daysLogged} of 7 days this week — enough for a first look, though your data may be incomplete on the days nothing was logged.`;
  }

  // ---- Protein / fiber / added-sugar / processing signal pools ----
  // Only meals with an actual computed judgment count toward these fractions
  // (a rated meal-photo scan, or a packaged product with a completed rules
  // analysis) — a bare log entry with no analysis contributes to
  // daysLogged/mealsLogged but not to a nutrient-quality fraction, since
  // there is nothing to judge it by yet.
  const packagedWithSignal = input.logEntries
    .map((e) => e.packagedFoodSignal)
    .filter((s): s is WeeklyReportPackagedFoodSignal => Boolean(s));

  const proteinSignalTotal = input.mealQualityRatings.length + packagedWithSignal.length;
  const proteinSignalPositive =
    input.mealQualityRatings.filter((r) => r.hasMeaningfulProtein).length +
    packagedWithSignal.filter((s) => s.isMeaningfulProtein).length;

  const fiberSignalTotal = input.mealQualityRatings.length + packagedWithSignal.length;
  const fiberSignalPositive =
    input.mealQualityRatings.filter((r) => r.hasMeaningfulFiber).length +
    packagedWithSignal.filter((s) => s.fiberG !== null && s.fiberG >= MEANINGFUL_FIBER_G).length;

  const sugarSignalTotal = input.mealQualityRatings.length + packagedWithSignal.length;
  const sugarSignalHigh =
    input.mealQualityRatings.filter((r) => r.addedSugarLevel === 'high').length +
    packagedWithSignal.filter((s) => s.addedSugarG !== null && s.addedSugarG >= HIGH_ADDED_SUGAR_G).length;

  const processingSignalTotal = input.mealQualityRatings.length + packagedWithSignal.length;
  const processingSignalHigh =
    input.mealQualityRatings.filter((r) => r.processingLevel === 'ultra_processed').length +
    packagedWithSignal.filter((s) => s.processingLabel === 'highly_processed').length;

  const supportCandidates: Candidate[] = [];
  const patternCandidates: Candidate[] = [];

  // Protein
  if (proteinSignalTotal > 0) {
    const frac = proteinSignalPositive / proteinSignalTotal;
    if (frac >= 0.8) {
      supportCandidates.push({
        priority: 1,
        strength: frac,
        sentence: `Protein showed up consistently — ${proteinSignalPositive} of ${proteinSignalTotal} meals Root could assess included a meaningful protein source, based on what was logged.`,
        winSentence:
          'Protein consistency is a real strength this week — keep building meals around a protein source, since it showed up reliably in what you logged.',
      });
    } else if (frac <= 0.4) {
      patternCandidates.push({
        priority: 1,
        strength: 1 - frac,
        sentence: `A pattern worth noticing: protein was light in most of what was logged — only ${proteinSignalPositive} of ${proteinSignalTotal} assessed meals had a clear protein source. Your data may be incomplete if some meals weren't logged.`,
        focusSentence:
          'Try adding a protein source to at least one more meal each day — even a small, consistent addition tends to show up clearly in next week\'s report.',
      });
    }
  }

  // Fiber
  if (fiberSignalTotal > 0) {
    const frac = fiberSignalPositive / fiberSignalTotal;
    if (frac >= 0.8) {
      supportCandidates.push({
        priority: 2,
        strength: frac,
        sentence: `Fiber-supportive meals were common — ${fiberSignalPositive} of ${fiberSignalTotal} assessed meals suggest a meaningful fiber source, based on what was logged.`,
        winSentence:
          'Fiber-supportive choices showed up often this week — a pattern worth carrying into next week as-is.',
      });
    } else if (frac <= 0.4) {
      patternCandidates.push({
        priority: 2,
        strength: 1 - frac,
        sentence: `A pattern worth noticing: fiber-supportive meals were less common this week — only ${fiberSignalPositive} of ${fiberSignalTotal} assessed meals suggest a meaningful fiber source.`,
        focusSentence:
          'Adding one fiber-rich food — vegetables, legumes, or whole grains — to a meal or two could be a simple focus for next week.',
      });
    }
  }

  // Added sugar
  if (sugarSignalTotal > 0) {
    const frac = sugarSignalHigh / sugarSignalTotal;
    if (frac <= 0.1) {
      supportCandidates.push({
        priority: 3,
        strength: 1 - frac,
        sentence: `Added sugar rarely stood out in what you logged — only ${sugarSignalHigh} of ${sugarSignalTotal} assessed meals registered a high added-sugar level.`,
        winSentence: 'Added sugar staying low this week is worth carrying forward, based on what was logged.',
      });
    } else if (frac >= 0.4) {
      patternCandidates.push({
        priority: 3,
        strength: frac,
        sentence: `A pattern worth noticing: added sugar showed up often — ${sugarSignalHigh} of ${sugarSignalTotal} assessed meals registered a high added-sugar level, based on what was logged.`,
        focusSentence:
          'Noticing where added sugar tends to show up — a drink, a snack, a particular time of day — could be worth your attention next week.',
      });
    }
  }

  // Highly processed frequency
  if (processingSignalTotal > 0) {
    const frac = processingSignalHigh / processingSignalTotal;
    if (frac <= 0.15) {
      supportCandidates.push({
        priority: 4,
        strength: 1 - frac,
        sentence: `Most of what you logged leaned whole or minimally processed — only ${processingSignalHigh} of ${processingSignalTotal} assessed meals were on the highly processed end.`,
        winSentence: 'Meals staying mostly whole and minimally processed is a real pattern worth keeping.',
      });
    } else if (frac >= 0.4) {
      patternCandidates.push({
        priority: 4,
        strength: frac,
        sentence: `A pattern worth noticing: highly processed foods showed up somewhat often — ${processingSignalHigh} of ${processingSignalTotal} assessed meals, based on what was logged.`,
        focusSentence:
          'Swapping in one whole-food option where a highly processed one usually shows up could be a gentle focus for next week.',
      });
    }
  }

  // ---- Food variety (from confirmed detected meal-photo items) ----
  const distinctLabels = uniq(input.detectedItems.map((i) => normalizeLabel(i.label)));
  const varietyCount = distinctLabels.length;
  // Gate on a minimum number of detected items so a low count isn't
  // mistaken for "narrow variety" when it's really just "few meal photos
  // were scanned this week" — a member with only 3 scanned items showing 3
  // distinct labels has *complete* variety among what they logged, not
  // narrow variety.
  if (input.detectedItems.length >= 8) {
    if (varietyCount >= 12) {
      supportCandidates.push({
        priority: 5,
        strength: Math.min(1, varietyCount / 20),
        sentence: `Your recent meals suggest real variety — ${varietyCount} different foods appeared across what Root could identify this week.`,
        winSentence: 'The variety in what you logged this week stood out — a wide range of foods showed up across your meals.',
      });
    } else if (varietyCount <= 5) {
      patternCandidates.push({
        priority: 5,
        strength: 1 - varietyCount / 8,
        sentence: `A pattern worth noticing: the same handful of foods repeated often this week — only ${varietyCount} distinct foods appeared across what was logged.`,
        focusSentence: 'Bringing in one or two new foods next week could add some variety to your rotation.',
      });
    }
  }

  // ---- Vegetable & fruit variety ----
  // FoodLensFoodCategory has no separate "fruit" bucket — the vision
  // detector groups produce (vegetables and fruit alike) under 'vegetable'.
  // This is a deliberate proxy, documented here rather than silently
  // treated as exact: "vegetable and fruit variety" below means distinct
  // labels detected in that category.
  const produceLabels = uniq(
    input.detectedItems.filter((i) => i.category === 'vegetable').map((i) => normalizeLabel(i.label))
  );
  if (input.detectedItems.length >= 5) {
    if (produceLabels.length >= 4) {
      supportCandidates.push({
        priority: 6,
        strength: Math.min(1, produceLabels.length / 8),
        sentence: `Several different vegetables and fruits appeared in what you logged this week (${produceLabels.length} distinct items) — a pattern worth recognizing.`,
        winSentence: 'A real range of vegetables and fruit showed up in what you logged — worth keeping up.',
      });
    } else if (produceLabels.length === 0) {
      patternCandidates.push({
        priority: 6,
        strength: 0.6,
        sentence:
          'A pattern worth noticing: vegetables and fruit did not clearly appear in what was logged this week. Your data may be incomplete if produce was eaten but not logged alongside the rest of a meal.',
        focusSentence: 'Adding one vegetable or piece of fruit to a meal you already log could be an easy focus for next week.',
      });
    }
  }

  // ---- Meal timing (breakfast presence, from member_food_log entries only — scans don't carry a meal category) ----
  if (input.logEntries.length > 0) {
    const logDaySet = uniq(input.logEntries.map((e) => e.localDate));
    const breakfastDays = uniq(
      input.logEntries.filter((e) => e.mealCategory === 'breakfast').map((e) => e.localDate)
    ).length;
    if (logDaySet.length >= 3) {
      const frac = breakfastDays / logDaySet.length;
      if (frac >= 0.7) {
        supportCandidates.push({
          priority: 7,
          strength: frac,
          sentence: `Breakfast showed up regularly in your log — ${breakfastDays} of ${logDaySet.length} logged days included a breakfast entry.`,
          winSentence: 'Logging breakfast consistently gave Root a clearer read on your full day — worth continuing.',
        });
      } else if (frac <= 0.2) {
        patternCandidates.push({
          priority: 7,
          strength: 1 - frac,
          sentence: `A pattern worth noticing: breakfast rarely appeared in your log — only ${breakfastDays} of ${logDaySet.length} logged days included a breakfast entry. Your data may be incomplete if breakfast was eaten but not logged.`,
          focusSentence: 'If breakfast is part of your routine, logging it could round out next week\'s picture.',
        });
      }
    }
  }

  // ---- Hydration (optional — only when daily_checkins carried water_cups) ----
  const waterDays = Object.keys(input.waterCupsByLocalDate);
  if (waterDays.length >= 3) {
    const avgCups =
      waterDays.reduce((sum, d) => sum + (input.waterCupsByLocalDate[d] ?? 0), 0) / waterDays.length;
    if (avgCups >= 7) {
      supportCandidates.push({
        priority: 8,
        strength: Math.min(1, avgCups / 10),
        sentence: `Hydration looked solid on the days you checked in — averaging about ${Math.round(avgCups)} cups a day.`,
        winSentence: 'Hydration was consistently strong on the days you checked in — a good habit to keep.',
      });
    } else if (avgCups <= 3) {
      patternCandidates.push({
        priority: 8,
        strength: 1 - avgCups / 5,
        sentence: `A pattern worth noticing: hydration looked light on the days you checked in — averaging about ${Math.round(avgCups)} cups a day. Your data may be incomplete on days without a check-in.`,
        focusSentence: 'Keeping a glass of water within reach at meals could be a simple focus for next week.',
      });
    }
  }

  // ---- Workout-nutrition alignment (optional — only with real overlap) ----
  if (input.completedWorkoutLocalDates.length >= 2) {
    const workoutDaySet = new Set(input.completedWorkoutLocalDates);
    const proteinOnWorkoutDays = { positive: 0, total: 0 };
    const proteinElsewhere = { positive: 0, total: 0 };

    for (const r of input.mealQualityRatings) {
      const bucket = workoutDaySet.has(r.localDate) ? proteinOnWorkoutDays : proteinElsewhere;
      bucket.total += 1;
      if (r.hasMeaningfulProtein) bucket.positive += 1;
    }
    for (const e of input.logEntries) {
      if (!e.packagedFoodSignal) continue;
      const bucket = workoutDaySet.has(e.localDate) ? proteinOnWorkoutDays : proteinElsewhere;
      bucket.total += 1;
      if (e.packagedFoodSignal.isMeaningfulProtein) bucket.positive += 1;
    }

    if (proteinOnWorkoutDays.total >= 2) {
      const workoutFrac = proteinOnWorkoutDays.positive / proteinOnWorkoutDays.total;
      const elsewhereFrac =
        proteinElsewhere.total > 0 ? proteinElsewhere.positive / proteinElsewhere.total : null;
      if (workoutFrac >= 0.7 && (elsewhereFrac === null || workoutFrac - elsewhereFrac >= 0.2)) {
        supportCandidates.push({
          priority: 9,
          strength: workoutFrac,
          sentence: `On days you completed a movement session, your logged meals leaned more protein-supportive — ${proteinOnWorkoutDays.positive} of ${proteinOnWorkoutDays.total} assessed meals on those days included a meaningful protein source.`,
          winSentence: 'Your meals tended to support your movement sessions well — protein showed up more on workout days than elsewhere.',
        });
      }
    }
  }

  // ---- Assemble sections (cap at 4 each, spec: "do not overwhelm") ----
  const whatSupportedYou = [...supportCandidates]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4)
    .map((c) => c.sentence);

  const patternsWorthNoticing = [...patternCandidates]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4)
    .map((c) => c.sentence);

  // ---- Win to build on: the single strongest genuinely-positive pattern ----
  const bestSupport = [...supportCandidates].sort((a, b) => b.strength - a.strength)[0];
  const winToBuildOn = bestSupport?.winSentence ?? null;

  // ---- Rooted focus for next week: at most one, occasionally two, never a laundry list ----
  const rankedPatterns = [...patternCandidates].sort((a, b) => b.strength - a.strength);
  let rootedFocusForNextWeek: string | null = null;
  const first = rankedPatterns[0];
  const second = rankedPatterns[1];
  if (first && !second) {
    rootedFocusForNextWeek = first.focusSentence ?? null;
  } else if (first && second) {
    // Only ever surface a second focus area when it is independently strong
    // (not just "the next one on the list") — otherwise stay to one clear
    // priority, per "do not overwhelm."
    if (second.strength >= 0.55 && first.focusSentence && second.focusSentence) {
      rootedFocusForNextWeek = `${first.focusSentence} ${second.focusSentence}`;
    } else {
      rootedFocusForNextWeek = first.focusSentence ?? null;
    }
  }

  // ---- Your Week in Food (always present for a generated report) ----
  const varietyClause =
    input.detectedItems.length >= 3
      ? ` Root identified ${varietyCount} different food${varietyCount === 1 ? '' : 's'} across what you logged.`
      : '';
  const yourWeekInFood = `${consistencyPhrase} You logged ${mealsLogged} meal${mealsLogged === 1 ? '' : 's'} in total this week.${varietyClause}`;

  return {
    daysLogged,
    mealsLogged,
    yourWeekInFood,
    whatSupportedYou,
    patternsWorthNoticing,
    winToBuildOn,
    rootedFocusForNextWeek,
  };
}
