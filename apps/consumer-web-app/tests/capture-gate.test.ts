/**
 * lib/body-assessment/captureGate.ts — the fixed order the capture gate
 * walks its checks in, and the rule that decides which single instruction
 * the member sees.
 *
 * What these pin down is the behaviour that was reported broken on real
 * phones: two checks failing at once used to produce whichever message an
 * if/else chain reached first, so the guidance alternated between "move
 * closer" and "level your phone" and never settled. The gate must instead
 * always name the FIRST failing check in the fixed order, show only that
 * one, and refuse to hand the instruction back to an earlier check that is
 * merely wobbling.
 */
import { describe, it, expect } from 'vitest';
import {
  stepCaptureGate,
  GATE_STEP_ORDER,
  REGRESSION_CONFIRM_MS,
  INITIAL_CAPTURE_GATE_STATE,
  type GateStepInput,
} from '../lib/body-assessment/captureGate';

/** Builds the four steps in order, with the named ones failing. */
function steps(failing: Partial<Record<string, boolean>>, brokenBadly: string[] = []): GateStepInput[] {
  return GATE_STEP_ORDER.map((id) => ({
    id,
    passing: !failing[id],
    instruction: `fix ${id}`,
    brokenBadly: brokenBadly.includes(id),
  }));
}

describe('capture gate — fixed order', () => {
  it('walks framing, then camera height, then tilt, then image quality', () => {
    expect([...GATE_STEP_ORDER]).toEqual(['framing', 'camera_height', 'tilt', 'image_quality']);
  });

  it('always names the first failing check in that order, never a later one', () => {
    const all = stepCaptureGate(
      INITIAL_CAPTURE_GATE_STATE,
      steps({ framing: true, camera_height: true, tilt: true, image_quality: true }),
      1000
    );
    expect(all.activeStep).toBe('framing');
    expect(all.instruction).toBe('fix framing');

    const later = stepCaptureGate(
      INITIAL_CAPTURE_GATE_STATE,
      steps({ camera_height: true, tilt: true }),
      1000
    );
    expect(later.activeStep).toBe('camera_height');

    const tiltOnly = stepCaptureGate(INITIAL_CAPTURE_GATE_STATE, steps({ tilt: true }), 1000);
    expect(tiltOnly.activeStep).toBe('tilt');
  });

  it('shows exactly one instruction, never two competing ones', () => {
    const result = stepCaptureGate(
      INITIAL_CAPTURE_GATE_STATE,
      steps({ framing: true, tilt: true }),
      1000
    );
    expect(result.instruction).toBe('fix framing');
    expect(result.instruction).not.toContain('tilt');
  });

  it('reports everything passing with no instruction at all', () => {
    const result = stepCaptureGate(INITIAL_CAPTURE_GATE_STATE, steps({}), 1000);
    expect(result.allPassing).toBe(true);
    expect(result.activeStep).toBeNull();
    expect(result.instruction).toBe('');
    expect(result.activeIndex).toBe(GATE_STEP_ORDER.length);
  });
});

