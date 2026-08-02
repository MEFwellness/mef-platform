import Link from 'next/link';
import type { Route } from 'next';
import { Compass } from 'lucide-react';
import type { CvsCoachSummary } from '@/app/actions/coreValuesSnapshot';
import { formatDisplayDate } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const BRANCH_LABEL: Record<CvsCoachSummary['branch'], string> = {
  clear_gap: 'Clear gap',
  aligned: 'Aligned',
  split: 'Split (instinct vs. plan)',
  slipping: 'Slipping',
};

/** Coach-facing summary of a client's Core Values Snapshot history — same "list + link to full detail" shape as WbsaPanel. */
export function CoreValuesSnapshotPanel({ clientId, sessions }: { clientId: string; sessions: CvsCoachSummary[] }) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Core Values Snapshot</p>
      </div>

      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">Not completed yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {sessions.map((summary) => (
            <li key={summary.sessionId}>
              <Link
                href={`/coach/clients/${clientId}/core-values-snapshot/${summary.sessionId}` as Route}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#1B3A2D]/[0.02]"
              >
                <div>
                  <p className="text-sm font-medium text-[#1B3A2D]">
                    {formatDisplayDate(summary.completedAt, { month: 'short', day: 'numeric', year: 'numeric' })} · v{summary.assessmentVersion}
                  </p>
                  <p className="text-xs text-[#6B7A72]">
                    Top: {summary.topValueLabel} · Runner-up: {summary.runnerUpValueLabel}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#F3F6F4] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
                  {BRANCH_LABEL[summary.branch]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
