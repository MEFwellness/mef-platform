/**
 * The Health & Lifestyle Intake's persistent card on Home.
 *
 * The pop-up gets one showing per login. This is the permanent, un-timed
 * way in for as long as the assignment is open, exactly as every other
 * coach assigned experience in this app pairs an interruption with a card
 * that never goes away until the thing is done.
 *
 * Renders nothing once the sitting is finished, and nothing for a member
 * who was never assigned it. Both decisions are made upstream, in
 * lib/health-intake/service.ts.
 *
 * IT CARRIES THE ASSIGNMENT'S DELIVERY RECEIPT (migration 210), because a
 * receipt that only counted the pop-up would let a coach's screen say "they
 * have not seen it" about a member who has looked at this card every
 * morning. The receipt is written on a real display and nowhere else: a
 * prefetch renders no card, and merely loading a screen writes nothing.
 *
 * THE BUTTON SAYS WHICH OF THE TWO THINGS IT DOES. A member who has never
 * opened it is invited to begin; a member partway through is invited back
 * to where she was, because "Begin" on something she is halfway through
 * would read as an offer to start again.
 */

import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';
import { QuietLink } from '@/components/nav/QuietLink';
import { TrackAssignmentDelivered } from '@/components/assignments/TrackAssignmentDelivered';
import { HLI_ROUTE, HLI_LABEL } from '@/lib/health-intake/constants';
import { HLI_COPY } from '@/lib/health-intake/copy';

export function HealthIntakeEntry({
  assignmentId,
  inProgress,
}: {
  assignmentId: string;
  inProgress: boolean;
}) {
  return (
    <section
      aria-label={HLI_LABEL}
      className="relative overflow-hidden rounded-[28px] bg-[#1B3A2D] p-6 text-[#F5F0E4] shadow-[0_18px_40px_-24px_rgba(14,31,23,0.55)]"
    >
      <TrackAssignmentDelivered assignmentId={assignmentId} presentation="home_card" />
      {/* One slow warm drift, no edges, nothing that competes with the
          words. Off under reduced motion through the shared keyframe rule. */}
      <div
        className="mef-wbs-cue-drift pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#C4A050]/18 blur-3xl"
        aria-hidden="true"
      />

      <p className="relative text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
        {HLI_COPY.cardTitle}
      </p>

      <h2 className="relative mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]">
        {HLI_COPY.cardBody}
      </h2>

      <p className="relative mt-2 text-[13px] text-[#F5F0E4]/60">{HLI_COPY.cardDuration}</p>

      <QuietLink
        href={HLI_ROUTE as Route}
        className="mef-focus-ring mef-press relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
      >
        {inProgress ? HLI_COPY.cardResumeCta : HLI_COPY.cardCta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </QuietLink>

      <p className="relative mt-4 text-[13px] leading-relaxed text-[#F5F0E4]/60">
        {HLI_COPY.cardFootnote}
      </p>
    </section>
  );
}
