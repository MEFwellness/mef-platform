/**
 * Daily Nutrition Coaching (Part 6) + Meal Timing Intelligence (Part 10).
 * Pure, deterministic — no LLM call, same discipline as weeklyReport.ts:
 * given the same input twice, returns the same output, so behavior is
 * unit-testable and reviewable rather than "whatever the model felt like
 * saying today." Reuses weeklyReport.ts's WeeklyReportPackagedFoodSignal /
 * WeeklyReportMealQualityRating shapes for today's entries so there is one
 * definition of "what a logged item's nutrition signal looks like," not two.
 *
 * "Do not nag" (product requirement §6) is enforced structurally: every
 * candidate message is scored, and at most MAX_MESSAGES survive — never
 * every true observation at once.
 */

import type { WeeklyReportMealQualityRating, WeeklyReportPackagedFoodSignal } from './weeklyReport';
import type { MealCategory } from '@mef/shared-types-contracts';

const MAX_MESSAGES = 2;
const MEANINGFUL_FIBER_G = 3;

export interface DailyCoachingLogEntry {
  mealCategory: MealCategory;
  packagedFoodSignal?: WeeklyReportPackagedFoodSignal | null;
}

export interface DailyCoachingInput {
  /** The member's current LOCAL hour (0-23, in their own timezone — never derived from a UTC instant via server-local time) — used only to judge how much of the day has reasonably passed, never stored as a fact about a meal. */
  localHour: number;
  logEntries: DailyCoachingLogEntry[];
  mealQualityRatings: WeeklyReportMealQualityRating[];
  /** True if a movement_sessions row reached status='completed' today. False (not null) when nothing completed — Movement Intelligence not being wired for this member reads the same as "no workout today," which is the honest default. */
  hasWorkoutToday: boolean;
}

export interface DailyCoachingResult {
  messages: string[];
  /** True when there's simply not enough logged today to say anything — distinct from "logged, and everything looks balanced," which produces zero messages for a different reason (nothing worth flagging). */
  insufficientToday: boolean;
}

interface Candidate {
  priority: number;
  strength: number;
  sentence: string;
}

export function computeDailyCoachingMessage(input: DailyCoachingInput): DailyCoachingResult {
  const totalLogged = input.logEntries.length + input.mealQualityRatings.length;
  const hour = input.localHour;

  if (totalLogged === 0) {
    if (hour >= 14) {
      return {
        messages: ['You have not logged much today, so there is not enough information for a reliable summary.'],
        insufficientToday: true,
      };
    }
    // Still morning/early afternoon — genuinely too early to say anything, not even the "not enough" line (per "do not nag").
    return { messages: [], insufficientToday: true };
  }

  const candidates: Candidate[] = [];

  const hasMeaningfulProteinToday =
    input.logEntries.some((e) => e.packagedFoodSignal?.isMeaningfulProtein) ||
    input.mealQualityRatings.some((r) => r.hasMeaningfulProtein);
  const hasMeaningfulFiberToday =
    input.logEntries.some((e) => (e.packagedFoodSignal?.fiberG ?? 0) >= MEANINGFUL_FIBER_G) ||
    input.mealQualityRatings.some((r) => r.hasMeaningfulFiber);
  const hasMeaningfulFatToday = input.mealQualityRatings.some((r) => r.hasHealthyFat);
  const highlyProcessedCount =
    input.logEntries.filter((e) => e.packagedFoodSignal?.processingLabel === 'highly_processed').length +
    input.mealQualityRatings.filter((r) => r.processingLevel === 'ultra_processed').length;

  // Protein light so far — only worth surfacing once enough of the day has
  // passed that "so far" is a meaningful frame, not a snap judgment on
  // breakfast alone.
  if (!hasMeaningfulProteinToday && hour >= 13) {
    candidates.push({
      priority: 1,
      strength: 0.7,
      sentence: 'Protein has been light so far today. Consider including a meaningful protein source at your next meal.',
    });
  }

  // Protein + fat present but fiber absent — the spec's own example phrasing.
  if (hasMeaningfulProteinToday && hasMeaningfulFatToday && !hasMeaningfulFiberToday) {
    candidates.push({
      priority: 2,
      strength: 0.6,
      sentence: 'Your meals have included protein and fat, but very little fiber so far.',
    });
  }

  // Several highly/ultra-processed items today — a simpler-next-meal nudge,
  // never a shaming one, and never framed around a specific nutrient this
  // layer doesn't actually have data for (e.g. sodium isn't tracked here).
  if (highlyProcessedCount >= 2) {
    candidates.push({
      priority: 3,
      strength: 0.55,
      sentence: "You've had a few highly processed foods today. A simpler next meal may offer better balance.",
    });
  }

  // Meal timing intelligence (Part 10): trained today, nothing suggests a
  // recovery-oriented meal followed — flagged gently, never as a rule
  // ("always eat within 30 minutes") since that's exactly the rigid framing
  // the product spec forbids.
  if (input.hasWorkoutToday) {
    candidates.push({
      priority: 0,
      strength: 0.65,
      sentence: 'You trained today. Your next meal may benefit from protein, carbohydrates, and fluids.',
    });
  }

  const messages = candidates
    .sort((a, b) => b.strength - a.strength || a.priority - b.priority)
    .slice(0, MAX_MESSAGES)
    .map((c) => c.sentence);

  return { messages, insufficientToday: false };
}
