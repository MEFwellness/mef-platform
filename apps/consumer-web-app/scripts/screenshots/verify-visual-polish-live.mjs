#!/usr/bin/env node
/**
 * Live verification for the visual polish pass (2026-08-19), against
 * app.mefwellness.com as the real test member.
 *
 * It walks Home, Food Lens, Daily Reset, Progress, Today and Movement, and
 * for each fix it checks the thing the fix was about, in the live DOM,
 * rather than eyeballing a screenshot and hoping. Screenshots are saved
 * alongside so the run can be looked at afterwards.
 *
 * READ-ONLY. Nothing is submitted, no answer is chosen, no button that
 * records a decision is pressed. The check-in is opened and looked at, not
 * filled in. Root's pop-ups are measured where they are and never
 * dismissed, because "Maybe later" and "Ignore" write a real decision down
 * on a real member's behalf.
 *
 * Sign-in is the standing method: a one-time session minted with the
 * production service-role key and retired immediately afterwards with
 * scope 'local'. Turnstile is live on the login form and refusing a
 * scripted form sign-in is exactly its job.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mintSessionContext, retireSession, canMintSessions } from '../lib/mint-session.mjs';

const BASE = process.env.LIVE_BASE_URL || 'https://app.mefwellness.com';
const EMAIL = process.env.TEST_MEMBER_EMAIL;
const SHOTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/screens/live-polish'
);
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Screenshot the page with any page-covering modal moved aside, same trick the capture tool uses. */
async function shoot(page, name) {
  const suppressed = await page.evaluate(() => {
    const covering = [...document.querySelectorAll('body *')].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.pointerEvents === 'none') return false;
      const z = Number.parseInt(cs.zIndex, 10);
      if (!Number.isFinite(z) || z < 10) return false;
      const r = el.getBoundingClientRect();
      return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
    });
    if (!covering.length) return false;
    const body = document.body;
    const html = document.documentElement;
    window.__saved = {
      body: body.getAttribute('style'),
      html: html.getAttribute('style'),
      els: covering.map((el) => ({ el, s: el.getAttribute('style') })),
    };
    for (const el of covering) el.style.display = 'none';
    body.style.position = 'static';
    body.style.top = 'auto';
    body.style.width = 'auto';
    body.style.overflow = 'visible';
    html.style.overflow = 'visible';
    return true;
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  if (suppressed) {
    await page.evaluate(() => {
      const s = window.__saved;
      if (!s) return;
      for (const { el, s: style } of s.els)
        style === null ? el.removeAttribute('style') : el.setAttribute('style', style);
      s.body === null
        ? document.body.removeAttribute('style')
        : document.body.setAttribute('style', s.body);
      s.html === null
        ? document.documentElement.removeAttribute('style')
        : document.documentElement.setAttribute('style', s.html);
    });
  }
  return suppressed;
}

/** Every colour actually painted on the page, so "is the generic green gone" is a measurement. */
async function paintedColors(page) {
  return page.evaluate(() => {
    const out = new Set();
    for (const el of document.querySelectorAll('main *, nav *')) {
      const cs = getComputedStyle(el);
      out.add(cs.color);
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') out.add(cs.backgroundColor);
    }
    return [...out];
  });
}

async function go(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
}

