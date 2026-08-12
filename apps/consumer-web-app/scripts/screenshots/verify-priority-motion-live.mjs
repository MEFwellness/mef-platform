#!/usr/bin/env node
// Live verification for the Priority Card's MOTION PASS (Part 2).
//
// Part 1's scripts (verify-priority-card-live.mjs, and the pop-up's) already
// prove the card's behavior end to end, and this deliberately does not
// repeat them. What it checks is the thing a behavior test cannot see: that
// each state change is expressed by real motion, in the right order, in
// every surface, and that turning motion OFF leaves the card completely
// usable.
//
// Everything below is read from the live DOM and computed styles rather
// than inferred: an animation-delay that is actually applied, a
// grid-template-rows that actually changes, an animation-name that is
// actually 'none' under reduced motion.
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-priority-motion-live.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const SHOTS = '../../docs/screens/priority-motion';
const issues = [];
const lines = [];

function log(s = '') {
  lines.push(s);
  console.log(s);
}

function attach(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => issues.push(`${label}: pageerror ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) issues.push(`${label}: http${r.status()} ${r.url()}`);
  });
}

const LABEL = 'your priority today';

/**
 * The card's staged entrance, as the browser actually computed it: every
 * `.mef-reveal-step` inside the card, in DOM order, with its real
 * animation-delay and animation-name.
 */
async function readEntrance(page, scope) {
  return page.evaluate(
    ({ scope, label }) => {
      const root =
        scope === 'dialog'
          ? document.querySelector('[role="dialog"]')
          : [...document.querySelectorAll('section')].find((s) =>
              s.innerText.toLowerCase().includes(label)
            );
      if (!root) return null;
      const steps = [...root.querySelectorAll('.mef-reveal-step')].map((el) => {
        const cs = getComputedStyle(el);
        return {
          text: el.innerText.trim().slice(0, 40),
          delayMs: Math.round(parseFloat(cs.animationDelay) * 1000),
          name: cs.animationName,
          durationMs: Math.round(parseFloat(cs.animationDuration) * 1000),
        };
      });
      return { steps, hasCard: true };
    },
    { scope, label: LABEL }
  );
}

/** The Help me panel's real collapsed/expanded geometry. */
async function readHelp(page, scope) {
  return page.evaluate(
    ({ scope, label }) => {
      const root =
        scope === 'dialog'
          ? document.querySelector('[role="dialog"]')
          : [...document.querySelectorAll('section')].find((s) =>
              s.innerText.toLowerCase().includes(label)
            );
      if (!root) return null;
      const panel = root.querySelector('.mef-expand');
      if (!panel) return null;
      const cs = getComputedStyle(panel);
      return {
        open: panel.classList.contains('mef-expand-open'),
        rows: cs.gridTemplateRows,
        opacity: cs.opacity,
        transition: cs.transitionProperty,
        height: Math.round(panel.getBoundingClientRect().height),
        ariaHidden: panel.getAttribute('aria-hidden'),
      };
    },
    { scope, label: LABEL }
  );
}

async function readCard(page) {
  return page.evaluate((label) => {
    const sections = [...document.querySelectorAll('section')];
    const card = sections.find((s) => s.innerText.toLowerCase().includes(label));
    if (!card) return null;
    return {
      text: card.innerText,
      classes: card.className,
      index: sections.indexOf(card),
      total: sections.length,
      hasDrawnCheck: !!card.querySelector('.mef-close-check-draw'),
    };
  }, LABEL);
}

async function clickIn(page, scope, name) {
  return page.evaluate(
    ({ scope, name, label }) => {
      const root =
        scope === 'dialog'
          ? document.querySelector('[role="dialog"]')
          : [...document.querySelectorAll('section')].find((s) =>
              s.innerText.toLowerCase().includes(label)
            );
      if (!root) return false;
      const btn = [...root.querySelectorAll('button')].find(
        (b) => b.innerText.trim().toLowerCase() === name.toLowerCase()
      );
      if (!btn) return false;
      btn.click();
      return true;
    },
    { scope, name, label: LABEL }
  );
}

async function dismissPopup(page) {
  // Any pop-up in the chain owns the screen; get past it so the inline
  // card is reachable. The Priority Card pop-up's own close is one of its
  // buttons, and it has already marked itself dismissed on mount.
  for (let i = 0; i < 3; i++) {
    const has = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    if (!has) return;
    const clicked = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const names = ['close', 'save for later', 'maybe later', 'not now', 'ignore'];
      const btn = [...d.querySelectorAll('button')].find((b) =>
        names.includes(b.innerText.trim().toLowerCase())
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) return;
    await page.waitForTimeout(2000);
  }
}

function ok(cond, msg) {
  log(`   ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) issues.push(`assert: ${msg}`);
  return cond;
}

