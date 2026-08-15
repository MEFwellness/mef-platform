/**
 * The order the capture gate walks its checks in, and the rule for which
 * single instruction the member is given.
 *
 * ============================================================
 * WHY THIS EXISTS
 * ============================================================
 * The gate has several independent checks (body framing, camera height,
 * phone tilt, image quality) and each one can fail on any given frame.
 * CameraCapture.tsx used to pick a message with a chain of if/else
 * branches evaluated fresh every frame, which meant two things went wrong
 * in real use:
 *
 *   - Two checks failing at once produced whichever message the chain
 *     happened to reach first, and as the member moved, the winner
 *     flipped. From the member's side that reads as the app alternating
 *     between "move closer" and "level your phone" and never settling.
 *   - A check that had already been satisfied could reclaim the message
 *     the instant it wobbled by a hair, throwing away visible progress for
 *     what was really sensor noise.
 *
 * So the order is fixed here, once, as data, and progress through it is
 * remembered between frames. The member is walked through the checks in
 * the order a person would physically do them: stand in the right place
 * first, then set the phone's height, then its tilt, and only then worry
 * about the picture itself. Exactly one instruction is ever returned.
 *
 * ============================================================
 * GOING BACKWARDS
 * ============================================================
 * An earlier check that starts failing does not immediately reclaim the
 * instruction. It has to either fail continuously for
 * REGRESSION_CONFIRM_MS, or report itself `brokenBadly`, meaning it is out
 * by more than its own tolerance plus a release margin. Anything smaller
 * is treated as jitter and ignored, and the member keeps the step they had
 * reached. When a step-back is confirmed, progress genuinely resets to
 * that step and the later ones have to be earned again.
 *
 * Pure and clock-injected (`nowMs` is a parameter, never read from the
 * environment) so the whole thing is testable without a device.
 */

export type GateStepId = 'framing' | 'camera_height' | 'tilt' | 'image_quality';

/**
 * Fixed, deliberate order. Framing and distance first, because nothing
 * else can be judged until the right body is in the frame at the right
 * size. Then camera height, then tilt, which are both properties of the
 * phone rather than the person. Image quality last: it is the only one
 * that is not a setup instruction, and telling someone their photo is
 * blurry while they are still walking into position is noise.
 */
export const GATE_STEP_ORDER: readonly GateStepId[] = [
  'framing',
  'camera_height',
  'tilt',
  'image_quality',
];

/** How long an already-passed check must fail continuously before the gate steps back to it. Below this it is treated as jitter. */
export const REGRESSION_CONFIRM_MS = 600;

export type GateStepInput = {
  id: GateStepId;
  passing: boolean;
  /** The one instruction to show while this step is the active one. */
  instruction: string;
  /**
   * Out by more than this check's tolerance plus its release margin: a
   * real break rather than noise, which is allowed to interrupt a later
   * step immediately instead of waiting out REGRESSION_CONFIRM_MS. Checks
   * that cannot express a margin (a boolean pass/fail) leave this false
   * and rely on the time rule alone.
   */
  brokenBadly?: boolean;
};

export type CaptureGateState = {
  /** Which step the gate was on last frame. Steps before it get the jitter allowance; steps at or after it do not. */
  currentIndex: number;
  /** When each step started failing without interruption, so REGRESSION_CONFIRM_MS can be measured. */
  failingSince: Partial<Record<GateStepId, number>>;
};

export const INITIAL_CAPTURE_GATE_STATE: CaptureGateState = {
  currentIndex: 0,
  failingSince: {},
};

export type CaptureGateResult = {
  state: CaptureGateState;
  /** The single check the member is being asked to fix, or null when every check passes. */
  activeStep: GateStepId | null;
  /** That step's instruction, empty when everything passes. */
  instruction: string;
  /** How far through the fixed order the member has got, from 0 to steps.length. */
  activeIndex: number;
  allPassing: boolean;
};

/**
 * Advances the gate by one frame and returns the one instruction to show.
 * `steps` must be supplied in GATE_STEP_ORDER; the caller builds them from
 * whatever its own checks currently say.
 */
export function stepCaptureGate(
  state: CaptureGateState,
  steps: GateStepInput[],
  nowMs: number
): CaptureGateResult {
  const failingSince: Partial<Record<GateStepId, number>> = { ...state.failingSince };
  for (const step of steps) {
    if (step.passing) delete failingSince[step.id];
    else if (failingSince[step.id] === undefined) failingSince[step.id] = nowMs;
  }

  let activeIndex = steps.length;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.passing) continue;

    // A step at or beyond where the member had reached is new ground: it
    // takes effect at once. An earlier one has to prove itself first.
    const isNewGround = i >= state.currentIndex;
    const since = failingSince[step.id] ?? nowMs;
    const heldLongEnough = nowMs - since >= REGRESSION_CONFIRM_MS;

    if (isNewGround || step.brokenBadly === true || heldLongEnough) {
      activeIndex = i;
      break;
    }
    // Otherwise this is jitter on ground already covered: skip it and let
    // a later step own the instruction instead.
  }

  const active = activeIndex < steps.length ? steps[activeIndex]! : null;

  return {
    state: { currentIndex: activeIndex, failingSince },
    activeStep: active?.id ?? null,
    instruction: active?.instruction ?? '',
    activeIndex,
    allPassing: active === null,
  };
}
