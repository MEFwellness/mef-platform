'use client';

/**
 * THE ONE FRAME EVERY FULL-SCREEN POP-UP IN THIS APP IS DRAWN IN.
 *
 * =====================================================================
 * THE BUG IT CLOSES (reported from a phone, 2026-09-11)
 * =====================================================================
 *
 * After finishing the Body Systems Survey and heading back to Home, the
 * Weekly Reflection pop-up came up HALF WAY DOWN THE SCREEN, clipped at
 * the bottom, sitting on top of the page rather than over it, with no way
 * to reach its buttons. The app had to be force closed.
 *
 * Two independent causes, and both of them are the same two lines of
 * markup copied into six files:
 *
 *   `fixed inset-0` IS NOT THE VIEWPORT IF AN ANCESTOR IS TRANSFORMED.
 *   A `transform`, a `filter`, a `backdrop-filter`, a `will-change` or a
 *   `contain` on ANY ancestor makes that ancestor the containing block
 *   for every `position: fixed` descendant, and this app is full of all
 *   five: `.mef-animate-in` and `.mef-fade-up` both end on a `transform`
 *   and both use `animation-fill-mode: both`, so the transform is still
 *   applied after the animation has finished, permanently, for as long
 *   as the element is on screen. A pop-up rendered inside one of those is
 *   positioned against that card, not against the phone, which is
 *   precisely "half way down the screen". This is the same class of bug
 *   NoticingSheet.tsx was portalled for; it was fixed there one component
 *   at a time, and the pop-up chain never got the same treatment.
 *
 *   A CARD TALLER THAN THE PHONE HAD NOWHERE TO GO. The old frame was
 *   `flex items-center justify-center` on a fixed, non-scrolling box, so
 *   a tall message (an offer with an eyebrow, a headline, a paragraph, a
 *   primary button and two escapes) centred itself and put its top ABOVE
 *   the top of the screen and its buttons BELOW the bottom, both
 *   unreachable, on exactly the small phones where that matters. That is
 *   the "clipped, had to force close".
 *
 * =====================================================================
 * WHAT THIS DOES INSTEAD
 * =====================================================================
 *
 * PORTALLED TO `document.body`. Nothing in the page tree can be its
 * containing block, whatever a card above it is doing, and whatever any
 * future card does.
 *
 * THE BACKDROP IS ITS OWN FIXED LAYER. It covers the viewport rather than
 * the scrollable frame, so a tall card scrolled half way still has the
 * dimmed page behind it rather than a bright strip.
 *
 * THE FRAME SCROLLS, AND CENTRES ONLY WHEN IT CAN. `overflow-y-auto` with
 * an inner `min-h-full` flex box: a card shorter than the screen is
 * centred exactly as before, and a card taller than the screen starts at
 * the top and scrolls, so every word and every button is reachable.
 * `overscroll-contain` keeps that scroll from chaining to the page under
 * it.
 *
 * AND THE FRAME IS `.mef-modal-viewport`, NOT A BARE `inset-0`. iOS
 * Safari resolves `position: fixed` against the LARGE viewport, the one
 * with the URL bar hidden, so a plain `inset-0` box is TALLER than what
 * she can actually see and a card centred inside it sits partly behind
 * Safari's own bottom bar. That is the third way this same pop-up could
 * end up with its buttons out of reach, and this app already had the fix
 * for it: `.mef-modal-viewport` in app/globals.css is `100dvh` with a
 * `100vh` fallback plus safe-area padding, and it is what the sign-out
 * confirmation, the push permission ask and the Start Over control are
 * already drawn in. One class, five more callers, no sixth idea about
 * what "the viewport" means.
 *
 * NOTHING IS RENDERED BEFORE MOUNT. `createPortal` needs a real document,
 * so this returns null on the server and on the first client tick. Every
 * caller is a modal that appears after a decision has been made, so there
 * is nothing to server render anyway.
 *
 * IT DOES NOT LOCK SCROLL AND DOES NOT CLOSE ITSELF. Those are the
 * caller's decisions and every caller already makes them:
 * `useBodyScrollLock` is held by the component that owns the open state,
 * and the pop-up chain deliberately has no backdrop-click or Escape
 * dismissal at all, because the whole point of those messages is that
 * nobody misses one. This element is the frame, nothing else.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ModalOverlay({
  children,
  zIndexClassName = 'z-[60]',
  backdropClassName = 'bg-[#0E1F17]/55 backdrop-blur-sm',
  testId,
}: {
  children: ReactNode;
  /** The stacking layer. Defaults to the pop-up chain's own z-[60]. */
  zIndexClassName?: string;
  /** The dimmed layer behind the card. */
  backdropClassName?: string;
  testId?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`mef-modal-viewport ${zIndexClassName}`}
      data-testid={testId ?? 'modal-overlay'}
    >
      <div className={`fixed inset-0 ${backdropClassName}`} aria-hidden="true" />
      <div
        className="relative h-full w-full overflow-y-auto overscroll-contain"
        data-testid="modal-overlay-frame"
      >
        <div className="flex min-h-full items-center justify-center px-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
