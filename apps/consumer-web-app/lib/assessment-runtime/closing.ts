/**
 * THE CLOSING BELONGS TO THE SITTING SHE IS IN (2026-09-05).
 *
 * One rule, one file, for every experience whose taker ends on a premium
 * closing beat rather than on its results screen.
 *
 * What was racing what. Finishing one of these experiences calls a Server
 * Action from the client taker, and an App Router Server Action's response
 * carries a re-render of the route the member is standing on. The take
 * route's own read (lib/assessment-runtime/entry.ts) sent a FINISHED
 * session to the results screen, so the re-render navigated her off her own
 * closing. Three different actions could fire that re-render inside the
 * same few seconds: the last answer's save, the completion itself, and the
 * closing's own reads (the experiment status, the narrative items). Which
 * one landed first decided whether she saw the closing at all, which is
 * why the bug looked intermittent: twice out of three live walks she went
 * straight to results, and the third time the closing drew and was replaced
 * seconds later.
 *
 * The fix is not to stop the re-render. It is to make the re-render land
 * where she already is. A session she finished WITHIN THIS SITTING still
 * renders the taker, in its closing phase, so every re-render reconciles
 * the same client component instead of redirecting away from it, and her
 * beat, her scoring and her reveal survive untouched. A session she
 * finished before this sitting still goes to the results screen, which is
 * what a member returning to a finished experience should get.
 *
 * The window is what separates those two. It is deliberately generous:
 * long enough that a member can sit with the closing, put the phone down
 * and come back to it, and short enough that opening the take URL the next
 * day is a return and not a replay.
 *
 * NOTHING HERE DECIDES A CALENDAR DAY. This is elapsed time between two
 * instants, never "today", so it needs no timezone and must not grow one.
 */

/**
 * Which half of the take route she is standing in. Declared here, beside
 * the rule that decides it, so a client component can name it without
 * importing the server-only entry module.
 */
export type RuntimePhase = 'taking' | 'closing';

/** The post-completion beats. In order, and the only values the URL marker may carry. */
export const CLOSING_BEATS = ['learned', 'experiment', 'resource', 'close'] as const;

export type ClosingBeat = (typeof CLOSING_BEATS)[number];

/** The take URL's marker for "she is inside the closing, at this beat". */
export const CLOSING_PARAM = 'closing';

/** Where the closing sequence starts when the URL does not say otherwise. */
export const FIRST_CLOSING_BEAT: ClosingBeat = 'learned';

/**
 * How long a finished session still counts as the sitting she is in.
 * Twelve hours: a member who finishes at night and comes back the next
 * morning is returning to a finished experience, and gets her results.
 */
export const CLOSING_WINDOW_MINUTES = 12 * 60;

/** The beat the URL is asking for, or null if it is asking for nothing valid. */
export function parseClosingBeat(raw: string | string[] | undefined | null): ClosingBeat | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return (CLOSING_BEATS as readonly string[]).includes(value) ? (value as ClosingBeat) : null;
}

/**
 * Is this completion still part of the sitting she is in? A session with
 * no completion instant is not, because there is nothing to measure from.
 */
export function isWithinClosingWindow(completedAt: string | null | undefined, nowMs: number): boolean {
  if (!completedAt) return false;
  const finishedMs = new Date(completedAt).getTime();
  if (Number.isNaN(finishedMs)) return false;
  const elapsed = nowMs - finishedMs;
  if (elapsed < 0) return true; // clock skew: a completion "in the future" is this second's.
  return elapsed <= CLOSING_WINDOW_MINUTES * 60_000;
}

/**
 * Writes the beat into the take URL without navigating, so a reload lands
 * back on the beat she was reading rather than at the top of the closing.
 * A no-op on the server and a no-op if the URL already says this.
 *
 * `history.replaceState` and not `router.replace`: a router navigation
 * would be a second system moving the member through the closing, and this
 * screen has exactly one, her own tap.
 */
export function markClosingBeat(beat: ClosingBeat): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(CLOSING_PARAM) === beat) return;
    url.searchParams.set(CLOSING_PARAM, beat);
    window.history.replaceState(window.history.state, '', url);
  } catch {
    // A URL the browser will not let us rewrite is not a reason to break
    // the closing she is reading.
  }
}

/**
 * THE ONE RULE, IN ONE PLACE. What a take route does with a session this
 * member has already finished.
 *
 *   'closing'   Render the taker's closing beats. She is still in the
 *               sitting she finished in, so every re-render lands where
 *               she already is instead of navigating out from under her.
 *   'results'   Her results screen. She is coming back to something
 *               finished, which is exactly what that screen is for.
 *
 * `hasInFlowClosing` is false for an experience that ends ON its results
 * screen rather than inside its taker: nothing changes for those, they
 * redirect the way they always did.
 */
export function decideFinishedSessionDestination(args: {
  hasInFlowClosing: boolean;
  completedAt: string | null | undefined;
  nowMs: number;
}): 'closing' | 'results' {
  if (!args.hasInFlowClosing) return 'results';
  return isWithinClosingWindow(args.completedAt, args.nowMs) ? 'closing' : 'results';
}
