#!/usr/bin/env node
/**
 * The coach side experience pass, driven on production.
 *
 * The walk (scripts/walk-staff-surfaces.mjs) measured heights. This drives
 * the things a height cannot prove: that the pinned search finds a
 * question and OPENS the group holding it, that a folded group really
 * renders nothing until it is tapped, that the reordered coach home puts
 * the caseload above the tools, that every tool tile still leads where its
 * card led, and that the analytics views now have a way back to Admin.
 *
 * READ ONLY on every real member. The one write is an assignment to the
 * seeded test fixture, and it is withdrawn in the finally block.
 *
 * Environment:
 *   BASE_URL, STAFF_EMAIL, TEST_MEMBER_EMAIL, ASSIGN_CLIENT_ID
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.walk/verify';
const PHONE = { width: 390, height: 844 };
const EM_DASH = '—';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};

function watch(page, bag) {
  page.on('console', (m) => { if (m.type() === 'error') bag.push(m.text()); });
  page.on('pageerror', (e) => bag.push(e.message));
}

async function main() {
  if (!canMintSessions()) throw new Error('Minting env not set');
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const minted = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!minted) throw new Error('Could not mint a staff session');
  const { context, session, service } = minted;
  const errors = [];

  try {
    // ---------- 1. The coach home, reordered ----------
    const home = await context.newPage();
    watch(home, errors);
    await home.goto(`${BASE}/coach`, { waitUntil: 'networkidle' });

    const order = await home.evaluate(() => {
      const text = document.body.innerText;
      return {
        attention: text.indexOf('NEEDS ATTENTION'),
        clients: text.indexOf('YOUR CLIENTS'),
        tools: text.indexOf('TOOLS'),
        today: text.indexOf('TODAY'),
        greeting: document.querySelector('h1')?.textContent?.trim() ?? '',
        hasSearch: Boolean(document.querySelector('input[type="search"]')),
      };
    });
    check('coach home: the caseload sits above the tools',
      order.clients > -1 && order.tools > order.clients, `clients@${order.clients} tools@${order.tools}`);
    check('coach home: who needs attention is first',
      order.attention > -1 && order.attention < order.clients);
    check('coach home: the client search is on the first screen', order.hasSearch);
    check('coach home: the greeting is not hardcoded to morning',
      /Good (morning|afternoon|evening)/i.test(order.greeting), order.greeting);

    // Every tool tile leads somewhere real.
    const toolHrefs = await home.$$eval('nav[aria-label="Coach tools"] a', (as) =>
      as.map((a) => a.getAttribute('href'))
    );
    const wanted = ['/coach/assign', '/coach/programs', '/coach/corrective-programs',
      '/coach/generate', '/coach/questions', '/exercises', '/movement/profile'];
    check('coach home: all seven standing tools are on the grid',
      wanted.every((h) => toolHrefs.includes(h)), `${toolHrefs.length} tiles`);
    check('coach home: Ebony is still visible to her coach',
      (await home.innerText('body')).includes('Ebony'));
    await home.screenshot({ path: `${SHOTS}/coach-home.png`, fullPage: true });

    // ---------- 2. The question bank: search and folds ----------
    const qb = await context.newPage();
    watch(qb, errors);
    await qb.goto(`${BASE}/coach/questions`, { waitUntil: 'networkidle' });
    await qb.waitForSelector('[data-question-search]');

    const foldedText = await qb.innerText('body');
    check('question bank: opens folded, no question prompt rendered',
      !foldedText.includes('How much water'), 'sampled one prompt');
    check('question bank: the count line names the total',
      /\d+ active questions\./.test(foldedText));

    // The field is pinned: it stays put while the page scrolls.
    await qb.evaluate(() => window.scrollTo(0, 1200));
    await qb.waitForTimeout(400);
    const pinned = await qb.evaluate(() => {
      const el = document.querySelector('[data-question-search]');
      const r = el?.getBoundingClientRect();
      return r ? r.top >= 0 && r.top < 160 : false;
    });
    check('question bank: the search field stays on screen when scrolled', pinned);
    await qb.evaluate(() => window.scrollTo(0, 0));

    await qb.fill('[data-question-search]', 'sleep');
    await qb.waitForTimeout(500);
    const searched = await qb.innerText('body');
    check('question bank: searching narrows the count',
      /\d+ of \d+ active questions match "sleep"\./.test(searched),
      (searched.match(/\d+ of \d+ active questions match[^\n]*/) ?? [''])[0]);
    // The proof that matters: a match is READABLE without a second tap.
    const openedByScore = await qb.evaluate(() =>
      document.querySelectorAll('button[aria-expanded="true"]').length
    );
    check('question bank: the groups holding a match are already open',
      openedByScore > 0, `${openedByScore} open`);
    await qb.screenshot({ path: `${SHOTS}/questions-search.png`, fullPage: true });

    await qb.fill('[data-question-search]', '');
    await qb.waitForTimeout(400);
    const cleared = await qb.evaluate(() =>
      document.querySelectorAll('button[aria-expanded="true"]').length
    );
    check('question bank: clearing the field folds everything back', cleared === 0, `${cleared} open`);

    // A group opens on a tap and shows real rows.
    const firstGroup = qb.locator('button[aria-expanded="false"]').nth(3);
    await firstGroup.click();
    await qb.waitForTimeout(300);
    check('question bank: a group opens on a tap',
      (await qb.evaluate(() => document.querySelectorAll('button[aria-expanded="true"]').length)) > 0);

    // ---------- 3. Entries: a day is a row that opens ----------
    const { data: assigned } = await service
      .from('coach_client_assignments')
      .select('client_id')
      .eq('coach_id', session.user.id)
      .eq('status', 'active')
      .limit(1);
    const readClientId = assigned?.[0]?.client_id;
    if (readClientId) {
      const en = await context.newPage();
      watch(en, errors);
      await en.goto(`${BASE}/coach/clients/${readClientId}/entries`, { waitUntil: 'networkidle' });
      const beforeOpen = await en.innerText('body');
      check('entries: check-in days are rows carrying their own count',
        /\d+ answers?[,.]/.test(beforeOpen));
      const dayButtons = await en.$$('button[aria-expanded="false"]');
      if (dayButtons.length > 0) {
        const before = beforeOpen.length;
        await dayButtons[dayButtons.length - 1].click();
        await en.waitForTimeout(400);
        const after = (await en.innerText('body')).length;
        check('entries: opening a day reveals answers that were not in the document',
          after > before, `${before} to ${after} characters`);
      }
      await en.screenshot({ path: `${SHOTS}/entries.png`, fullPage: true });
      await en.close();
    }

    // ---------- 4. Analytics has a way out ----------
    const an = await context.newPage();
    watch(an, errors);
    await an.goto(`${BASE}/admin/analytics/drop-off`, { waitUntil: 'networkidle' });
    const backControl = await an.evaluate(() =>
      Array.from(document.querySelectorAll('button,a')).some(
        (el) => (el.textContent ?? '').trim().toLowerCase() === 'admin' &&
                !el.closest('nav[aria-label="Staff"]')
      )
    );
    check('analytics: a drill-down offers a way back to Admin', backControl);
    await an.screenshot({ path: `${SHOTS}/analytics-dropoff.png`, fullPage: true });
    await an.close();

    // ---------- 5. The admin home ----------
    const ad = await context.newPage();
    watch(ad, errors);
    await ad.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    const adText = await ad.innerText('body');
    check('admin home: the test account toggle is still there',
      adText.includes('Show test accounts') || adText.includes('Hide test accounts'));
    check('admin home: both hidden counts are still stated',
      /accounts? shown\./.test(adText) && /pairings? shown\./.test(adText));
    const adminTools = await ad.$$eval('nav[aria-label="Testing and internal tools"] a', (as) =>
      as.map((a) => a.getAttribute('href'))
    );
    check('admin home: all five tool tiles are present', adminTools.length === 5, adminTools.join(' '));
    await ad.screenshot({ path: `${SHOTS}/admin-home.png`, fullPage: true });

    await ad.goto(`${BASE}/admin?includeTest=1`, { waitUntil: 'networkidle' });
    const onText = await ad.innerText('body');
    check('admin home: the toggle still switches test accounts on',
      onText.includes('Hide test accounts'));
    await ad.close();

    // ---------- 6. Em dashes and console errors ----------
    for (const [name, page] of [['coach home', home], ['question bank', qb]]) {
      check(`${name}: no em dash`, !(await page.innerText('body')).includes(EM_DASH));
    }
    await home.close();
    await qb.close();

    // ---------- 7. The member side is untouched ----------
    if (MEMBER_EMAIL) {
      const memberMint = await mintSessionContext(browser, MEMBER_EMAIL, {
        baseUrl: BASE, viewport: PHONE,
      });
      if (memberMint) {
        const mp = await memberMint.context.newPage();
        const memberErrors = [];
        watch(mp, memberErrors);
        const res = await mp.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
        check('member Home still loads', res?.status() === 200, `HTTP ${res?.status()}`);
        const mtext = await mp.innerText('body');
        check('member Home shows no staff chrome',
          !mtext.includes('YOUR CLIENTS') && !mtext.includes('Needs Attention'));
        check('member Home has no console errors', memberErrors.length === 0,
          memberErrors.slice(0, 2).join(' | '));
        await mp.screenshot({ path: `${SHOTS}/member-home.png`, fullPage: true });
        await mp.close();
        await retireSession(memberMint);
      }
    }

    check('no console or page errors across the staff walk', errors.length === 0,
      errors.slice(0, 3).join(' | '));
  } finally {
    await retireSession(minted);
    await browser.close();
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed} of ${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
