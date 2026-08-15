// DeviceOrientationEvent: intrinsic Z-X'-Y'' Tait-Bryan angles (alpha, beta, gamma).
// R = Rz(alpha) Rx(beta) Ry(gamma) maps device frame -> earth frame.
// Device axes: +x screen-right, +y screen-top, +z out of the screen.
// World "up" expressed in DEVICE coordinates is R^T (0,0,1):
const d = (x) => (x * Math.PI) / 180, deg = (x) => (x * 180) / Math.PI;
const up = (beta, gamma) => ({
  x: -Math.sin(d(gamma)) * Math.cos(d(beta)),
  y: Math.sin(d(beta)),
  z: Math.cos(d(gamma)) * Math.cos(d(beta)),
});
const newRoll = (b, g) => { const u = up(b, g); return deg(Math.atan2(u.x, u.y)); };
const newPitch = (b, g) => { const u = up(b, g); return deg(Math.asin(Math.max(-1, Math.min(1, -u.z)))); };

console.log('case                                  beta   gamma | OLD roll(=gamma) OLD pitch(=b-90) | NEW roll  NEW pitch');
const rows = [
  ['flat on table, screen up',            0,   0],
  ['upright portrait, camera horizontal', 90,  0],
  ['propped, leaning back 5 deg',         85,  0],
  ['propped, leaning back 10 deg',        80,  0],
  ['upright but PANNED 20 deg to a side', 90, -20],
  ['upright but PANNED 45 deg to a side', 90, -45],
];
for (const [name, b, g] of rows) {
  console.log(
    name.padEnd(38), String(b).padStart(4), String(g).padStart(6), '|',
    String(g).padStart(13), String(b - 90).padStart(16), '|',
    newRoll(b, g).toFixed(2).padStart(8), newPitch(b, g).toFixed(2).padStart(10)
  );
}

// A genuinely ROLLED phone: rotate an upright portrait phone by phi about the
// horizontal axis the camera points along. Derived: up = (-sin phi, cos phi, 0),
// which forces sin(beta)=cos(phi) and gamma = 90 for ANY phi > 0.
console.log('\nGenuinely rolled phone (top tipped sideways by phi about the viewing axis):');
console.log('phi   -> reported beta   reported gamma | OLD roll(=gamma)  NEW roll');
for (const phi of [1, 3, 5, 10, 30]) {
  const beta = 90 - phi, gamma = 90;
  console.log(
    String(phi).padStart(3), '  ->', beta.toFixed(1).padStart(12), gamma.toFixed(1).padStart(15), '|',
    gamma.toFixed(1).padStart(14), newRoll(beta, gamma).toFixed(2).padStart(9)
  );
}
