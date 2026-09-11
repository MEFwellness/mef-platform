/**
 * What the member sees, and the boundary that keeps it that way.
 *
 * THIS MODULE IS THE MEMBER LAYER. It imports ./scoring.ts, ./redFlags.ts
 * and ./retake.ts, and it does NOT import ./associations.ts, ./patterns.ts
 * or ./coachView.ts. That is the fence, and it is checked:
 * tests/body-systems-member-language.test.ts walks the import graph from
 * every member surface in this feature and fails if any coach only module
 * is reachable.
 *
 * IT SPEAKS ONLY IN LOUDNESS. Every word it can put on a screen comes from
 * three places, all of them rows: the band's own member_status_line, the
 * section's own top_attention_line, and a 'member.' prefixed copy row.
 * Nothing here composes a sentence about her body, so there is no place
 * for a medical conclusion to enter.
 *
 * NO TOTAL, NO GRADE. There is deliberately no function here that adds
 * sections together, averages them, or gives the whole survey a number.
 */

import { bandForPercent, loudestSection } from './scoring';
import { compareSections, type SectionComparison } from './retake';
import type {
  BodySystemsBand,
  BodySystemsResults,
  BodySystemsSection,
} from './types';

/** One bar on her results screen. */
export type MemberSectionBar = {
  sectionKey: string;
  sectionName: string;
  memberIntroLine: string;
  percent: number;
  bandKey: string;
  colorKey: BodySystemsBand['colorKey'];
  /** "Quiet", "Showing up", "Speaking loudly". */
  bandLabel: string;
  /** Present only on a retake. */
  comparison: SectionComparison | null;
};

/**
 * One entry in the legend that explains the three bands, ONCE, above the
 * graph.
 *
 * WHY THE BANDS AND NOT THE BARS CARRY THIS. Her screen used to repeat a
 * band's status line under every one of the eleven bars, which said the
 * same three sentences up to eleven times and made the graph read as a
 * list. The sentence belongs to the band, so it is printed once per band
 * and the bars carry only their own label.
 *
 * ALL THREE, ALWAYS, even a band no section of hers landed in, because a
 * legend that appeared and disappeared would be a fourth thing to read
 * rather than a key.
 */
export type MemberBandLegendEntry = {
  bandKey: string;
  colorKey: BodySystemsBand['colorKey'];
  /** "Quiet", "Showing up", "Speaking loudly". */
  label: string;
  /** The band's own full status line, verbatim from its row. */
  statusLine: string;
};

/** The whole member facing results screen, as data. */
export type MemberResultsView = {
  bars: MemberSectionBar[];
  /** The three bands, loudest first, explained once above the graph. */
  legend: MemberBandLegendEntry[];
  /**
   * The one personalised line, from the loudest section's own row, or null
   * when nothing is showing up at all and there is therefore no loudest
   * section to name.
   */
  topAttentionLine: string | null;
  topAttentionSectionName: string | null;
  /** True when there is a previous sitting to sit beside this one. */
  isRetake: boolean;
};

export function buildMemberResultsView(input: {
  sections: readonly BodySystemsSection[];
  bands: readonly BodySystemsBand[];
  results: BodySystemsResults;
  previousResults: BodySystemsResults | null;
  minDeltaPercent: number;
}): MemberResultsView {
  const { sections, bands, results, previousResults, minDeltaPercent } = input;

  const comparisons = new Map(
    compareSections({ current: results, previous: previousResults, minDelta: minDeltaPercent }).map(
      (entry) => [entry.sectionKey, entry]
    )
  );

  const bars: MemberSectionBar[] = results.sections.map((result) => {
    const section = sections.find((entry) => entry.sectionKey === result.sectionKey);
    const band =
      bands.find((entry) => entry.bandKey === result.bandKey) ??
      bandForPercent(bands, result.percent);
    const comparison = previousResults ? (comparisons.get(result.sectionKey) ?? null) : null;
    return {
      sectionKey: result.sectionKey,
      sectionName: section?.displayName ?? result.sectionKey,
      memberIntroLine: section?.memberIntroLine ?? '',
      percent: result.percent,
      bandKey: result.bandKey,
      colorKey: band.colorKey,
      bandLabel: band.memberLabel,
      comparison: comparison && comparison.previousPercent !== null ? comparison : null,
    };
  });

  const loudest = loudestSection(results);
  const loudestSectionRow = loudest
    ? (sections.find((entry) => entry.sectionKey === loudest.sectionKey) ?? null)
    : null;

  // Loudest first, the order the specification lists them in and the same
  // direction the graph under it reads.
  const legend: MemberBandLegendEntry[] = bands
    .slice()
    .sort((a, b) => b.position - a.position)
    .map((band) => ({
      bandKey: band.bandKey,
      colorKey: band.colorKey,
      label: band.memberLabel,
      statusLine: band.memberStatusLine,
    }));

  return {
    bars,
    legend,
    topAttentionLine: loudestSectionRow?.topAttentionLine ?? null,
    topAttentionSectionName: loudestSectionRow?.displayName ?? null,
    isRetake: previousResults !== null,
  };
}
