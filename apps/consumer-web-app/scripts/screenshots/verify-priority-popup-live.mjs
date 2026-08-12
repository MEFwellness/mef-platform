#!/usr/bin/env node
// Live verification for the Priority Card's POP-UP delivery against
// production. Same shape as verify-priority-card-live.mjs, but drives the
// pop-up rather than the inline card.
//
// Checks, per account: does the pop-up appear on login, does it carry a
// real priority, do all three buttons work inside it, does the inline card
// on Home and Today reflect what was done in the pop-up, and does a
// same-day reload avoid re-popping.
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-priority-popup-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const issues = [];

function attach(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push({ label, text: m.text() });
  });
  page.on('pageerror', (e) => issues.push({ label, text: `pageerror: ${e.message}` }));
  page.on('response', (r) => {
    if (r.status() >= 500) issues.push({ label, text: `http${r.status()} ${r.url()}` });
  });
}

const LABEL = 'your priority today';

/** The pop-up is the one role="dialog" on screen. */
async function readPopup(page) {
  return page.evaluate((label) => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const text = dialog.innerText;
    return {
      text,
      isPriorityCard: text.toLowerCase().includes(label),
      buttons: [...dialog.querySelectorAll('button')].map((b) => b.innerText.trim()),
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
    };
  }, LABEL);
}

/** The inline card, wherever it is on the current page. */
async function readInline(page) {
  return page.evaluate((label) => {
    const sections = [...document.querySelectorAll('section')];
    const card = sections.find((s) => s.innerText.toLowerCase().includes(label));
    if (!card) return null;
    return { text: card.innerText, index: sections.indexOf(card), total: sections.length };
  }, LABEL);
}

async function clickPopupButton(page, name) {
  const ok = await page.evaluate((name) => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const btn = [...dialog.querySelectorAll('button')].find(
      (b) => b.innerText.trim().toLowerCase() === name.toLowerCase()
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, name);
  await page.waitForTimeout(2500);
  return ok;
}

function print(lines) {
  for (const line of (lines ?? '').split('\n').filter(Boolean)) console.log(`  | ${line}`);
}

async function open(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(2800);
}

async function run(label, account, actions) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  attach(page, label);

  console.log(`\n\n================ ${label} ================`);
  await login(page, BASE_URL, account);
  await open(page, '/dashboard');

  const popup = await readPopup(page);
  console.log(`pop-up on open: ${popup ? 'YES' : 'NO'}`);
  if (popup) {
    console.log(`  is the Priority Card: ${popup.isPriorityCard}`);
    console.log(`  dialogs on screen (must be 1, never stacked): ${popup.dialogCount}`);
    console.log(`  buttons: ${JSON.stringify(popup.buttons)}`);
    console.log(`  em dash in pop-up: ${popup.text.includes('—')}`);
    console.log('  --- pop-up text ---');
    print(popup.text);
  }

  await actions({ page, popup });
  await browser.close();
}

async function main() {
  console.log(`Verifying Priority Card pop-up delivery against ${BASE_URL}`);

  // ---- memberPopulated: already actioned today, so the pop-up must NOT
  // interrupt her; the inline card must still show her real priority. ----
  await run('memberPopulated', ACCOUNTS.memberPopulated, async ({ page, popup }) => {
    console.log(`\n  expectation: no Priority Card pop-up (today's card was already actioned)`);
    console.log(`  priority pop-up suppressed: ${!popup || !popup.isPriorityCard}`);

    const home = await readInline(page);
    console.log('\n  inline card on Home:');
    print(home?.text ?? 'NONE');
    console.log(`  position on Home: ${home ? `${home.index + 1} of ${home.total}` : '-'}`);

    await open(page, '/today');
    const today = await readInline(page);
    console.log('\n  inline card on Today:');
    print(today?.text ?? 'NONE');
    console.log(
      `  Home and Today agree: ${Boolean(home && today) && home.text.trim() === today.text.trim()}`
    );
  });

  // ---- memberEmpty: brand new. Must now get exactly one honest fallback
  // pop-up. Taps Help me, then Done, inside the pop-up. ----
  await run('memberEmpty (brand new)', ACCOUNTS.memberEmpty, async ({ page, popup }) => {
    console.log(`\n  fallback pop-up present: ${Boolean(popup?.isPriorityCard)}`);

    console.log('\n  > tapping "Help me" INSIDE the pop-up');
    console.log(`  clicked: ${await clickPopupButton(page, 'Help me')}`);
    const expanded = await readPopup(page);
    console.log(`  still on /dashboard (no navigation): ${page.url().includes('/dashboard')}`);
    print(expanded?.text);

    console.log('\n  > tapping "Done" INSIDE the pop-up');
    console.log(`  clicked: ${await clickPopupButton(page, 'Done')}`);
    print((await readPopup(page))?.text);

    console.log('\n  > reloading Home');
    await open(page, '/dashboard');
    const rePopped = await readPopup(page);
    console.log(`  re-popped on same-day reload (must be false): ${Boolean(rePopped?.isPriorityCard)}`);
    const home = await readInline(page);
    console.log('  inline card on Home after Done in the pop-up:');
    print(home?.text ?? 'NONE');
    console.log(`  shows Done: ${/done today/i.test(home?.text ?? '')}`);

    await open(page, '/today');
    const today = await readInline(page);
    console.log('  inline card on Today:');
    print(today?.text ?? 'NONE');
    console.log(`  Today also shows Done: ${/done today/i.test(today?.text ?? '')}`);
  });

  // ---- memberBelowThreshold: just started. Fallback pop-up, Save for later. ----
  await run(
    'memberBelowThreshold (just started)',
    {
      email: process.env.MEMBER_BELOW_THRESHOLD_EMAIL,
      password: process.env.MEMBER_BELOW_THRESHOLD_PASSWORD,
    },
    async ({ page, popup }) => {
      console.log(`\n  fallback pop-up present: ${Boolean(popup?.isPriorityCard)}`);

      console.log('\n  > tapping "Save for later" INSIDE the pop-up');
      console.log(`  clicked: ${await clickPopupButton(page, 'Save for later')}`);
      print((await readPopup(page))?.text);

      console.log('\n  > reloading Home');
      await open(page, '/dashboard');
      const rePopped = await readPopup(page);
      console.log(`  re-popped on same-day reload (must be false): ${Boolean(rePopped?.isPriorityCard)}`);
      const home = await readInline(page);
      console.log(`  saved card absent from Home dominant slot: ${home === null}`);

      await open(page, '/today');
      const today = await readInline(page);
      console.log('  collapsed card on Today:');
      print(today?.text ?? 'NONE');
      console.log(`  shows Saved for later: ${/saved for later/i.test(today?.text ?? '')}`);
      console.log(
        `  no longer dominant on Today: ${today ? today.index > 0 : 'n/a'} (position ${today ? today.index + 1 : '-'} of ${today?.total ?? '-'})`
      );
    }
  );

  console.log(`\n\nTOTAL console/page/5xx issues: ${issues.length}`);
  if (issues.length) console.log(JSON.stringify(issues.slice(0, 10), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
