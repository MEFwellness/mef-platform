import Link from 'next/link';
import type { Route } from 'next';
import { ChevronRight, ClipboardList } from 'lucide-react';
import type { AssessmentSummary } from '@/lib/onboarding/reassessment';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

type Props = {
  history: AssessmentSummary[];
  /** Where the baseline entry links to (the already-built baseline page) — member and coach have different baseline URLs. */
  baselineHref: string;
  /** Builds the URL for a given reassessment's submissionId — member and coach have different detail-view URLs. */
  reassessmentHref: (submissionId: string) => string;
};

export function AssessmentHistoryList({ history, baselineHref, reassessmentHref }: Props) {
  if (history.length === 0) {
    return (
      <section className={`${CARD} p-6`}>
        <p className="text-sm text-[#6B7A72]">No assessments on file yet.</p>
      </section>
    );
  }

  // Oldest first in `history` (baseline is index 0) — shown most-recent-first, matching every other history list in the app.
  const mostRecentFirst = [...history].reverse();

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Assessment History</p>
      </div>
      <div className="mt-3 divide-y divide-[#1B3A2D]/5">
        {mostRecentFirst.map((entry) => {
          const isBaseline = entry.assessmentType === 'baseline';
          const href = isBaseline ? baselineHref : reassessmentHref(entry.submissionId);
          return (
            <Link
              key={entry.submissionId}
              href={href as Route}
              className="flex items-center justify-between gap-3 py-3 text-sm transition hover:opacity-80"
            >
              <div>
                <p className="font-medium text-[#1B3A2D]">
                  {isBaseline ? 'Baseline Assessment' : 'Reassessment'}
                </p>
                <p className="text-xs text-[#6B7A72]">{formatDate(entry.localDate)}</p>
              </div>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[#1B3A2D]/40"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
