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
  /** The band's own full status line, verbatim from its row. */
  statusLine: string;
  /** Present only on a retake. */
  comparison: SectionComparison | null;
};

/** The whole member facing results screen, as data. */
export type MemberResultsView = {
  bars: MemberSectionBar[];
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
      statusLine: band.memberStatusLine,
      comparison: comparison && comparison.previousPercent !== null ? comparison : null,
    };
  });

  const loudest = loudestSection(results);
  const loudestSectionRow = loudest
    ? (sections.find((entry) => entry.sectionKey === loudest.sectionKey) ?? null)
    : null;

  return {
    bars,
    topAttentionLine: loudestSectionRow?.topAttentionLine ?? null,
    topAttentionSectionName: loudestSectionRow?.displayName ?? null,
    isRetake: previousResults !== null,
  };
}
