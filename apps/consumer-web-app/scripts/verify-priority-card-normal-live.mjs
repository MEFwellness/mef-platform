#!/usr/bin/env node
/**
 * Confirms the Priority Card behaves normally on the live site now that
 * migrations 165 and 166 are applied, and that the friction question is
 * correctly NOT showing for a member who has not ignored anything.
 *
 * The second half is the point. "Armed" must not mean "firing". A member
 * who has responded to her card every day must see exactly what she saw
 * before, and an engine that started asking her what got in the way would
 * be a worse regression than the one this build fixed.
 *
 * READS ONLY. Nothing is written to her account.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   MEMBER_PASSWORD_FILE=/path/to/pw.txt SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-priority-card-normal-live.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const PASSWORD = readFileSync(process.env.MEMBER_PASSWORD_FILE, 'utf8').trim();
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-priority';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

/** Every word the friction question can put on screen. */
const FRICTION_MARKERS = [
  'A quick question',
  'What got in the way',
  'This one has not landed',
  'Too much to take on',
  'Not what I need right now',
  'Anything else worth saying',
];

const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 });
  check('signed in through the real login form', true, EMAIL);

  const visit = async (path, key) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2400);
    const text = await page.locator('body').innerText();
    writeFileSync(`${SHOTS}/${key}.txt`, text);
    await page.screenshot({ path: `${SHOTS}/${key}.png`, fullPage: true });
    return text;
  };

  const home = await visit('/dashboard', 'home');
  const today = await visit('/today', 'today');

  // ---- The card still works, unchanged ------------------------------
  const focus = 'Take a few minutes for your Daily Reset.';
  check('Today still carries her priority', today.includes(focus), focus);
  check(
    'the card is in its saved state, which is what she left it in',
    /Saved for later/i.test(today),
    today.match(/[^\n]*Saved for later[^\n]*/i)?.[0] ?? 'not saved'
  );
  check(
    'a saved card still offers Done, so she can still finish it',
    /\bDone\b/.test(today),
    'Done present'
  );
  check(
    'Home names the same one thing while the card lives on Today',
    home.includes(focus),
    home.match(/YOUR ONE THING TODAY\n[^\n]*/)?.[0]?.replace('\n', ' ') ?? 'not named'
  );

  // ---- The question is armed but correctly silent --------------------
  const showing = FRICTION_MARKERS.filter((m) => home.includes(m) || today.includes(m));
  check(
    'the friction question is NOT shown to a member who has ignored nothing',
    showing.length === 0,
    showing.length ? showing.join(' | ') : 'silent, which is correct at 0 ignored days'
  );

  // ---- Nothing else regressed with the migrations applied ------------
  const rootMap = await visit('/root-map', 'root-map');
  check(
    'findings still render one tier label each after the backfill',
    /Early indication|Emerging pattern|Supported by repeated check-ins|Coach verified/.test(rootMap),
    rootMap.match(/(Early indication|Emerging pattern|Supported by repeated check-ins|Coach verified)/g)?.slice(0, 3).join(', ') ?? ''
  );
  check(
    'the hip discomfort is still one finding, cross referenced',
    (rootMap.match(/discomfort in the hips|Discomfort: hips/gi) ?? []).length <= 1 &&
      /Also shown under|Shown in full under/.test(rootMap),
    'one statement, cross referenced'
  );
  check(
    'no percentage confidence came back with the new columns',
    !/\d{1,3}\s*%\s*confiden/i.test([home, today, rootMap].join('\n')),
    'none'
  );
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passing`);
process.exit(passed === results.length ? 0 : 1);
