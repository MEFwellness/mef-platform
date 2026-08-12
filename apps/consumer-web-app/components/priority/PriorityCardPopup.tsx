'use client';

/**
 * The Priority Card as the Root pop-up on open.
 *
 * This is a presentation, not a second card. All three buttons run the
 * exact same handlers the inline card runs
 * (components/priority/usePriorityCardActions.ts), writing the same
 * `member_daily_priorities` row through the same server actions, so
 * marking it Done here shows Done on Home and Today with no syncing of any
 * kind. There is no second pop-up system either: this renders inside the
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
 * The ways out are the three buttons plus the explicit close, and all four
 * leave the card available inline afterwards.
 */

import { CheckCircle2, Lightbulb } from 'lucide-react';
import type { PriorityView } from '@/lib/priority/types';
import {
  PRIORITY_BUTTON_LABELS,
  PRIORITY_CARD_LABEL,
  PRIORITY_DONE_TEXT,
  PRIORITY_HELP_HEADING,
  PRIORITY_SAVED_TEXT,
} from '@/lib/priority/copy';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { usePriorityCardActions } from './usePriorityCardActions';

export function PriorityCardPopup({
  view,
  closed,
  onClose,
}: {
  view: PriorityView;
  closed: boolean;
  onClose: () => void;
}) {
  const { status, helpOpen, pending, onDone, onSave, onHelp } = usePriorityCardActions(view);
  const { selected, isReEntry, welcomeLine } = view;

  useBodyScrollLock(!closed);

  if (closed) return null;

  // Once she has acted, the pop-up stops asking and simply confirms. It
  // stays on screen rather than vanishing mid-tap, and the inline card on
  // Home and Today is already showing the same state underneath.
  const acted = status === 'done' || status === 'saved';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-[#0E1F17]/55 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="priority-popup-title"
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/10"
          aria-hidden="true"
        />

        <p
          id="priority-popup-title"
          className="relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]"
        >
          {PRIORITY_CARD_LABEL}
        </p>

        {/* The re-entry welcome. Root Presence's own established sentence,
            never a second welcome authored here, so a returning member
            gets one coherent greeting. */}
        {isReEntry && welcomeLine && (
          <h2 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]">
            {welcomeLine}
          </h2>
        )}

        <p className="relative mt-3 text-[17px] leading-relaxed text-[#F5F0E4]">{selected.title}</p>

        {/* Omitted entirely when no honest, query-backed reason exists. */}
        {selected.reason && (
          <p className="relative mt-3 text-sm leading-relaxed text-[#F5F0E4]/75">{selected.reason}</p>
        )}

        {helpOpen && (
          <div className="relative mt-4 rounded-2xl bg-[#F5F0E4]/10 p-4">
            <div className="flex items-center gap-2 text-[#C4A050]">
              <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-wider">
                {PRIORITY_HELP_HEADING}
              </p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#F5F0E4]/90">{selected.help}</p>
          </div>
        )}

        {acted ? (
          <>
            <p className="relative mt-5 flex items-center gap-2 text-sm font-medium text-[#C4A050]">
              {status === 'done' && (
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              )}
              {status === 'done' ? PRIORITY_DONE_TEXT : PRIORITY_SAVED_TEXT}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mef-focus-ring mef-press relative mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
            >
              Close
            </button>
          </>
        ) : (
          <div className="relative mt-5 space-y-2">
            <button
              type="button"
              disabled={pending}
              onClick={onDone}
              className="mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {PRIORITY_BUTTON_LABELS.done}
            </button>
            <button
              type="button"
              onClick={onHelp}
              aria-expanded={helpOpen}
              className="mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#F5F0E4]/30 px-6 py-3 text-sm font-semibold text-[#F5F0E4] transition hover:border-[#F5F0E4]/60"
            >
              <Lightbulb className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {PRIORITY_BUTTON_LABELS.help}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onSave}
              className="mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl px-6 py-3 text-sm font-medium text-[#F5F0E4]/70 transition hover:text-[#F5F0E4] disabled:opacity-50"
            >
              {PRIORITY_BUTTON_LABELS.save}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
