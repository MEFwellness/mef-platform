/**
 * lib/body-assessment/steadyHold.ts — the hold and countdown that fire the
 * shutter with no tap required.
 *
 * The behaviour that matters most here is what an interruption does. A
 * gate that throws away all progress every time a member twitches is a
 * gate that never completes, which is exactly what was reported. So these
 * pin down three separate cases that are easy to conflate: a blip (absorb
 * it, change nothing), an interruption during the hold (restart the hold),
 * and an interruption during the countdown (pause it, never restart it).
 */
import { describe, it, expect } from 'vitest';
import {
  stepSteadyHold,
  INITIAL_STEADY_HOLD_STATE,
  REQUIRED_STABLE_MS,
  COUNTDOWN_MS,
  STABILITY_GRACE_MS,
  MAX_FRAME_STEP_MS,
  type SteadyHoldState,
  type SteadyHoldResult,
} from '../lib/body-assessment/steadyHold';

const FRAME_MS = 50;

/** Runs a run of frames at a fixed cadence and returns the last result plus the clock. */
function run(
  state: SteadyHoldState,
  startMs: number,
  frames: number,
  passing: boolean | ((i: number) => boolean),
  countdownAllowed = true
): { state: SteadyHoldState; nowMs: number; last: SteadyHoldResult; phases: string[] } {
  let current = state;
  let nowMs = startMs;
  let last: SteadyHoldResult | null = null;
  const phases: string[] = [];
  for (let i = 0; i < frames; i++) {
    nowMs += FRAME_MS;
    const isPassing = typeof passing === 'function' ? passing(i) : passing;
    last = stepSteadyHold(current, { passing: isPassing, nowMs, countdownAllowed });
    current = last.state;
    phases.push(last.phase);
  }
  return { state: current, nowMs, last: last!, phases };
}

describe('steady hold — capturing without a tap', () => {
  it('builds the hold, runs the countdown, then asks for the capture', () => {
    // 1.5s of hold plus 3s of countdown at 50ms a frame, with one extra
    // frame because the very first contributes no elapsed time.
    const framesNeeded = (REQUIRED_STABLE_MS + COUNTDOWN_MS) / FRAME_MS + 1;
    const { phases, last } = run(INITIAL_STEADY_HOLD_STATE, 0, framesNeeded, true);

    expect(phases[0]).toBe('holding');
    expect(phases).toContain('counting_down');
    expect(last.phase).toBe('capture');
  });

  it('holds for 1.5 seconds before the countdown starts, not longer or shorter', () => {
    let state = INITIAL_STEADY_HOLD_STATE;
    let nowMs = 0;
    let firstCountdownAtMs: number | null = null;
    for (let i = 0; i < 200 && firstCountdownAtMs === null; i++) {
      nowMs += FRAME_MS;
      const result = stepSteadyHold(state, { passing: true, nowMs });
      state = result.state;
      if (result.phase === 'counting_down') firstCountdownAtMs = state.heldMs;
    }
    expect(firstCountdownAtMs).toBe(REQUIRED_STABLE_MS);
    expect(REQUIRED_STABLE_MS).toBe(1500);
  });

  it('never lets one frame jump the timers forward, however long the gap', () => {
    const first = stepSteadyHold(INITIAL_STEADY_HOLD_STATE, { passing: true, nowMs: 1000 });
    // A ten second stall (a backgrounded tab) contributes one capped step.
    const afterStall = stepSteadyHold(first.state, { passing: true, nowMs: 11_000 });
    expect(afterStall.state.heldMs).toBeLessThanOrEqual(MAX_FRAME_STEP_MS);
    expect(afterStall.phase).toBe('holding');
  });
});

describe('steady hold — a blip changes nothing', () => {
  it('absorbs a failing streak shorter than the grace window without advancing or resetting', () => {
    const { state, nowMs } = run(INITIAL_STEADY_HOLD_STATE, 0, 20, true);
    const heldBefore = state.heldMs;
    expect(heldBefore).toBeGreaterThan(0);

    // Two failing frames, well inside the grace window.
    const blip = run(state, nowMs, 2, false);
    expect(blip.last.phase).toBe('holding');
    expect(blip.state.heldMs).toBe(heldBefore);
  });

  it('does not start guiding during a blip, so no correction flashes up and vanishes', () => {
    const { state, nowMs } = run(INITIAL_STEADY_HOLD_STATE, 0, 20, true);
    const blip = run(state, nowMs, Math.floor(STABILITY_GRACE_MS / FRAME_MS) - 1, false);
    expect(blip.phases).not.toContain('guiding');
  });
});

