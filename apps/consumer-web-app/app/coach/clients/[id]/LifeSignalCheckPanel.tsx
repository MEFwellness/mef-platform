import Link from 'next/link';
import type { Route } from 'next';
import { Radio } from 'lucide-react';
import type { LscCoachSummary } from '@/app/actions/lifeSignalCheck';
import { formatDisplayDate } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const PATTERN_LABEL: Record<LscCoachSummary['pattern'], string> = {
  one_loud: 'One loud signal',
  chorus: 'A chorus',
  quiet_body: 'Quiet body',
};

/** Coach-facing summary of a client's Life Signal Check history — same "list + link to full detail" shape as CoreValuesSnapshotPanel. */
export function LifeSignalCheckPanel({ clientId, sessions }: { clientId: string; sessions: LscCoachSummary[] }) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Radio className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Life Signal Check</p>
      </div>

      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">Not completed yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {sessions.map((summary) => (
            <li key={summary.sessionId}>
              <Link
                href={`/coach/clients/${clientId}/life-signal-check/${summary.sessionId}` as Route}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#1B3A2D]/[0.02]"
              >
                <div>
                  <p className="text-sm font-medium text-[#1B3A2D]">
                    {formatDisplayDate(summary.completedAt, { month: 'short', day: 'numeric', year: 'numeric' })} · v{summary.assessmentVersion}
                  </p>
                  <p className="text-xs text-[#6B7A72]">
                    Chosen: {summary.chosenSignalLabel} · Loudest: {summary.loudestSignalLabel}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#F3F6F4] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
                  {PATTERN_LABEL[summary.pattern]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
