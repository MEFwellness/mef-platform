/**
 * lib/body-assessment/cameraTilt.ts — the sensor geometry and the gate
 * tolerances.
 *
 * The headline case here is the one that broke the capture gate on real
 * phones: this module used to read DeviceOrientationEvent's `gamma`
 * directly as the phone's side-to-side roll. In the upright-portrait
 * attitude this assessment asks for, that Euler decomposition is in gimbal
 * lock, so `gamma` stops meaning roll. The tests below pin both halves of
 * the resulting damage (a level phone reported as tilted, and a barely
 * tilted phone reported as 90 degrees out) and prove the replacement
 * geometry gets them right.
 */
import { describe, it, expect } from 'vitest';
import {
  deviceTiltAngles,
  evaluateCameraTilt,
  ROLL_TOLERANCE_DEGREES,
  PITCH_TOLERANCE_DEGREES,
  TILT_RELEASE_MARGIN_DEGREES,
} from '../lib/body-assessment/cameraTilt';

/** Shorthand: the angles a phone reporting this beta/gamma actually has. */
function angles(beta: number, gamma: number, screenAngle = 0) {
  return deviceTiltAngles(beta, gamma, screenAngle)!;
}

describe('deviceTiltAngles — reference attitudes', () => {
  it('reads a phone lying flat on a table as aimed straight down, with no roll', () => {
    const flat = angles(0, 0);
    expect(flat.rollDegrees).toBeCloseTo(0, 6);
    expect(flat.pitchDegrees).toBeCloseTo(-90, 6);
  });

  it('reads a phone standing upright in portrait as perfectly level and vertical', () => {
    const upright = angles(90, 0);
    expect(upright.rollDegrees).toBeCloseTo(0, 6);
    expect(upright.pitchDegrees).toBeCloseTo(0, 6);
  });

  it('reads a phone propped leaning back as leaning back by that many degrees, still unrolled', () => {
    expect(angles(85, 0).pitchDegrees).toBeCloseTo(-5, 6);
    expect(angles(85, 0).rollDegrees).toBeCloseTo(0, 6);
    expect(angles(80, 0).pitchDegrees).toBeCloseTo(-10, 6);
  });

  it('reproduces the old beta minus 90 pitch exactly whenever the phone is not panned', () => {
    // The pitch half of the old math was right, and migration 103 already
    // stores values in that convention, so stored pitch stays comparable.
    for (const beta of [70, 85, 88, 90, 92, 95, 110]) {
      expect(angles(beta, 0).pitchDegrees).toBeCloseTo(beta - 90, 6);
    }
  });
});

describe('deviceTiltAngles — the bug that made the gate unpassable', () => {
  it('reports NO roll for a level phone that is merely aimed off to one side', () => {
    // This is the "a level, stationary phone is told it is tilted" report.
    // At beta 90 the Euler convention is degenerate and gamma describes
    // which way the phone POINTS, not how it is rolled.
    for (const gamma of [-45, -20, -5, 5, 20, 45]) {
      const reading = angles(90, gamma);
      expect(reading.rollDegrees).toBeCloseTo(0, 6);
      expect(evaluateCameraTilt(reading).ok).toBe(true);
    }
    // The old code compared gamma itself against a 1 degree tolerance, so
    // every one of those readings was rejected.
    expect(Math.abs(-20)).toBeGreaterThan(1);
  });

  it('reports a genuinely rolled phone as its real roll, where gamma reports 90 degrees', () => {
    // Rolling an upright portrait phone by phi about the axis its camera
    // points along forces gamma to 90 for ANY phi greater than zero, while
    // beta reads 90 minus phi. The old check therefore saw a 90 degree
    // tilt for a 1 degree problem.
    for (const phi of [1, 3, 5, 10, 30]) {
      const reading = angles(90 - phi, 90);
      expect(Math.abs(reading.rollDegrees)).toBeCloseTo(phi, 6);
      expect(reading.pitchDegrees).toBeCloseTo(0, 6);
    }
    // Small real rolls now pass; large ones still fail, as they should.
    expect(evaluateCameraTilt(angles(89, 90)).ok).toBe(true);
    expect(evaluateCameraTilt(angles(60, 90)).ok).toBe(false);
  });

  it('measures roll against whichever edge is currently the top of the interface', () => {
    const portrait = angles(90 - 10, 90, 0);
    const landscape = angles(90 - 10, 90, 90);
    expect(Math.abs(portrait.rollDegrees)).toBeCloseTo(10, 6);
    // The same physical attitude is a different roll relative to a rotated
    // interface, which is exactly why the screen angle is read rather than
    // assumed.
    expect(Math.abs(landscape.rollDegrees)).not.toBeCloseTo(10, 3);
  });

  it('returns nothing, rather than a wrong number, when either reading is missing', () => {
    expect(deviceTiltAngles(null, 0)).toBeNull();
    expect(deviceTiltAngles(90, null)).toBeNull();
    expect(deviceTiltAngles(null, null)).toBeNull();
    expect(deviceTiltAngles(Number.NaN, 0)).toBeNull();
  });
});

