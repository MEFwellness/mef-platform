/**
 * Priority Card — its motion timing, in one place.
 *
 * Every number here is DERIVED from the Root Motion System's own tokens
 * (lib/motion/tokens.ts, mirroring app/globals.css's `--mef-duration-*`)
 * or from lib/introRevealTiming.ts's already-standardized reveal pause.
 * Nothing in this file is an invented duration, and no component in
 * components/priority/ contains a bare millisecond value — that is the
 * whole reason this module exists.
 *
 * Plain (no 'use client') on purpose, the same rule
 * lib/introRevealTiming.ts's own header documents: a Server Component
 * that ever needs to stage priority markup must be able to import these
 * numbers without Next.js turning them into client references.
 */

import { MOTION_DURATION_MS, MOTION_STAGGER_STEP_TIGHT_MS } from '../motion/tokens';
import { revealStepTotalMs } from '../motion/revealStep';
import { INTRO_REVEAL_TYPEWRITER_SETTLE_MS } from '../introRevealTiming';

/**
 * The order the card assembles itself in, as reveal-step indexes. This is
 * the brief's sequence: the small label first, the priority itself a
 * fraction later, the reason after that, the buttons last.
 *
 * The re-entry welcome line shares the label's index deliberately — it is
 * part of the same opening beat, not a fifth thing to wait through.
 */
export const PRIORITY_REVEAL_INDEX = {
  label: 0,
  welcome: 0,
  priority: 1,
  reason: 2,
  buttons: 3,
} as const;

/** How many distinct beats the entrance has. */
export const PRIORITY_REVEAL_STEP_COUNT = 4;

/**
 * The whole entrance, start to last element settled: 3 x 60ms of stagger
 * plus one Standard-tier (320ms) fade-up = 500ms. Inside the brief's
 * "300 to 500ms total", and exactly the Deliberate tier's ceiling.
 */
export const PRIORITY_ENTRANCE_TOTAL_MS = revealStepTotalMs(
  PRIORITY_REVEAL_STEP_COUNT,
  MOTION_STAGGER_STEP_TIGHT_MS,
  MOTION_DURATION_MS.standard
);

/**
 * How long the outgoing active content takes to step back before its
 * resolved form (Done's accomplished state, Save's collapsed state)
 * arrives. Quick tier — `.mef-recede`'s own duration, so the class and
 * the timer that unmounts behind it can never drift apart.
 */
export const PRIORITY_RECEDE_MS = MOTION_DURATION_MS.quick;

/**
 * "Building on yesterday..." — the adaptation sequence's three beats, as
 * the millisecond each one begins.
 *
 * One beat is a Deliberate-tier reveal (500ms) plus the app's own
 * standardized moment of stillness after a reveal
 * (INTRO_REVEAL_TYPEWRITER_SETTLE_MS, 300ms — Bible §5 step 3 says to use
 * that value verbatim rather than inventing a pause length per screen).
 * So: yesterday's completed priority lands and is allowed to be read,
 * then the bridge line lands and is allowed to be read, then today's
 * priority begins its ordinary entrance.
 */
export const PRIORITY_BRIDGE_BEAT_MS =
  MOTION_DURATION_MS.deliberate + INTRO_REVEAL_TYPEWRITER_SETTLE_MS;

export const PRIORITY_BRIDGE_AT_MS = {
  /** Yesterday's completed priority, in its resolved state. */
  yesterday: 0,
  /** The bridge line. */
  line: PRIORITY_BRIDGE_BEAT_MS,
  /**
   * The handover: yesterday's block steps back. Deliberately its own
   * beat rather than cutting straight to today, so the sequence ends by
   * putting something away instead of by something vanishing.
   */
  handover: PRIORITY_BRIDGE_BEAT_MS * 2,
  /** Today's priority takes over and the ordinary staged entrance plays. */
  today: PRIORITY_BRIDGE_BEAT_MS * 2 + MOTION_DURATION_MS.quick,
} as const;

/**
 * The sessionStorage key that makes "on today's first reveal" literally
 * true. Without it the sequence would replay every time she moved between
 * Home and Today, which would turn the one moment Root adapts in front of
 * her into a thing that happens constantly and therefore means nothing.
 *
 * Scoped to her own local date, so tomorrow's sequence is a genuinely new
 * one. Session-scoped rather than stored, because it is about this visit,
 * costs no schema, and a member who genuinely reopens the app tomorrow
 * gets tomorrow's key anyway.
 */
export function priorityBridgeSeenKey(localDate: string): string {
  return `mef:priority-bridge:${localDate}`;
}
