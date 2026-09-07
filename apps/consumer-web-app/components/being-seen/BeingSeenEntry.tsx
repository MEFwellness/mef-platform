/**
 * Being Seen's persistent card on Home.
 *
 * The pop-up gets one showing per login. This is the permanent, un-timed
 * way in for as long as the assignment is open, exactly as every other
 * experience in this app pairs an interruption with a card that never goes
 * away until the thing is done.
 *
 * Renders nothing once the sitting is finished, and nothing for a member
 * who was never assigned it. Both decisions are made upstream, in
 * lib/being-seen/service.ts, so this component has one job and no rules of
 * its own.
 *
 * IT CARRIES THE ASSIGNMENT'S DELIVERY RECEIPT (migration 210), for the
 * reason the cards beside it carry their own: the pop-up gets one showing,
 * and a receipt that only counted the pop-up would let a coach's screen say
 * "they have not seen it" about a member who has looked at this card every
 * morning. This is an assessment_assignments row like every other coach
 * assignment, so it uses the one receipt system.
 */

import { QuietLink } from '@/components/nav/QuietLink';
import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';
import { BSN_COPY, BSN_LABEL } from '@/lib/being-seen/copy';
import { BSN_ROUTE } from '@/lib/being-seen/constants';
import { TrackAssignmentDelivered } from '@/components/assignments/TrackAssignmentDelivered';

export function BeingSeenEntry({
  assignmentId,
  hasDraft,
}: {
  assignmentId: string;
  hasDraft: boolean;
}) {
  return (
    <section
      aria-label={BSN_LABEL}
      className="relative overflow-hidden rounded-[28px] bg-[#1B3A2D] p-6 text-[#F5F0E4] shadow-[0_18px_40px_-24px_rgba(14,31,23,0.55)]"
    >
      <TrackAssignmentDelivered assignmentId={assignmentId} presentation="home_card" />
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
        aria-hidden="true"
      />

      <p className="relative text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
        {BSN_LABEL}
      </p>

      <h2 className="relative mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]">
        {BSN_COPY.cardTitle}
      </h2>

      <p className="relative mt-2 text-[15px] leading-relaxed text-[#F5F0E4]/80">
        {BSN_COPY.cardBody}
      </p>

      <QuietLink
        href={BSN_ROUTE as Route}
        className="mef-focus-ring mef-press relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
      >
        {hasDraft ? BSN_COPY.cardResumeCta : BSN_COPY.cardCta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </QuietLink>
    </section>
  );
}
