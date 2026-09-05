'use client';

/**
 * The Priority Card as the Root pop-up on open.
 *
 * This is a presentation, not a second card. Its buttons run the exact
 * same handlers the inline card runs
 * (components/priority/usePriorityCardActions.ts), writing the same
 * `member_daily_priorities` row through the same server actions, so
 * marking it Done here shows Done on Home and Today with no syncing of any
 * kind. WHICH buttons it may show is not this file's decision either: it
 * asks lib/priority/actions.ts, exactly as the inline card does, so an
 * offer never grows a Done claim in one presentation and not the other. There is no second pop-up system either: this renders inside the
 * existing chain (app/actions/rootPopupMessages.ts ->
 * components/dashboard/RootMessagePopupClient.tsx), which already decides
 * that only one pop-up may own the screen at a time.
 *
 * Chrome is deliberately identical to the chain's other modals: the same
 * dark-green panel, the same gold eyebrow, the same corner wash, the same
 * z-index and backdrop. A member should experience this as Root speaking,
 * exactly as she already does for a coach assignment or a day-3 follow-up,
 * not as a new kind of interruption.
 *
 * Like every other message in the chain there is no backdrop-click or
 * Escape dismissal: the whole point is that the priority is not missed.
 * The ways out are its buttons plus the explicit close, and every one of
 * them leaves the card available inline afterwards. On an offer the
 * primary is a link, and following it unmounts this modal with the page
 * it was drawn over.
 *
 * MOTION (Part 2). Identical to the inline card's, and shared with it
 * rather than written twice: the same staged reveal in the same reading
 * order, the same in-place Help me expansion, the same recede-then-resolve
 * on Done and Save for later, the same "Building on yesterday..."
 * sequence. Sequencing lives in ./usePriorityCardMotion.ts and timing in
 * lib/priority/motion.ts, so this file contains no millisecond values.
 * The panel itself gets the one motion the inline card has no equivalent
 * for: it rises into place while the backdrop fades, so Root arriving is
 * a movement rather than a cut.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, CheckCircle2, Lightbulb } from 'lucide-react';
import { SuccessCheck } from '@/components/motion/SuccessCheck';
import { revealStep } from '@/lib/motion/revealStep';
import type { PriorityView } from '@/lib/priority/types';
import { PRIORITY_REVEAL_INDEX } from '@/lib/priority/motion';
import { priorityActionSet } from '@/lib/priority/actions';
import {
  PRIORITY_CARD_LABEL,
  PRIORITY_DONE_TEXT,
  PRIORITY_HELP_HEADING,
} from '@/lib/priority/copy';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { usePriorityCardActions } from './usePriorityCardActions';
import { usePriorityCardMotion } from './usePriorityCardMotion';
import { PriorityBridge } from './PriorityBridge';

export function PriorityCardPopup({
  view,
  closed,
  onClose,
}: {
  view: PriorityView;
  closed: boolean;
  onClose: () => void;
}) {
  const { status, helpOpen, onDone, onSave, onHelp } = usePriorityCardActions(view);
  const motion = usePriorityCardMotion(view, status, 'popup');
  const { selected, isReEntry, welcomeLine, bridge } = view;

  // Which buttons this priority is allowed to show, decided from the
  // priority's own stored row rather than from its words. See
  // lib/priority/actions.ts. The inline card asks the identical question of
  // the identical function, so the two presentations cannot disagree about
  // whether Done is even offered.
  const actions = priorityActionSet(selected);

  useBodyScrollLock(!closed);

  if (closed) return null;

  // Once she has acted, the pop-up stops asking and simply confirms. It
  // stays on screen rather than vanishing mid-tap, and the inline card on
  // Home and Today is already showing the same state underneath.
  //
  // `resolvePhase` is what makes that a transition rather than a swap: the
  // question recedes for one Quick beat, then the confirmation arrives.
  const acted =
    (status === 'done' || status === 'saved') && motion.resolvePhase === 'resolved';
  const receding = motion.resolvePhase === 'receding';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="mef-fade-in absolute inset-0 bg-[#0E1F17]/55 backdrop-blur-sm" aria-hidden="true" />
      {/* `aria-label` rather than the `aria-labelledby` Part 1 used: the
          element it pointed at is part of today's reveal, so during the
          "Building on yesterday..." sequence the dialog would briefly have
          had no accessible name at all. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={PRIORITY_CARD_LABEL}
        className="mef-animate-in relative w-full max-w-sm overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
          aria-hidden="true"
        />

        {/* The adaptation moment, when Root genuinely adapted overnight.
            Same component, same beats, same copy as the inline card. */}
        {bridge && motion.showsYesterday && (
          <div className="relative">
            <PriorityBridge
              yesterdayTitle={bridge.yesterdayTitle}
              showsLine={motion.showsBridgeLine}
              receding={motion.bridgeReceding}
              tone="dark"
            />
          </div>
        )}

        {motion.showsToday && (
          <div className={receding ? 'mef-recede' : ''}>
            <p
              {...revealStep(PRIORITY_REVEAL_INDEX.label, "relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]")}
            >
              {PRIORITY_CARD_LABEL}
            </p>

            {/* The re-entry welcome. Root Presence's own established sentence,
                never a second welcome authored here, so a returning member
                gets one coherent greeting. */}
            {isReEntry && welcomeLine && (
              <h2
                {...revealStep(PRIORITY_REVEAL_INDEX.welcome, "relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]")}
              >
                {welcomeLine}
              </h2>
            )}

            <p
              {...revealStep(PRIORITY_REVEAL_INDEX.priority, "relative mt-3 text-[17px] leading-relaxed text-[#F5F0E4]")}
            >
              {selected.title}
            </p>

            {/* Omitted entirely when no honest, query-backed reason exists. */}
            {selected.reason && (
              <p
                {...revealStep(PRIORITY_REVEAL_INDEX.reason, "relative mt-3 text-sm leading-relaxed text-[#F5F0E4]/75")}
              >
                {selected.reason}
              </p>
            )}

            {/* Expands in place, exactly as it does inline: no navigation,
                and the buttons below ease down rather than jumping. */}
            <div
              className={`mef-expand relative ${helpOpen ? 'mef-expand-open' : ''}`}
              aria-hidden={!helpOpen}
            >
              <div>
                <div className="mt-4 rounded-2xl bg-[#F5F0E4]/10 p-4">
                  <div className="flex items-center gap-2 text-[#C4A050]">
                    <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wider">
                      {PRIORITY_HELP_HEADING}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[#F5F0E4]/90">{selected.help}</p>
                </div>
              </div>
            </div>

            {acted ? (
              <div className="mef-fade-in">
                <p className="relative mt-5 flex items-center gap-2 text-sm font-medium text-[#C4A050]">
                  {status === 'done' && (
                    // The one focal confirmation, drawing itself once, plus
                    // the single completion haptic where the platform has
                    // one — and only when she completed it just now, never
                    // when this state simply mounts already resolved.
                    <SuccessCheck
                      size={20}
                      color="#C4A050"
                      haptic={motion.justResolved}
                      className="shrink-0"
                    />
                  )}
                  {status === 'done' ? PRIORITY_DONE_TEXT : actions.setAsideText}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mef-focus-ring mef-press relative mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
                >
                  Close
                </button>
              </div>
            ) : (
              <div
                {...revealStep(PRIORITY_REVEAL_INDEX.buttons, "relative mt-5 space-y-2")}
              >
                {/* THE PRIMARY, AND WHAT IT IS ALLOWED TO CLAIM.
                    An offer opens the thing, because the app records what
                    actually happens there. A self-reported priority takes
                    her Done, because she is the only witness. The safety
                    override has neither, because nothing is being asked.

                    The open link carries no onClose, deliberately. The
                    chain's own close handler refreshes the route on the
                    way out, which on the page she is LEAVING is a full
                    server render nobody will read. Following the link
                    unmounts this modal with its page and releases the
                    scroll lock through the hook's own cleanup, and the
                    pop-up was already marked shown on mount, so it cannot
                    return behind her. */}
                {actions.primary?.kind === 'open' && (
                  <Link
                    href={actions.primary.href as Route}
                    className="mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
                  >
                    {actions.primary.label}
                    <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </Link>
                )}
                {actions.primary?.kind === 'done' && (
                  <button
                    type="button"
                    onClick={onDone}
                    className="mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50"
                  >
                    {/* A plain icon, deliberately. `SuccessCheck` draws itself
                        and fires the completion haptic on mount, which on a
                        button she has not pressed yet would be decoration
                        claiming to be a confirmation. It belongs in the
                        confirmation above, not here. */}
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    {actions.primary.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onHelp}
                  aria-expanded={helpOpen}
                  className="mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#F5F0E4]/30 px-6 py-3 text-sm font-semibold text-[#F5F0E4] transition hover:border-[#F5F0E4]/60"
                >
                  <Lightbulb className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  {actions.helpLabel}
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  className="mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl px-6 py-3 text-sm font-medium text-[#F5F0E4]/70 transition hover:text-[#F5F0E4] disabled:opacity-50"
                >
                  {actions.setAsideLabel}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
