/**
 * Rooted Reset Fuel Pattern Assessment, Build 4 — the learning loop.
 *
 * =====================================================================
 * THE SAME DISCIPLINE AS THE BUILD 2 OBSERVATION ENGINE.
 * =====================================================================
 *
 * Five approved insights, written once, each paired with an evidence
 * rule over her logged checks. An insight qualifies only when its rule is
 * met over rows she actually wrote. Nothing is generated, nothing is
 * padded, and there is no sixth thing this engine can ever say.
 *
 * WHAT AN INSIGHT IS ALLOWED TO BE. A suggestion, in the house voice, of
 * a small experiment worth trying. It never changes her pattern, her
 * starting range, her plate or her meal cards, and nothing downstream of
 * this file writes to any of them. Refining the pattern itself stays a
 * coach conversation and a retake.
 *
 * =====================================================================
 * ONE AT A TIME, AND IT ONLY EVER MOVES UPWARDS.
 * =====================================================================
 *
 * At most one insight stands. It is chosen after each new check, and:
 *
 *   - with nothing standing, the highest priority qualifying insight
 *     takes the place;
 *   - with something standing, it is replaced only by an insight of
 *     HIGHER priority that has NEWLY qualified, which is the rule the
 *     brief states and the reason a quiet week cannot displace a real
 *     signal;
 *   - an insight that still qualifies keeps its place and has its own
 *     wording recomputed, so the one that names a part of the day is
 *     always naming the part of the day her rows currently point at.
 *
 * Priority is the order of INSIGHT_RULES below and nothing else.
 *
 * =====================================================================
 * NOTHING IS STORED. THE HISTORY IS REPLAYED.
 * =====================================================================
 *
 * The standing insight and every insight that stood before it are
 * derived here, by replaying her checks in the order she logged them.
 * There is no stored "current insight" column to drift from the rows it
 * claims to describe, and the coach's history and her screen are
 * literally the same function over the same rows. That is the same
 * decision the observation engine made, for the same reason: one source
 * of truth per number.
 */

import { FPA_CHECK_MEAL_TYPE_IN_SENTENCE } from './copy';
import type { FpaExperimentCheck } from './types';
import { FPA_MEAL_TYPES, type FpaMealType } from '../meals/types';

export type FpaInsightId =
  | 'hungry_soon'
  | 'heavy_full'
  | 'foggy_pattern'
  | 'meal_type_flag'
  | 'holding_well';

/** One insight, ready to read. */
export type FpaInsight = {
  id: FpaInsightId;
  header: string;
  body: string;
  /** The part of the day this insight names, for the one insight that names one. */
  mealType: FpaMealType | null;
  /** How many of her checks meet its evidence rule. Never printed to a member. */
  supportingCount: number;
};

const NOTICED = 'WE NOTICED SOMETHING';
const HOLDING = 'YOUR PATTERN IS HOLDING';

/** How many checks a threshold rule needs before it says anything at all. */
const THRESHOLD = 3;
/** The one rule that needs two rather than three, because it is two of the SAME meal. */
const MEAL_TYPE_THRESHOLD = 2;
/** How many checks a week needs before "this is holding" is an observation rather than a guess. */
const HOLDING_THRESHOLD = 5;

type Evidence = { supportingCount: number; mealType: FpaMealType | null };

type Rule = {
  id: FpaInsightId;
  header: string;
  /** The approved line. `[meal type]` is the only substitution any of them make. */
  body: string;
  evaluate: (checks: readonly FpaExperimentCheck[]) => Evidence | null;
};

/** More than half of them. Not "at least half": a tie is not a majority. */
function majority(hits: number, total: number): boolean {
  return total > 0 && hits * 2 > total;
}

/**
 * THE APPROVED INSIGHT LIBRARY, IN PRIORITY ORDER.
 *
 * The order of this array IS the priority order. Nothing else encodes
 * it, so moving an entry moves its priority and
 * tests/fuel-pattern-experiment-insights.test.ts asserts the order that
 * shipped.
 */
