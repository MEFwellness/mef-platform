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
 *
 * THE COUNT IS SAID ONCE (Home presentation pass, 2026-09-13). The row
 * used to print "4/9" on the right of its heading AND "4 of 9 complete"
 * on the line underneath: the same number twice, 20px apart, in two
 * different notations. The sentence is the one that survives, because it
 * is the one that says what the number means.
 */

import { QuietLink } from '@/components/nav/QuietLink';
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

  /*
   * A ROW ON THE PAGE, NOT A BOX, AND NOT A RULE EITHER (Home
   * presentation pass, 2026-09-13). It already refused to be a card,
   * which was right; what it had instead was a bottom border, which is
   * the same framing drawn with one line. It sits on a tonal panel now,
   * the same one the other two container-less blocks on Home use.
   *
   * The progress bar became a 3px line running the full width of the
   * row under the text, rather than a 6px bar in the middle of it: a
   * count of nine questionnaires does not need the visual weight of a
   * loading bar, and a thin line is the treatment every measurement on
   * this screen now uses.
   */
  return (
    <QuietLink
      href={'/questionnaires' as Route}
      className="mef-press mef-home-quiet block transition hover:bg-[#1B3A2D]/[0.045]"
    >
      <div className="flex items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
          <ClipboardList className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mef-home-label">Questionnaires</p>
          <p className="mt-1.5 text-[15px] leading-snug text-[#1B3A2D]">
            {allComplete
              ? 'All complete. Root is using these to personalize your coaching.'
              : `${completedCount} of ${totalCount} complete`}
          </p>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-[#1B3A2D]/30"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>
      <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-[#1B3A2D]/[0.08]">
        <div
          className="h-full rounded-full bg-[#1B3A2D]/70 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </QuietLink>
  );
}
