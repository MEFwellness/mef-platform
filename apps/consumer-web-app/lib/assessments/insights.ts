/**
 * Reusable Assessment Engine — insights. Deterministic, template-based
 * summary generation from a completed QuestionnaireScoreResult: no LLM
 * call, no randomness, same scores always produce the same summary. Same
 * discipline as lib/scoring/explain.ts's buildExplanation for Root Score —
 * this is the questionnaire-assessment equivalent, generalized to work
 * with any registered questionnaire's categories rather than Root Score's
 * fixed five domains.
 *
 * Wellness-education language only: describes which areas the member's
 * own answers point to and what commonly helps, never a diagnosis, a
 * disease claim, or medical advice. ASSESSMENT_SAFETY_STATEMENT is shown
 * alongside every result, exactly like Root Score's SAFETY_STATEMENT.
 */

import type { AssessmentCopy, PriorityLevel, Questionnaire, QuestionnaireScoreResult } from './engine/types';

export const ASSESSMENT_SAFETY_STATEMENT =
  'This assessment is a wellness coaching guide built from your own answers about everyday habits and how you feel — it is not a medical diagnosis, a lab test, or a clinical measurement. Talk to a qualified healthcare provider about any symptom that concerns you.';

export type WellnessInsight = {
  headline: string;
  summary: string;
  /** High-priority category ids first (worst score first), then moderate — nothing from "low". Empty when nothing needs attention. */
  focusCategoryIds: string[];
};

const HEADLINE_BY_PRIORITY: Record<PriorityLevel, string> = {
  high: 'A few areas deserve your attention',
  moderate: 'Steady, with some room to grow',
  low: 'A strong overall pattern',
};

/**
 * Hand-authored relationship phrasing for category combinations that are
 * commonly physiologically linked (e.g. sleep rhythm, stress, and
 * digestion). Checked most-specific-first; a combination not covered here
 * falls back to the generic multi-category sentence below — the fallback
 * is deliberately generic rather than silent, so a future questionnaire's
 * categories (which won't appear in this list) still produce a coherent
 * summary.
 */
const RELATIONSHIP_RULES: { categories: string[]; focusCategoryId: string; sentence: string }[] = [
  {
    categories: ['stress', 'circadian_health', 'digestive_system_health'],
    focusCategoryId: 'circadian_health',
    sentence:
      'Your stress, circadian rhythm, and digestive scores all indicate they deserve greater attention. These areas commonly influence one another — improving sleep consistency may positively support stress recovery and digestive wellness.',
  },
  {
    categories: ['circadian_health', 'you_are_when_you_eat'],
    focusCategoryId: 'circadian_health',
    sentence:
      'Your circadian rhythm and meal-timing scores both indicate they deserve greater attention. A more consistent wake time and a regular meal schedule tend to reinforce each other.',
  },
  {
    categories: ['stress', 'detoxification_system_health'],
    focusCategoryId: 'stress',
    sentence:
      'Your stress and detoxification scores both indicate they deserve greater attention. Chronic stress and a taxed detox system commonly show up together — building in real recovery time is usually the highest-leverage first step.',
  },
  {
    categories: ['you_are_what_you_eat', 'digestive_system_health'],
    focusCategoryId: 'you_are_what_you_eat',
    sentence:
      'Your food-choices and digestive scores both indicate they deserve greater attention. Shifting toward fresher, less processed meals often eases digestive discomfort within a few weeks.',
  },
  {
    categories: ['fungus_and_parasites', 'digestive_system_health'],
    focusCategoryId: 'digestive_system_health',
    sentence:
      "Your gut-balance and digestive scores both indicate they deserve greater attention — they're closely linked. Easing off sugar and processed foods tends to support both together.",
  },
];

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function buildWellnessInsight(
  result: QuestionnaireScoreResult,
  questionnaire: Questionnaire,
  copy: AssessmentCopy
): WellnessInsight {
  const labelFor = (categoryId: string) => copy.categoryCopy[categoryId]?.shortLabel ?? categoryId;

  const byPriorityDescendingScore = (priority: PriorityLevel) =>
    result.categoryScores
      .filter((c) => c.priority === priority)
      .sort((a, b) => b.score / b.maxScore - a.score / a.maxScore);

  const high = byPriorityDescendingScore('high');
  const moderate = byPriorityDescendingScore('moderate');

  const headline = HEADLINE_BY_PRIORITY[result.totalPriority];

  if (high.length === 0 && moderate.length === 0) {
    return {
      headline,
      summary:
        "Every area of this assessment currently falls in the low-priority range — a strong overall pattern across nutrition, stress, rhythm, and digestion. Keep doing what's working.",
      focusCategoryIds: [],
    };
  }

  if (high.length === 0) {
    const names = moderate.map((c) => labelFor(c.categoryId));
    return {
      headline,
      summary: `Everything here sits at low or moderate priority — a solid overall pattern. Keep an eye on ${joinWithAnd(
        names
      )}, which are trending toward needing more attention.`,
      focusCategoryIds: moderate.map((c) => c.categoryId),
    };
  }

  if (high.length === 1) {
    const single = high[0]!;
    return {
      headline,
      summary: `Your ${labelFor(single.categoryId)} score currently stands out as the area most worth attention. Small, consistent changes there tend to compound into how you feel across other areas too.`,
      focusCategoryIds: [single.categoryId, ...moderate.map((c) => c.categoryId)],
    };
  }

  const highIds = new Set(high.map((c) => c.categoryId));
  const rule = RELATIONSHIP_RULES.find((r) => r.categories.every((id) => highIds.has(id)));
  const focusCategoryIds = [...high.map((c) => c.categoryId), ...moderate.map((c) => c.categoryId)];

  if (rule) {
    return { headline, summary: rule.sentence, focusCategoryIds };
  }

  const names = high.map((c) => labelFor(c.categoryId));
  const focusLabel = labelFor(high[0]!.categoryId);
  return {
    headline,
    summary: `Your ${joinWithAnd(
      names
    )} scores all indicate they deserve greater attention. These areas commonly influence one another — small, consistent improvements in ${focusLabel} are a reasonable place to start.`,
    focusCategoryIds,
  };
}
