import Link from 'next/link';
import type { Route } from 'next';
import { Sparkles, ChevronRight } from 'lucide-react';
import type { PrescriptionSnapshot } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** Compact entry point on the client detail page — the full strategy review (blocks, exercises, reasoning, confidence, approve/reject) lives on the dedicated /coach/clients/[id]/prescription page, same "full surface needs more room than a dashboard panel" split ClientProgramsSummaryCard already uses. */
export function PrescriptionIntelligenceCard({
  clientId,
  snapshots,
}: {
  clientId: string;
  snapshots: PrescriptionSnapshot[];
}) {
  const pending = snapshots.filter((s) => s.status === 'pending_coach_review');
  const latest = snapshots[0];

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Prescription Intelligence
          </p>
        </div>
        {pending.length > 0 && (
          <span className="rounded-full bg-[#F5B700]/[0.2] px-2.5 py-1 text-[10px] font-semibold uppercase text-[#854D0E]">
            {pending.length} awaiting review
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-[#6B7A72]">
        {latest
          ? `Last run ${new Date(latest.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${latest.status.replace(/_/g, ' ')}.`
          : 'No prescription runs yet — build today’s strategy from this member’s Movement Profile, readiness, and assessment history.'}
      </p>

      <Link
        href={`/coach/clients/${clientId}/prescription` as Route}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-[#1B3A2D] hover:opacity-70"
      >
        Open Prescription Intelligence
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </section>
  );
}
