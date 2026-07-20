/**
 * The Questionnaires card on Home — a single summary tile, not a list.
 * "Questionnaires," a real completion count, and the whole card is the tap
 * target into the Questionnaires destination (app/questionnaires/page.tsx),
 * which owns all per-questionnaire browsing/filtering/status. Home never
 * duplicates that status logic — completedCount/totalCount come from
 * getMyQuestionnaireCatalog(), the exact same query the destination reads.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { ClipboardList, ChevronRight } from 'lucide-react';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function QuestionnairesHomeCard({
  completedCount,
  totalCount,
}: {
  completedCount: number;
  totalCount: number;
}) {
  if (totalCount === 0) return null;

  const allComplete = completedCount === totalCount;

  return (
    <Link
      href={'/questionnaires' as Route}
      className={`${CARD} mef-animate-in flex items-center justify-between gap-4 p-6 transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Questionnaires</p>
        </div>
        <p className="mt-2 text-sm text-[#6B7A72]">
          {allComplete
            ? 'All assessments complete. Root is using these to personalize your coaching.'
            : `${completedCount} of ${totalCount} complete`}
        </p>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-[#1B3A2D]/30"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </Link>
  );
}
