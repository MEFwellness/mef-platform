#!/usr/bin/env node
/**
 * Prints what a phone's orientation sensors report at a set of reference
 * attitudes, and what the OLD and NEW camera-tilt math each make of them.
 *
 * This is the audit that found the capture-gate bug. It is committed
 * rather than thrown away because the finding is unintuitive enough to be
 * worth being able to re-run: "the roll angle is not the roll angle" is
 * the kind of claim a future reader will reasonably want to check rather
 * than take on faith from a comment.
 *
 * What it shows:
 *   - A perfectly level phone merely AIMED off to one side reports a large
 *     gamma. The old gate read that as tilt and refused to capture.
 *   - A phone genuinely rolled by 1 degree reports gamma = 90. The old
 *     gate read a 1 degree problem as a 90 degree one.
 * Both are consequences of DeviceOrientationEvent's Z-X'-Y' Euler
 * convention being in gimbal lock at beta = 90 degrees, which is exactly
 * the upright-portrait attitude this assessment asks for.
 *
 * No device needed: these are the values the W3C DeviceOrientation spec
 * defines for each attitude, so the geometry can be checked exactly.
 * lib/body-assessment/cameraTilt.ts is the real implementation and
 * tests/camera-tilt.test.ts pins these same cases.
 *
 * Run: node scripts/audit-device-orientation-math.mjs
 */

const toRad = (x) => (x * Math.PI) / 180;
const toDeg = (x) => (x * 180) / Math.PI;

/** World "up" expressed in the device's own axes, from beta and gamma alone. */
function up(beta, gamma) {
  return {
    x: -Math.sin(toRad(gamma)) * Math.cos(toRad(beta)),
    y: Math.sin(toRad(beta)),
    z: Math.cos(toRad(gamma)) * Math.cos(toRad(beta)),
  };
}

const newRoll = (beta, gamma) => {
  const u = up(beta, gamma);
  return toDeg(Math.atan2(u.x, u.y));
};
const newPitch = (beta, gamma) => {
  const u = up(beta, gamma);
  return toDeg(Math.asin(Math.max(-1, Math.min(1, -u.z))));
};

const pad = (v, n) => String(v).padStart(n);

console.log('Reference attitudes');
console.log(
  'case                                  beta   gamma | OLD roll(=gamma) OLD pitch(=b-90) |  NEW roll  NEW pitch'
);
for (const [name, beta, gamma] of [
  ['flat on table, screen up', 0, 0],
  ['upright portrait, camera horizontal', 90, 0],
  ['propped, leaning back 5 deg', 85, 0],
  ['propped, leaning back 10 deg', 80, 0],
  ['upright but PANNED 20 deg to a side', 90, -20],
  ['upright but PANNED 45 deg to a side', 90, -45],
]) {
  console.log(
    name.padEnd(38),
    pad(beta, 4),
    pad(gamma, 6),
    '|',
    pad(gamma, 13),
    pad(beta - 90, 16),
    '|',
    pad(newRoll(beta, gamma).toFixed(2), 9),
    pad(newPitch(beta, gamma).toFixed(2), 10)
  );
}

// Rolling an upright portrait phone by phi about the axis its camera points
// along forces gamma to 90 for ANY phi greater than zero, with beta reading
// 90 - phi. Derived from up = (-sin phi, cos phi, 0) for that attitude.
console.log('\nA genuinely rolled phone (top tipped sideways by phi about the viewing axis)');
console.log('phi   -> reported beta   reported gamma | OLD roll(=gamma)   NEW roll');
for (const phi of [1, 3, 5, 10, 30]) {
  const beta = 90 - phi;
  const gamma = 90;
  console.log(
    pad(phi, 3),
    '  ->',
    pad(beta.toFixed(1), 12),
    pad(gamma.toFixed(1), 15),
    '|',
    pad(gamma.toFixed(1), 14),
    pad(newRoll(beta, gamma).toFixed(2), 10)
  );
}

console.log(
  '\nOld gate: +/-1 deg roll, +/-2 deg pitch. New gate: +/-3 deg roll, +/-5 deg pitch.'
);
