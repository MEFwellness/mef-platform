/**
 * Member-facing translation of the raw on-device screening estimates
 * (body_assessment_findings, written by recordPostureFindingsAction during
 * capture) into calm, non-alarming language. This fills the gap a prior
 * audit flagged: nothing previously rendered a member's own findings back
 * to them between submitting an assessment and a coach eventually
 * publishing a full AI report (ClientReportView.tsx) — which can take a
 * while, since it's a coach-driven workflow. This section is deliberately
 * shown only while that fuller report is still pending (see
 * app/assessment/[id]/page.tsx).
 *
 * No raw degrees, ratios, or confidence percentages are ever rendered here
 * — those stay practitioner-only, same convention as this dashboard's
 * PostureFindingsSection.tsx (app/coach/clients/[id]/body-assessments/
 * [assessmentId]/RightPanel/PostureFindingsSection.tsx, read-only
 * reference). Labels/descriptions are reused verbatim from
 * FINDING_TYPE_CONFIG rather than re-invented here.
 */

import { Activity, ShieldCheck } from 'lucide-react';
import type { BodyAssessmentFinding, FindingSeverity, FindingStatus } from '@mef/shared-types-contracts';
import { MemberFindingCard, type MemberFindingCopy } from './MemberFindingCard';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

// A member should only ever see a finding a coach has already accepted as
// worth attention, or one that simply hasn't been ruled out yet — never
// one a coach explicitly dismissed. 'confirmed' and 'pending_review' are
// the two statuses called out directly; 'coach_overridden' rows are
// included too because that status only ever exists when a coach has
// *already* reviewed and hand-corrected a finding (see
// overrideFindingAction in app/actions/body-assessment.ts, read-only) —
// hiding the one row a coach explicitly authored would be a stranger
// member experience than showing it. 'draft' and 'superseded' rows are
// intentionally never shown.
const DISPLAY_STATUSES = new Set<FindingStatus>(['confirmed', 'pending_review', 'coach_overridden']);

// Below this confidence the screening estimate is too uncertain to be
// worth a member-facing tile at all.
const MIN_CONFIDENCE_TO_DISPLAY = 0.3;

const SEVERITY_SORT_RANK: Record<FindingSeverity, number> = {
  significant: 3,
  moderate: 2,
  mild: 1,
  unknown: 0,
  none: -1,
};

function copyFor(finding: BodyAssessmentFinding): MemberFindingCopy {
  const reviewed = finding.status === 'confirmed' || finding.status === 'coach_overridden';
  const reviewNote = reviewed
    ? 'Reviewed by your coach'
    : "Your coach will confirm this at your next review";

  let confidenceNote: string | null = null;
  if (finding.confidence >= 0.7) confidenceNote = 'Based on a clear reading';
  else if (finding.confidence < 0.45) confidenceNote = 'Based on a limited reading';

  if (finding.severity === 'significant') {
    return { headline: 'Review recommended', tone: 'attention', reviewNote, confidenceNote };
  }
  if (finding.severity === 'moderate') {
    return { headline: 'Possible asymmetry', tone: 'attention', reviewNote, confidenceNote };
  }
  if (finding.severity === 'mild') {
    return { headline: 'Slight variation detected', tone: 'calm', reviewNote, confidenceNote };
  }
  // 'unknown' severity that still cleared the confidence filter below —
  // worded the same register as "mild": there's a real enough signal to
  // mention, but nothing to grade more sharply than "detected."
  return { headline: 'Detected', tone: 'calm', reviewNote, confidenceNote };
}

/**
 * Dedupes to one tile per finding_type+side, keeping whichever candidate
 * is most worth a member's attention (most severe, then most confident).
 * A single assessment can produce more than one screening estimate for
 * the same finding_type+side across different captures (e.g. a front and
 * a back view both flagging elevated_shoulder) — stacking near-duplicate
 * tiles would work against the "small, elegant set" this view is meant to
 * be.
 */
function dedupe(findings: BodyAssessmentFinding[]): BodyAssessmentFinding[] {
  const bestByKey = new Map<string, BodyAssessmentFinding>();
  for (const finding of findings) {
    const key = `${finding.finding_type}:${finding.side}`;
    const current = bestByKey.get(key);
    if (!current) {
      bestByKey.set(key, finding);
      continue;
    }
    const currentRank = SEVERITY_SORT_RANK[current.severity];
    const nextRank = SEVERITY_SORT_RANK[finding.severity];
    if (nextRank > currentRank || (nextRank === currentRank && finding.confidence > current.confidence)) {
      bestByKey.set(key, finding);
    }
  }
  return Array.from(bestByKey.values());
}

export function MemberFindingsSummary({ findings }: { findings: BodyAssessmentFinding[] }) {
  // No findings recorded at all (e.g. pose tracking never got a stable
  // capture) is a different situation from "screening ran and found
  // nothing worth flagging" — saying "looked balanced" in the former case
  // would overclaim, so this section simply doesn't render rather than
  // guessing.
  if (findings.length === 0) return null;

  const displayable = dedupe(
    findings.filter(
      (f) =>
        DISPLAY_STATUSES.has(f.status) &&
        f.severity !== 'none' &&
        f.confidence >= MIN_CONFIDENCE_TO_DISPLAY
    )
  ).sort(
    (a, b) =>
      SEVERITY_SORT_RANK[b.severity] - SEVERITY_SORT_RANK[a.severity] || b.confidence - a.confidence
  );

  return (
    <section className={`${CARD} mef-animate-in p-6`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        What We Noticed
      </p>

      {displayable.length === 0 ? (
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-[#FAFAF8] p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p className="text-sm leading-relaxed text-[#1B3A2D]">
            Nothing stood out in this screening — your posture looked balanced across what we
            could observe.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {displayable.map((finding) => (
            <li key={finding.id}>
              <MemberFindingCard finding={finding} copy={copyFor(finding)} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-[#9AA79F]">
        This is a wellness screening based on your photos and videos, not a medical diagnosis.
        Your coach reviews every finding before it becomes part of your plan.
      </p>
    </section>
  );
}