async function main() {
  if (!canMintSessions()) throw new Error('Minting env not set (PROD_SUPABASE_URL / *_KEY_FILE).');
  if (!EMAIL) throw new Error('TEST_MEMBER_EMAIL not set.');

  const browser = await chromium.launch();
  let minted = null;
  try {
    minted = await mintSessionContext(browser, EMAIL, {
      baseUrl: BASE,
      viewport: { width: 390, height: 844 },
    });
    if (!minted) throw new Error('Could not mint a session for the test member.');

    // generateLink creates the account if the address is wrong, so assert
    // we are the member we meant to be before touching anything.
    check(
      'signed in as the intended test member',
      minted.session.user.email === EMAIL,
      minted.session.user.email
    );

    const page = await minted.context.newPage();
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // ---------- Home ----------
    await go(page, '/dashboard');
    const hadModal = await shoot(page, 'home');
    check('Home loads as a member', /dashboard|^\/$/.test(new URL(page.url()).pathname), page.url());

    // The RevealOnScroll fix: after scrolling to the bottom in one jump,
    // no reveal wrapper may still be sitting at opacity 0.
    const hidden = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve(
              [...document.querySelectorAll('main .transition-all.duration-700')].filter(
                (el) => Number.parseFloat(getComputedStyle(el).opacity) < 0.99
              ).length
            ),
          1500
        )
      );
    });
    check('Home: no zone left invisible after jumping to the bottom', hidden === 0, `${hidden} hidden`);

    // The nav pill: capped, not a slab across half the bar.
    const pill = await page.evaluate(() => {
      const link = document.querySelector('nav[aria-label="Primary"] a[aria-current="page"]');
      if (!link) return null;
      const span = link.querySelector('span');
      return {
        pill: Math.round(span.getBoundingClientRect().width),
        cell: Math.round(link.getBoundingClientRect().width),
        bg: getComputedStyle(span).backgroundColor,
      };
    });
    check(
      'nav: the selected tab is a capped pill, not a half-bar slab',
      pill !== null && pill.pill <= 76,
      pill ? `pill ${pill.pill}px inside a ${pill.cell}px cell, ${pill.bg}` : 'no active tab found'
    );

    // Decorative accents are blurred glows, not hard discs.
    const discs = await page.evaluate(
      () =>
        [...document.querySelectorAll('main div.pointer-events-none.absolute.rounded-full')].filter(
          (el) => {
            const r = el.getBoundingClientRect();
            return r.width >= 120 && getComputedStyle(el).filter === 'none';
          }
        ).length
    );
    check('Home: no large hard-edged decorative disc over content', discs === 0, `${discs} found`);

    if (hadModal) console.log('note: a Root pop-up was open on Home and was left exactly as found.');

    // ---------- Today ----------
    await go(page, '/today');
    await shoot(page, 'today');
    const colors = await paintedColors(page);
    const genericGreens = colors.filter((c) =>
      ['rgb(21, 128, 61)', 'rgb(22, 163, 74)', 'rgb(34, 197, 94)'].includes(c)
    );
    check(
      "Today: Tailwind's default greens are gone from the numbers",
      genericGreens.length === 0,
      genericGreens.join(', ') || 'none painted'
    );

    // Today's Numbers only exists once she has checked in today, so the
    // brand-green assertion has to be conditional on the grid being there
    // at all. Asserting it unconditionally reported a failure on a
    // perfectly healthy screen that simply had nothing to show yet.
    const hasNumbersGrid = await page.evaluate(() =>
      Boolean([...document.querySelectorAll('p')].find((p) => p.textContent.trim() === "Today's Numbers"))
    );
    const brandGreen = colors.some((c) => c === 'rgb(47, 107, 79)' || c === 'rgb(60, 127, 94)');
    check(
      'Today: the brand status green is painted instead',
      !hasNumbersGrid || brandGreen,
      hasNumbersGrid ? '' : "no check-in logged today, so Today's Numbers is not on screen"
    );

    const digestionSpans = await page.evaluate(() => {
      const label = [...document.querySelectorAll('p')].find(
        (p) => p.textContent.trim() === 'Digestion'
      );
      if (!label) return null;
      const tile = label.closest('.mef-card');
      const grid = tile?.parentElement;
      if (!tile || !grid) return null;
      return Math.round(tile.getBoundingClientRect().width / grid.getBoundingClientRect().width);
    });
    check(
      'Today: the odd fifth tile spans the row instead of sitting beside a hole',
      digestionSpans === null || digestionSpans === 1,
      digestionSpans === null
        ? "no check-in logged today, so the tile is not on screen"
        : `ratio ${digestionSpans}`
    );

    // ---------- Progress ----------
    await go(page, '/progress');
    await shoot(page, 'progress');
    const history = await page.evaluate(() => {
      const h = [...document.querySelectorAll('p')].find(
        (p) => p.textContent.trim().toLowerCase() === 'history'
      );
      const section = h?.closest('section');
      if (!section) return null;
      return {
        card: section.className.includes('mef-card'),
        bg: getComputedStyle(section).backgroundColor,
      };
    });
    check(
      'Progress: History sits in the same white card as every section above it',
      history === null || history.card === true,
      history === null ? 'History not shown in this state' : `${history.bg}`
    );

    // ---------- Food Lens ----------
    await go(page, '/food-lens');
    const flOk = !/\/dashboard|\/login/.test(new URL(page.url()).pathname);
    if (flOk) {
      await shoot(page, 'food-lens');
      const tiles = await page.evaluate(() => {
        const wanted = ["Today's food log", 'Allergies & preferences', 'Pantry', 'Eating out'];
        const found = wanted
          .map((t) => [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === t))
          .filter(Boolean);
        if (found.length < 4) return null;
        const hs = found.map((a) => Math.round(a.getBoundingClientRect().height));
        return { hs, equal: new Set(hs).size === 1 };
      });
      check(
        'Food Lens: all four utility tiles are the same height',
        tiles === null || tiles.equal,
        tiles ? tiles.hs.join(' / ') : 'tiles not present in this state'
      );
    } else {
      check('Food Lens: reachable for this member', false, `redirected to ${page.url()}`);
    }

    // ---------- Movement ----------
    await go(page, '/movement');
    await shoot(page, 'movement');
    const weekly = await page.evaluate(() => {
      const label = [...document.querySelectorAll('p')].find(
        (p) => p.textContent.trim() === 'Weekly Goal'
      );
      const tile = label?.closest('div.rounded-\\[28px\\]') || label?.parentElement?.parentElement;
      if (!tile) return null;
      const bar = tile.querySelector('div.rounded-full.overflow-hidden, div.overflow-hidden');
      if (!bar) return null;
      const t = tile.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return { tileH: Math.round(t.height), gapBelow: Math.round(t.bottom - b.bottom) };
    });
    check(
      'Movement: the Weekly Goal card is no longer 172px of mostly nothing',
      weekly === null || weekly.tileH < 160,
      weekly ? `card ${weekly.tileH}px, ${weekly.gapBelow}px under the bar` : 'card not present'
    );

    // ---------- Daily Reset (opened, never answered) ----------
    await go(page, '/checkin');
    await shoot(page, 'checkin');
    const cta = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => x.textContent.trim() === 'Continue'
      );
      if (!b) return null;
      const cs = getComputedStyle(b);
      return { disabled: b.disabled, bg: cs.backgroundColor, color: cs.color };
    });
    check(
      'Daily Reset: the disabled Continue is a drawn pale pill, not a dimmed dark slab',
      cta === null || !cta.disabled || cta.bg !== 'rgb(27, 58, 45)',
      cta ? `disabled=${cta.disabled} bg=${cta.bg}` : 'no Continue on this screen'
    );

    check('no uncaught page error on any screen', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await retireSession(minted);
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed} of ${results.length} checks passed. Screenshots in ${SHOTS}`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