async function run(browser, account, key, action) {
  log('');
  log(`=== ${key} ===`);

  // ---------------------------------------------------------------
  // 1. MOTION ON — the pop-up on open, then the inline card.
  // ---------------------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  attach(page, key);
  await login(page, BASE_URL, account);
  await page.waitForTimeout(3500);

  const hasDialog = await page.evaluate(
    (l) => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.innerText.toLowerCase().includes(l) : false;
    },
    LABEL
  );

  let scope = 'inline';
  if (hasDialog) {
    scope = 'dialog';
    log(' -- pop-up presentation --');
  } else {
    log(' -- no priority pop-up this run; inline presentation --');
    await dismissPopup(page);
    await page.waitForTimeout(1500);
  }

  // Entrance staging.
  const entrance = await readEntrance(page, scope);
  if (entrance && entrance.steps.length) {
    const delays = entrance.steps.map((s) => s.delayMs);
    log(`   stages: ${entrance.steps.map((s) => `${s.delayMs}ms "${s.text}"`).join(' | ')}`);
    ok(
      entrance.steps.every((s) => s.name === 'mef-fade-up'),
      'every stage animates with the fade-up keyframe (no bounce/pop)'
    );
    ok(
      delays.every((d, i) => i === 0 || d >= delays[i - 1]),
      'stages are in ascending delay order down the card (label, priority, reason, buttons)'
    );
    ok(delays[0] === 0, 'the first stage starts immediately');
    ok(
      Math.max(...delays) + Math.max(...entrance.steps.map((s) => s.durationMs)) <= 500,
      'the whole entrance lands within 500ms'
    );
  } else {
    ok(false, 'found a priority card with staged entrance elements');
  }
  await page.screenshot({ path: `${SHOTS}/${key}-01-entrance.png` });

  // Help me: expand and collapse in place.
  const helpClosed = await readHelp(page, scope);
  const helpClicked = await clickIn(page, scope, 'Help me');
  await page.waitForTimeout(700);
  const helpOpen = await readHelp(page, scope);
  const urlAfterHelp = page.url();
  await page.screenshot({ path: `${SHOTS}/${key}-02-help-open.png` });

  if (helpClicked && helpClosed && helpOpen) {
    ok(helpClosed.rows.startsWith('0'), 'the help panel is genuinely collapsed to zero height first');
    ok(helpOpen.height > helpClosed.height, `the panel expands in place (${helpClosed.height}px -> ${helpOpen.height}px)`);
    ok(
      helpClosed.transition.includes('grid-template-rows'),
      'the height itself is transitioned, so content below eases out of the way'
    );
    ok(helpClosed.ariaHidden === 'true' && helpOpen.ariaHidden === 'false', 'the collapsed panel is hidden from assistive tech');
  } else {
    ok(false, 'Help me is present and expands');
  }

  await clickIn(page, scope, 'Help me');
  await page.waitForTimeout(700);
  const helpReclosed = await readHelp(page, scope);
  ok(helpReclosed ? helpReclosed.height <= (helpClosed?.height ?? 0) + 2 : false, 'and collapses smoothly back to nothing');

  // ---------------------------------------------------------------
  // 2. The adaptation sequence — is it live-testable today?
  // ---------------------------------------------------------------
  const bridge = await page.evaluate(
    ({ scope, label }) => {
      const root =
        scope === 'dialog'
          ? document.querySelector('[role="dialog"]')
          : [...document.querySelectorAll('section')].find((s) =>
              s.innerText.toLowerCase().includes(label)
            );
      return root ? root.innerText.includes('Building on yesterday') : false;
    },
    { scope, label: LABEL }
  );
  log(`   bridge on screen this run: ${bridge ? 'YES' : 'no (trigger conditions not met by today\'s data)'}`);

  // ---------------------------------------------------------------
  // 3. The state change itself: Done, or Save for later.
  // ---------------------------------------------------------------
  if (action === 'done') {
    const doneClicked = await clickIn(page, scope, 'Done');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${key}-03-done-transition.png` });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/${key}-04-done-resolved.png` });

    if (scope === 'dialog') {
      const drew = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        return d ? !!d.querySelector('.mef-close-check-draw') : false;
      });
      ok(doneClicked && drew, 'Done in the pop-up resolves to a checkmark that draws itself');
      await dismissPopup(page);
      await page.waitForTimeout(1500);
    } else {
      const card = await readCard(page);
      ok(doneClicked && !!card?.hasDrawnCheck, 'Done resolves to a checkmark that draws itself');
    }

    await page.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const todayAfterDone = await readCard(page);
    ok(
      !!todayAfterDone && /done today/i.test(todayAfterDone.text),
      'Today still shows the accomplished state after a full reload'
    );
    await page.screenshot({ path: `${SHOTS}/${key}-05-today-after-done.png` });
  } else {
    const savedClicked = await clickIn(page, scope, 'Save for later');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${key}-03-save-transition.png` });
    await page.waitForTimeout(2500);

    if (scope === 'dialog') {
      await dismissPopup(page);
      await page.waitForTimeout(1500);
      await page.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
    }
    const settled = await readCard(page);
    await page.screenshot({ path: `${SHOTS}/${key}-04-saved-settled.png` });
    ok(savedClicked, 'Save for later is reachable');
    ok(
      !!settled && /saved for later/i.test(settled.text),
      'the card settles into its collapsed, still-available form'
    );
    ok(
      !!settled && settled.classes.includes('mef-settle-down'),
      'and arrives from above with the settle-down motion rather than appearing already there'
    );

    await page.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const lower = await readCard(page);
    ok(
      !!lower && lower.index > 0,
      `on reload it sits lower down Today rather than in the dominant slot (position ${lower?.index} of ${lower?.total})`
    );
    await page.screenshot({ path: `${SHOTS}/${key}-05-today-saved-lower.png` });
  }

  await ctx.close();

  // ---------------------------------------------------------------
  // 4. MOTION OFF — everything must still work, instantly.
  // ---------------------------------------------------------------
  const rmCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const rm = await rmCtx.newPage();
  attach(rm, `${key}/reduced`);
  await login(rm, BASE_URL, account);
  await rm.waitForTimeout(3000);
  await dismissPopup(rm);
  await rm.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
  await rm.waitForTimeout(3000);

  log(' -- reduce-motion --');
  const rmEntrance = await readEntrance(rm, 'inline');
  if (rmEntrance && rmEntrance.steps.length) {
    ok(
      rmEntrance.steps.every((s) => s.name === 'none'),
      'the staged entrance animates nothing at all'
    );
  }
  const rmCard = await readCard(rm);
  ok(!!rmCard, 'the card is fully present and readable with motion off');

  const rmHelpClosed = await readHelp(rm, 'inline');
  await clickIn(rm, 'inline', 'Help me');
  await rm.waitForTimeout(400);
  const rmHelpOpen = await readHelp(rm, 'inline');
  if (rmHelpClosed && rmHelpOpen) {
    ok(rmHelpOpen.height > rmHelpClosed.height, 'Help me still reveals its content, instantly');
    ok(rmHelpClosed.transition === 'none' || !rmHelpClosed.transition.includes('grid-template-rows'), 'and does so with no transition');
  }
  await rm.screenshot({ path: `${SHOTS}/${key}-06-reduced-motion.png` });

  await rmCtx.close();
}

const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });
log(`Priority Card motion pass — live verification against ${BASE_URL}`);

// memberBelowThreshold has no entry in ACCOUNTS (the shared config only
// covers the three the screenshot tool drives); its credentials live in
// the same .env.local, per docs/PRODUCTION_TEST_ACCOUNTS.md.
const PLAN = [
  ['memberEmpty', ACCOUNTS.memberEmpty, 'done'],
  [
    'memberBelowThreshold',
    {
      email: process.env.MEMBER_BELOW_THRESHOLD_EMAIL,
      password: process.env.MEMBER_BELOW_THRESHOLD_PASSWORD,
    },
    'save',
  ],
  ['memberPopulated', ACCOUNTS.memberPopulated, 'done'],
];

for (const [key, account, action] of PLAN) {
  if (!account?.email || !account?.password) {
    log(`\n=== ${key} === (no credentials configured, skipped)`);
    continue;
  }
  try {
    await run(browser, account, key, action);
  } catch (error) {
    log(`   ERROR ${error.message}`);
    issues.push(`${key}: ${error.message}`);
  }
}

await browser.close();

log('');
log(issues.length ? `ISSUES (${issues.length}):` : 'No console errors, page errors, 5xx responses, or failed assertions.');
for (const issue of issues) log(` - ${issue}`);
process.exitCode = issues.length ? 1 : 0;
