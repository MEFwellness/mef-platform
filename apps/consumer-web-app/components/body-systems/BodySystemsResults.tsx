'use client';

/**
 * Her results screen. Loudness, and nothing else.
 *
 * ONE HORIZONTAL BAR PER SYSTEM, LOUDEST FIRST, sweeping in from the left
 * on scroll through the shared ScrollDrawIn wipe, staggered one bar at a
 * time. That is the same motion language as the Trends distribution bars
 * (app/progress/MetricDistributionCard.tsx), reused rather than reinvented,
 * with a per bar delay added so eleven bars arrive in order rather than as
 * one block.
 *
 * EVERY WORD ON THIS SCREEN IS A ROW. The band labels and status lines are
 * body_systems_bands columns, the personalised line is the loudest
 * section's own top_attention_line, the closing sentence is a
 * 'member.' copy row. This component composes no sentence about her body,
 * which is why there is nowhere in it for a medical conclusion to enter.
 *
 * NO TOTAL, NO GRADE, NO OVERALL COLOUR. There is deliberately nothing on
 * this screen that adds the eleven systems together.
 *
 * THE RETAKE VIEW IS THE SAME GRAPH. This time sits beside last time per
 * system with one word, so addressing one system and watching the others
 * settle is visible on the screen she already knows.
 */

import { ScrollDrawIn } from '@/components/ScrollDrawIn';
import { memberCopy, type MemberCopyKey } from '@/lib/body-systems/copyKeys';
import { DIRECTION_COPY_KEY } from '@/lib/body-systems/retake';
import type { MemberResultsView } from '@/lib/body-systems/memberView';

/** The three band colours, as fills. Named once so a bar and its dot cannot disagree. */
const BAND_FILL: Record<string, string> = {
  green: '#4E8C6A',
  yellow: '#C4A050',
  red: '#C4634A',
};

/** How far apart two bars arrive. Small enough to read as one gesture. */
const STAGGER_MS = 90;

export function BodySystemsResults({
  view,
  copy,
}: {
  view: MemberResultsView;
  copy: Record<string, string>;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
        {memberCopy(copy, 'member.results_eyebrow')}
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-tight text-[#F5F0E4]">
        {memberCopy(copy, 'member.results_heading')}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[#F5F0E4]/80">
        {memberCopy(copy, 'member.results_intro')}
      </p>

      {/*
        THE ONE PERSONALISED LINE, and only for the loudest system. Absent
        entirely when nothing is showing up at all, because there is no
        loudest system to name when eleven systems are tied at nought and
        naming one would be Root claiming something untrue about her.
      */}
      {view.topAttentionLine && (
        <div className="mt-6 rounded-2xl border border-[#C4A050]/40 bg-[#C4A050]/10 p-4">
          <p className="text-[15px] leading-relaxed text-[#F5F0E4]">{view.topAttentionLine}</p>
        </div>
      )}

      {view.isRetake && (
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-[#F5F0E4]/50">
          {memberCopy(copy, 'member.compare_heading')}
        </p>
      )}

      <ScrollDrawIn>
        <ul className="mt-4 space-y-5">
          {view.bars.map((bar, index) => {
            const fill = BAND_FILL[bar.colorKey] ?? BAND_FILL.green;
            const direction = bar.comparison?.direction ?? null;
            return (
              <li key={bar.sectionKey}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] font-medium text-[#F5F0E4]">{bar.sectionName}</p>
                  <p className="shrink-0 text-[13px] text-[#F5F0E4]/65">{bar.bandLabel}</p>
                </div>

                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#F5F0E4]/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-[900ms] ease-out"
                    style={{
                      width: `${bar.percent}%`,
                      backgroundColor: fill,
                      transitionDelay: `${index * STAGGER_MS}ms`,
                    }}
                  />
                </div>

                {/*
                  THE RETAKE BAR SITS UNDER THE CURRENT ONE, quieter in
                  every sense: thinner, dimmer, and labelled, so the one on
                  top is unambiguously this time.
                */}
                {bar.comparison?.previousPercent !== null && bar.comparison !== null && (
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F5F0E4]/[0.06]">
                      <div
                        className="h-full rounded-full bg-[#F5F0E4]/25"
                        style={{ width: `${bar.comparison.previousPercent ?? 0}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[12px] text-[#F5F0E4]/55">
                      {`${memberCopy(copy, 'member.compare_last_time')}. `}
                      {direction ? memberCopy(copy, DIRECTION_COPY_KEY[direction] as MemberCopyKey) : ''}
                    </p>
                  </div>
                )}

                <p className="mt-2 text-[13px] leading-relaxed text-[#F5F0E4]/60">
                  {bar.statusLine}
                </p>
              </li>
            );
          })}
        </ul>
      </ScrollDrawIn>

      <p className="mt-8 text-[15px] leading-relaxed text-[#F5F0E4]/85">
        {memberCopy(copy, 'member.results_closing')}
      </p>
    </div>
  );
}
