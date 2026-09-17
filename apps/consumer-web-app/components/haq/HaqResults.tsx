'use client';

/**
 * HER HEALTH APPRAISAL RESULTS: twenty one areas drawn as one map, under the
 * instrument's own ten Parts.
 *
 * THE QUESTION THIS PAGE ANSWERS IN A FEW SECONDS is "where am I doing well,
 * and what deserves my attention". So the colour does the work. A strip at
 * the top counts her three states, and below it every section is one compact
 * row: its name, its one result, and one bar drawn in that result's colour.
 * She should never have to read twenty one paragraphs to see the shape of
 * her own sitting, so the approved sentence for a colour is one tap away in
 * the row itself rather than repeated under every section.
 *
 * ONE SECTION, ONE COLOUR. A row is Green or Yellow or Red, never a scale
 * with all three on it and never a gradient. Whatever band the section
 * landed in is the only colour that row wears.
 *
 * THE BAR IS THE BAND, NOT THE SCORE. Three fixed widths (resultsView.ts),
 * because the sections do not share a scale and a bar drawn from a raw total
 * would claim one Red section is worse than another. No number of the
 * instrument is on this screen: no total, no cutoff, no maximum, no hidden
 * value, no priority and no overall result, because the instrument has no
 * overall result to give.
 *
 * A CLIENT COMPONENT NOW, AND ONLY FOR THE THREE THINGS THAT MOVE: the bars
 * filling once as they arrive, the summary strip emphasising one colour
 * across the map, and a row opening. Everything it imports is pure
 * (lib/haq/resultsView.ts, lib/haq/copy.ts), so no database client and no
 * scoring module is anywhere near this bundle, which
 * tests/haq-member-safety.test.ts enforces.
 *
 * THE BAR IS DECORATION, AND IS MARKED AS SUCH. Every row states its result
 * in words next to a colour dot, so the bar is aria-hidden and nothing is
 * carried by colour alone. It is also why there is no <noscript> fallback
 * filling the bars: the result is already written on the row, and a <style>
 * block would put its own digits into the page's text.
 *
 * SYMPTOMS, NEVER CONDITIONS. Every sentence says what an AREA is showing
 * from what she reported. A section is named, never an organ, and nothing
 * here diagnoses anything.
 *
 * THE TREND IS A COMPARISON OF REPORTS. It appears only when she has an
 * earlier finished sitting, it says Quieter, Unchanged or Louder, and it is
 * never framed as getting better or getting worse. It never changes the bar:
 * a Yellow section that got quieter is still a Yellow section.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { Card } from '@/components/layout';
import { HAQ_ROUTE } from '@/lib/haq/constants';
import {
  HAQ_MEMBER_LABELS,
  HAQ_RESULTS_BACK_LABEL,
  HAQ_RESULTS_COMPARISON_LINE,
  HAQ_RESULTS_INTRO,
  HAQ_RESULTS_SUMMARY_HEADING,
  HAQ_RESULTS_TITLE,
  HAQ_TREND_LABELS,
  haqAreaCountLabel,
} from '@/lib/haq/copy';
import {
  HAQ_BAND_FILL,
  HAQ_RESULT_COLOR_ORDER,
  haqResultCounts,
  haqResultGroups,
  type HaqResultCard,
} from '@/lib/haq/resultsView';
import type { HaqMemberResults } from '@/lib/haq/results';
import type { HaqResultColor } from '@/lib/haq/types';
import { useHaqBarReveal } from './useHaqBarReveal';

/**
 * THE THREE STATES, DRAWN. Quiet, warm and calm in that order, and never a
 * traffic light: Red is the colour of "worth a closer look with someone",
 * not of alarm, which is why it is a muted clay and not a signal red.
 */
const TONE: Record<HaqResultColor, { ink: string; fill: string; wash: string }> = {
  red: { ink: 'text-[#8A3A3A]', fill: '#B9524F', wash: 'bg-[#B9524F]' },
  yellow: { ink: 'text-[#7A5714]', fill: '#C4A050', wash: 'bg-[#C4A050]' },
  green: { ink: 'text-[#1B3A2D]', fill: '#4F7A63', wash: 'bg-[#4F7A63]' },
};

