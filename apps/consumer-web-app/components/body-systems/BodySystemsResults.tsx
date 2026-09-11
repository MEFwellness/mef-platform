'use client';

/**
 * Her results screen. Loudness, and nothing else.
 *
 * ONE GRAPH, NOT A LIST (rebuilt 2026-09-11). All eleven systems sit in a
 * single continuous block with hairline rules between them, loudest first:
 * name on the left, bar and its one word status on the right. The screen
 * used to repeat a band's whole sentence under every bar, which said the
 * same three sentences up to eleven times and made the graph read as a
 * settings page. Those three sentences are now a legend, printed once,
 * above the graph. Under a bar there is nothing.
 *
 * LOUD ROWS CARRY MORE WEIGHT, QUIET ROWS LESS. Type size, opacity, bar
 * thickness and row height all step down with the band, so the systems
 * speaking loudly are the ones her eye lands on and the quiet ones stay
 * calm underneath. It is the same three band colours, and no others.
 *
 * IT ARRIVES IN READING ORDER. Headline, then the one line summary, then
 * the legend, then the bars one after another, loudest first. The motion
 * is CSS only, from tokens (app/globals.css, `.mef-bs-open` and
 * `.mef-bs-bar`), with a per element delay carried here beside the thing
 * it delays. Under prefers-reduced-motion both animations are off and the
 * finished state is the element's natural one, so the screen is complete
 * rather than empty.
 *
 * EVERY WORD ON THIS SCREEN IS A ROW. The band labels and the legend's
 * three sentences are body_systems_bands columns, the personalised line is
 * the loudest section's own top_attention_line, and the closing sentence
 * is a 'member.' copy row. This component composes no sentence about her
 * body, which is why there is nowhere in it for a medical conclusion to
 * enter.
 *
 * NO TOTAL, NO GRADE, NO OVERALL COLOUR. There is deliberately nothing on
 * this screen that adds the eleven systems together.
 *
 * THE RETAKE VIEW IS THE SAME GRAPH. Last time is a tick on this time's
 * own rail rather than a second bar under it, and the direction is one
 * word beside the band label, so a retake stays one graph too.
 */

import type { ReactNode } from 'react';
import { memberCopy, type MemberCopyKey } from '@/lib/body-systems/copyKeys';
import { DIRECTION_COPY_KEY } from '@/lib/body-systems/retake';
import type {
  MemberBandLegendEntry,
  MemberResultsView,
  MemberSectionBar,
} from '@/lib/body-systems/memberView';

/** The three band colours, as fills. Named once so a bar and its dot cannot disagree. */
const BAND_FILL: Record<string, string> = {
  green: '#4E8C6A',
  yellow: '#C4A050',
  red: '#C4634A',
};

/**
 * How much weight a row carries, by band.
 *
 * The loudest band is the one she is meant to read first, so it is the
 * only one at full strength. Everything below it steps down together:
 * smaller name, dimmer status, thinner bar, tighter row.
 */
const ROW_WEIGHT: Record<
  string,
  { row: string; name: string; status: string; rail: string }
> = {
  red: {
    row: 'py-3.5',
    name: 'text-[16px] font-semibold text-[#F5F0E4]',
    status: 'text-[12px] font-semibold text-[#F5F0E4]',
    rail: 'h-[9px]',
  },
  yellow: {
    row: 'py-3',
    name: 'text-[15px] font-medium text-[#F5F0E4]/90',
    status: 'text-[12px] text-[#F5F0E4]/70',
    rail: 'h-[7px]',
  },
  green: {
    row: 'py-2.5',
    name: 'text-[14px] text-[#F5F0E4]/65',
    status: 'text-[12px] text-[#F5F0E4]/45',
    rail: 'h-[5px]',
  },
};

/** The opening beats, in the order she reads them. */
const OPEN_DELAY_MS = { eyebrow: 0, heading: 70, intro: 140, summary: 220, legend: 300 };

/** When the first bar starts, and how far apart the eleven arrive. */
const GRAPH_DELAY_MS = 380;
const STAGGER_MS = 70;

function weightFor(bar: MemberSectionBar) {
  return ROW_WEIGHT[bar.colorKey] ?? ROW_WEIGHT.green!;
}

/**
 * The rest of a band's own sentence, once its label has been printed.
 *
 * The stored status line opens with the band's label, for example
 * "Quiet. Signals here are barely showing up right now." The legend prints
 * that label as the entry's name, so what belongs beside it is the rest of
 * the same sentence. Nothing is reworded and nothing is composed: if a
 * coach rewrites the line so it no longer opens with the label, the whole
 * line is printed exactly as it stands.
 */
function legendRemainder(entry: MemberBandLegendEntry): string {
  const prefix = `${entry.label}.`;
  return entry.statusLine.startsWith(prefix)
    ? entry.statusLine.slice(prefix.length).trim()
    : entry.statusLine;
}