describe('evaluateCameraTilt — the new tolerances', () => {
  it('does not enforce tilt at all when there is no reading (graceful degradation)', () => {
    expect(evaluateCameraTilt(null).ok).toBe(true);
    expect(evaluateCameraTilt(null).failing).toBeNull();
  });

  it('uses the loosened tolerances a real propped phone can actually meet', () => {
    expect(ROLL_TOLERANCE_DEGREES).toBe(3);
    expect(PITCH_TOLERANCE_DEGREES).toBe(5);
  });

  it('passes roll just inside tolerance and fails it just outside, in both directions', () => {
    expect(evaluateCameraTilt({ rollDegrees: 2.9, pitchDegrees: 0 }).ok).toBe(true);
    expect(evaluateCameraTilt({ rollDegrees: -2.9, pitchDegrees: 0 }).ok).toBe(true);
    expect(evaluateCameraTilt({ rollDegrees: 3, pitchDegrees: 0 }).ok).toBe(true);

    expect(evaluateCameraTilt({ rollDegrees: 3.1, pitchDegrees: 0 }).ok).toBe(false);
    expect(evaluateCameraTilt({ rollDegrees: -3.1, pitchDegrees: 0 }).ok).toBe(false);
    expect(evaluateCameraTilt({ rollDegrees: 3.1, pitchDegrees: 0 }).failing).toBe('roll');
  });

  it('passes lean just inside tolerance and fails it just outside, in both directions', () => {
    expect(evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: 4.9 }).ok).toBe(true);
    expect(evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: -4.9 }).ok).toBe(true);
    expect(evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: 5 }).ok).toBe(true);

    expect(evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: 5.1 }).ok).toBe(false);
    expect(evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: -5.1 }).ok).toBe(false);
    expect(evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: 5.1 }).failing).toBe('pitch');
  });

  it('passes a phone propped leaning back a few degrees, the case that must work', () => {
    // A phone in a stand leans back; beta below 90 is exactly that.
    expect(evaluateCameraTilt(angles(86, 0)).ok).toBe(true);
    expect(evaluateCameraTilt(angles(85, 0)).ok).toBe(true);
    // And it still rejects a phone propped at a genuinely useless angle.
    expect(evaluateCameraTilt(angles(70, 0)).ok).toBe(false);
  });

  it('names the direction to move and roughly how far, never a generic complaint', () => {
    const rolledRightSideHigh = evaluateCameraTilt({ rollDegrees: 8, pitchDegrees: 0 });
    expect(rolledRightSideHigh.message).toBe('Turn the top of the phone to the right, about 8 degrees.');

    const rolledOtherWay = evaluateCameraTilt({ rollDegrees: -8, pitchDegrees: 0 });
    expect(rolledOtherWay.message).toBe('Turn the top of the phone to the left, about 8 degrees.');

    const tippedToward = evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: 9 });
    expect(tippedToward.message).toBe('Tilt the top of the phone back, about 9 degrees.');

    const tippedAway = evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: -9 });
    expect(tippedAway.message).toBe('Tilt the top of the phone forward, about 9 degrees.');

    // Grossly wrong is better served by one plain instruction than a number.
    expect(evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: -90 }).message).toBe(
      'Stand the phone upright so it faces you straight on.'
    );
  });

  it('never uses an em dash in anything a member reads', () => {
    const messages = [
      evaluateCameraTilt({ rollDegrees: 8, pitchDegrees: 0 }).message,
      evaluateCameraTilt({ rollDegrees: -8, pitchDegrees: 0 }).message,
      evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: 9 }).message,
      evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: -9 }).message,
      evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: -90 }).message,
    ];
    for (const message of messages) {
      expect(message).not.toContain('—');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('only calls a failure a genuine break once it is past the release margin', () => {
    // Just outside tolerance is jitter, and must not interrupt a later step.
    expect(evaluateCameraTilt({ rollDegrees: 3.5, pitchDegrees: 0 }).brokenBadly).toBe(false);
    expect(
      evaluateCameraTilt({
        rollDegrees: ROLL_TOLERANCE_DEGREES + TILT_RELEASE_MARGIN_DEGREES,
        pitchDegrees: 0,
      }).brokenBadly
    ).toBe(false);
    // Well outside is a real break.
    expect(
      evaluateCameraTilt({
        rollDegrees: ROLL_TOLERANCE_DEGREES + TILT_RELEASE_MARGIN_DEGREES + 0.1,
        pitchDegrees: 0,
      }).brokenBadly
    ).toBe(true);
    expect(evaluateCameraTilt({ rollDegrees: 0, pitchDegrees: 12 }).brokenBadly).toBe(true);
  });

  it('reports roll before lean when both are out, since a rolled phone tips the whole image', () => {
    expect(evaluateCameraTilt({ rollDegrees: 10, pitchDegrees: 10 }).failing).toBe('roll');
  });
});
