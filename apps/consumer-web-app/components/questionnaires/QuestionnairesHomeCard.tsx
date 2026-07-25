/**
 * The Questionnaires row on Home — a single summary line, not a list.
 * "Questionnaires," a real completion count, and the whole row is the tap
 * target into the Questionnaires destination (app/questionnaires/page.tsx),
 * which owns all per-questionnaire browsing/filtering/status. Home never
 * duplicates that status logic — completedCount/totalCount come from
 * getMyQuestionnaireCatalog(), the exact same query the destination reads.
 *
 * Home dashboard redesign: no longer its own white card — a plain row
 * with a progress bar, sitting directly on the page background, per the
 * "Your Path" zone's explicit no-card treatment.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { ClipboardList, ChevronRight } from 'lucide-react';

export function QuestionnairesHomeCard({
  completedCount,
  totalCount,
}: {
  completedCount: number;
  totalCount: number;
}) {
  if (totalCount === 0) return null;

  const allComplete = completedCount === totalCount;
  const percent = Math.round((completedCount / totalCount) * 100);

  return (
    <Link
      href={'/questionnaires' as Route}
      className="mef-press flex items-center gap-4 border-b border-[#1B3A2D]/8 py-4 transition hover:bg-[#1B3A2D]/[0.02]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
        <ClipboardList className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#1B3A2D]">
            Questionnaires
          </p>
          <span className="shrink-0 text-xs font-medium text-[#6B7A72]">
            {completedCount}/{totalCount}
          </span>
        </div>
        <p className="mt-1 text-sm text-[#6B7A72]">
          {allComplete
            ? 'All assessments complete. Root is using these to personalize your coaching.'
            : `${completedCount} of ${totalCount} complete`}
        </p>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#EFE9DB]">
          <div
            className="h-full rounded-full bg-[#1B3A2D] transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-[#1B3A2D]/30"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </Link>
  );
}
