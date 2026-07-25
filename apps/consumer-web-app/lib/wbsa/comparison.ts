/**
 * WBSA retake comparison — pure, no I/O. Same shape/purpose as
 * lib/body-assessment/comparison.ts: given two completed sessions' system
 * breakdowns (the earlier one, then the later one), produce one
 * ComparisonRow per body system present on either side. Deliberately its
 * own small local vocabulary (WbsaComparisonTrend), same convention every
 * other comparison module here already follows — see
 * lib/assessment-comparison/adapters.ts's fromWbsaDirection for the
 * translation into the canonical cross-assessment ComparisonDirection.
 */

import type { WbsaBand, WbsaSystemBreakdownRow } from './results';

export type WbsaComparisonTrend = 'improved' | 'stable' | 'declined' | 'unknown';

export type WbsaComparisonRow = {
  sectionTitle: string;
  earlierBand: WbsaBand | null;
  laterBand: WbsaBand | null;
  trend: WbsaComparisonTrend;
  summary: string;
};

const BAND_RANK: Record<WbsaBand, number> = { lower: 0, watch: 1, needs_context: 2 };

function trendFor(earlier: WbsaBand | null, later: WbsaBand | null): WbsaComparisonTrend {
  if (earlier === null || later === null) return 'unknown';
  const earlierRank = BAND_RANK[earlier];
  const laterRank = BAND_RANK[later];
  if (laterRank < earlierRank) return 'improved';
  if (laterRank > earlierRank) return 'declined';
  return 'stable';
}

function summarize(sectionTitle: string, trend: WbsaComparisonTrend, later: WbsaBand | null): string {
  switch (trend) {
    case 'improved':
      return `${sectionTitle} showed fewer reported patterns than your last assessment.`;
    case 'declined':
      return `${sectionTitle} showed more reported patterns than your last assessment.`;
    case 'stable':
      return `${sectionTitle} looks about the same as your last assessment.`;
    default:
      return later
        ? `${sectionTitle} wasn't present on your earlier assessment to compare against.`
        : `Not enough data to compare ${sectionTitle} between assessments.`;
  }
}

export function compareWbsaSystemBreakdowns(
  earlier: WbsaSystemBreakdownRow[],
  later: WbsaSystemBreakdownRow[]
): WbsaComparisonRow[] {
  const earlierByTitle = new Map(earlier.map((row) => [row.title, row]));
  const laterByTitle = new Map(later.map((row) => [row.title, row]));
  const titles = new Set<string>([...earlierByTitle.keys(), ...laterByTitle.keys()]);

  return [...titles].map((sectionTitle) => {
    const earlierBand = earlierByTitle.get(sectionTitle)?.band ?? null;
    const laterBand = laterByTitle.get(sectionTitle)?.band ?? null;
    const trend = trendFor(earlierBand, laterBand);
    return {
      sectionTitle,
      earlierBand,
      laterBand,
      trend,
      summary: summarize(sectionTitle, trend, laterBand),
    };
  });
}
