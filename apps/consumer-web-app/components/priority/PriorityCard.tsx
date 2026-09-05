'use client';

/**
 * The Priority Card — the dominant first element of Home and the Today
 * screen.
 *
 * Not a modal and not a popup. It renders inline, at the top of the page,
 * as the first thing a member reads.
 *
 * Three states:
 *
 *   active  the dominant card: label, priority, reason line, and the
 *           buttons lib/priority/actions.ts says this priority may show
 *           (an offer opens the thing and is declined with "Not today";
 *           only a self-reported priority is ever offered a Done claim).
 *   done    the accomplished state, in the Today page's own accomplished
 *           visual language (the same green check and muted card that
 *           TodayZones' Done Today list uses), so completing a priority
 *           reads as the same kind of event as completing a check-in.
 *   saved   collapsed. The page renders this variant lower down instead of
 *           at the top (see app/today/page.tsx) and passes `collapsed`, so
 *           the card is still available but no longer dominant.
 *
 * MOTION (Part 2). Every animation here expresses a state change; none of
 * it decorates. All of it is shared with the pop-up presentation rather
 * than written twice — the sequencing lives in
 * ./usePriorityCardMotion.ts and the timing in lib/priority/motion.ts, so
 * this file contains no millisecond values at all.
 *
 *   entrance  a staged fade-up in reading order (label, priority, reason,
 *             buttons) via `.mef-reveal-step`, finishing at 500ms. Root
 *             presenting something prepared, rather than UI appearing.
 *   done      the active content recedes, then the accomplished state
 *             arrives with a checkmark that draws itself (`SuccessCheck`,
 *             which also fires the single completion haptic where the
 *             platform has one and silently does nothing where it does not).
 *   help me   expands in place via `.mef-expand`, so the content below
 *             eases out of the way instead of snapping. No navigation.
 *   saved     the active content recedes and the collapsed card settles
 *             DOWN into place (`.mef-settle-down`), so she sees it take a
 *             lower position rather than finding it already there.
 *   bridge    "Building on yesterday..." — see ./PriorityBridge.tsx.
 *
 * Reduced motion: `usePriorityCardMotion` skips every timed sequence
 * outright (not shortened), and each class above carries its own
 * `@media (prefers-reduced-motion: reduce)` override in app/globals.css.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { CheckCircle2, Compass, Lightbulb, ArrowRight } from 'lucide-react';
import { SuccessCheck } from '@/components/motion/SuccessCheck';
import { revealStep } from '@/lib/motion/revealStep';
import type { PriorityView } from '@/lib/priority/types';
import { PRIORITY_ACCOMPLISHED_SETTLE_MS, PRIORITY_REVEAL_INDEX } from '@/lib/priority/motion';
import { priorityActionSet } from '@/lib/priority/actions';
import {
  PRIORITY_CARD_LABEL,
  PRIORITY_DONE_TEXT,
  PRIORITY_HELP_HEADING,
} from '@/lib/priority/copy';
import { usePriorityCardActions } from './usePriorityCardActions';
import { usePriorityCardMotion } from './usePriorityCardMotion';
import { PriorityBridge } from './PriorityBridge';
import { FrictionQuestion } from './FrictionQuestion';

export function PriorityCard({ view, collapsed = false }: { view: PriorityView; collapsed?: boolean }) {
  // Behavior lives in the shared hook so the inline card and the pop-up
  // can never disagree about what Done means. See
  // components/priority/usePriorityCardActions.ts.
  const { status, helpOpen, onDone, onSave, onHelp } = usePriorityCardActions(view);
  // Motion lives in its own shared hook for the same reason, and holds no
  // behavior: it reads `status` and never writes anything.
  const motion = usePriorityCardMotion(view, status, 'inline');

  const { selected, isReEntry, welcomeLine, bridge, frictionQuestion } = view;

  // WHICH BUTTONS THIS PRIORITY MAY SHOW, and the one place that decides
  // it. An offer (something that lives inside this app) opens the thing and
  // is declined with "Not today"; only a priority she is the sole witness
  // to is offered a Done claim. Decided from the priority's own stored row,
  // never from its words. See lib/priority/actions.ts for the whole rule
  // and for the bug that produced it.
  const actions = priorityActionSet(selected);

  const router = useRouter();

  // ---- The move to the bottom of the page ----------------------------
  // Home cleanup pass (2026-08-14). A completed priority no longer keeps
  // the dominant slot: both pages render this card at the top only while
  // it is active, and render the compact accomplished card at the bottom
  // once it is done. That is a SERVER decision (see app/dashboard/page.tsx
  // and app/today/page.tsx), so the page has to re-render for the card to
  // actually take its new place — otherwise she taps Done and the
  // accomplished card sits at the top until her next navigation.
  //
  // The refresh waits one settle beat so the completion she just earned
  // (the drawn ring, the haptic) is seen before the card moves, and it
  // only ever runs for a completion that happened in front of her in the
  // dominant slot: `justResolved` is false on an ordinary page load, and
  // the collapsed card at the bottom is already where it belongs.
  const justCompletedInPlace = !collapsed && status === 'done' && motion.justResolved;
  useEffect(() => {
    if (!justCompletedInPlace) return;
    const timer = setTimeout(() => router.refresh(), PRIORITY_ACCOMPLISHED_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [justCompletedInPlace, router]);

  // ---- Compact accomplished state (bottom of the page) ---------------
  // Where a completed priority lives for the rest of her own calendar
  // day, on Home and on Today alike, from the same
  // member_daily_priorities row. One quiet line, not a second card
  // competing for attention: what she finished, and that she finished it.
  if (collapsed && status === 'done') {
    return (
      <section className="mef-card mef-settle-down flex items-center gap-3 border-[#3C7F5E]/25 bg-[#EAF1EC]/60 py-4">
        <CheckCircle2
          className="h-5 w-5 shrink-0 text-[#3C7F5E]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
            {PRIORITY_CARD_LABEL}
          </p>
          {/* Two lines at most. Some priorities are a full sentence, and
              an unclamped one turns this quiet closing row back into a
              card the size of the active one. */}
          <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-[#1B3A2D]">
            {selected.title}
          </p>
        </div>
        <span className="ml-auto shrink-0 text-xs font-medium text-[#2F6B4F]">
          {PRIORITY_DONE_TEXT}
        </span>
      </section>
    );
  }

  // ---- Accomplished state -------------------------------------------
  // Reached either by tapping Done in front of her (resolvePhase walked
  // active -> receding -> resolved) or by arriving already done, in which
  // case there was no state change to express and `.mef-fade-in` is just
  // the card appearing.
  if (status === 'done' && motion.resolvePhase === 'resolved') {
    return (
      <section className="mef-card mef-fade-in mt-6 border-[#3C7F5E]/25 bg-[#EAF1EC]/60">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <CheckCircle2 className="h-4 w-4 text-[#3C7F5E]" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">{PRIORITY_CARD_LABEL}</p>
        </div>
        <p className="mt-3 text-lg leading-relaxed text-[#1B3A2D]">{selected.title}</p>
        {/* The one focal confirmation: a ring and a check that draw
            themselves once, plus the single completion haptic. Bible §9's
            success-state precedent, never the gold sweep — that is
            reserved for genuine first-completion milestones.
            The haptic is gated on her having completed it just now: this
            same state also mounts on an ordinary reload, and buzzing there
            would be feedback for something she did hours ago. */}
        <div className="mt-3 flex items-center gap-2 text-sm font-medium text-[#2F6B4F]">
          <SuccessCheck
            size={20}
            color="#15803d"
            haptic={motion.justResolved}
            className="shrink-0"
          />
          {PRIORITY_DONE_TEXT}
        </div>
      </section>
    );
  }

  // ---- Saved (collapsed, lower down the page) ------------------------
  if (status === 'saved' && motion.resolvePhase === 'resolved') {
    return (
      <section className="mef-card mef-settle-down">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">{PRIORITY_CARD_LABEL}</p>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{selected.title}</p>
        <p className="mt-2 text-sm text-[#6B7A72]">{actions.setAsideText}</p>
        {/* The way back in, in the same mode the card was in when she set it
            aside. An offer she declined this morning is still an offer this
            evening, so this reopens it rather than offering to claim it. */}
        {actions.primary?.kind === 'open' && (
          <Link
            href={actions.primary.href as Route}
            className="mef-press mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
          >
            {actions.primary.label}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </Link>
        )}
        {actions.primary?.kind === 'done' && (
          <button
            type="button"
            onClick={onDone}
            className="mef-press mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] disabled:opacity-60"
          >
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {actions.primary.label}
          </button>
        )}
      </section>
    );
  }

  // A saved card is rendered lower down by the page; if the page asked for
  // the collapsed slot but the card is still active, render nothing there
  // rather than a duplicate of the dominant card above.
  if (collapsed) return null;

  // ---- Active (dominant) ---------------------------------------------
  // `receding` is the outgoing half of Done and Save for later: the
  // content she acted on steps back for one Quick beat before its
  // resolved form arrives, so neither state change is a blink.
  const receding = motion.resolvePhase === 'receding';

  return (
    <section className="mef-card relative mt-6 overflow-hidden border-[#1B3A2D]/15 shadow-[0_2px_28px_-6px_rgba(27,58,45,0.16)]">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#C4A050]/25 blur-3xl"
        aria-hidden="true"
      />

      {/* The adaptation moment, when Root genuinely adapted overnight. */}
      {bridge && motion.showsYesterday && (
        <PriorityBridge
          yesterdayTitle={bridge.yesterdayTitle}
          showsLine={motion.showsBridgeLine}
          receding={motion.bridgeReceding}
          tone="light"
        />
      )}

      {motion.showsToday && (
        <div className={receding ? 'mef-recede' : ''}>
          <div
            {...revealStep(PRIORITY_REVEAL_INDEX.label, "relative flex items-center gap-2 text-[#6B7A72]")}
          >
            <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">{PRIORITY_CARD_LABEL}</p>
          </div>

          {/* The re-entry welcome. Root's own established return sentence,
              taken from the Root Presence System rather than authored here, so
              a member who has just seen it elsewhere sees the same words and
              not a competing second greeting. */}
          {isReEntry && welcomeLine && (
            <p
              {...revealStep(PRIORITY_REVEAL_INDEX.welcome, "relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug text-[#1B3A2D]")}
            >
              {welcomeLine}
            </p>
          )}

          <p
            {...revealStep(PRIORITY_REVEAL_INDEX.priority, "relative mt-3 text-xl leading-relaxed text-[#1B3A2D]")}
          >
            {selected.title}
          </p>

          {/* Omitted entirely when no honest, query-backed reason exists. Never
              replaced with filler. */}
          {selected.reason && (
            <p
              {...revealStep(PRIORITY_REVEAL_INDEX.reason, "relative mt-3 text-sm leading-relaxed text-[#6B7A72]")}
            >
              {selected.reason}
            </p>
          )}

          {/* Help me expands in place. No navigation away, per the brief.
              Kept mounted and collapsed rather than unmounted, which is
              what lets the height animate at all and what lets collapsing
              back be as smooth as opening. */}
          <div
            className={`mef-expand relative ${helpOpen ? 'mef-expand-open' : ''}`}
            aria-hidden={!helpOpen}
          >
            <div>
              <div className="mt-4 rounded-2xl bg-[#1B3A2D]/[0.05] p-4">
                <div className="flex items-center gap-2 text-[#1B3A2D]/70">
                  <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-xs font-semibold uppercase tracking-wider">
                    {PRIORITY_HELP_HEADING}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]/85">{selected.help}</p>
              </div>
            </div>
          </div>

          {/* ROOT ASKS WHAT GOT IN THE WAY (AUDIT-ADAPTIVE-REVEAL.md 2.17).
              Non-null only on a day the ignore window has closed and she has
              not answered yet. Placed above the buttons deliberately: the
              question is about this card, and Done / Help me / Save for later
              are still right there, so answering it is never the only way
              forward. */}
          {frictionQuestion && <FrictionQuestion question={frictionQuestion} />}

          <div
            {...revealStep(PRIORITY_REVEAL_INDEX.buttons, "relative mt-5 flex flex-wrap gap-2")}
          >
            {/* An offer opens the thing it named. It is the same address the
                separate "Open it" link under the reason used to carry: one
                control now, in the position her thumb already goes to. */}
            {actions.primary?.kind === 'open' && (
              <Link
                href={actions.primary.href as Route}
                className="mef-press inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
              >
                {actions.primary.label}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </Link>
            )}
            {actions.primary?.kind === 'done' && (
              <button
                type="button"
                onClick={onDone}
                className="mef-press inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                {actions.primary.label}
              </button>
            )}
            <button
              type="button"
              onClick={onHelp}
              aria-expanded={helpOpen}
              className="mef-press inline-flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/20 px-5 py-2.5 text-sm font-semibold text-[#1B3A2D] transition hover:border-[#1B3A2D]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
            >
              <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {actions.helpLabel}
            </button>
            <button
              type="button"
              onClick={onSave}
              className="mef-press inline-flex items-center rounded-full px-5 py-2.5 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] disabled:opacity-60"
            >
              {actions.setAsideLabel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
