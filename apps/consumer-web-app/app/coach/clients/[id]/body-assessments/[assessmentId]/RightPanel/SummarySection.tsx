import type { BodyAssessment, BodyAssessmentStatus } from '@mef/shared-types-contracts';

const STATUS_META: Record<BodyAssessmentStatus, { label: string; className: string }> = {
  in_progress: { label: 'In progress', className: 'bg-amber-50 text-amber-700' },
  submitted: { label: 'Submitted', className: 'bg-blue-50 text-blue-700' },
  not_configured: {
    label: 'Awaiting analysis setup',
    className: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]',
  },
  analyzing: { label: 'Analyzing', className: 'bg-amber-50 text-amber-700' },
  analyzed: { label: 'Analyzed', className: 'bg-blue-50 text-blue-700' },
  coach_reviewed: { label: 'Reviewed', className: 'bg-emerald-50 text-emerald-700' },
  archived: { label: 'Archived', className: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]' },
};

function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-[#6B7A72]">{label}</span>
      <span className="font-medium text-[#1B3A2D]">{value}</span>
    </div>
  );
}

export function SummarySection({
  assessment,
  typeLabel,
  coachName,
  captureCount,
}: {
  assessment: BodyAssessment;
  typeLabel: string;
  coachName: string | null;
  captureCount: number;
}) {
  const status = STATUS_META[assessment.status];
  const duration = formatDuration(assessment.started_at, assessment.submitted_at);

  return (
    <div className="divide-y divide-[#1B3A2D]/5">
      <Row
        label="Assessment Date"
        value={new Date(assessment.started_at).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      />
      <Row label="Assessment Type" value={typeLabel} />
      <Row label="Coach" value={coachName ?? 'Not yet reviewed'} />
      <Row
        label="Completion Status"
        value={
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
        }
      />
      <Row label="Time Required" value={duration ?? '—'} />
      <Row label="Number of Captures" value={captureCount} />
    </div>
  );
}
