/**
 * The steady-hold and countdown that fire the shutter, as a pure state
 * machine.
 *
 * ============================================================
 * WHY IT WORKS THE WAY IT DOES
 * ============================================================
 * There is no tap to capture, on purpose: tapping the phone moves it, and
 * moving it destroys the propped setup the whole reproducibility gate
 * exists to establish. So every check passing has to be enough on its own.
 * Once they all pass the member holds briefly, sees a short countdown, and
 * the photo is taken.
 *
 * The important detail is how an interruption is handled. Both timers here
 * are TOTALS added to frame by frame, not "now minus a start timestamp".
 * A start timestamp can only be kept or thrown away; a total can be
 * paused. That difference is the whole point:
 *
 *   - A momentary blip, shorter than STABILITY_GRACE_MS, is absorbed
 *     entirely. Nothing advances and nothing resets. MediaPipe drops a
 *     frame now and then even for a member standing perfectly still, and
 *     that must not be visible.
 *   - A real interruption resets the HOLD, because a hold that is not
 *     continuous is not a hold.
 *   - A real interruption does NOT reset the COUNTDOWN once it has begun.
 *     It pauses. A member who wobbles at "2" comes back to "2", not to
 *     "3". Starting over from the beginning every time is what makes a
 *     gate feel unpassable even when each individual check is achievable.
 *
 * Every timestamp is a parameter, never read from the environment, so the
 * whole machine is testable without a camera, a phone, or a clock.
 */

/** How long every check must keep passing before the visible countdown begins. */
export const REQUIRED_STABLE_MS = 1500;
/** The calm 3-2-1 that follows, real elapsed time rather than a delay layered on top of already-real stability. */
export const COUNTDOWN_MS = 3000;
/** A failing streak shorter than this is absorbed as a blip: it neither advances nor resets anything. */
export const STABILITY_GRACE_MS = 400;
/** No single frame may contribute more than this, so a backgrounded tab or a long stall cannot jump either timer forward. */
export const MAX_FRAME_STEP_MS = 250;

export type SteadyHoldPhase =
  /** Checks are failing (past the blip window): the member is being guided. */
  | 'guiding'
  /** Everything passes, building toward REQUIRED_STABLE_MS. */
  | 'holding'
  /** The hold is satisfied and the visible countdown is running. */
  | 'counting_down'
  /** The countdown has completed: take the photo. */
  | 'capture';

export type SteadyHoldState = {
  /** Accumulated continuous passing time toward REQUIRED_STABLE_MS. */
  heldMs: number;
  /** Accumulated countdown time toward COUNTDOWN_MS. Paused, never reset, once started. */
  countdownMs: number;
  /** True once the countdown has begun, so a later interruption pauses rather than cancels it. */
  countdownStarted: boolean;
  /** Previous processed frame's timestamp, so each frame contributes its own real elapsed time. */
  lastFrameAtMs: number | null;
  /** When the current failing streak began, for the blip grace window. Null while passing. */
  failingSinceMs: number | null;
};

export const INITIAL_STEADY_HOLD_STATE: SteadyHoldState = {
  heldMs: 0,
  countdownMs: 0,
  countdownStarted: false,
  lastFrameAtMs: null,
  failingSinceMs: null,
};

export type SteadyHoldResult = {
  state: SteadyHoldState;
  phase: SteadyHoldPhase;
  /** Progress toward the hold, 0 to REQUIRED_STABLE_MS, for the progress ring. */
  heldMs: number;
  /** Milliseconds left on the countdown, or null when it is not running. */
  countdownRemainingMs: number | null;
};

export type SteadyHoldInput = {
  /** Whether every capture check passes on this frame. */
  passing: boolean;
  nowMs: number;
  /**
   * Whether the countdown is allowed to advance right now. The caller
   * withholds this while voice guidance is mid-sentence, so the shutter
   * never fires over the top of an instruction the member is still
   * hearing. Withholding it pauses the countdown, it does not reset it.
   */
  countdownAllowed?: boolean;
};

export function stepSteadyHold(
  state: SteadyHoldState,
  input: SteadyHoldInput
): SteadyHoldResult {
  const { passing, nowMs, countdownAllowed = true } = input;

  const frameStepMs =
    state.lastFrameAtMs === null
      ? 0
      : Math.max(0, Math.min(nowMs - state.lastFrameAtMs, MAX_FRAME_STEP_MS));

  const remainingOf = (countdownMs: number, started: boolean): number | null =>
    started ? Math.max(0, COUNTDOWN_MS - countdownMs) : null;

  if (!passing) {
    const failingSinceMs = state.failingSinceMs ?? nowMs;
    const withinGrace = nowMs - failingSinceMs < STABILITY_GRACE_MS;

    if (withinGrace) {
      // A blip. Freeze everything exactly where it is: no advance, no
      // reset, and deliberately no guidance, so the member never sees a
      // correction for something that was gone before they could read it.
      return {
        state: { ...state, lastFrameAtMs: nowMs, failingSinceMs },
        phase: state.countdownStarted ? 'counting_down' : 'holding',
        heldMs: state.heldMs,
        countdownRemainingMs: remainingOf(state.countdownMs, state.countdownStarted),
      };
    }

    // A genuine interruption: the hold restarts, the countdown only pauses.
    return {
      state: {
        ...state,
        heldMs: 0,
        lastFrameAtMs: nowMs,
        failingSinceMs,
      },
      phase: 'guiding',
      heldMs: 0,
      countdownRemainingMs: null,
    };
  }

  const heldMs = Math.min(state.heldMs + frameStepMs, REQUIRED_STABLE_MS);

  if (heldMs < REQUIRED_STABLE_MS) {
    return {
      state: { ...state, heldMs, lastFrameAtMs: nowMs, failingSinceMs: null },
      phase: 'holding',
      heldMs,
      countdownRemainingMs: null,
    };
  }

  if (!countdownAllowed) {
    return {
      state: { ...state, heldMs, lastFrameAtMs: nowMs, failingSinceMs: null },
      phase: state.countdownStarted ? 'counting_down' : 'holding',
      heldMs,
      countdownRemainingMs: remainingOf(state.countdownMs, state.countdownStarted),
    };
  }

  const countdownMs = Math.min(state.countdownMs + frameStepMs, COUNTDOWN_MS);
  const next: SteadyHoldState = {
    heldMs,
    countdownMs,
    countdownStarted: true,
    lastFrameAtMs: nowMs,
    failingSinceMs: null,
  };

  if (countdownMs >= COUNTDOWN_MS) {
    return { state: next, phase: 'capture', heldMs, countdownRemainingMs: 0 };
  }

  return {
    state: next,
    phase: 'counting_down',
    heldMs,
    countdownRemainingMs: COUNTDOWN_MS - countdownMs,
  };
}
