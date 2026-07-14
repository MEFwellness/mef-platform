/**
 * The reusable comparison engine — pure functions, no I/O, no fabrication.
 * Given the findings from two assessments (assessment A, the earlier one,
 * vs. assessment B, the later one), produces one ComparisonRow per
 * finding_type present on either side plus one 'overall' rollup row.
 *
 * This is intentionally the same shape regardless of which two
 * assessments are being compared (assessment 1 vs 2, assessment 2 vs 3,
 * baseline vs latest, etc.) — the caller (app/actions/body-assessment.ts)
 * decides which pair to run this on and persists the result to
 * body_assessment_comparisons; this module never touches the database.
 */

import type {
  BodyAssessmentFinding,
  ComparisonTrend,
  FindingSeverity,
  PostureFindingType,
} from '@mef/shared-types-contracts';
import { SEVERITY_RANK } from './findings';

export type ComparableFinding = Pick<
  BodyAssessmentFinding,
  'finding_type' | 'severity' | 'confidence' | 'status'
>;

export type ComparisonRow = {
  dimension: PostureFindingType | 'overall';
  trend: ComparisonTrend;
  confidence: number;
  summary: string;
};

const ACTIVE_STATUSES = new Set(['pending_review', 'confirmed', 'coach_overridden']);

/** Only active, non-dismissed findings count — a dismissed or superseded finding is no longer this member's current state. */
function activeFindings(findings: ComparableFinding[]): ComparableFinding[] {
  return findings.filter((f) => ACTIVE_STATUSES.has(f.status));
}

/** The most severe active finding of a given type — ties broken by highest confidence, since that's the most defensible single representative of "what was true in this assessment" for the type. */
function representativeFinding(
  findings: ComparableFinding[],
  findingType: PostureFindingType
): ComparableFinding | null {
  const candidates = findings.filter((f) => f.finding_type === findingType);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) => {
    if (candidate.severity === 'unknown' || best.severity === 'unknown') {
      return candidate.confidence > best.confidence ? candidate : best;
    }
    const candidateRank = SEVERITY_RANK[candidate.severity];
    const bestRank = SEVERITY_RANK[best.severity];
    if (candidateRank !== bestRank) return candidateRank > bestRank ? candidate : best;
    return candidate.confidence > best.confidence ? candidate : best;
  });
}

function severityTrend(before: FindingSeverity, after: FindingSeverity): ComparisonTrend {
  if (before === 'unknown' || after === 'unknown') return 'unknown';
  const beforeRank = SEVERITY_RANK[before];
  const afterRank = SEVERITY_RANK[after];
  if (afterRank < beforeRank) return 'improved';
  if (afterRank > beforeRank) return 'declined';
  return 'stable';
}

function summarizeDimension(
  findingType: PostureFindingType,
  before: ComparableFinding | null,
  after: ComparableFinding | null,
  trend: ComparisonTrend
): string {
  if (!before && !after) return 'No finding recorded on either assessment.';
  if (!before && after) return `New finding since the earlier assessment (${after.severity}).`;
  if (before && !after) return 'No longer observed in the later assessment.';
  if (!before || !after) return 'Not enough data to compare.';

  switch (trend) {
    case 'improved':
      return `Improved from ${before.severity} to ${after.severity}.`;
    case 'declined':
      return `Changed from ${before.severity} to ${after.severity} — worth a closer look.`;
    case 'stable':
      return `Remained ${after.severity} across both assessments.`;
    default:
      return 'Confidence too low on one or both assessments to determine a trend.';
  }
}

/** One ComparisonRow per finding_type present (as an active finding) on either side of the pair. */
export function compareFindingSets(
  earlierFindings: ComparableFinding[],
  laterFindings: ComparableFinding[]
): ComparisonRow[] {
  const earlier = activeFindings(earlierFindings);
  const later = activeFindings(laterFindings);

  const findingTypes = new Set<PostureFindingType>([
    ...earlier.map((f) => f.finding_type),
    ...later.map((f) => f.finding_type),
  ]);

  const rows: ComparisonRow[] = [];
  for (const findingType of findingTypes) {
    const before = representativeFinding(earlier, findingType);
    const after = representativeFinding(later, findingType);

    let trend: ComparisonTrend = 'unknown';
    if (before && after) trend = severityTrend(before.severity, after.severity);
    else if (!before && after)
      trend = 'declined'; // a brand-new finding is never "improved"
    else if (before && !after) trend = 'improved'; // previously observed, no longer present

    const confidence = Math.min(before?.confidence ?? 0.5, after?.confidence ?? 0.5);

    rows.push({
      dimension: findingType,
      trend,
      confidence,
      summary: summarizeDimension(findingType, before, after, trend),
    });
  }

  rows.push(overallRow(rows));
  return rows;
}

/** A conservative rollup: any decline anywhere makes the overall trend 'declined' (a single worsening finding shouldn't be masked by several stable ones); otherwise any improvement makes it 'improved'; otherwise 'stable' if everything resolved, else 'unknown'. */
function overallRow(dimensionRows: ComparisonRow[]): ComparisonRow {
  if (dimensionRows.length === 0) {
    return {
      dimension: 'overall',
      trend: 'unknown',
      confidence: 0,
      summary: 'No findings to compare yet.',
    };
  }

  const trends = dimensionRows.map((r) => r.trend);
  const declinedCount = trends.filter((t) => t === 'declined').length;
  const improvedCount = trends.filter((t) => t === 'improved').length;
  const unknownCount = trends.filter((t) => t === 'unknown').length;

  let trend: ComparisonTrend;
  if (declinedCount > 0) trend = 'declined';
  else if (improvedCount > 0) trend = 'improved';
  else if (unknownCount === trends.length) trend = 'unknown';
  else trend = 'stable';

  const confidence = dimensionRows.reduce((sum, r) => sum + r.confidence, 0) / dimensionRows.length;

  const summary =
    trend === 'declined'
      ? `${declinedCount} area${declinedCount === 1 ? '' : 's'} changed for the worse since the earlier assessment.`
      : trend === 'improved'
        ? `${improvedCount} area${improvedCount === 1 ? '' : 's'} improved since the earlier assessment.`
        : trend === 'stable'
          ? 'No meaningful change since the earlier assessment.'
          : 'Not enough confident findings yet to determine an overall trend.';

  return { dimension: 'overall', trend, confidence, summary };
}
