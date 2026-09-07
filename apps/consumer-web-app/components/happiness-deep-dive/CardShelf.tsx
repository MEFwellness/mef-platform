'use client';

/**
 * The shelf: a warm, editorial place to set her own words down.
 *
 * SHARED, NOT OWNED BY ONE TEMPLATE. What You Put Down is the first
 * template to use it. It is a plain visual with three optional jobs, so a
 * later template can use any one of them without inheriting the other two.
 *
 * NOT A BOOKCASE. One plank per card, stacked, each card lying flat on a
 * thin gold rule with a soft shadow under it. That shape is the reason it
 * works on a 320 pixel phone with a card carrying a whole sentence on it: a
 * grid of tiles would have to shorten her words to fit, and shortening her
 * words is the one thing this screen may never do.
 *
 * THREE JOBS, AND A SHELF NEVER DOES TWO AT ONCE:
 *
 *   display    it just stands there. The closing screen, and the coach's
 *              card.
 *   drop       something is waiting to be placed, and the whole shelf is
 *              the target. It becomes ONE button, so a tap anywhere on it
 *              places the waiting card and a keyboard reaches it with Tab.
 *   choose     every card on it is a button, and she picks one.
 *
 * They are mutually exclusive on purpose: a shelf that was itself a button
 * AND full of buttons is a nested control, which is invalid HTML and
 * unusable with a screen reader. `onDrop` and `onChoose` are never both
 * given, and the templates using it never need both at once.
 *
 * EVERYTHING WORKS WITH TAPS ALONE. Nothing here requires a drag on any
 * device. Dragging is the PlacingDeck's optional enhancement beside it, and
 * this component only ever hears about it through `armed`.
 *
 * REDUCED MOTION. Cards appear placed with a gentle fade rather than
 * settling in from above, which is what `still` carries down to each card
 * and what the caller passes when the device has asked for it.
 */

import type React from 'react';
import { WordCard } from './WordCard';
import { hddShelfCardDelayMs } from '@/lib/happiness-deep-dive/interactive';

export type ShelfCard = { id: string; text: string };

export function CardShelf({
  cards,
  markedId = null,
  liftedId = null,
  markedNote,
  liftedNote,
  onDrop,
  dropLabel,
  onChoose,
  chooseLabel,
  armed = false,
  emptyLabel,
  still = false,
  staggered = false,
  boardRef,
  ariaLabel,
}: {
  /** The cards resting on the shelf, in the order she placed them. */
  cards: ShelfCard[];
  /** The card she named. Drawn with a gold outline. */
  markedId?: string | null;
  /** The card she took back off. Drawn warm gold and raised. */
  liftedId?: string | null;
  markedNote?: string | undefined;
  liftedNote?: string | undefined;
  /** Makes the whole shelf one button. Never given together with onChoose. */
  onDrop?: (() => void) | undefined;
  /** What that button says, and what a screen reader hears. */
  dropLabel?: string | undefined;
  /** Makes every card on the shelf a button. Never given together with onDrop. */
  onChoose?: ((id: string) => void) | undefined;
  /** The verb a screen reader hears before her words on each card. */
  chooseLabel?: string | undefined;
  /** True while a card is being dragged over the shelf, so the target says so. */
  armed?: boolean;
  /** What the shelf says when nothing is on it yet. */
  emptyLabel?: string | undefined;
  /** Reduced motion, and every later viewing: placed, not arriving. */
  still?: boolean;
  /** Let the cards arrive one after another. The closing screen only. */
  staggered?: boolean;
  /** So a PlacingDeck beside it can tell whether a drop landed here. */
  boardRef?: React.Ref<HTMLDivElement> | undefined;
  ariaLabel: string;
}) {
  const isDropTarget = Boolean(onDrop);

  const planks = (
    <ul className="space-y-4" aria-label={ariaLabel}>
      {cards.map((card, index) => {
        const tone =
          card.id === liftedId ? 'lifted' : card.id === markedId ? 'marked' : 'resting';
        const note =
          card.id === liftedId ? liftedNote : card.id === markedId ? markedNote : undefined;
        return (
          <li
            key={card.id}
            className={still || !staggered ? undefined : 'mef-settle-down'}
            style={
              still || !staggered
                ? undefined
                : { animationDelay: `${hddShelfCardDelayMs(index, cards.length)}ms` }
            }
          >
            <WordCard
              text={card.text}
              tone={tone}
              note={note}
              still={still}
              onSelect={onChoose ? () => onChoose(card.id) : undefined}
              actionLabel={onChoose ? chooseLabel : undefined}
              pressed={
                onChoose ? card.id === (liftedId ?? markedId) : undefined
              }
            />
            <Plank />
          </li>
        );
      })}

      {cards.length === 0 && (
        <li>
          <div className="rounded-2xl border border-dashed border-[#F5F0E4]/20 px-4 py-6 text-center text-[14px] leading-relaxed text-[#F5F0E4]/50">
            {emptyLabel}
          </div>
          <Plank />
        </li>
      )}
    </ul>
  );

  // THE DROP TARGET IS THE WHOLE SHELF, and it is a real button rather than
  // a div with a click handler, so Tab reaches it and Enter works. The
  // planks inside it carry no controls of their own in this mode, which is
  // what keeps it a single, legal control.
  if (isDropTarget) {
    return (
      <div ref={boardRef}>
        <button
          type="button"
          onClick={onDrop}
          aria-label={dropLabel}
          className={`mef-focus-ring mef-press w-full rounded-[22px] border p-4 text-left transition-colors ${
            armed
              ? 'border-[#C4A050]/70 bg-[#C4A050]/[0.10]'
              : 'border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.03] hover:border-[#C4A050]/45'
          }`}
        >
          {planks}
          <span className="mt-4 block text-center text-[13px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {dropLabel}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={boardRef}
      className="rounded-[22px] border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.03] p-4"
    >
      {planks}
    </div>
  );
}

/**
 * The plank a card is lying on: one thin gold rule and the soft shadow it
 * casts. Decorative, so it is hidden from assistive technology entirely.
 */
function Plank() {
  return (
    <span aria-hidden="true" className="mt-1.5 block">
      <span className="block h-px w-full rounded-full bg-[#C4A050]/40" />
      <span className="block h-2 w-full rounded-b-full bg-gradient-to-b from-[#0E1F17]/30 to-transparent" />
    </span>
  );
}
