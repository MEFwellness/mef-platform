/**
 * Rooted Reset Fuel Pattern Assessment — "Why this pattern fits you".
 *
 * =====================================================================
 * A DETERMINISTIC OBSERVATION ENGINE, NOT A PARAGRAPH GENERATOR.
 * =====================================================================
 *
 * The section under her pattern name says "You told us:" and then three
 * or four things. Every one of them has to be something she actually
 * told us, which rules out both of the easy ways to build this: a fixed
 * list per pattern (identical for every Protein-Supportive member, so
 * most lines are luck rather than evidence) and generated prose (no way
 * to prove a sentence is supported by a stored answer).
 *
 * So each line below is APPROVED COPY, written once, paired with an
 * evidence rule over her stored answers. A line qualifies only when its
 * rule is met. Nothing is padded, nothing is invented, and a line that
 * her answers contradict is never shown.
 *
 * HOW THE THREE OR FOUR ARE CHOSEN:
 *   1. Every rule is evaluated against her stored responses.
 *   2. Qualifying lines are ranked by how many answers support them,
 *      ties broken by the order they are written in this file.
 *   3. The top three are shown, four when a fourth qualifies.
 *   4. Fewer than two qualifying lines is its own honest state, and
 *      FPA_NO_OBSERVATIONS_LINE is what she reads instead.
 *
 * CONTRADICTION IS CHECKED, not assumed away. Most of the pairs below
 * cannot both fire (they read opposite classes of the same question),
 * but substantial_meals and lighter_meals genuinely can: they read
 * overlapping but different question sets. CONFLICTING_PAIRS names that,
 * and the weaker of the two is dropped rather than both being printed
 * beside each other.
 *
 * THE CLASSES ARE THE SCORING ENGINE'S OWN. "A protein-class answer"
 * means the option's authored weight class in questionContent.ts, the
 * same value scoring.ts reads, so a rule here and a score there can
 * never be looking at different things.
 */

import { FPA_QUESTIONS, fpaOption } from './questionContent';
import { FPA_VITALITY_QUESTION_KEY } from './constants';
import type { FpaWeightClass, FuelPattern } from './types';

export type FpaObservationId =
  | 'protein_satiety'
  | 'carbs_alone_rough'
  | 'carbs_steady'
  | 'balanced_energy'
  | 'substantial_meals'
  | 'lighter_meals'
  | 'gap_sensitivity'
  | 'long_gaps_fine'
  | 'fat_matters'
  | 'fat_sits_heavy'
  | 'no_extreme'
  | 'honest_variation';

export type FpaObservation = {
  id: FpaObservationId;
  /** The approved line, verbatim. */
  text: string;
  /** The question keys whose stored answers support it, in question order. */
  supporting: string[];
};

/** What she reads when fewer than two lines qualify. A heavy "it varies" sitting is information, not a gap. */
export const FPA_NO_OBSERVATIONS_LINE =
  'Your responses did not point strongly in one direction, and Rooted Reset treats that as honest information rather than forcing a conclusion.';

/** The most lines the section will ever print. */
export const FPA_MAX_OBSERVATIONS = 4;
/** Below this many qualifying lines, the section prints FPA_NO_OBSERVATIONS_LINE instead. */
export const FPA_MIN_OBSERVATIONS = 2;

type Ctx = {
  /** The weight class of her answer to one question, or null when she did not answer it. */
  classOf: (questionKey: string) => FpaWeightClass | null;
  /** Every question that takes part in scoring and that she answered with a scored option. */
  scoredKeys: string[];
  pattern: FuelPattern;
};

type Rule = {
  id: FpaObservationId;
  text: string;
  /** Returns the supporting question keys, or null when the rule is not met. */
  evaluate: (ctx: Ctx) => string[] | null;
};