describe('steady hold — interruptions', () => {
  it('restarts the hold when a real interruption lands before the countdown began', () => {
    const { state, nowMs } = run(INITIAL_STEADY_HOLD_STATE, 0, 10, true);
    expect(state.heldMs).toBeGreaterThan(0);
    expect(state.countdownStarted).toBe(false);

    const interrupted = run(state, nowMs, 20, false);
    expect(interrupted.last.phase).toBe('guiding');
    expect(interrupted.state.heldMs).toBe(0);
  });

  it('PAUSES the countdown on an interruption and resumes it where it stopped', () => {
    // Reach the countdown and get partway through it.
    const toCountdown = (REQUIRED_STABLE_MS + 1000) / FRAME_MS + 1;
    const started = run(INITIAL_STEADY_HOLD_STATE, 0, toCountdown, true);
    expect(started.last.phase).toBe('counting_down');
    const countdownAtInterruption = started.state.countdownMs;
    expect(countdownAtInterruption).toBeGreaterThan(500);
    expect(countdownAtInterruption).toBeLessThan(COUNTDOWN_MS);

    // A long, genuine interruption.
    const interrupted = run(started.state, started.nowMs, 40, false);
    expect(interrupted.last.phase).toBe('guiding');
    // The countdown kept its place. It did NOT go back to the start.
    expect(interrupted.state.countdownMs).toBe(countdownAtInterruption);
    expect(interrupted.state.countdownStarted).toBe(true);

    // Re-establish position: the hold rebuilds, then the countdown carries
    // on from where it paused rather than from 3 seconds.
    const resumed = run(interrupted.state, interrupted.nowMs, REQUIRED_STABLE_MS / FRAME_MS + 2, true);
    expect(resumed.state.countdownMs).toBeGreaterThanOrEqual(countdownAtInterruption);
  });

  it('completes the capture sooner after a pause than a fresh countdown would', () => {
    const toCountdown = (REQUIRED_STABLE_MS + 2000) / FRAME_MS + 1;
    const started = run(INITIAL_STEADY_HOLD_STATE, 0, toCountdown, true);
    const interrupted = run(started.state, started.nowMs, 30, false);

    // Roughly 900ms of countdown was left when it paused. Rebuilding the
    // hold costs 1500ms, so resuming should reach the shutter in about
    // 2400ms. A full restart would need 4500ms. The bound is deliberately
    // tight enough to tell those two apart: a version that reset the
    // countdown instead of pausing it fails this.
    const remainingCountdownMs = COUNTDOWN_MS - interrupted.state.countdownMs;
    expect(remainingCountdownMs).toBeLessThan(1200);

    let state = interrupted.state;
    let nowMs = interrupted.nowMs;
    let framesToCapture = 0;
    for (let i = 0; i < 400; i++) {
      nowMs += FRAME_MS;
      framesToCapture++;
      const result = stepSteadyHold(state, { passing: true, nowMs });
      state = result.state;
      if (result.phase === 'capture') break;
    }
    const msToCapture = framesToCapture * FRAME_MS;
    expect(msToCapture).toBeGreaterThan(REQUIRED_STABLE_MS);
    expect(msToCapture).toBeLessThan(REQUIRED_STABLE_MS + remainingCountdownMs + FRAME_MS * 2);
  });

  it('does not cancel the countdown when jitter stays inside the grace window', () => {
    // The section 6 requirement stated directly: a member who twitches
    // every few frames, never for long, still gets their photo.
    const toCountdown = REQUIRED_STABLE_MS / FRAME_MS + 2;
    const started = run(INITIAL_STEADY_HOLD_STATE, 0, toCountdown, true);
    expect(started.state.countdownStarted).toBe(true);

    // One failing frame in every six, so no failing streak ever reaches
    // STABILITY_GRACE_MS.
    const jittery = run(started.state, started.nowMs, 200, (i) => i % 6 !== 0);
    expect(jittery.phases).not.toContain('guiding');
    expect(jittery.last.phase).toBe('capture');
  });
});

describe('steady hold — not talking over the member', () => {
  it('pauses the countdown while guidance is speaking, without resetting it', () => {
    const toCountdown = (REQUIRED_STABLE_MS + 500) / FRAME_MS + 1;
    const started = run(INITIAL_STEADY_HOLD_STATE, 0, toCountdown, true);
    const before = started.state.countdownMs;

    const whileSpeaking = run(started.state, started.nowMs, 20, true, false);
    expect(whileSpeaking.state.countdownMs).toBe(before);
    expect(whileSpeaking.last.phase).toBe('counting_down');

    const afterSpeaking = run(whileSpeaking.state, whileSpeaking.nowMs, 5, true, true);
    expect(afterSpeaking.state.countdownMs).toBeGreaterThan(before);
  });
});
