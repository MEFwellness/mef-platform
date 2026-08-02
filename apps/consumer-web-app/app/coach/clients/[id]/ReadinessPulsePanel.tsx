import Link from 'next/link';
import type { Route } from 'next';
import { Gauge } from 'lucide-react';
import type { RplCoachSummary } from '@/app/actions/readinessPulse';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Coach-facing summary of a client's Readiness Pulse history — same "list + link to full detail" shape as CoreValuesSnapshotPanel/LifeSignalCheckPanel. */
export function ReadinessPulsePanel({ clientId, sessions }: { clientId: string; sessions: RplCoachSummary[] }) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Gauge className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Readiness Pulse</p>
      </div>

      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">Not completed yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {sessions.map((summary) => (
            <li key={summary.sessionId}>
              <Link
                href={`/coach/clients/${clientId}/readiness-pulse/${summary.sessionId}` as Route}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#1B3A2D]/[0.02]"
              >
                <div>
                  <p className="text-sm font-medium text-[#1B3A2D]">
                    {formatDate(summary.completedAt)} · v{summary.assessmentVersion}
                  </p>
                  <p className="text-xs text-[#6B7A72]">
                    Her pick: {summary.finalPatternLabel}
                    {summary.pickDiverged && ` (derived: ${summary.derivedPatternLabel})`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#F3F6F4] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">{summary.finalPatternLabel}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