/** The keys of every question whose answers carry a class, in question order. */
function orderKeys(keys: string[]): string[] {
  const order = FPA_QUESTIONS.map((q) => q.key);
  return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Which of `keys` she answered with one of `classes`. */
function matching(ctx: Ctx, keys: string[], classes: FpaWeightClass[]): string[] {
  return keys.filter((key) => {
    const cls = ctx.classOf(key);
    return cls !== null && classes.includes(cls);
  });
}

/** A rule of the shape "at least `min` of these questions answered in one of these classes". */
function atLeast(keys: string[], classes: FpaWeightClass[], min: number) {
  return (ctx: Ctx): string[] | null => {
    const hits = matching(ctx, keys, classes);
    return hits.length >= min ? orderKeys(hits) : null;
  };
}

/** A rule of the shape "every one of these questions answered in this class". */
function allOf(pairs: Array<[string, FpaWeightClass]>) {
  return (ctx: Ctx): string[] | null => {
    const hit = pairs.every(([key, cls]) => ctx.classOf(key) === cls);
    return hit ? orderKeys(pairs.map(([key]) => key)) : null;
  };
}

/**
 * THE APPROVED LIBRARY. The copy is verbatim and is not rewritten here or
 * anywhere downstream. The ORDER is load bearing: it is the tie break
 * when two qualifying lines have the same number of supporting answers.
 */
export const FPA_OBSERVATION_RULES: Rule[] = [
  {
    id: 'protein_satiety',
    text: 'Protein appears to support your satisfaction and staying power between meals.',
    evaluate: atLeast(['fpa_q1', 'fpa_q4', 'fpa_q16'], ['protein'], 2),
  },
  {
    id: 'carbs_alone_rough',
    text: 'Carbohydrate-heavy meals on their own do not appear to hold you steady.',
    evaluate: atLeast(['fpa_q3', 'fpa_q5', 'fpa_q8'], ['protein'], 2),
  },
  {
    id: 'carbs_steady',
    text: 'Your response to carbohydrates appears relatively steady.',
    evaluate: atLeast(['fpa_q3', 'fpa_q5', 'fpa_q8'], ['carb', 'balanced'], 2),
  },
  {
    id: 'balanced_energy',
    text: 'Balanced meals tend to hold your energy well.',
    evaluate: atLeast(['fpa_q2', 'fpa_q15', 'fpa_q22'], ['balanced'], 2),
  },
  {
    id: 'substantial_meals',
    text: 'More substantial meals appear to serve you well.',
    evaluate: atLeast(['fpa_q17', 'fpa_q18', 'fpa_q19', 'fpa_q22'], ['protein'], 2),
  },
  {
    id: 'lighter_meals',
    text: 'Lighter meals appear to leave you feeling your best.',
    evaluate: atLeast(['fpa_q18', 'fpa_q19', 'fpa_q22'], ['carb'], 2),
  },
  {
    id: 'gap_sensitivity',
    text: 'Long gaps between meals appear to work against you.',
    evaluate: allOf([
      ['fpa_q9', 'protein'],
      ['fpa_q1', 'protein'],
    ]),
  },
  {
    id: 'long_gaps_fine',
    text: 'You appear comfortable going longer stretches between meals.',
    evaluate: allOf([
      ['fpa_q1', 'carb'],
      ['fpa_q9', 'carb'],
    ]),
  },
  {
    id: 'fat_matters',
    text: 'Healthy fat appears to play a real role in how satisfying your meals feel.',
    evaluate: allOf([
      ['fpa_q12', 'protein'],
      ['fpa_q13', 'protein'],
    ]),
  },
  {
    id: 'fat_sits_heavy',
    text: 'Higher-fat meals appear to sit a little heavily for you.',
    evaluate: allOf([['fpa_q13', 'carb']]),
  },
  {
    id: 'no_extreme',
    text: 'You do not show a strong need for either extreme.',
    evaluate: (ctx) => {
      if (ctx.pattern !== 'balanced_fuel' && ctx.pattern !== 'flexible_fuel') return null;
      if (ctx.scoredKeys.length === 0) return null;
      const hits = matching(ctx, ctx.scoredKeys, ['neutral', 'tendency', 'balanced']);
      return hits.length / ctx.scoredKeys.length >= 0.6 ? orderKeys(hits) : null;
    },
  },
  {
    id: 'honest_variation',
    text: 'Your responses genuinely vary from day to day, and that is useful information in itself.',
    evaluate: (ctx) => {
      if (ctx.pattern !== 'flexible_fuel') return null;
      if (ctx.scoredKeys.length === 0) return null;
      const hits = matching(ctx, ctx.scoredKeys, ['neutral', 'tendency']);
      return hits.length / ctx.scoredKeys.length >= 0.4 ? orderKeys(hits) : null;
    },
  },
];

/**
 * Lines that would contradict each other on the same screen. Only one
 * pair is actually reachable: every other opposing pair reads opposite
 * classes of the SAME question and so cannot both fire. Written as a list
 * rather than as a special case so a future line's conflicts are declared
 * in the same place.
 */
export const CONFLICTING_PAIRS: Array<[FpaObservationId, FpaObservationId]> = [
  ['substantial_meals', 'lighter_meals'],
];

/**
 * Her answers, as the classes the rules read. An answer the content does
 * not recognise has no class, exactly as the scoring engine treats it,
 * rather than being quietly counted as one of the directions.
 */
function classReader(responses: Record<string, string>) {
  return (questionKey: string): FpaWeightClass | null => {
    const value = responses[questionKey];
    if (typeof value !== 'string' || value === '') return null;
    return fpaOption(questionKey, value)?.weight ?? null;
  };
}

/**
 * The questions that took part in scoring for this sitting: every
 * question except the vitality one, answered with an option that carries
 * a real weight class. The same denominator scoring.ts counts, so the
 * 60 percent and 40 percent rules above are measured against the same
 * number a coach reads on her row.
 */
function scoredKeysFor(responses: Record<string, string>): string[] {
  const classOf = classReader(responses);
  return FPA_QUESTIONS.filter((q) => q.key !== FPA_VITALITY_QUESTION_KEY)
    .filter((q) => {
      const cls = classOf(q.key);
      return cls !== null && cls !== 'unscored';
    })
    .map((q) => q.key);
}

/**
 * Every line her answers support, strongest first. Nothing is truncated
 * here: choosing how many to print is the caller's job, and the coach
 * side reads the whole list.
 */
export function qualifyingFpaObservations(
  responses: Record<string, string>,
  pattern: FuelPattern
): FpaObservation[] {
  const ctx: Ctx = {
    classOf: classReader(responses),
    scoredKeys: scoredKeysFor(responses),
    pattern,
  };

  const qualified: Array<FpaObservation & { rank: number }> = [];
  FPA_OBSERVATION_RULES.forEach((rule, rank) => {
    const supporting = rule.evaluate(ctx);
    if (supporting) qualified.push({ id: rule.id, text: rule.text, supporting, rank });
  });

  // Contradictions first, so a dropped line cannot take a slot from a
  // line that has nothing arguing with it.
  const dropped = new Set<FpaObservationId>();
  for (const [a, b] of CONFLICTING_PAIRS) {
    const left = qualified.find((o) => o.id === a);
    const right = qualified.find((o) => o.id === b);
    if (!left || !right) continue;
    // The weaker one goes. On a tie the one written later goes, which is
    // the same tie break the ranking uses.
    dropped.add(left.supporting.length >= right.supporting.length ? b : a);
  }

  return qualified
    .filter((o) => !dropped.has(o.id))
    .sort((x, y) => y.supporting.length - x.supporting.length || x.rank - y.rank)
    .map(({ id, text, supporting }) => ({ id, text, supporting }));
}

/**
 * The lines the member's page actually prints. An empty array means
 * fewer than two qualified and FPA_NO_OBSERVATIONS_LINE is what the
 * section says instead.
 */
export function selectFpaObservations(
  responses: Record<string, string>,
  pattern: FuelPattern
): FpaObservation[] {
  const qualifying = qualifyingFpaObservations(responses, pattern);
  if (qualifying.length < FPA_MIN_OBSERVATIONS) return [];
  return qualifying.slice(0, FPA_MAX_OBSERVATIONS);
}

/**
 * One supporting answer, in words. Nothing member facing calls this: it
 * is for the tests and the live verification rig, which have to be able
 * to say WHICH answers put a line on the screen.
 */
export function describeFpaSupport(
  responses: Record<string, string>,
  questionKey: string
): { questionKey: string; prompt: string; answer: string; weight: FpaWeightClass | null } {
  const question = FPA_QUESTIONS.find((q) => q.key === questionKey);
  const value = responses[questionKey] ?? '';
  const option = value ? fpaOption(questionKey, value) : undefined;
  return {
    questionKey,
    prompt: question?.prompt ?? questionKey,
    answer: option?.label ?? value,
    weight: option?.weight ?? null,
  };
}
