/**
 * The Weekly Reflection's persistent card on Home.
 *
 * The pop-up gets one showing per login inside her window. This is the
 * permanent, un-timed way in for the rest of the Friday-to-Sunday window,
 * exactly as every other experience in this app pairs an interruption with
 * a card that never goes away until the thing is done.
 *
 * A high-priority card, and it looks like one: the same deep green
 * treatment the pop-up uses rather than the quiet cream of an ordinary
 * Home card, because for a program member this is the one thing on Home
 * with a deadline on it.
 *
 * Renders nothing at all once the reflection is finished, and nothing for
 * a member who is not offered it. Both of those decisions are made
 * upstream, in lib/weekly-reflection/service.ts, so this component has one
 * job and no rules of its own.
 *
 * ONE SENTENCE VARIES, AND ONLY BECAUSE OF A DEADLINE. A program member's
 * window really does close on Sunday night and the card says so. A member
 * whose coach sent her this one is on a week that runs to the following
 * Thursday, so her copy names no night rather than the wrong one. The
 * card, the link and the deadline-free half of the sentence are identical.
 */

import { QuietLink } from '@/components/nav/QuietLink';
import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';
import { WEEKLY_REFLECTION_COPY, WEEKLY_REFLECTION_LABEL } from '@/lib/weekly-reflection/copy';
import type { WeeklyReflectionOffer } from '@/lib/weekly-reflection/service';

export function WeeklyReflectionEntry({ offer }: { offer: WeeklyReflectionOffer }) {
  return (
    <section
      aria-label={WEEKLY_REFLECTION_LABEL}
      className="mef-assigned-card"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
        aria-hidden="true"
      />

      <p className="mef-assigned-eyebrow">
        {WEEKLY_REFLECTION_LABEL}
      </p>

      <h2 className="mef-assigned-title">
        {WEEKLY_REFLECTION_COPY.cardTitle}
      </h2>

      <p className="relative mt-2 text-[15px] leading-relaxed text-[#F5F0E4]/80">
        {offer === 'assigned'
          ? WEEKLY_REFLECTION_COPY.cardBodyAssigned
          : WEEKLY_REFLECTION_COPY.cardBody}
      </p>

      <QuietLink
        href={'/weekly-reflection' as Route}
        className="mef-focus-ring mef-press mef-assigned-cta"
      >
        {WEEKLY_REFLECTION_COPY.cardCta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </QuietLink>
    </section>
  );
}
