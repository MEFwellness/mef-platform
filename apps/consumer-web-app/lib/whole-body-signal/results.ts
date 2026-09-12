/**
 * The whole stored reading, built once from her answers.
 *
 * ONE FUNCTION, ONE ANSWER. Sections, Zones and the Signal Load are built
 * together from the same answers in the same pass, so nothing downstream
 * can rebuild one of the three from a different set of inputs and disagree
 * with the other two. What lands in
 * member_whole_body_signal_sessions.results is exactly what this returns.
 *
 * NUMBERS AND SLUGS ONLY. Not one sentence is stored here: every word a
 * member or a coach reads about this sitting is rendered at read time from
 * the stored copy rows, so a wording fix reaches every past sitting at
 * once and a member and her coach can never read two different readings of
 * one sitting.
 */

import { buildSectionResults, buildSignalLoad, buildZoneResults } from './scoring';
import type { WbsSettings } from './settings';
import type {
  BranchRule,
  ReadingQuestion,
  ScaleOption,
  SignalBand,
  WbsAnswers,
  WbsResults,
} from './types';

export function buildResults(input: {
  sections: readonly { sectionKey: string; position: number }[];
  questions: readonly ReadingQuestion[];
  scale: readonly ScaleOption[];
  bands: readonly SignalBand[];
  branchRules: readonly BranchRule[];
  /** The fixed Zone display order. Keys and positions only, never words. */
  zoneOrder: readonly { zoneKey: string; position: number }[];
  answers: WbsAnswers;
  routingOptionKey: string | null;
  settings: WbsSettings;
}): WbsResults {
  const sections = buildSectionResults({
    sections: input.sections,
    questions: input.questions,
    scale: input.scale,
    bands: input.bands,
    branchRules: input.branchRules,
    answers: input.answers,
    routingOptionKey: input.routingOptionKey,
  });

  const zones = buildZoneResults({
    questions: input.questions,
    scale: input.scale,
    branchRules: input.branchRules,
    answers: input.answers,
    routingOptionKey: input.routingOptionKey,
    zoneOrder: input.zoneOrder,
  });

  const load = buildSignalLoad({
    sections,
    weightA: input.settings.weightA,
    weightB: input.settings.weightB,
    weightC: input.settings.weightC,
    elevatedMinPercent: input.settings.elevatedMinPercent,
    topComponentCount: input.settings.topComponentCount,
  });

  return { routingOptionKey: input.routingOptionKey, sections, zones, load };
}

/**
 * The primary Zone, and the secondary one when it earns its place.
 *
 * THE SECONDARY IS SUPPRESSED RATHER THAN SHOWN QUIETLY. It is displayed
 * only when it is at least the stored absolute floor AND at least the
 * stored share of the primary. A second Zone that is neither is not a
 * pattern, it is the next line of a list, and printing it would put a
 * reading in front of a coach that the numbers do not support.
 */
export function zonePatterns(
  results: WbsResults,
  settings: WbsSettings
): { primary: WbsResults['zones'][number] | null; secondary: WbsResults['zones'][number] | null } {
  const primary = results.zones[0] ?? null;
  if (!primary || primary.percent <= 0) return { primary: null, secondary: null };

  const candidate = results.zones[1] ?? null;
  if (!candidate) return { primary, secondary: null };

  const meetsAbsolute = candidate.percent >= settings.secondaryZoneMinPercent;
  const meetsShare = candidate.percent >= primary.percent * settings.secondaryZoneMinRatio;
  return { primary, secondary: meetsAbsolute && meetsShare ? candidate : null };
}

/**
 * The sections this assessment recommends as coaching priorities.
 *
 * The loudest, capped by the stored maximum, and only sections that
 * actually have a signal. When nothing is showing up there is no priority
 * to name, and naming one anyway would be the assessment claiming
 * something its own numbers do not say.
 */
export function recommendedPriorities(
  results: WbsResults,
  settings: WbsSettings
): WbsResults['sections'] {
  return results.sections
    .filter((section) => section.possible > 0 && section.percent > 0)
    .slice(0, Math.max(1, settings.maxPriorities));
}
