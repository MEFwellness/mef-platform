import Link from 'next/link';
import type { Route } from 'next';
import { ScanFace } from 'lucide-react';
import type { BodyAssessment } from '@mef/shared-types-contracts';
import { ASSESSMENT_TYPE_CONFIG } from '@/lib/body-assessment/assessmentTypes';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  submitted: 'Submitted',
  not_configured: 'Awaiting analysis',
  analyzing: 'Analyzing',
  analyzed: 'Analyzed — needs review',
  coach_reviewed: 'Reviewed',
  archived: 'Archived',
};

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]',
  submitted: 'bg-amber-50 text-amber-700',
  not_configured: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]',
  analyzing: 'bg-amber-50 text-amber-700',
  analyzed: 'bg-orange-50 text-orange-700',
  coach_reviewed: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Coach-facing summary of a client's Body Assessment history — same "list + link to full review surface" shape as the Baseline/Reassessment history list, since full capture review (photos/video, findings, coach review workflow) needs its own dedicated page rather than crowding this dashboard. */
export function BodyAssessmentPanel({
  clientId,
  assessments,
}: {
  clientId: string;
  assessments: BodyAssessment[];
}) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Body Assessments</p>
      </div>

      {assessments.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">No body assessments completed yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {assessments.map((assessment) => (
            <li key={assessment.id}>
              <Link
                href={`/coach/clients/${clientId}/body-assessments/${assessment.id}` as Route}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#1B3A2D]/[0.02]"
              >
                <div>
                  <p className="text-sm font-medium text-[#1B3A2D]">
                    {ASSESSMENT_TYPE_CONFIG[assessment.assessment_type].label}
                  </p>
                  <p className="text-xs text-[#6B7A72]">{formatDate(assessment.started_at)}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[assessment.status] ?? STATUS_BADGE.in_progress}`}
                >
                  {STATUS_LABEL[assessment.status] ?? assessment.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