export function BodySystemsResults({
  view,
  copy,
  action,
}: {
  view: MemberResultsView;
  copy: Record<string, string>;
  /**
   * Her next action, if this screen has one. It sits inside the closing
   * card rather than under it, because the closing sentence and the button
   * beneath it are one statement.
   */
  action?: ReactNode;
}) {
  return (
    <div>
      <p
        className="mef-bs-open text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C4A050]"
        style={{ animationDelay: `${OPEN_DELAY_MS.eyebrow}ms` }}
      >
        {memberCopy(copy, 'member.results_eyebrow')}
      </p>
      <h1
        className="mef-bs-open mt-2.5 font-[family-name:var(--font-cormorant-garamond)] text-[32px] leading-[1.12] tracking-[-0.01em] text-[#F5F0E4]"
        style={{ animationDelay: `${OPEN_DELAY_MS.heading}ms` }}
      >
        {memberCopy(copy, 'member.results_heading')}
      </h1>
      <p
        className="mef-bs-open mt-3 text-[15px] leading-relaxed text-[#F5F0E4]/70"
        style={{ animationDelay: `${OPEN_DELAY_MS.intro}ms` }}
      >
        {memberCopy(copy, 'member.results_intro')}
      </p>

      {/*
        THE ONE PERSONALISED LINE, and only for the loudest system. Absent
        entirely when nothing is showing up at all, because there is no
        loudest system to name when eleven systems are tied at nought and
        naming one would be Root claiming something untrue about her.
      */}
      {view.topAttentionLine && (
        <div
          className="mef-bs-open mt-7 rounded-3xl border border-[#C4A050]/35 bg-[#C4A050]/[0.09] px-5 py-4"
          style={{ animationDelay: `${OPEN_DELAY_MS.summary}ms` }}
        >
          <p className="text-[16px] leading-relaxed text-[#F5F0E4]">{view.topAttentionLine}</p>
        </div>
      )}

      {/*
        THE BANDS, EXPLAINED ONCE. Three sentences at the top of the graph
        instead of the same three repeated under eleven bars.
      */}
      <ul
        className="mef-bs-open mt-7 space-y-2 rounded-3xl border border-[#F5F0E4]/10 bg-[#F5F0E4]/[0.04] px-4 py-3.5"
        aria-label={memberCopy(copy, 'member.legend_label')}
        style={{ animationDelay: `${OPEN_DELAY_MS.legend}ms` }}
      >
        {view.legend.map((entry) => (
          <li key={entry.bandKey} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: BAND_FILL[entry.colorKey] ?? BAND_FILL.green }}
            />
            <p className="text-[13px] leading-snug text-[#F5F0E4]/60">
              <span className="font-semibold text-[#F5F0E4]/90">{entry.label}</span>{' '}
              {legendRemainder(entry)}
            </p>
          </li>
        ))}
      </ul>

      {view.isRetake && (
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F5F0E4]/50">
            {memberCopy(copy, 'member.compare_heading')}
          </p>
          <p className="flex items-center gap-1.5 text-[12px] text-[#F5F0E4]/45">
            <span aria-hidden="true" className="h-3 w-[2px] rounded-full bg-[#F5F0E4]/45" />
            {memberCopy(copy, 'member.compare_last_time')}
          </p>
        </div>
      )}

      {/*
        ONE GRAPH BLOCK. Hairline rules between the rows rather than gaps,
        so eleven systems read as one chart and not as eleven cards.
      */}
      <ul className="mt-4 divide-y divide-[#F5F0E4]/[0.09] border-y border-[#F5F0E4]/[0.09]">
        {view.bars.map((bar, index) => {
          const weight = weightFor(bar);
          const fill = BAND_FILL[bar.colorKey] ?? BAND_FILL.green;
          const direction = bar.comparison?.direction ?? null;
          const previousPercent = bar.comparison?.previousPercent ?? null;
          const delay = GRAPH_DELAY_MS + index * STAGGER_MS;
          return (
            <li key={bar.sectionKey} className={weight.row}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={weight.name}>{bar.sectionName}</p>
                <p className={`shrink-0 ${weight.status}`}>
                  {bar.bandLabel}
                  {direction && (
                    <span className="ml-1.5 font-normal text-[#F5F0E4]/45">
                      {memberCopy(copy, DIRECTION_COPY_KEY[direction] as MemberCopyKey)}
                    </span>
                  )}
                </p>
              </div>

              <div
                className={`relative mt-2 w-full overflow-hidden rounded-full bg-[#F5F0E4]/[0.08] ${weight.rail}`}
              >
                <div
                  className="mef-bs-bar h-full rounded-full"
                  style={{
                    width: `${bar.percent}%`,
                    backgroundColor: fill,
                    animationDelay: `${delay}ms`,
                  }}
                />
                {/*
                  LAST TIME, ON THIS TIME'S OWN RAIL. A tick rather than a
                  second bar underneath, so a retake is still one graph.
                  The word beside the band label is what says which way it
                  moved, so nothing here depends on reading the tick.
                */}
                {previousPercent !== null && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 w-[2px] rounded-full bg-[#F5F0E4]/45"
                    style={{ left: `calc(${previousPercent}% - 1px)` }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        THE CLOSING CARD. Her coach, the next session, and her way on. No
        advice and no association: what this survey found is a conversation
        she has with a person.
      */}
      <div
        className="mef-bs-open mt-8 rounded-3xl border border-[#F5F0E4]/12 bg-[#F5F0E4]/[0.05] px-5 py-5"
        style={{
          animationDelay: `${GRAPH_DELAY_MS + view.bars.length * STAGGER_MS + 120}ms`,
        }}
      >
        <p className="text-[15px] leading-relaxed text-[#F5F0E4]/85">
          {memberCopy(copy, 'member.results_closing')}
        </p>
        {action}
      </div>
    </div>
  );
}