describe('capture gate — not bouncing back on jitter', () => {
  it('ignores a brief wobble on an already-passed earlier check', () => {
    // Reach the tilt step cleanly.
    let state = stepCaptureGate(INITIAL_CAPTURE_GATE_STATE, steps({ tilt: true }), 1000).state;

    // Framing now wobbles. It must NOT reclaim the instruction.
    const wobble = stepCaptureGate(state, steps({ framing: true, tilt: true }), 1100);
    expect(wobble.activeStep).toBe('tilt');
    expect(wobble.instruction).toBe('fix tilt');
    state = wobble.state;

    // Still wobbling, still inside the confirmation window.
    const stillWobbling = stepCaptureGate(
      state,
      steps({ framing: true, tilt: true }),
      1000 + REGRESSION_CONFIRM_MS - 1
    );
    expect(stillWobbling.activeStep).toBe('tilt');
  });

  it('does step back when an earlier check genuinely stays broken', () => {
    let state = stepCaptureGate(INITIAL_CAPTURE_GATE_STATE, steps({ tilt: true }), 1000).state;
    state = stepCaptureGate(state, steps({ framing: true, tilt: true }), 1100).state;

    const confirmed = stepCaptureGate(
      state,
      steps({ framing: true, tilt: true }),
      1100 + REGRESSION_CONFIRM_MS
    );
    expect(confirmed.activeStep).toBe('framing');
    expect(confirmed.instruction).toBe('fix framing');
  });

  it('steps back immediately when an earlier check breaks by more than its tolerance', () => {
    const state = stepCaptureGate(INITIAL_CAPTURE_GATE_STATE, steps({ tilt: true }), 1000).state;

    const badBreak = stepCaptureGate(
      state,
      steps({ camera_height: true, tilt: true }, ['camera_height']),
      1010
    );
    expect(badBreak.activeStep).toBe('camera_height');
  });

  it('clears the failing streak as soon as a check passes again, so jitter cannot accumulate', () => {
    let state = stepCaptureGate(INITIAL_CAPTURE_GATE_STATE, steps({ tilt: true }), 0).state;

    // Framing flickers off and on repeatedly, never failing continuously
    // for long enough. It must never take the instruction.
    for (let t = 100; t < 5000; t += 200) {
      const failing = stepCaptureGate(state, steps({ framing: true, tilt: true }), t);
      expect(failing.activeStep).toBe('tilt');
      state = failing.state;
      const recovered = stepCaptureGate(state, steps({ tilt: true }), t + 100);
      expect(recovered.activeStep).toBe('tilt');
      state = recovered.state;
    }
  });

  it('makes the member re-earn the later checks once a step-back is confirmed', () => {
    let state = stepCaptureGate(INITIAL_CAPTURE_GATE_STATE, steps({ tilt: true }), 1000).state;
    state = stepCaptureGate(state, steps({ framing: true, tilt: true }), 1100).state;
    const back = stepCaptureGate(
      state,
      steps({ framing: true, tilt: true }),
      1100 + REGRESSION_CONFIRM_MS
    );
    expect(back.activeStep).toBe('framing');
    expect(back.state.currentIndex).toBe(0);

    // Camera height failing now is new ground again and takes effect at once.
    const next = stepCaptureGate(back.state, steps({ camera_height: true }), 3000);
    expect(next.activeStep).toBe('camera_height');
  });

  it('never alternates between two failing checks across a long run of frames', () => {
    // The reported symptom, reproduced as a sequence: framing and tilt are
    // both failing, frame after frame. The instruction must be stable.
    let state = INITIAL_CAPTURE_GATE_STATE;
    const seen = new Set<string>();
    for (let t = 0; t < 4000; t += 80) {
      const result = stepCaptureGate(state, steps({ framing: true, tilt: true }), t);
      seen.add(result.activeStep!);
      state = result.state;
    }
    expect([...seen]).toEqual(['framing']);
  });
});

describe('capture gate — progressing forward', () => {
  it('advances one check at a time as each is satisfied', () => {
    let state = INITIAL_CAPTURE_GATE_STATE;

    const atFraming = stepCaptureGate(
      state,
      steps({ framing: true, camera_height: true, tilt: true }),
      0
    );
    expect(atFraming.activeStep).toBe('framing');
    state = atFraming.state;

    const atHeight = stepCaptureGate(state, steps({ camera_height: true, tilt: true }), 500);
    expect(atHeight.activeStep).toBe('camera_height');
    state = atHeight.state;

    const atTilt = stepCaptureGate(state, steps({ tilt: true }), 1000);
    expect(atTilt.activeStep).toBe('tilt');
    state = atTilt.state;

    const done = stepCaptureGate(state, steps({}), 1500);
    expect(done.allPassing).toBe(true);
  });
});
