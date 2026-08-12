'use client';

/**
 * The Priority Card's motion, in one place, shared by both of its
 * presentations — exactly the same reason
 * ./usePriorityCardActions.ts owns the behavior.
 *
 * The card has three surfaces (the Root pop-up on open, Home inline,
 * Today inline) and the brief requires identical motion in all three.
 * Two copies of a staged reveal and a two-beat bridge sequence is how
 * those three surfaces start moving differently from each other, so
 * neither component owns any of this: they own only their own palette
 * and layout.
 *
 * This hook holds NO behavior. It never calls a server action, never
 * touches `member_daily_priorities`, and cannot change what the buttons
 * do — it reads the status the actions hook already decided and answers
 * one question: what should be on screen right now.
 *
 * REDUCED MOTION. Every timed sequence below is skipped outright, not
 * shortened: the bridge renders its three parts at once as plain text
 * and the resolved states appear the instant she taps, with no
 * intermediate phase to sit through. The CSS classes carry their own
 * `@media (prefers-reduced-motion: reduce)` overrides on top of this, so
 * a class that did slip through would still animate nothing.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion, prefersReducedMotionNow } from '@/lib/motion/useReducedMotion';
import { PRIORITY_BRIDGE_AT_MS, PRIORITY_RECEDE_MS, priorityBridgeSeenKey } from '@/lib/priority/motion';
import type { PriorityStatus, PriorityView } from '@/lib/priority/types';

/**
 * Where the adaptation sequence is.
 *
 *   yesterday  yesterday's completed priority, alone, in its resolved state
 *   line       ...plus the bridge line
 *   handover   ...stepping back, so the sequence ends by putting
 *              something away rather than by something vanishing
 *   all        all three at once, no motion — the reduced-motion rendering
 *   card       no bridge (or it is over): today's priority owns the card
 */
export type PriorityBridgePhase = 'yesterday' | 'line' | 'handover' | 'all' | 'card';

/**
 * Where a state change is.
 *
 *   active    she has not acted
 *   receding  the active content is stepping back, its resolved form next
 *   resolved  the accomplished or collapsed state
 */
export type PriorityResolvePhase = 'active' | 'receding' | 'resolved';

export type PriorityCardMotion = {
  reduced: boolean;
  bridgePhase: PriorityBridgePhase;
  /** Yesterday's completed priority is on screen. */
  showsYesterday: boolean;
  /** The bridge line is on screen. */
  showsBridgeLine: boolean;
  /** Today's priority may render. False only while the bridge is still handing over. */
  showsToday: boolean;
  /** Yesterday's block is stepping back, on its way out. */
  bridgeReceding: boolean;
  resolvePhase: PriorityResolvePhase;
  /**
   * She completed or saved it just now, in front of her, rather than
   * arriving at a card that was already resolved.
   *
   * This is what gates the completion haptic. Found live: the accomplished
   * state also mounts on an ordinary page load (a reload of Today, a
   * navigation back to Home after finishing earlier), and a haptic there
   * buzzes for something she did hours ago. Chrome says so out loud —
   * `navigator.vibrate` with no user gesture behind it logs a console
   * error — but the real problem is the meaning, not the warning. Bible §9
   * gives haptics to a completed action, never to rendering a past one.
   */
  justResolved: boolean;
};

/**
 * "On today's first reveal", made literally true.
 *
 * Home and Today both render this card, and the pop-up renders it in the
 * same paint as Home's inline copy, so without a guard the sequence would
 * replay on every navigation between them. A moment that happens
 * constantly is not a moment. sessionStorage rather than a column: it is
 * a fact about this visit, it costs no schema, and the key carries her
 * own local date so tomorrow's adaptation is genuinely a new one.
 *
 * Private-mode and disabled-storage browsers throw on access. There the
 * sequence simply plays again, which is the right way to fail: a member
 * seeing the animation twice is a much smaller harm than her never
 * seeing it.
 */
function readBridgeSeen(localDate: string): boolean {
  try {
    return window.sessionStorage.getItem(priorityBridgeSeenKey(localDate)) !== null;
  } catch {
    return false;
  }
}

function markBridgeSeen(localDate: string): void {
  try {
    window.sessionStorage.setItem(priorityBridgeSeenKey(localDate), '1');
  } catch {
    // See above: an unwritable store means it may replay, never that it breaks.
  }
}

