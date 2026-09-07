'use client';

/**
 * The card waiting in her hand, and the deliberate act of putting it down.
 *
 * SHARED, NOT OWNED BY ONE TEMPLATE. What You Put Down is the first
 * template to use it, and the act it stages is the point of the question it
 * belongs to: shelving her own words, one at a time, IS the moment. A list
 * of checkboxes would have collected the same data and staged nothing.
 *
 * TAPS ALONE ARE ENOUGH, ON EVERY DEVICE. The card is a real button: tap
 * it, or reach it with Tab and press Enter, and it goes on the shelf. The
 * shelf beside it is a button too. Dragging is an ENHANCEMENT layered on
 * top, never a requirement, and nothing in this experience needs a mouse or
 * a steady hand.
 *
 * THE DRAG IS POINTER EVENTS, NOT HTML5 DRAG AND DROP, because HTML5 drag
 * and drop does not exist on a touch screen and this is a phone-first
 * experience. Pointer events are one implementation for a finger, a mouse
 * and a stylus alike.
 *
 * A DRAG IS NOT A TAP, AND THIS ONE CANNOT BE BOTH. A pointer that moved
 * past the threshold sets a flag that swallows the click the browser fires
 * afterwards, so a drag that ends on the shelf places one card rather than
 * two.
 *
 * REDUCED MOTION MEANS TAP TO PLACE AND NOTHING ELSE. No pointer handlers
 * are attached at all, so there is no travel to see and nothing follows her
 * finger. The card simply appears on the shelf with a gentle fade.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { RefObject } from 'react';
import { WordCard, type WordCardTone } from './WordCard';
import { HDD_CARD_SETTLE_MS, HDD_DRAG_THRESHOLD_PX } from '@/lib/happiness-deep-dive/interactive';

export function PlacingDeck({
  text,
  placeLabel,
  counter,
  onPlace,
  boardRef,
  onOverBoardChange,
  still = false,
  tone = 'waiting',
}: {
  /** Her own line, on the card. Never edited, never shortened. */
  text: string;
  /** The verb, on the card's own accessible name and under it. */
  placeLabel: string;
  /** Where she is in the pile, e.g. "3 of 7". Said out loud rather than implied by a stack. */
  counter: string;
  onPlace: () => void;
  /** The shelf, so a released drag can be tested against it. */
  boardRef: RefObject<HTMLDivElement | null>;
  /** Fires as a drag crosses onto or off the shelf, so the shelf can say it is armed. */
  onOverBoardChange: (over: boolean) => void;
  /** Reduced motion: no drag at all, and no travel. */
  still?: boolean;
  tone?: WordCardTone;
}) {
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  // Set the moment a drag ends, and cleared by the click the browser fires
  // straight after it. Without this, one drag onto the shelf would place
  // one card by the drop and a second by the click.
  const swallowClick = useRef(false);

  function overBoard(x: number, y: number): boolean {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function reset() {
    origin.current = null;
    dragging.current = false;
    setOffset(null);
    onOverBoardChange(false);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (still) return;
    // Primary pointer only. A right click or a second finger is not a drag.
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    origin.current = { x: event.clientX, y: event.clientY };
    dragging.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = origin.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!dragging.current && Math.hypot(dx, dy) < HDD_DRAG_THRESHOLD_PX) return;
    dragging.current = true;
    setOffset({ x: dx, y: dy });
    onOverBoardChange(overBoard(event.clientX, event.clientY));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const wasDragging = dragging.current;
    const landed = wasDragging && overBoard(event.clientX, event.clientY);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    reset();
    if (!wasDragging) return;
    swallowClick.current = true;
    // A drag released anywhere but the shelf simply returns the card to her
    // hand. Nothing is placed and nothing is lost.
    if (landed) onPlace();
  }

  function handleClick() {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    onPlace();
  }

  const isDragging = offset !== null;

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#F5F0E4]/45">
        {counter}
      </p>
      <div
        className="mt-2"
        // touch-action is none only while a drag can actually start, so the
        // card does not fight the page's own scrolling under reduced motion
        // or on a shelf with nothing left to place.
        style={
          still
            ? undefined
            : {
                touchAction: 'none',
                transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
                transition: isDragging ? 'none' : `transform ${HDD_CARD_SETTLE_MS}ms ease-out`,
                zIndex: isDragging ? 30 : undefined,
                position: 'relative',
              }
        }
        onPointerDown={still ? undefined : handlePointerDown}
        onPointerMove={still ? undefined : handlePointerMove}
        onPointerUp={still ? undefined : handlePointerUp}
        onPointerCancel={still ? undefined : reset}
      >
        <WordCard
          text={text}
          tone={tone}
          onSelect={handleClick}
          actionLabel={placeLabel}
          still={still}
          className={isDragging ? 'shadow-[0_20px_40px_-12px_rgba(14,31,23,0.6)]' : undefined}
        />
      </div>
      <p className="mt-2 text-center text-[13px] text-[#F5F0E4]/55">{placeLabel}</p>
    </div>
  );
}
