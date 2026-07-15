/**
 * Generic timestamp-driven "confirm after persistence, release after
 * grace" state machine — the shared primitive behind both multi-person
 * detection hysteresis and brief-tracking-loss tolerance
 * (CameraCapture.tsx). A raw per-frame boolean signal is inherently noisy
 * (model instability, momentary occlusion, a single duplicate/ghost pose
 * candidate, a landmark jump during quick movement); treating any single
 * frame as proof of anything is what caused the false "another person
 * detected" warnings this module replaces the ad hoc logic behind. This
 * turns a raw per-frame signal into a stable tri-state — inactive /
 * pending (persisting, not yet confirmed) / confirmed — that only flips
 * to confirmed once the signal has genuinely persisted for
 * `confirmAfterMs`, and only releases back to inactive once its absence
 * has ALSO persisted for `releaseAfterMs` (hysteresis, so a single good
 * frame in the middle of an otherwise-real event doesn't immediately
 * clear it and then re-trigger a frame later).
 *
 * Pure and timestamp-based (not frame-count-based) so behavior doesn't
 * depend on device frame rate — same discipline as
 * voiceGuidanceMachine.ts's stepGuidance.
 */

export type TemporalSignalState = {
  /** True once the signal has persisted unbroken for at least confirmAfterMs. */
  confirmed: boolean;
  /** Timestamp the current unbroken "active" streak started, or null if not currently active. */
  activeSince: number | null;
  /** Timestamp the current unbroken "inactive" streak started while still confirmed (release grace window), or null. */
  inactiveSince: number | null;
};

export const INITIAL_TEMPORAL_SIGNAL_STATE: TemporalSignalState = {
  confirmed: false,
  activeSince: null,
  inactiveSince: null,
};

/** Derived helper — true while the signal is actively persisting but hasn't reached confirmAfterMs yet. Distinct from `confirmed`: this is the "uncertain, still gathering evidence" window callers should treat as neutral, not as proof of anything. */
export function isTemporalSignalPending(state: TemporalSignalState): boolean {
  return !state.confirmed && state.activeSince !== null;
}

export function stepTemporalSignal(
  state: TemporalSignalState,
  active: boolean,
  now: number,
  confirmAfterMs: number,
  releaseAfterMs: number
): TemporalSignalState {
  if (active) {
    const activeSince = state.activeSince ?? now;
    const confirmed = state.confirmed || now - activeSince >= confirmAfterMs;
    return { confirmed, activeSince, inactiveSince: null };
  }

  if (state.confirmed) {
    const inactiveSince = state.inactiveSince ?? now;
    if (now - inactiveSince < releaseAfterMs) {
      // Still within the release grace window — stay confirmed so a
      // single missed frame can't flicker the state off and back on.
      return { ...state, inactiveSince };
    }
    return { confirmed: false, activeSince: null, inactiveSince: null };
  }

  return { confirmed: false, activeSince: null, inactiveSince: null };
}
