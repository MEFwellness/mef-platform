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
 */

import { QuietLink } from '@/components/nav/QuietLink';
import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';
import { WEEKLY_REFLECTION_COPY, WEEKLY_REFLECTION_LABEL } from '@/lib/weekly-reflection/copy';

export function WeeklyReflectionEntry() {
  return (
    <section
      aria-label={WEEKLY_REFLECTION_LABEL}
      className="relative overflow-hidden rounded-[28px] bg-[#1B3A2D] p-6 text-[#F5F0E4] shadow-[0_18px_40px_-24px_rgba(14,31,23,0.55)]"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
        aria-hidden="true"
      />

      <p className="relative text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
        {WEEKLY_REFLECTION_LABEL}
      </p>

      <h2 className="relative mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]">
        {WEEKLY_REFLECTION_COPY.cardTitle}
      </h2>

      <p className="relative mt-2 text-[15px] leading-relaxed text-[#F5F0E4]/80">
        {WEEKLY_REFLECTION_COPY.cardBody}
      </p>

      <QuietLink
        href={'/weekly-reflection' as Route}
        className="mef-focus-ring mef-press relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
      >
        {WEEKLY_REFLECTION_COPY.cardCta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </QuietLink>
    </section>
  );
}
