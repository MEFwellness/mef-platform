/**
 * The Giving Ledger's persistent card on Home.
 *
 * The pop-up gets one showing per login. This is the permanent, un-timed
 * way in for as long as the assignment is open, exactly as every other
 * experience in this app pairs an interruption with a card that never goes
 * away until the thing is done.
 *
 * Renders nothing once the sitting is finished, and nothing for a member
 * who was never assigned it. Both decisions are made upstream, in
 * lib/the-giving-ledger/service.ts, so this component has one job and no
 * rules of its own.
 *
 * IT CARRIES THE ASSIGNMENT'S DELIVERY RECEIPT (migration 210), for the
 * reason the cards beside it carry their own: the pop-up gets one showing,
 * and a receipt that only counted the pop-up would let a coach's screen say
 * "they have not seen it" about a member who has looked at this card every
 * morning. This is an assessment_assignments row like every other coach
 * assignment, so it uses the one receipt system.
 *
 * THE BUTTON SAYS WHICH IT IS. A member who has already written something
 * is offered "Pick up where you left off" rather than "Start", because the
 * app knows which of the two is true and a button that said "Start" would
 * read as if her writing had been lost.
 */

import { QuietLink } from '@/components/nav/QuietLink';
import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';
import { TGL_COPY, TGL_LABEL } from '@/lib/the-giving-ledger/copy';
import { TGL_ROUTE } from '@/lib/the-giving-ledger/constants';
import { TrackAssignmentDelivered } from '@/components/assignments/TrackAssignmentDelivered';

export function TheGivingLedgerEntry({
  assignmentId,
  hasDraft,
}: {
  assignmentId: string;
  hasDraft: boolean;
}) {
  return (
    <section
      aria-label={TGL_LABEL}
      className="mef-assigned-card"
    >
      <TrackAssignmentDelivered assignmentId={assignmentId} presentation="home_card" />
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
        aria-hidden="true"
      />

      <p className="mef-assigned-eyebrow">
        {TGL_LABEL}
      </p>

      <h2 className="mef-assigned-title">
        {TGL_COPY.cardTitle}
      </h2>

      <p className="relative mt-2 text-[15px] leading-relaxed text-[#F5F0E4]/80">
        {TGL_COPY.cardBody}
      </p>

      <QuietLink
        href={TGL_ROUTE as Route}
        className="mef-focus-ring mef-press mef-assigned-cta"
      >
        {hasDraft ? TGL_COPY.cardResumeCta : TGL_COPY.cardCta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </QuietLink>
    </section>
  );
}
