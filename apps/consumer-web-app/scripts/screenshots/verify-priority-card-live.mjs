#!/usr/bin/env node
// Live verification for the Priority Card (Part 1) against production,
// across the seeded member states in docs/PRODUCTION_TEST_ACCOUNTS.md.
// Same shape as verify-root-presence-live.mjs.
//
// Drives the real member journey: reads the card, taps all three buttons
// across the accounts, and reports what each account actually saw. The
// analytics events each tap produced are checked separately, by querying
// production directly after this script runs.
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-priority-card-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const consoleIssues = [];

function attachListeners(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error')
      consoleIssues.push({ label, type: 'console.error', text: msg.text(), url: page.url() });
  });
  page.on('pageerror', (err) =>
    consoleIssues.push({ label, type: 'pageerror', text: err.message, url: page.url() })
  );
  page.on('response', (res) => {
    if (res.status() >= 500)
      consoleIssues.push({ label, type: `http${res.status()}`, text: res.url(), url: page.url() });
  });
}

const LABEL = 'Your priority today';

/** Pulls the card's own text block out of the page, plus which buttons are present. */
async function readCard(page) {
  return page.evaluate((label) => {
    const sections = [...document.querySelectorAll('section')];
    const card = sections.find((s) => s.innerText.toLowerCase().includes(label.toLowerCase()));
    if (!card) return null;
    const buttons = [...card.querySelectorAll('button')].map((b) => b.innerText.trim());
    return {
      text: card.innerText,
      buttons,
      index: sections.indexOf(card),
      totalSections: sections.length,
    };
  }, LABEL);
}

async function goToToday(page, label) {
  const before = consoleIssues.length;
  await page.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const issues = consoleIssues.slice(before);
  if (issues.length) console.log(`  ! errors: ${JSON.stringify(issues.map((i) => i.text).slice(0, 3))}`);
  const bodyText = await page.evaluate(() => document.body.innerText);
  return { bodyText, card: await readCard(page) };
}

function report(label, card, bodyText) {
  console.log(`\n=== ${label} ===`);
  if (!card) {
    console.log('  NO PRIORITY CARD RENDERED');
    return;
  }
  console.log('  card present: yes');
  console.log(`  position: section ${card.index + 1} of ${card.totalSections} (1 = first)`);
  console.log(`  buttons: ${JSON.stringify(card.buttons)}`);
  console.log('  --- card text ---');
  for (const line of card.text.split('\n').filter(Boolean)) console.log(`  | ${line}`);
  console.log('  -----------------');
  console.log(`  em dash in card: ${card.text.includes('—')}`);
  console.log(
    `  card count on page (must be 1): ${bodyText.toLowerCase().split(LABEL.toLowerCase()).length - 1}`
  );
}

async function clickInCard(page, name) {
  const clicked = await page.evaluate(
    ({ label, name }) => {
      const card = [...document.querySelectorAll('section')].find((s) =>
        s.innerText.toLowerCase().includes(label.toLowerCase())
      );
      if (!card) return false;
      const btn = [...card.querySelectorAll('button')].find(
        (b) => b.innerText.trim().toLowerCase() === name.toLowerCase()
      );
      if (!btn) return false;
      btn.click();
      return true;
    },
    { label: LABEL, name }
  );
  await page.waitForTimeout(2500);
  return clicked;
}

async function run(label, account, actions) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  attachListeners(page, label);
  await login(page, BASE_URL, account);

  const { bodyText, card } = await goToToday(page, label);
  report(label, card, bodyText);

  await actions({ page, card, bodyText });

  await context.close();
  await browser.close();
}

async function main() {
  console.log(`Verifying the Priority Card against ${BASE_URL}`);

  // ---- memberPopulated: fully-active member. Taps Help me, then Done. ----
  await run('memberPopulated', ACCOUNTS.memberPopulated, async ({ page }) => {
    console.log('\n  > tapping "Help me"');
    console.log(`  clicked: ${await clickInCard(page, 'Help me')}`);
    const afterHelp = await readCard(page);
    console.log(`  still on /today (no navigation): ${page.url().endsWith('/today')}`);
    console.log(`  card grew in place: ${afterHelp && afterHelp.text.length > 0}`);
    console.log('  --- expanded card ---');
    for (const line of (afterHelp?.text ?? '').split('\n').filter(Boolean)) console.log(`  | ${line}`);

    console.log('\n  > tapping "Done"');
    console.log(`  clicked: ${await clickInCard(page, 'Done')}`);
    const done = await goToToday(page, 'memberPopulated after Done');
    console.log('  --- card after reload ---');
    for (const line of (done.card?.text ?? 'NO CARD').split('\n').filter(Boolean))
      console.log(`  | ${line}`);
    console.log(`  accomplished state persisted: ${/done today/i.test(done.card?.text ?? '')}`);
  });

  // ---- memberBelowThreshold: the 14-day-gap account, re-entry override. Taps Save for later. ----
  await run(
    'memberBelowThreshold (14-day gap)',
    {
      email: process.env.MEMBER_BELOW_THRESHOLD_EMAIL,
      password: process.env.MEMBER_BELOW_THRESHOLD_PASSWORD,
    },
    async ({ page, card }) => {
      console.log(`\n  re-entry welcome present: ${/glad you'?re back/i.test(card?.text ?? '')}`);
      console.log(
        `  no guilt language: ${!/missed|streak|overdue|behind|\d+ days/i.test(card?.text ?? '')}`
      );
      const body = await page.evaluate(() => document.body.innerText);
      console.log(`  Past Lessons suppressed: ${!body.includes('Past Lessons')}`);
      console.log(`  "Not completed" absent from page: ${!body.includes('Not completed')}`);

      console.log('\n  > tapping "Save for later"');
      console.log(`  clicked: ${await clickInCard(page, 'Save for later')}`);
      const saved = await goToToday(page, 'memberBelowThreshold after Save');
      console.log('  --- card after reload ---');
      for (const line of (saved.card?.text ?? 'NO CARD').split('\n').filter(Boolean))
        console.log(`  | ${line}`);
      console.log(`  saved state persisted: ${/saved for later/i.test(saved.card?.text ?? '')}`);
      console.log(
        `  moved out of the dominant slot: ${saved.card ? saved.card.index > 0 : 'n/a'} (position ${saved.card ? saved.card.index + 1 : '-'} of ${saved.card?.totalSections ?? '-'})`
      );
    }
  );

  // ---- memberEmpty: brand-new member. Observation only. ----
  await run('memberEmpty (brand new)', ACCOUNTS.memberEmpty, async ({ card }) => {
    const text = card?.text ?? '';
    console.log(`\n  reason line count (0 = no fabricated insight): ${text.split('\n').filter(Boolean).length - 2 - (card?.buttons.length ?? 0)}`);
  });

  console.log(`\n\nTOTAL console/page/5xx issues: ${consoleIssues.length}`);
  if (consoleIssues.length) console.log(JSON.stringify(consoleIssues.slice(0, 10), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