export const FPA_INSIGHT_RULES: readonly Rule[] = [
  {
    id: 'hungry_soon',
    header: NOTICED,
    body: 'Meals with slightly more protein and healthy fat appear worth trying. You have been getting hungry again fairly soon after eating, and a little more of both often helps meals hold longer. Notice what changes.',
    evaluate: (checks) => {
      const hits = checks.filter((check) => check.hunger === 'hungry').length;
      return hits >= THRESHOLD ? { supportingCount: hits, mealType: null } : null;
    },
  },
  {
    id: 'heavy_full',
    header: NOTICED,
    body: 'Slightly smaller or lighter meals appear worth trying. You have often still been very full hours after eating. A gentler portion may leave you more comfortable without costing you energy.',
    evaluate: (checks) => {
      const hits = checks.filter((check) => check.hunger === 'still_very_full').length;
      return hits >= THRESHOLD ? { supportingCount: hits, mealType: null } : null;
    },
  },
  {
    id: 'foggy_pattern',
    header: NOTICED,
    body: 'Your mental clarity may be worth watching alongside your meals. If fog tends to follow carbohydrate-heavier meals, a bit more protein at those meals is a reasonable next experiment.',
    evaluate: (checks) => {
      const hits = checks.filter((check) => check.clarity === 'foggy').length;
      return hits >= THRESHOLD ? { supportingCount: hits, mealType: null } : null;
    },
  },
  {
    id: 'meal_type_flag',
    header: NOTICED,
    /*
      THE ONLY SUBSTITUTION IN THE LIBRARY, and it is the same word in
      both places on purpose: the insight is about one part of her day,
      so naming two would be describing something her rows do not say.
    */
    body: 'Your [meal type] may be the one to adjust first. More than one check after [meal type] has shown low energy. Small changes there are likely to teach you the most.',
    evaluate: (checks) => {
      /*
        A CHECK COUNTS ONLY WHERE SHE NAMED THE MEAL. The meal tag is
        optional, so an untagged low energy check is genuine information
        about her energy and no information at all about which meal, and
        attributing it to one would be inventing the evidence.
      */
      let best: Evidence | null = null;
      for (const mealType of FPA_MEAL_TYPES) {
        const hits = checks.filter(
          (check) => check.mealType === mealType && check.energy === 'low'
        ).length;
        if (hits < MEAL_TYPE_THRESHOLD) continue;
        // Ties go to the earlier part of the day, which is the order the
        // four are written in everywhere else in this feature.
        if (!best || hits > best.supportingCount) best = { supportingCount: hits, mealType };
      }
      return best;
    },
  },
  {
    id: 'holding_well',
    header: HOLDING,
    body: 'Your starting pattern appears to be serving you well so far. No adjustment needed right now. Keep noticing.',
    evaluate: (checks) => {
      if (checks.length < HOLDING_THRESHOLD) return null;
      const steady = checks.filter(
        (check) => check.energy === 'steady' || check.energy === 'great'
      ).length;
      const comfortable = checks.filter((check) => check.hunger === 'comfortable').length;
      if (!majority(steady, checks.length) || !majority(comfortable, checks.length)) return null;
      return { supportingCount: Math.min(steady, comfortable), mealType: null };
    },
  },
] as const;

/** Priority, as a number. Lower is stronger. */
function priorityOf(id: FpaInsightId): number {
  return FPA_INSIGHT_RULES.findIndex((rule) => rule.id === id);
}

/** The approved body, with the one substitution applied. */
function bodyFor(rule: Rule, mealType: FpaMealType | null): string {
  if (!mealType) return rule.body;
  return rule.body.split('[meal type]').join(FPA_CHECK_MEAL_TYPE_IN_SENTENCE[mealType]);
}

/**
 * Every insight her checks currently support, strongest priority first.
 * Nothing member facing prints more than one of these; the list exists
 * because the replay below needs to know what qualified, and because a
 * test that can only see the winner cannot prove the loser was there.
 */
export function fpaQualifyingInsights(checks: readonly FpaExperimentCheck[]): FpaInsight[] {
  const out: FpaInsight[] = [];
  for (const rule of FPA_INSIGHT_RULES) {
    const evidence = rule.evaluate(checks);
    if (!evidence) continue;
    out.push({
      id: rule.id,
      header: rule.header,
      body: bodyFor(rule, evidence.mealType),
      mealType: evidence.mealType,
      supportingCount: evidence.supportingCount,
    });
  }
  return out;
}

/** One entry in the history: an insight, and the check after which it took its place. */
export type FpaStandingInsightEntry = {
  insight: FpaInsight;
  /** How many checks had been logged when it took its place. */
  afterCheckCount: number;
};

/**
 * Every insight that has stood, oldest first, by replaying her checks in
 * the order she logged them.
 *
 * A run with no qualifying insight returns an empty list, and that is a
 * real answer rather than a gap: the completion screen has its own
 * approved line for exactly that week.
 */
export function fpaInsightHistory(
  checks: readonly FpaExperimentCheck[]
): FpaStandingInsightEntry[] {
  const history: FpaStandingInsightEntry[] = [];
  let standing: FpaInsight | null = null;
  let qualifiedLastTime = new Set<FpaInsightId>();

  for (let count = 1; count <= checks.length; count += 1) {
    const qualifying = fpaQualifyingInsights(checks.slice(0, count));
    const qualifiedNow = new Set(qualifying.map((insight) => insight.id));
    const best = qualifying[0] ?? null;

    if (best) {
      const takesOver =
        standing === null ||
        (priorityOf(best.id) < priorityOf(standing.id) && !qualifiedLastTime.has(best.id));

      if (takesOver) {
        standing = best;
        history.push({ insight: best, afterCheckCount: count });
      } else if (standing && qualifiedNow.has(standing.id)) {
        // It keeps its place, and its wording is recomputed so the one
        // insight that names a part of the day is always naming the one
        // her rows currently point at. A changed name is a change worth
        // recording; the same words are not.
        const refreshed = qualifying.find((insight) => insight.id === standing!.id)!;
        if (refreshed.mealType !== standing.mealType) {
          history.push({ insight: refreshed, afterCheckCount: count });
        }
        standing = refreshed;
      }
    }

    qualifiedLastTime = qualifiedNow;
  }

  return history;
}

/** The one insight standing right now, or null when none has ever qualified. */
export function fpaStandingInsight(
  checks: readonly FpaExperimentCheck[]
): FpaInsight | null {
  const history = fpaInsightHistory(checks);
  return history.length > 0 ? history[history.length - 1]!.insight : null;
}
