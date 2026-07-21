import Link from 'next/link';
import { Dumbbell, ChevronRight, Plus } from 'lucide-react';
import type { ProgramAssignmentSummary } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** Compact summary on the client detail page — full assignment management (assign, publish, cancel, per-occurrence detail) lives on the dedicated /coach/clients/[id]/programs page, same "full surface needs more room than a dashboard panel" split BodyAssessmentPanel already uses. */
export function ClientProgramsSummaryCard({
  clientId,
  summaries,
}: {
  clientId: string;
  summaries: ProgramAssignmentSummary[];
}) {
  const active = summaries.filter((s) => s.assignment.status === 'active');

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Assigned Programs</p>
        </div>
        <Link
          href={`/coach/clients/${clientId}/programs/assign`}
          className="flex items-center gap-1 rounded-full bg-[#1B3A2D] px-3.5 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          Assign
        </Link>
      </div>

      {active.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">No programs currently assigned.</p>
      ) : (
        <div className="mt-3 divide-y divide-[#1B3A2D]/5">
          {active.slice(0, 3).map((summary) => (
            <div
              key={summary.assignment.id}
              className="flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <span className="truncate font-medium text-[#1B3A2D]">
                {summary.assignment.template_name_snapshot}
              </span>
              <span className="shrink-0 text-xs text-[#6B7A72]">
                {summary.completedWorkouts}/{summary.totalWorkouts} completed
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/coach/clients/${clientId}/programs`}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-[#1B3A2D] hover:opacity-70"
      >
        View all programs
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </section>
  );
}
