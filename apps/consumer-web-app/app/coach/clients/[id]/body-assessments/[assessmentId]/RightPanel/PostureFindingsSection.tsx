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
 *
 * `history` (all findings for the assessment, including 'superseded' ones)
 * is optional and additive — when supplied, an active finding that
 * supersedes an earlier one gets a "Show history" toggle exposing the
 * append-only supersede chain (body_assessment_findings.supersedes_id /
 * superseded_by_id) that the database already stores but no UI previously
 * surfaced: previous narrative, previous severity, who changed it, when.
 */

import { useState, useTransition } from 'react';
import { Activity, Check, ChevronDown, History, X } from 'lucide-react';
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Walks supersedes_id backward through `history` collecting every ancestor of `finding`, most-recently-superseded first. */
function buildSupersedeChain(
  finding: BodyAssessmentFinding,
  byId: Map<string, BodyAssessmentFinding>
): BodyAssessmentFinding[] {
  const chain: BodyAssessmentFinding[] = [];
  let cursor = finding.supersedes_id ? byId.get(finding.supersedes_id) : undefined;
  const seen = new Set<string>([finding.id]);
  while (cursor && !seen.has(cursor.id)) {
    chain.push(cursor);
    seen.add(cursor.id);
    cursor = cursor.supersedes_id ? byId.get(cursor.supersedes_id) : undefined;
  }
  return chain;
}

function HistoryEntry({
  entry,
  coachNames,
}: {
  entry: BodyAssessmentFinding;
  coachNames: Record<string, string>;
}) {
  const config = FINDING_TYPE_CONFIG[entry.finding_type];
  const changedBy = entry.coach_reviewed_by ? coachNames[entry.coach_reviewed_by] ?? 'A coach' : null;

  return (
    <div className="rounded-xl border border-dashed border-[#1B3A2D]/10 bg-white p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[#6B7A72]">Previously: {config.label}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_TONE[entry.severity]}`}>
          {SEVERITY_LABEL[entry.severity]}
        </span>
      </div>
      {entry.narrative && <p className="mt-1 text-[11px] leading-relaxed text-[#9AA79F]">{entry.narrative}</p>}
      {entry.coach_override_notes && (
        <p className="mt-1 text-[11px] italic leading-relaxed text-[#6B7A72]">
          Override note: {entry.coach_override_notes}
        </p>
      )}
      <p className="mt-1 text-[10px] text-[#9AA79F]">
        {changedBy ? `Changed by ${changedBy}` : 'Recorded'}
        {entry.coach_reviewed_at ? ` · ${formatDateTime(entry.coach_reviewed_at)}` : ` · ${formatDateTime(entry.created_at)}`}
      </p>
    </div>
  );
}

function FindingRow({
  finding,
  supersedeChain,
  coachNames,
}: {
  finding: BodyAssessmentFinding;
  supersedeChain: BodyAssessmentFinding[];
  coachNames: Record<string, string>;
}) {
  const [status, setStatus] = useState(finding.status);
  const [isPending, startTransition] = useTransition();
  const [historyOpen, setHistoryOpen] = useState(false);
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

      {supersedeChain.length > 0 && (
        <div className="mt-2 border-t border-[#1B3A2D]/5 pt-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-1 text-[11px] font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
          >
            <History className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            {historyOpen ? 'Hide history' : `Show history (${supersedeChain.length} change${supersedeChain.length === 1 ? '' : 's'})`}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
              strokeWidth={1.75}
              aria-hidden
            />
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-1.5">
              {supersedeChain.map((entry) => (
                <HistoryEntry key={entry.id} entry={entry} coachNames={coachNames} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PostureFindingsSection({
  findings,
  history = [],
  coachNames = {},
}: {
  findings: BodyAssessmentFinding[];
  /** Every finding for this assessment, including superseded ones — optional, additive; omit to keep the old "active findings only" behavior. */
  history?: BodyAssessmentFinding[];
  /** coach_id -> display name, for labeling "Changed by …" in the history view. */
  coachNames?: Record<string, string>;
}) {
  if (findings.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No screening estimates yet"
        description="On-device posture screening runs automatically during standing photo captures with a valid, stable pose."
      />
    );
  }

  const byId = new Map(history.map((f) => [f.id, f]));

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-[#9AA79F]">
        Screening indicators only — estimated from external landmarks on-device, not a diagnosis.
        Confirm or dismiss after your own review.
      </p>
      {findings.map((finding) => (
        <FindingRow
          key={finding.id}
          finding={finding}
          supersedeChain={buildSupersedeChain(finding, byId)}
          coachNames={coachNames}
        />
      ))}
    </div>
  );
}