export function usePriorityCardMotion(
  view: PriorityView,
  status: PriorityStatus,
  /**
   * Which presentation is asking. Only the bridge's once-per-day guard
   * cares, and only because of a real race: on Home the pop-up and the
   * inline card mount in the SAME paint, so whichever effect happened to
   * run first would claim the day's sequence and the other would skip
   * it. React gives no order guarantee there, and the wrong winner means
   * the member watches nothing while the card hidden behind the backdrop
   * plays the animation.
   *
   * The pop-up is by definition the day's first reveal — the chain's own
   * date-scoped message key already guarantees it shows at most once per
   * calendar day — so it plays unconditionally and only ever writes the
   * guard. Everything else reads it. That makes the outcome the same
   * whichever effect wins.
   */
  surface: 'popup' | 'inline'
): PriorityCardMotion {
  const reduced = useReducedMotion();
  const hasBridge = view.bridge !== null;

  // ---- The adaptation sequence -------------------------------------
  // Starts at 'yesterday' whenever there is a bridge, so the server's
  // HTML and the client's first render agree. The layout effect below
  // then corrects it to 'all' or 'card' BEFORE the first paint where
  // that correction is needed, so neither a reduced-motion member nor a
  // member who has already seen today's sequence ever gets a frame of it.
  const [bridgePhase, setBridgePhase] = useState<PriorityBridgePhase>(
    hasBridge ? 'yesterday' : 'card'
  );

  useLayoutEffect(() => {
    if (!hasBridge) return;

    // Once per day. See `surface` above for why the pop-up writes this
    // guard without reading it.
    if (surface !== 'popup' && readBridgeSeen(view.localDate)) {
      setBridgePhase('card');
      return;
    }

    // Reduced motion: the same three parts, all at once, as plain
    // sequential text, and they simply stay. Not a shortened animation,
    // and not a skipped message either — she is told what Root adapted
    // from, just without being made to watch it happen.
    const reduced = prefersReducedMotionNow();
    if (reduced) setBridgePhase('all');

    const timers = reduced
      ? []
      : [
          setTimeout(() => setBridgePhase('line'), PRIORITY_BRIDGE_AT_MS.line),
          setTimeout(() => setBridgePhase('handover'), PRIORITY_BRIDGE_AT_MS.handover),
          setTimeout(() => setBridgePhase('card'), PRIORITY_BRIDGE_AT_MS.today),
        ];

    // The day is claimed when the sequence has finished, NEVER in the same
    // tick it was read.
    //
    // Found while driving this in a real browser: claiming on mount means
    // any remount of the card before it has played swallows the day's
    // sequence permanently, because the remount reads the guard its own
    // previous mount just wrote. React's StrictMode makes that reproduce
    // on every development mount, and the same hole is open in production
    // to a Suspense retry or any other remount. The failure is silent — a
    // bridge that never appears looks exactly like a day Root did not
    // adapt.
    //
    // Deferring the claim also gives the right answer when she navigates
    // away mid-sequence: she did not see it, so the next surface still
    // shows it. The reduced-motion path uses the same delay for the same
    // reason, even though it has nothing to wait through: the parts it
    // renders are static, so re-rendering them on a remount costs nothing
    // and losing them costs her the message.
    const claim = setTimeout(
      () => markBridgeSeen(view.localDate),
      PRIORITY_BRIDGE_AT_MS.today
    );

    return () => {
      for (const timer of timers) clearTimeout(timer);
      clearTimeout(claim);
    };
    // Runs once per mount: a bridge is a property of the day, not of a
    // re-render, and re-running it would be the replay this guards against.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Done / Save for later ---------------------------------------
  // A card that arrives already done or already saved (a reload, or the
  // other surface having acted) has no state change to express, so it is
  // simply resolved. Only a change that happens in front of her animates.
  const [resolvePhase, setResolvePhase] = useState<PriorityResolvePhase>(
    status === 'active' ? 'active' : 'resolved'
  );
  const previousStatus = useRef<PriorityStatus>(status);
  const [justResolved, setJustResolved] = useState(false);

  useEffect(() => {
    const from = previousStatus.current;
    if (from === status) return;
    previousStatus.current = status;

    if (status === 'active') {
      setResolvePhase('active');
      return;
    }

    // She acted just now, whether or not the motion runs, and whichever
    // state she acted from. The collapsed saved card carries its own Done
    // button, so `saved -> done` is a real completion too and has to earn
    // the same drawn checkmark and the same single haptic.
    setJustResolved(true);

    // No recede from the collapsed card: it is already small and
    // recessive, and the two inline surfaces render it in a slot the
    // accomplished state does not occupy, so animating it out would show
    // her an empty gap rather than a transition.
    if (reduced || from !== 'active') {
      setResolvePhase('resolved');
      return;
    }

    setResolvePhase('receding');
    const toResolved = setTimeout(() => setResolvePhase('resolved'), PRIORITY_RECEDE_MS);
    return () => clearTimeout(toResolved);
  }, [status, reduced]);

  return {
    reduced,
    bridgePhase,
    showsYesterday: bridgePhase !== 'card',
    showsBridgeLine:
      bridgePhase === 'line' || bridgePhase === 'handover' || bridgePhase === 'all',
    showsToday: bridgePhase === 'card' || bridgePhase === 'all',
    bridgeReceding: bridgePhase === 'handover',
    resolvePhase,
    justResolved,
  };
}
