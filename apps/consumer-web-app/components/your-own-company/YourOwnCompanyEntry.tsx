/**
 * Your Own Company's persistent card on Home.
 *
 * The pop-up gets one showing per login. This is the permanent, un-timed
 * way in for as long as the assignment is open, exactly as every other
 * experience in this app pairs an interruption with a card that never goes
 * away until the thing is done.
 *
 * Renders nothing once the sitting is finished, and nothing for a member
 * who was never assigned it. Both decisions are made upstream, in
 * lib/your-own-company/service.ts, so this component has one job and no
 * rules of its own.
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
import { YOC_COPY, YOC_LABEL } from '@/lib/your-own-company/copy';
import { YOC_ROUTE } from '@/lib/your-own-company/constants';
import { TrackAssignmentDelivered } from '@/components/assignments/TrackAssignmentDelivered';

export function YourOwnCompanyEntry({
  assignmentId,
  hasDraft,
}: {
  assignmentId: string;
  hasDraft: boolean;
}) {
  return (
    <section
      aria-label={YOC_LABEL}
      className="mef-assigned-card"
    >
      <TrackAssignmentDelivered assignmentId={assignmentId} presentation="home_card" />
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
        aria-hidden="true"
      />

      <p className="mef-assigned-eyebrow">
        {YOC_LABEL}
      </p>

      <h2 className="mef-assigned-title">
        {YOC_COPY.cardTitle}
      </h2>

      <p className="relative mt-2 text-[15px] leading-relaxed text-[#F5F0E4]/80">
        {YOC_COPY.cardBody}
      </p>

      <QuietLink
        href={YOC_ROUTE as Route}
        className="mef-focus-ring mef-press mef-assigned-cta"
      >
        {hasDraft ? YOC_COPY.cardResumeCta : YOC_COPY.cardCta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </QuietLink>
    </section>
  );
}
