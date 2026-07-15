'use client';

/**
 * Practitioner-facing view of the on-device MediaPipe screening estimates
 * (lib/body-assessment/postureMeasurements.ts) — every finding here was
 * written client-side at capture time under the member's own session
 * (recordPostureFindingsAction), never auto-confirmed. This is the one
 * place those numbers are surfaced to a human for review; the member-
 * facing results page does not show this level of detail (see that
 * file's clinical-boundary docblock for why: these are screening
 * indicators for a practitioner to interpret, not member-facing claims).
 */

import { useState, useTransition } from 'react';
import { Activity, Check, X } from 'lucide-react';
import type { BodyAssessmentFinding, FindingSeverity } from '@mef/shared-types-contracts';
import { FINDING_TYPE_CONFIG, SEVERITY_LABEL } from '@/lib/body-assessment/findings';
import { confirmFindingAction, dismissFindingAction } from '@/app/actions/body-assessment';
import { EmptyState } from './EmptyState';

const SEVERITY_TONE: Record<FindingSeverity, string> = {
  none: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
  mild: 'bg-amber-50 text-amber-700',
  moderate: 'bg-amber-100 text-amber-800',
  significant: 'bg-red-50 text-red-700',
  unknown: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
};

function FindingRow({ finding }: { finding: BodyAssessmentFinding }) {
  const [status, setStatus] = useState(finding.status);
  const [isPending, startTransition] = useTransition();
  const config = FINDING_TYPE_CONFIG[finding.finding_type];

  function confirm() {
    startTransition(async () => {
      const result = await confirmFindingAction(finding.id);
      if (!result.error) setStatus('confirmed');
    });
  }

  function dismiss() {
    startTransition(async () => {
      const result = await dismissFindingAction(finding.id);
      if (!result.error) setStatus('dismissed');
    });
  }

  return (
    <div className="rounded-2xl bg-[#FAFAF8] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[#1B3A2D]">{config.label}</p>
          {finding.side !== 'not_applicable' && (
            <p className="text-[11px] capitalize text-[#9AA79F]">{finding.side}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${SEVERITY_TONE[finding.severity]}`}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
      </div>

      {finding.narrative && <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">{finding.narrative}</p>}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-[#9AA79F]">
          Confidence: {Math.round(finding.confidence * 100)}%
        </span>
        {status === 'pending_review' ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isPending}
              onClick={confirm}
              className="flex items-center gap-1 rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.12] disabled:opacity-50"
            >
              <Check className="h-3 w-3" strokeWidth={2} aria-hidden />
              Confirm
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={dismiss}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06] disabled:opacity-50"
            >
              <X className="h-3 w-3" strokeWidth={2} aria-hidden />
              Dismiss
            </button>
          </div>
        ) : (
          <span className="text-[11px] font-medium capitalize text-[#9AA79F]">{status.replace('_', ' ')}</span>
        )}
      </div>
    </div>
  );
}

export function PostureFindingsSection({ findings }: { findings: BodyAssessmentFinding[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No screening estimates yet"
        description="On-device posture screening runs automatically during standing photo captures with a valid, stable pose."
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-[#9AA79F]">
        Screening indicators only — estimated from external landmarks on-device, not a diagnosis.
        Confirm or dismiss after your own review.
      </p>
      {findings.map((finding) => (
        <FindingRow key={finding.id} finding={finding} />
      ))}
    </div>
  );
}