/** The bar's own travel. Cinematic tier, decelerating, no overshoot and no bounce. */
const FILL_MS = 700;
/** A Part settles as a group rather than snapping in unison. Four sections at most, so 150ms at most. */
const STAGGER_MS = 50;

export function HaqResults({ results }: { results: HaqMemberResults }) {
  const counts = haqResultCounts(results.cards);
  const groups = haqResultGroups(results.cards);

  /**
   * ONE COLOUR HELD UP ACROSS THE WHOLE MAP, and never a second screen. She
   * taps High Attention and the rows that are not Red step back so the ones
   * that are stand out WHERE THEY ALREADY STAND. Nothing is filtered, nothing
   * is reordered and nothing is hidden, because the point of the map is where
   * a result falls in the body system structure, and a filtered list would
   * destroy exactly that. Tapping the same count again puts the page back.
   */
  const [emphasis, setEmphasis] = useState<HaqResultColor | null>(null);

  /** One open at a time: a second tap closes the first, so the map never unrolls into a wall of text. */
  const [openSection, setOpenSection] = useState<string | null>(null);

  return (
    <div data-testid="haq-results">
      <h1 className={`${CVS_DISPLAY_FONT} text-[30px] leading-tight tracking-[0.02em] text-[#1B3A2D]`}>
        {HAQ_RESULTS_TITLE}
      </h1>
      <p className="mt-3 text-[15.5px] leading-relaxed text-[#4F645A]">{HAQ_RESULTS_INTRO}</p>

      {results.hasPrevious && (
        <p className="mt-3 text-[14px] leading-relaxed text-[#6B7A72]" data-testid="haq-results-comparison-line">
          {HAQ_RESULTS_COMPARISON_LINE}
        </p>
      )}

      <Card className="mef-animate-in mt-6" data-testid="haq-results-summary">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#6B7A72]">
          {HAQ_RESULTS_SUMMARY_HEADING}
        </h2>
        <div className="mt-2 divide-y divide-[#1B3A2D]/5">
          {HAQ_RESULT_COLOR_ORDER.map((color) => {
            const active = emphasis === color;
            return (
              <button
                key={color}
                type="button"
                aria-pressed={active}
                onClick={() => setEmphasis(active ? null : color)}
                className={`mef-focus-ring mef-press -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-4 rounded-xl px-2 py-2.5 text-left transition-colors duration-200 ${
                  active ? 'bg-[#1B3A2D]/[0.045]' : ''
                }`}
                data-testid={`haq-summary-${color}`}
                data-active={active ? 'true' : 'false'}
              >
                <span className="flex items-center gap-2.5 text-[15px] text-[#1B3A2D]">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[color].wash}`}
                    aria-hidden="true"
                  />
                  {HAQ_MEMBER_LABELS[color]}
                </span>
                <span className="text-[15px] font-semibold text-[#1B3A2D]">
                  {haqAreaCountLabel(counts[color])}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* THE MAP. Ten Parts in the instrument's order, each section in its own. */}
      <div className="mt-7">
        {groups.map((group) => (
          <section key={group.partId} className="mt-6 first:mt-0" data-testid={`haq-part-${group.partId}`}>
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6B7A72]">
              {group.partName}
            </h2>
            <div className="mt-2 h-px w-full bg-gradient-to-r from-[#C4A050]/35 via-[#1B3A2D]/8 to-transparent" />
            <ul className="mt-1 list-none">
              {group.cards.map((card, index) => (
                <ResultRow
                  key={card.sectionId}
                  card={card}
                  delayMs={index * STAGGER_MS}
                  dimmed={emphasis !== null && emphasis !== card.resultColor}
                  open={openSection === card.sectionId}
                  onToggle={() =>
                    setOpenSection(openSection === card.sectionId ? null : card.sectionId)
                  }
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Link
        href={'/questionnaires' as Route}
        className="mef-press mef-focus-ring mt-8 block w-full rounded-2xl border border-[#1B3A2D]/12 bg-white px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D]"
      >
        {HAQ_RESULTS_BACK_LABEL}
      </Link>
      {/* Her own sitting stays one tap away, so the results are never a dead end. */}
      <Link
        href={HAQ_ROUTE as Route}
        className="mef-focus-ring mt-3 block text-center text-[13px] font-medium text-[#6B7A72] underline decoration-[#6B7A72]/30 underline-offset-4"
      >
        Back to your Health Appraisal
      </Link>
    </div>
  );
}

/**
 * ONE SECTION, COMPACT ENOUGH THAT SHE SEES SEVERAL AT ONCE. Name, the one
 * result in words beside its dot, and the bar. The whole row is the control
 * that opens the approved sentence for that colour.
 */
function ResultRow({
  card,
  delayMs,
  dimmed,
  open,
  onToggle,
}: {
  card: HaqResultCard;
  delayMs: number;
  dimmed: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { ref, filled, reducedMotion } = useHaqBarReveal();
  const tone = TONE[card.resultColor];
  const panelId = `haq-detail-${card.sectionId}`;

  return (
    <li
      ref={ref}
      className="border-b border-[#1B3A2D]/5 last:border-b-0"
      data-testid={`haq-result-card-${card.sectionId}`}
      data-result={card.resultColor}
      data-dimmed={dimmed ? 'true' : 'false'}
      style={{
        opacity: dimmed ? 0.34 : 1,
        transition: reducedMotion ? 'none' : 'opacity var(--mef-duration-standard) var(--mef-ease-standard)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="mef-focus-ring w-full rounded-xl px-1 py-3 text-left"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="text-[15.5px] font-medium leading-snug text-[#1B3A2D]">
            {card.sectionTitle}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {card.trend && (
              <span
                className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#8B9A92]"
                data-testid={`haq-trend-${card.sectionId}`}
              >
                {HAQ_TREND_LABELS[card.trend]}
              </span>
            )}
            <Caret open={open} />
          </span>
        </span>

        <span className={`mt-1 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] ${tone.ink}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.wash}`} aria-hidden="true" />
          {card.memberResultLabel}
        </span>

        {/* One neutral track, one fill, one colour. Decoration: the row already says the result. */}
        <span
          className="mt-2.5 block h-1.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/[0.07]"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full"
            data-testid={`haq-bar-${card.sectionId}`}
            data-fill={HAQ_BAND_FILL[card.resultColor]}
            style={{
              width: filled ? HAQ_BAND_FILL[card.resultColor] : '0%',
              backgroundColor: tone.fill,
              transition: reducedMotion
                ? 'none'
                : `width ${FILL_MS}ms var(--mef-ease-decelerate) ${delayMs}ms`,
            }}
          />
        </span>
      </button>

      {/*
        THE APPROVED SENTENCE, ONE TAP AWAY. It stays in the document when
        closed, collapsed by rows rather than unmounted, so opening it is a
        smooth height and not a jump. aria-hidden keeps a closed panel out of
        the screen reader's way while the button's aria-expanded says it is
        there to open.
      */}
      <div
        id={panelId}
        aria-hidden={!open}
        className="grid"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: reducedMotion
            ? 'none'
            : 'grid-template-rows var(--mef-duration-standard) var(--mef-ease-decelerate)',
        }}
      >
        <div className="overflow-hidden">
          <p className="px-1 pb-3.5 text-[14.5px] leading-relaxed text-[#4F645A]">{card.explanation}</p>
        </div>
      </div>
    </li>
  );
}

/** The one affordance saying a row opens. Rotates rather than swapping glyph, so nothing flickers. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3 shrink-0 text-[#A3B0A9]"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform var(--mef-duration-standard) var(--mef-ease-decelerate)',
      }}
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
