#!/usr/bin/env node
/**
 * Draws the two figures scripts/audit-facing-landmarks.mjs runs the real
 * pose model against: the same body seen from the front (with face
 * features) and from behind (with none at all). Output is committed to
 * tests/fixtures/facing/, so the audit never depends on running this.
 *
 * The back view deliberately has no face drawn on it whatsoever. That is
 * the point of the exercise: the model reports a nose, eyes and ears there
 * anyway, at high confidence, which is why the old back-view check could
 * never pass.
 *
 * Run, from apps/consumer-web-app:
 *   node scripts/generate-facing-audit-figures.mjs
 */
import sharp from 'sharp';
const W=600,H=1000;
// Simple shaded human figure. `facing` adds face features; both share identical body geometry.
function fig(facing){
  const skin='#c98f6a', dark='#a5714f', hair='#2b2118';
  const face = facing ? `
    <ellipse cx="300" cy="118" rx="9" ry="6" fill="#fff"/><circle cx="300" cy="118" r="4" fill="#3a2a1a"/>
    <ellipse cx="352" cy="118" rx="9" ry="6" fill="#fff"/><circle cx="352" cy="118" r="4" fill="#3a2a1a"/>
    <path d="M300 150 Q326 165 352 150" stroke="#7a4436" stroke-width="5" fill="none"/>
    <path d="M326 120 L326 140 L336 142" stroke="${dark}" stroke-width="4" fill="none"/>
    <path d="M282 100 Q300 92 316 100" stroke="${hair}" stroke-width="6" fill="none"/>
    <path d="M336 100 Q352 92 370 100" stroke="${hair}" stroke-width="6" fill="none"/>`
    : `<path d="M262 86 Q326 60 390 86 Q392 140 326 150 Q260 140 262 86" fill="${hair}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#e8e4dc"/>
    <ellipse cx="326" cy="128" rx="66" ry="78" fill="${skin}"/>
    ${facing?'':''}
    <path d="M262 66 Q326 34 390 66 Q396 104 326 106 Q256 104 262 66" fill="${hair}"/>
    ${face}
    <rect x="306" y="196" width="40" height="40" fill="${skin}"/>
    <path d="M212 240 Q326 210 440 240 L424 500 Q326 520 228 500 Z" fill="${skin}"/>
    <path d="M228 500 Q326 520 424 500 L436 560 Q326 585 216 560 Z" fill="${dark}"/>
    <path d="M216 250 L182 470 L216 480 L246 260 Z" fill="${skin}"/>
    <path d="M436 250 L470 470 L436 480 L406 260 Z" fill="${skin}"/>
    <ellipse cx="196" cy="500" rx="20" ry="30" fill="${skin}"/>
    <ellipse cx="456" cy="500" rx="20" ry="30" fill="${skin}"/>
    <path d="M240 560 L232 790 L282 790 L304 566 Z" fill="${skin}"/>
    <path d="M412 560 L420 790 L370 790 L348 566 Z" fill="${skin}"/>
    <path d="M232 790 L228 930 L282 930 L282 790 Z" fill="${skin}"/>
    <path d="M420 790 L424 930 L370 930 L370 790 Z" fill="${skin}"/>
    <ellipse cx="255" cy="940" rx="34" ry="16" fill="${dark}"/>
    <ellipse cx="397" cy="940" rx="34" ry="16" fill="${dark}"/>
  </svg>`;
}
for (const [name,f] of [['front',true],['back',false]]) {
  await sharp(Buffer.from(fig(f))).png().toFile(`tests/fixtures/facing/${name}-facing-figure.png`);
  console.log('wrote',name);
}
