/**
 * The cross section patterns. COACH ONLY.
 *
 * EVERY WORD A COACH READS ABOUT A PATTERN IS A COLUMN ON THE ROW THAT
 * FIRED. Nothing here composes a sentence, so there is no place for a
 * conclusion to enter that a practitioner did not write.
 *
 * A FIRED PATTERN CITES THE SECTIONS THAT FIRED IT, collected while it is
 * being evaluated rather than reconstructed afterwards, so a coach can see
 * which numbers put it on the screen.
 *
 * WHERE THE THRESHOLD COMES FROM. A rule that names no minPercent reads
 * the one stored elevated threshold, which is the same number the Signal
 * Load's component B and every coaching trigger use. That is what keeps
 * "elevated" meaning one thing across the whole instrument.
 */

import type { SectionResult, SignalPattern, WbsResults } from './types';

export type FiredPattern = {
  patternKey: string;
  title: string;
  coachText: string;
  /** The sections whose numbers satisfied the rule, loudest first. */
  citedSections: SectionResult[];
};

function elevatedSections(
  results: WbsResults,
  minPercent: number
): SectionResult[] {
  return results.sections.filter(
    (section) => section.possible > 0 && section.percent >= minPercent
  );
}

export function evaluatePatterns(input: {
  patterns: readonly SignalPattern[];
  results: WbsResults;
  elevatedMinPercent: number;
}): FiredPattern[] {
  const fired: FiredPattern[] = [];

  for (const pattern of input.patterns.slice().sort((a, b) => a.position - b.position)) {
    const threshold = pattern.rule.minPercent ?? input.elevatedMinPercent;
    const elevated = elevatedSections(input.results, threshold);

    if (pattern.rule.type === 'sections_at_or_above') {
      const cited: SectionResult[] = [];
      let all = true;
      for (const sectionKey of pattern.rule.sections) {
        const match = elevated.find((section) => section.sectionKey === sectionKey);
        if (!match) {
          all = false;
          break;
        }
        cited.push(match);
      }
      if (!all) continue;
      fired.push({
        patternKey: pattern.patternKey,
        title: pattern.title,
        coachText: pattern.coachText,
        citedSections: cited.slice().sort((a, b) => b.percent - a.percent),
      });
      continue;
    }

    if (elevated.length >= pattern.rule.minCount) {
      fired.push({
        patternKey: pattern.patternKey,
        title: pattern.title,
        coachText: pattern.coachText,
        citedSections: elevated.slice().sort((a, b) => b.percent - a.percent),
      });
    }
  }

  return fired;
}
