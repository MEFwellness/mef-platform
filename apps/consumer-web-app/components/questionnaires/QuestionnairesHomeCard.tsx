/**
 * THE QUESTIONNAIRES CARD ON HOME — the assessment hub, not a row.
 *
 * It was a single tappable line ("Questionnaires", "4 of 9 complete", a
 * chevron) sitting in the Your Path zone at the very bottom of Home,
 * which is where a member goes to look back rather than to keep going.
 * Thirteen questionnaires are the substance of what Root knows about her,
 * and the line said so in the flattest voice on the page.
 *
 * It is a card now, and it sits directly under Your Week with Root
 * (app/dashboard/page.tsx). Presentation and placement only:
 *
 *   THE COUNT IS STILL THE DESTINATION'S OWN COUNT. `completedCount` and
 *   `totalCount` are `getMyQuestionnaireCatalog()`'s, the exact two
 *   numbers app/questionnaires/page.tsx prints under its heading, handed
 *   down from the already-memoized `homeQuestionnaireCatalog()` the day
 *   frame awaits. Nothing here counts anything.
 *
 *   THE DESTINATION IS THE SAME ONE. `/questionnaires`, unchanged, and
 *   quiet (QuietLink) for the reason written in that component: Home
 *   carries nineteen links and prefetching all of them on sight is the
 *   most expensive thing the screen used to do.
 *
 *   THE NEXT ITEM IS CHOSEN FROM ROWS ALREADY READ, by
 *   lib/questionnaires/homeNextQuestionnaire.ts, and it links wherever
 *   the catalog page's own card for it links
 *   (lib/questionnaires/catalogCardAction.ts). It is deliberately the
 *   quietest object on the card, under a hairline, below the CTA: a
 *   coach-assigned questionnaire already has a full deep-green card in
 *   Assigned to You and that selector refuses to name anything drawn up
 *   there, so this line can never be the same request shouted twice.
 *
 * IT DOES NOT COMPETE WITH THE TWO THINGS ABOVE IT. Today's priority is a
 * feature card and Your Week with Root is a saturated cream panel with a
 * deep drop; this takes the page's ordinary 28px card rung, a near-white
 * warm surface, and one gold hairline of progress. Its CTA is an outlined
 * pill rather than the filled forest button the assigned cards carry.
 *
 * SAY ONLY WHAT IS TRUE TODAY. Once every questionnaire is complete there
 * is nothing to continue, so the title and the supporting line both change
 * rather than inviting her to continue something that is finished.
 */

import { QuietLink } from '@/components/nav/QuietLink';
import type { Route } from 'next';
import { ClipboardList, ChevronRight, ArrowRight } from 'lucide-react';
import type { HomeNextQuestionnaire } from '@/lib/questionnaires/homeNextQuestionnaire';

export function QuestionnairesHomeCard({
  completedCount,
  totalCount,
  nextItem = null,
}: {
  completedCount: number;
  totalCount: number;
  nextItem?: HomeNextQuestionnaire | null;
}) {
  if (totalCount === 0) return null;

  const allComplete = completedCount >= totalCount;
  const percent = Math.max(0, Math.min(100, Math.round((completedCount / totalCount) * 100)));

  return (
    <section
      aria-label="Questionnaires"
      className="mef-card mef-questionnaires-card p-6"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#1B3A2D]/[0.07] bg-[#1B3A2D]/[0.045]">
          <ClipboardList
            className="h-[1.15rem] w-[1.15rem] text-[#1B3A2D]"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mef-home-label">Questionnaires</p>
          <h2 className="mef-home-title mt-2">
            {allComplete ? 'Your assessments are complete' : 'Continue your assessments'}
          </h2>
        </div>
      </div>

      <p className="mef-home-body mt-3">
        {allComplete
          ? 'Root is reading all of them together to shape your coaching.'
          : 'Each one you finish deepens what Root understands about you.'}
      </p>

      {/* THE MEASUREMENT. One sentence naming what the number counts, and
          a 3px line under it. Identical wording to the line the
          Questionnaires screen prints under its own heading, from the
          identical pair of numbers. */}
      <p className="mt-6 text-[13px] font-medium tracking-wide text-[#1B3A2D]/70">
        {completedCount} of {totalCount} complete
      </p>
      <div
        className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-[#1B3A2D]/[0.08]"
        role="presentation"
      >
        <div
          className="mef-questionnaires-bar h-full rounded-full bg-[#C4A050]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <QuietLink
        href={'/questionnaires' as Route}
        className="mef-press mef-focus-ring mt-6 inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border border-[#1B3A2D]/15 bg-[#1B3A2D]/[0.035] px-5 py-3 text-sm font-semibold text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.07]"
      >
        View questionnaires
        <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </QuietLink>

      {nextItem && (
        /* THE QUIET LINE. Under a hairline, one step smaller, no button:
           it names the one thing she is closest to finishing and opens
           it. Never the loudest thing on this card, and never the same
           request the Assigned to You section is already making. */
        <QuietLink
          href={nextItem.href as Route}
          className="mef-press mef-focus-ring mt-6 flex min-h-[2.75rem] items-center gap-3 border-t border-[#1B3A2D]/[0.08] pt-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/40">
              {nextItem.inProgress ? 'Pick up where you left off' : 'Next for you'}
            </span>
            <span className="mt-1 block truncate text-[14px] leading-snug text-[#1B3A2D]">
              {nextItem.title}
            </span>
          </span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
            <ArrowRight className="h-4 w-4 text-[#1B3A2D]/70" strokeWidth={1.75} aria-hidden="true" />
          </span>
        </QuietLink>
      )}
    </section>
  );
}
