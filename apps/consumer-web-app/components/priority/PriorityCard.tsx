'use client';

/**
 * The Priority Card — the dominant first element of the Today screen.
 *
 * Not a modal and not a popup. It renders inline, at the top of the page,
 * as the first thing a member reads.
 *
 * Three states, all in this one component so Part 2 can animate the
 * transitions between them without restructuring anything:
 *
 *   active  the dominant card: label, priority, reason line, three buttons.
 *   done    the accomplished state, in the Today page's own accomplished
 *           visual language (the same green CheckCircle2 and muted card
 *           that TodayZones' Done Today list uses), so completing a
 *           priority reads as the same kind of event as completing a
 *           check-in.
 *   saved   collapsed. The page renders this variant lower down instead of
 *           at the top (see app/today/page.tsx) and passes `collapsed`, so
 *           the card is still available but no longer dominant.
 *
 * ENTRANCE (Part 1's simple version). Soft fade with a slight upward rise,
 * staged: label, then the priority a beat later, then the reason, then the
 * buttons. This reuses `.mef-animate-in` from app/globals.css, which is
 * already exactly the fade-up this build asks for (500ms, ease-out, 8px
 * rise, no bounce) and which already disables itself under
 * prefers-reduced-motion, rather than defining a second, parallel
 * animation that would need its own reduced-motion handling. Staging is
 * per-element animationDelay, the same technique the Today page's own
 * `stagger()` already uses. Part 2's richer motion language, including the
 * priority-transition animation, replaces the delays here without touching
 * the state structure.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { CheckCircle2, Compass, Lightbulb, ArrowRight } from 'lucide-react';
import type { PriorityView } from '@/lib/priority/types';
import {
  PRIORITY_BUTTON_LABELS,
  PRIORITY_CARD_LABEL,
  PRIORITY_DONE_TEXT,
  PRIORITY_HELP_HEADING,
  PRIORITY_SAVED_TEXT,
} from '@/lib/priority/copy';
import { usePriorityCardActions } from './usePriorityCardActions';

/** Entrance staging, in the order the brief specifies. Inside `.mef-animate-in`'s own 500ms, so the last element lands at roughly 500ms. */
const STAGE_MS = { label: 0, priority: 90, reason: 180, buttons: 270 } as const;

function stage(delayMs: number) {
  return { animationDelay: `${delayMs}ms` };
}

export function PriorityCard({ view, collapsed = false }: { view: PriorityView; collapsed?: boolean }) {
  // Behavior lives in the shared hook so the inline card and the pop-up
  // can never disagree about what Done means. See
  // components/priority/usePriorityCardActions.ts.
  const { status, helpOpen, pending, onDone, onSave, onHelp } = usePriorityCardActions(view);

  const { selected, isReEntry, welcomeLine } = view;

  // ---- Accomplished state -------------------------------------------
  if (status === 'done') {
    return (
      <section className="mef-card mef-animate-in mt-6 border-green-600/20 bg-green-50/40">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <CheckCircle2 className="h-4 w-4 text-green-600" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">{PRIORITY_CARD_LABEL}</p>
        </div>
        <p className="mt-3 text-lg leading-relaxed text-[#1B3A2D]">{selected.title}</p>
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {PRIORITY_DONE_TEXT}
        </p>
      </section>
    );
  }

  // ---- Saved (collapsed, lower down the page) ------------------------
  if (status === 'saved') {
    return (
      <section className="mef-card mef-animate-in">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">{PRIORITY_CARD_LABEL}</p>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{selected.title}</p>
        <p className="mt-2 text-sm text-[#6B7A72]">{PRIORITY_SAVED_TEXT}</p>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="mef-press mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] disabled:opacity-60"
        >
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {PRIORITY_BUTTON_LABELS.done}
        </button>
      </section>
    );
  }

  // A saved card is rendered lower down by the page; if the page asked for
  // the collapsed slot but the card is still active, render nothing there
  // rather than a duplicate of the dominant card above.
  if (collapsed) return null;

  // ---- Active (dominant) ---------------------------------------------
  return (
    <section className="mef-card relative mt-6 overflow-hidden border-[#1B3A2D]/15 shadow-[0_2px_28px_-6px_rgba(27,58,45,0.16)]">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#F5B700]/10"
        aria-hidden="true"
      />

      <div className="mef-animate-in relative flex items-center gap-2 text-[#6B7A72]" style={stage(STAGE_MS.label)}>
        <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{PRIORITY_CARD_LABEL}</p>
      </div>

      {/* The re-entry welcome. Root's own established return sentence,
          taken from the Root Presence System rather than authored here, so
          a member who has just seen it elsewhere sees the same words and
          not a competing second greeting. */}
      {isReEntry && welcomeLine && (
        <p
          className="mef-animate-in relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug text-[#1B3A2D]"
          style={stage(STAGE_MS.label)}
        >
          {welcomeLine}
        </p>
      )}

      <p
        className="mef-animate-in relative mt-3 text-xl leading-relaxed text-[#1B3A2D]"
        style={stage(STAGE_MS.priority)}
      >
        {selected.title}
      </p>

      {/* Omitted entirely when no honest, query-backed reason exists. Never
          replaced with filler. */}
      {selected.reason && (
        <p
          className="mef-animate-in relative mt-3 text-sm leading-relaxed text-[#6B7A72]"
          style={stage(STAGE_MS.reason)}
        >
          {selected.reason}
        </p>
      )}

      {selected.href && (
        <Link
          href={selected.href as Route}
          className="mef-animate-in relative mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
          style={stage(STAGE_MS.reason)}
        >
          Open it
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </Link>
      )}

      {/* Help me expands in place. No navigation away, per the brief. */}
      {helpOpen && (
        <div className="mef-animate-in relative mt-4 rounded-2xl bg-[#1B3A2D]/[0.05] p-4">
          <div className="flex items-center gap-2 text-[#1B3A2D]/70">
            <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wider">{PRIORITY_HELP_HEADING}</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]/85">{selected.help}</p>
        </div>
      )}

      <div
        className="mef-animate-in relative mt-5 flex flex-wrap gap-2"
        style={stage(STAGE_MS.buttons)}
      >
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="mef-press inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] disabled:opacity-60"
        >
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {PRIORITY_BUTTON_LABELS.done}
        </button>
        <button
          type="button"
          onClick={onHelp}
          aria-expanded={helpOpen}
          className="mef-press inline-flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/20 px-5 py-2.5 text-sm font-semibold text-[#1B3A2D] transition hover:border-[#1B3A2D]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
        >
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {PRIORITY_BUTTON_LABELS.help}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="mef-press inline-flex items-center rounded-full px-5 py-2.5 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] disabled:opacity-60"
        >
          {PRIORITY_BUTTON_LABELS.save}
        </button>
      </div>
    </section>
  );
}
