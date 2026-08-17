import Link from 'next/link';
import type { Route } from 'next';
import { AlertTriangle, HeartPulse } from 'lucide-react';
import type { WbsaCoachSummary } from '@/app/actions/wbsa';
import { formatDisplayDate } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Coach-facing summary of a client's WBSA history — same "list + link to
 * full review surface" shape as BodyAssessmentPanel. Only counts and
 * flags here, never which system or what the member actually answered —
 * that detail lives one click away, behind the same coach-assigned RLS.
 */
export function WbsaPanel({ clientId, sessions }: { clientId: string; sessions: WbsaCoachSummary[] }) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <HeartPulse className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Whole-Body Check-In</p>
      </div>

      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">No WBSA completed yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {sessions.map((summary) => (
            <li key={summary.sessionId}>
              <Link
                href={`/coach/clients/${clientId}/wbsa/${summary.sessionId}` as Route}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#1B3A2D]/[0.02]"
              >
                <div>
                  <p className="text-sm font-medium text-[#1B3A2D]">
                    {formatDisplayDate(summary.completedAt, { month: 'short', day: 'numeric', year: 'numeric' })} · v{summary.assessmentVersion}
                  </p>
                  <p className="text-xs text-[#6B7A72]">
                    {summary.systemsNeedingContextCount} needs more context ·{' '}
                    {summary.systemsWorthWatchingCount} worth watching
                    {summary.skippedAnyQuestion ? ' · some questions skipped' : ''}
                  </p>
                </div>
                {summary.hasSafetyFlag && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-xs font-medium text-[#9B4040]">
                    <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    Safety flag
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
