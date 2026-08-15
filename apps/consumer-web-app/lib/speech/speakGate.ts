/**
 * Whether a given request to speak should actually reach the speech
 * engine.
 *
 * ============================================================
 * THE DEADLOCK THIS EXISTS TO PREVENT
 * ============================================================
 * Mobile browsers silently drop `speechSynthesis.speak()` calls that do
 * not come from a user gesture, and a dropped call fires no events at all,
 * so the only way to detect one is a watchdog: ask to speak, and if no
 * "playing" event arrives, conclude the call was blocked. hooks/
 * useGuidedVoice.ts does exactly that, and once blocked it stopped making
 * further automatic attempts, which is right: retrying automatically can
 * never succeed, and the member is shown a "Tap once to enable voice
 * guidance" button instead.
 *
 * The defect was that the skip applied to EVERY call, including the one
 * made from inside that button's own tap handler. So the recovery path was
 * inert: the button appeared, the member tapped it, the call short-
 * circuited before reaching the engine, no audio played, no "playing"
 * event could arrive, and the blocked flag could never clear. Tapping it
 * again did the same thing. Voice guidance, once blocked, could never be
 * turned back on for the rest of the assessment.
 *
 * The same applied to the prep screen's "Enable voice guidance" button and
 * to unmuting, which are also taps whose whole purpose is to make sound
 * happen.
 *
 * A user gesture is precisely the condition under which a blocked engine
 * WILL accept a call. It is therefore the one case that must never be
 * skipped for being blocked. That is the rule this module encodes, kept
 * separate from the hook so it is testable without a browser, a speech
 * engine, or a React renderer.
 */

export type SpeakGateState = {
  /** The member has muted guidance. Silence is intended, so nothing should reach the engine. */
  muted: boolean;
  /** A previous automatic attempt was detected as silently blocked by the browser's autoplay policy. */
  blocked: boolean;
  /** The browser exposes a speech engine at all. */
  supported: boolean;
};

export type SpeakDecision =
  /** Send it to the engine. */
  | 'speak'
  /** Muted: stay silent, but still run the caller's completion callback so pacing keeps working. */
  | 'skip_muted'
  /** No engine here: nothing to do but let the caller carry on. */
  | 'skip_unsupported'
  /** Known blocked and this is not a gesture, so it could only fail again. */
  | 'skip_blocked';

/**
 * `fromUserGesture` must be true only when the call is made synchronously
 * inside a real click or tap handler. That is the one situation in which a
 * blocked engine will accept a call, so it overrides the blocked skip.
 *
 * Muting still wins over a gesture: the member asked for silence, and the
 * unmute control clears `muted` before speaking rather than speaking
 * through it.
 */
export function decideSpeak(state: SpeakGateState, fromUserGesture: boolean): SpeakDecision {
  if (state.muted) return 'skip_muted';
  if (!state.supported) return 'skip_unsupported';
  if (state.blocked && !fromUserGesture) return 'skip_blocked';
  return 'speak';
}

/**
 * Whether this call should also clear the blocked flag before speaking.
 * A gesture gets a genuine fresh attempt: the flag is dropped, the call
 * goes through, and the hook's watchdog re-arms so the outcome is learned
 * honestly rather than assumed. If it fails again, the flag comes straight
 * back and the button reappears.
 */
export function shouldRetryBlocked(state: SpeakGateState, fromUserGesture: boolean): boolean {
  return state.blocked && fromUserGesture && !state.muted && state.supported;
}
