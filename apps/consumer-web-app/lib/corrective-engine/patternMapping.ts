/**
 * Maps a member's latest completed posture-assessment findings
 * (body_assessment_findings, migration 37) onto the 4 corrective
 * blueprints. Pure function — no Supabase access — see findings.ts for the
 * DB read that feeds it.
 *
 * The Universal Registry of finding_types (body-assessment.types.ts) was
 * built before the 4 named corrective blueprints existed, so only two
 * finding_types map 1:1 onto a blueprint (forward_head, lower_crossed_
 * pattern). Upper Cross and Flat Back have no dedicated finding_type yet —
 * this is a documented modeling decision, not a data gap:
 *
 *   - Upper Cross is inferred from rounded_shoulders and/or
 *     elevated_shoulder and/or thoracic_kyphosis — the external signals a
 *     static_posture assessment actually produces for an upper-quadrant
 *     crossed pattern.
 *   - Flat Back is inferred from lumbar_posture, which measures lumbar
 *     curvature outside neutral in either direction (the assessment has no
 *     signal for which direction). Lower Cross (hyperlordotic/anterior)
 *     and Flat Back (flattened/posterior) sit at opposite ends of the same
 *     lumbar-curvature spectrum, so they are treated as mutually exclusive
 *     per assessment: lumbar_posture only produces a Flat Back pattern when
 *     lower_crossed_pattern is NOT also present on the same assessment. A
 *     future dedicated flat_back-style finding_type (or a directional
 *     lumbar-curvature signal) would let this be a direct 1:1 mapping like
 *     the other two — recorded as a known follow-up in BUILD_STATUS.md.
 */
import type { BodyAssessmentFinding, FindingSeverity } from '@mef/shared-types-contracts';
import type { BlueprintKey, CorrectiveSeverity, DetectedPattern } from './types';
import { SEVERITY_RANK } from './types';

function toCorrectiveSeverity(severity: FindingSeverity): CorrectiveSeverity | null {
  if (severity === 'significant') return 'severe';
  if (severity === 'moderate') return 'moderate';
  if (severity === 'mild') return 'mild';
  return null; // 'none' / 'unknown' carry no corrective signal
}

function worstSeverity(a: CorrectiveSeverity, b: CorrectiveSeverity): CorrectiveSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/** Findings that count as "real" evidence for pattern detection — dismissed/superseded findings are explicitly excluded (they were reviewed and rejected, or replaced by a newer finding), draft findings never leave the capture flow. */
const ACTIVE_STATUSES = new Set(['pending_review', 'confirmed', 'coach_overridden']);

function contribute(
  byBlueprint: Map<BlueprintKey, { severity: CorrectiveSeverity; findingIds: Set<string> }>,
  blueprint: BlueprintKey,
  finding: BodyAssessmentFinding,
  severity: CorrectiveSeverity
) {
  const existing = byBlueprint.get(blueprint);
  if (existing) {
    existing.severity = worstSeverity(existing.severity, severity);
    existing.findingIds.add(finding.id);
  } else {
    byBlueprint.set(blueprint, { severity, findingIds: new Set([finding.id]) });
  }
}

/** Detects which of the 4 corrective blueprints apply, and at what severity, from a member's active posture-assessment findings. A member can match more than one blueprint (pattern stacking, e.g. upper cross + forward head). */
export function detectCorrectivePatterns(findings: BodyAssessmentFinding[]): DetectedPattern[] {
  const usable = findings.filter((f) => ACTIVE_STATUSES.has(f.status));
  const byBlueprint = new Map<BlueprintKey, { severity: CorrectiveSeverity; findingIds: Set<string> }>();

  for (const finding of usable) {
    const severity = toCorrectiveSeverity(finding.severity);
    if (!severity) continue;

    if (finding.finding_type === 'forward_head') {
      contribute(byBlueprint, 'forward_head', finding, severity);
    } else if (finding.finding_type === 'lower_crossed_pattern') {
      contribute(byBlueprint, 'lower_cross', finding, severity);
    } else if (
      finding.finding_type === 'rounded_shoulders' ||
      finding.finding_type === 'elevated_shoulder' ||
      finding.finding_type === 'thoracic_kyphosis'
    ) {
      contribute(byBlueprint, 'upper_cross', finding, severity);
    }
  }

  const lumbarFindings = usable.filter((f) => f.finding_type === 'lumbar_posture');
  if (lumbarFindings.length > 0 && !byBlueprint.has('lower_cross')) {
    for (const finding of lumbarFindings) {
      const severity = toCorrectiveSeverity(finding.severity);
      if (severity) contribute(byBlueprint, 'flat_back', finding, severity);
    }
  }

  return Array.from(byBlueprint.entries()).map(([blueprint, { severity, findingIds }]) => ({
    blueprint,
    severity,
    supportingFindingIds: Array.from(findingIds),
  }));
}

/** The severity dial for the whole program: the worst individual finding across all detected/stacked patterns. */
export function overallSeverity(patterns: DetectedPattern[]): CorrectiveSeverity {
  return patterns.reduce<CorrectiveSeverity>(
    (worst, p) => worstSeverity(worst, p.severity),
    'mild'
  );
}
