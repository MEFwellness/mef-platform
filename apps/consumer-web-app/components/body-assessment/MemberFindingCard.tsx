/**
 * A single member-facing posture screening tile. Purely presentational —
 * all the "how do we word this" logic lives in the copy object the caller
 * (MemberFindingsSummary.tsx) builds from a raw BodyAssessmentFinding, so
 * this component never sees severity/confidence numbers directly and can't
 * accidentally leak them into the UI.
 */

import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { BodyAssessmentFinding } from '@mef/shared-types-contracts';
import { FINDING_TYPE_CONFIG } from '@/lib/body-assessment/findings';

export type MemberFindingTone = 'calm' | 'attention';

export type MemberFindingCopy = {
  /** Short status pill text — e.g. "Detected", "Possible asymmetry", "Review recommended". Never a raw severity/degree value. */
  headline: string;
  /** 'attention' gets a measured amber tone, never red — see PoseOverlay.tsx's warning-tone convention (read-only reference, not imported here). */
  tone: MemberFindingTone;
  /** Whether/when a coach has looked at this — "Reviewed by your coach" vs "Your coach will confirm this at your next review". */
  reviewNote: string;
  /** Optional qualitative (never numeric) confidence hint, or null to omit. */
  confidenceNote: string | null;
};

const TONE_ICON_WRAP: Record<MemberFindingTone, string> = {
  calm: 'bg-emerald-50 text-emerald-600',
  attention: 'bg-amber-50 text-amber-700',
};

const TONE_BADGE: Record<MemberFindingTone, string> = {
  calm: 'bg-emerald-50 text-emerald-700',
  attention: 'bg-amber-100 text-amber-800',
};

const SIDE_LABEL: Partial<Record<BodyAssessmentFinding['side'], string>> = {
  left: 'Left side',
  right: 'Right side',
  bilateral: 'Both sides',
};

export function MemberFindingCard({
  finding,
  copy,
}: {
  finding: BodyAssessmentFinding;
  copy: MemberFindingCopy;
}) {
  const config = FINDING_TYPE_CONFIG[finding.finding_type];
  const Icon = copy.tone === 'attention' ? AlertCircle : CheckCircle2;
  const sideLabel = SIDE_LABEL[finding.side];

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[#FAFAF8] p-4">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_ICON_WRAP[copy.tone]}`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-[#1B3A2D]">{config.label}</p>
          {sideLabel && <span className="text-[11px] text-[#9AA79F]">{sideLabel}</span>}
          <span
            className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${TONE_BADGE[copy.tone]}`}
          >
            {copy.headline}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-[#6B7A72]">{config.description}</p>
        <p className="mt-2 text-[11px] text-[#9AA79F]">
          {copy.reviewNote}
          {copy.confidenceNote ? ` · ${copy.confidenceNote}` : ''}
        </p>
      </div>
    </div>
  );
}
