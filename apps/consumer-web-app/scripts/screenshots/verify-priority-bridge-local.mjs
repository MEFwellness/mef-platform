#!/usr/bin/env node
// "Building on yesterday..." — driven in a real browser.
//
// The sequence needs a genuine yesterday-to-today transition (a completed
// priority for the previous calendar day, and a different one today).
// Production's test accounts cannot be put into that state on demand, so
// this proves it against the local Supabase, where a completed yesterday
// row can be seeded and removed again.
//
// It samples the DOM across the sequence rather than trusting a single
// snapshot, so the ORDER of the beats is observed rather than assumed, and
// then re-runs the whole thing with reduced motion to confirm the same
// three parts arrive at once with nothing animating.
//
// Usage (local only, dev server + supabase running):
//   node scripts/screenshots/verify-priority-bridge-local.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const SHOTS = '../../docs/screens/priority-motion';
const issues = [];

function ok(cond, msg) {
  console.log(`   ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) issues.push(msg);
}

/** What the card is showing right now, wherever it lives. */
async function sample(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector('[role="dialog"]') ||
      [...document.querySelectorAll('section')].find((s) =>
        s.innerText.toLowerCase().includes('your priority today')
      );
    if (!root) return null;
    // innerText reflects `text-transform`, and several labels here are
    // uppercased in CSS, so every match below is case-insensitive. The
    // bridge line is excluded from the "yesterday" match so the two beats
    // can be told apart rather than one satisfying both.
    const text = root.innerText.toLowerCase();
    const line = text.includes('building on yesterday');
    return {
      yesterday: text.includes('yesterday') && (!line || text.split('building on yesterday')[0].includes('yesterday')),
      bridgeLine: line,
      // Today's card has actually taken over only once its actions exist.
      today: [...root.querySelectorAll('button')].some((b) => /help me/i.test(b.innerText)),
      buttons: [...root.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean),
      inDialog: !!document.querySelector('[role="dialog"]'),
      receding: !!root.querySelector('.mef-recede'),
    };
  });
}

async function trace(page, ms, stepMs = 100) {
  const frames = [];
  for (let t = 0; t <= ms; t += stepMs) {
    frames.push({ t, ...(await sample(page)) });
    await page.waitForTimeout(stepMs);
  }
  return frames;
}

function firstAt(frames, key) {
  const hit = frames.find((f) => f[key]);
  return hit ? hit.t : null;
}

const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });
console.log(`"Building on yesterday..." — local browser run against ${BASE_URL}\n`);

// ---------------------------------------------------------------------
// Motion on.
// ---------------------------------------------------------------------
console.log('=== motion on ===');
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') issues.push(`console: ${m.text()}`);
});

await login(page, BASE_URL, ACCOUNTS.memberPopulated);
// Start the clock when the card actually appears, not when navigation
// begins: on a cold dev server the first render is slower than the whole
// sequence, and timing from the wrong zero measures the compiler.
await page.waitForFunction(
  () =>
    !!(
      document.querySelector('[role="dialog"]') ||
      [...document.querySelectorAll('section')].find((s) =>
        s.innerText.toLowerCase().includes('your priority today')
      )
    ),
  { timeout: 30000 }
);
const frames = await trace(page, 2600, 80);

const yesterdayAt = firstAt(frames, 'yesterday');
const lineAt = firstAt(frames, 'bridgeLine');
const todayAt = firstAt(frames, 'today');

console.log(
  `   first seen: yesterday=${yesterdayAt}ms  bridge line=${lineAt}ms  today's priority=${todayAt}ms`
);

ok(yesterdayAt !== null, "yesterday's completed priority appears first");
ok(lineAt !== null, 'the bridge line appears');
ok(todayAt !== null, "today's priority appears");
ok(
  yesterdayAt !== null && lineAt !== null && yesterdayAt < lineAt,
  'yesterday is on screen BEFORE the bridge line, not with it'
);
ok(
  lineAt !== null && todayAt !== null && lineAt < todayAt,
  "the bridge line lands BEFORE today's priority takes over"
);
ok(
  frames.some((f) => f.receding),
  'the block steps back on the handover rather than vanishing'
);
const final = frames[frames.length - 1];
ok(!!final && !final.yesterday && final.today, 'and the sequence ends with today owning the card');
ok(
  todayAt !== null && lineAt !== null && todayAt > lineAt,
  `today's actions only become reachable once the handover is over (${todayAt}ms)`
);
ok(
  !!final && final.buttons.some((b) => /^done$/i.test(b)),
  'the three actions are reachable once the sequence is over'
);

// It is a moment, so it happens once. Home and Today both render this
// card; without the guard, moving between them would replay it until it
// meant nothing.
await page.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const afterNav = await sample(page);
ok(!!afterNav && !afterNav.bridgeLine, 'and it does not replay when she moves to another surface');

// Screenshots at the three beats, on a fresh session so the sequence replays.
await ctx.close();
const shotCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const shot = await shotCtx.newPage();
await login(shot, BASE_URL, ACCOUNTS.memberPopulated);
// Wait for the card, not for the clock: the app plays its own entry
// animation on login first, and capturing on a fixed delay photographs
// that instead of the sequence.
await shot.waitForFunction(
  () =>
    !!(
      document.querySelector('[role="dialog"]') ||
      [...document.querySelectorAll('section')].find((s) =>
        s.innerText.toLowerCase().includes('your priority today')
      )
    ),
  { timeout: 30000 }
);
let elapsed = 0;
for (const [name, at] of [
  ['bridge-01-yesterday', 250],
  ['bridge-02-line', 1100],
  ['bridge-03-today', 2300],
]) {
  await shot.waitForTimeout(at - elapsed);
  elapsed = at;
  await shot.screenshot({ path: `${SHOTS}/${name}.png` });
}
await shotCtx.close();

// ---------------------------------------------------------------------
// Motion off — same three parts, at once, nothing animating.
// ---------------------------------------------------------------------
console.log('\n=== reduce motion ===');
const rmCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const rm = await rmCtx.newPage();
rm.on('pageerror', (e) => issues.push(`reduced pageerror: ${e.message}`));
rm.on('console', (m) => {
  if (m.type() === 'error') issues.push(`reduced console: ${m.text()}`);
});
await login(rm, BASE_URL, ACCOUNTS.memberPopulated);
await rm.waitForFunction(
  () =>
    !!(
      document.querySelector('[role="dialog"]') ||
      [...document.querySelectorAll('section')].find((s) =>
        s.innerText.toLowerCase().includes('your priority today')
      )
    ),
  { timeout: 30000 }
);

const rmSample = await sample(rm);
ok(!!rmSample?.yesterday, "yesterday's completed priority is rendered");
ok(!!rmSample?.bridgeLine, 'the bridge line is rendered');
ok(!!rmSample?.today, "today's priority is rendered");
ok(
  !!rmSample?.buttons.some((b) => /done/i.test(b)),
  'all three actions are immediately usable, with nothing to wait through'
);

const animating = await rm.evaluate(() => {
  const root =
    document.querySelector('[role="dialog"]') ||
    [...document.querySelectorAll('section')].find((s) =>
      s.innerText.toLowerCase().includes('your priority today')
    );
  if (!root) return null;
  return [...root.querySelectorAll('.mef-reveal-step, .mef-fade-in, .mef-recede')].map(
    (el) => getComputedStyle(el).animationName
  );
});
ok(
  Array.isArray(animating) && animating.length > 0 && animating.every((n) => n === 'none'),
  `nothing animates at all (${(animating ?? []).join(', ') || 'no elements found'})`
);
await rm.screenshot({ path: `${SHOTS}/bridge-04-reduced-motion.png` });
await rmCtx.close();

// ---------------------------------------------------------------------
// Save for later — production could not be put into a state to show this,
// since its own card had already been resolved for the day. Runs LAST
// because it resolves this member's priority too, which every pass above
// needs still active.
// ---------------------------------------------------------------------
console.log('\n=== save for later ===');
const saveCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const save = await saveCtx.newPage();
save.on('pageerror', (e) => issues.push(`save pageerror: ${e.message}`));
await login(save, BASE_URL, ACCOUNTS.memberPopulated);
await save.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
await save.waitForTimeout(2500);

// Save for later, which production could not be put into a state to show:
// the card should settle DOWN into its lesser position, not blink out.
const savedClicked = await save.evaluate(() => {
  const root = [...document.querySelectorAll('section')].find((s) =>
    s.innerText.toLowerCase().includes('your priority today')
  );
  const btn = [...(root?.querySelectorAll('button') ?? [])].find(
    (b) => b.innerText.trim().toLowerCase() === 'save for later'
  );
  if (!btn) return false;
  btn.click();
  return true;
});
ok(savedClicked, 'Save for later is reachable on the dominant card');
await save.waitForTimeout(80);
const receding = await save.evaluate(() => {
  const root = [...document.querySelectorAll('section')].find((s) =>
    s.innerText.toLowerCase().includes('your priority today')
  );
  return !!root?.querySelector('.mef-recede');
});
ok(receding, 'the dominant card recedes first rather than vanishing');
await save.waitForTimeout(1200);
const settled = await save.evaluate(() => {
  const sections = [...document.querySelectorAll('section')];
  const card = sections.find((s) => s.innerText.toLowerCase().includes('your priority today'));
  if (!card) return null;
  return {
    text: card.innerText.toLowerCase(),
    settles: card.className.includes('mef-settle-down'),
    animation: getComputedStyle(card).animationName,
  };
});
ok(!!settled?.text.includes('saved for later'), 'it becomes the collapsed, still-available card');
ok(!!settled?.settles, 'carrying the settle-down class');
ok(
  settled?.animation === 'mef-settle-down',
  `and the browser really runs that animation (${settled?.animation})`
);
await save.screenshot({ path: `${SHOTS}/bridge-05-saved-settle.png` });


await saveCtx.close();

await browser.close();
console.log('');
console.log(issues.length ? `ISSUES (${issues.length}):` : 'All checks passed, no console or page errors.');
for (const issue of issues) console.log(` - ${issue}`);
process.exitCode = issues.length ? 1 : 0;
