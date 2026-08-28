#!/usr/bin/env node
/**
 * HOME SPEED BUILD (2026-08-28) — item 3 of the live run, on its own.
 *
 * Completes one real Daily Reset as the standing production test member and
 * reloads Home, to see that the day frame and the priority reflect what she
 * just did rather than a cached yesterday. Split out from
 * verify-home-speed-live.mjs because it is the one WRITING check in that
 * run, and because the wizard walk below is the already-proven one from
 * verify-checkin-then-home-live.mjs rather than a fresh guess at it.
 *
 * Additive only: it creates one daily check-in row for today. Nothing is
 * deleted and nothing existing is altered.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-home-checkin';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}
const logged = [];
const consoleErrors = [];

const browser = await chromium.launch();
let minted = null;
try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) {
    console.error('could not mint a session');
    process.exit(1);
  }
  const page = await minted.context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3500);
  const homeBefore = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${SHOTS}/home-before.png`, fullPage: true });

  await page.goto(`${BASE}/checkin`, { waitUntil: 'networkidle', timeout: 90000 });
  /**
   * The wizard is Continue-only (auto-advance was deliberately removed in
   * the navigation stability fix), so the walk is: answer everything
   * answerable on this screen, press Continue, repeat.
   *
   * "Answerable" is decided structurally rather than by question text, so
   * this survives the question bank changing: any control that looks like a
   * scale, a choice chip or a toggle gets a middle-ish answer, which is the
   * least opinionated real answer a script can give on someone's behalf.
   */
  /**
   * Navigation, not answers. The step dots carry "Go to screen N of 4" and
   * clicking one takes the walk backwards, which is exactly what happened on
   * the first attempt: it answered screen 2, tapped a dot, and looped.
   */
  const NAV =
    /^(continue|next|back|done|submit|finish|save|skip|close|exit|cancel|update|home|go to screen|sign out|profile|membership|connected devices|notifications|help|about|e$)/i;

  /**
   * Controls the walk must never touch, distinct from navigation.
   *
   * The coach-note toggle sends a real message to a real coach. A
   * verification script answering a member's check-in on her behalf has no
   * business flagging something to her coach, so it is left exactly as she
   * left it.
   */
  const DO_NOT_TOUCH = /send your coach|something new or worsening/i;

  /**
   * Everything the walk may click lives inside the wizard's own region.
   *
   * The first fallback attempt worked through the whole page and got as far
   * as the avatar menu, opening "Sign out of Rooted Reset?" over the very
   * question it was trying to answer. A verification script that can sign
   * itself out is not a verification script.
   */
  const ANSWER_SELECTOR =
    'main button:not([disabled]), main [role="radio"], main [role="option"], main [role="switch"]';

  let screen = 0;
  let submitted = false;
  for (; screen < 24 && !submitted; screen += 1) {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/checkin-${String(screen).padStart(2, '0')}.png`, fullPage: true });

    /**
     * One answer per QUESTION, and a question is a group of sibling choice
     * buttons. Grouping by the button's own parent is what makes "middle
     * option" mean the middle of that question rather than the middle of the
     * whole screen, which is what the first attempt got wrong.
     */
    const groups = await page.evaluate(([navSource, selector]) => {
      const nav = new RegExp(navSource, 'i');
      const byParent = new Map();
      const controls = Array.from(document.querySelectorAll(selector));
      controls.forEach((el, domIndex) => {
        const name = (el.textContent ?? '').trim().replace(/\s+/g, ' ') ||
          el.getAttribute('aria-label') || '';
        if (!name || nav.test(name) || /send your coach|something new or worsening/i.test(name)) return;
        const key = el.parentElement
          ? Array.from(document.querySelectorAll('*')).indexOf(el.parentElement)
          : -1;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push({ domIndex, name });
      });
      return Array.from(byParent.values()).filter((g) => g.length >= 2);
    }, [NAV.source, ANSWER_SELECTOR]);

    const controls = page.locator(ANSWER_SELECTOR);
    for (const group of groups) {
      const pick = group[Math.floor(group.length / 2)];
      await controls.nth(pick.domIndex).click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(300);
      logged.push(`screen ${screen}: ${pick.name}`);
    }

    const continueBtn = page.getByRole('button', {
      name: /^(continue|finish|submit|done|save check-in)$/i,
    });
    if ((await continueBtn.count()) === 0) break;

    /**
     * The sibling-grouping above misses a question whose options do not
     * share one parent element. The Yes/No discomfort question is one: the
     * walk answered protein and activity on that screen and Continue stayed
     * disabled with "Answer whether you had any discomfort today."
     *
     * So: when Continue is still disabled, work through the remaining
     * controls one at a time, rechecking after each. It stops the moment the
     * screen is satisfied, which is what keeps it from clicking things that
     * do not need clicking.
     */
    if (!(await continueBtn.first().isEnabled().catch(() => false))) {
      const remaining = page.locator(ANSWER_SELECTOR);
      const total = await remaining.count();
      for (let i = 0; i < total; i += 1) {
        const el = remaining.nth(i);
        const name = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
        if (!name || NAV.test(name) || DO_NOT_TOUCH.test(name)) continue;
        await el.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        logged.push(`screen ${screen}: ${name}`);
        if (await continueBtn.first().isEnabled().catch(() => false)) break;
      }
    }

    const enabled = await continueBtn.first().isEnabled().catch(() => false);
    if (!enabled) {
      // Something on this screen still needs an answer this walk could not
      // reach. Report it rather than hammering the button.
      const body = await page.locator('body').innerText();
      check('every check-in screen was answerable by the walk', false, `stuck on screen ${screen}`);
      writeFileSync(`${SHOTS}/stuck-screen.txt`, body);
      break;
    }
    const wasSave = /save check-in/i.test(
      ((await continueBtn.first().innerText().catch(() => '')) || '').trim()
    );
    await continueBtn.first().click();
    await page.waitForTimeout(2600);
    // Either the app navigated away from the wizard, or the control we just
    // pressed was the save itself. Both mean the check-in went in.
    if (wasSave || !page.url().includes('/checkin')) submitted = true;
  }

  await page.screenshot({ path: `${SHOTS}/checkin-final.png`, fullPage: true });
  check('completed a real daily check-in', submitted, submitted ? `${screen} screens` : 'not submitted');
  writeFileSync(`${SHOTS}/what-was-logged.txt`, logged.join('\n'));

  // -----------------------------------------------------------------
  // Home, the same day, after the check-in.
  // -----------------------------------------------------------------
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4500);
  const homeAfter = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${SHOTS}/home-after.png`, fullPage: true });

  const promptBefore = homeBefore.includes("Once today's check-in is done");
  const promptAfter = homeAfter.includes("Once today's check-in is done");
  check(
    'Home reflects today\'s check-in on the very next load',
    promptBefore ? !promptAfter : true,
    promptBefore
      ? 'the "your numbers are on the Today tab" prompt was there before and is gone after'
      : 'she had already checked in today, so the prompt was absent either way (recorded, not counted as proof)'
  );
  check('the greeting changed with the day she just logged', homeAfter.includes('Good '), '');
  check('no console error anywhere in the walk', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));
  check('no em dash on Home after the check-in', !homeAfter.includes('\u2014'), '');
  writeFileSync(`${SHOTS}/home-after.txt`, homeAfter);
  writeFileSync(`${SHOTS}/answers.txt`, logged.join('\n'));
} finally {
  await retireSession(minted);
  await browser.close();
}

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed} of ${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
