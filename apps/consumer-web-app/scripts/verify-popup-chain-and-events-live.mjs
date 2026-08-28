/**
 * Live verification for bug sweep findings B1 and B2, on production.
 *
 * B1: a dismissed priority card must not silence the rest of the pop-up
 * chain. This member is in the exact state the sweep measured: today's
 * priority_card key is dismissed, the card is still active, and there are
 * genuinely due messages below it.
 *
 * B2: one real showing of the card must write one re_entry_shown row.
 *
 * Bounded timeouts everywhere, one browser, closed in a finally. The
 * minted session is retired with scope 'local'.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const MEMBER_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const SHOTS = path.join(import.meta.dirname, '.verify', 'shots');
const VIEWPORT = { width: 390, height: 844 };
const NAV_TIMEOUT = 45000;

mkdirSync(SHOTS, { recursive: true });

const results = [];
function record(item, ok, detail) {
  results.push({ item, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item}\n      ${detail}`);
}

const admin = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function countEvents(eventType, localDate) {
  const { count } = await admin
    .from('member_wellness_events')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID)
    .eq('event_type', eventType)
    .eq('local_date', localDate);
  return count ?? 0;
}

async function dismissals() {
  const { data } = await admin
    .from('member_root_popup_dismissals')
    .select('message_key, status')
    .eq('member_id', MEMBER_ID);
  return data ?? [];
}

/** What the pop-up modal on Home currently is, or null when there is none. */
async function readPopup(page, shotName) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: false });

  const dialog = page.locator('[role="dialog"]').first();
  if ((await dialog.count()) === 0) return null;
  const text = (await dialog.innerText().catch(() => '')) ?? '';
  return { text: text.replace(/\s+/g, ' ').trim() };
}

const consoleErrors = [];
const emDashScreens = [];

async function main() {
  const browser = await chromium.launch();
  let minted = null;
  try {
    minted = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
    if (!minted) throw new Error('could not mint a session');

    const page = await minted.context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    console.log(`local date for this member: ${today}`);
    console.log('dismissals before:', JSON.stringify(await dismissals()));

    // ---- Item 1a: the chain is not silent behind the dismissed card ----
    const first = await readPopup(page, 'b1-01-first-open.png');
    record(
      '1a. a pop-up appears at all, behind an already-dismissed priority card',
      first !== null,
      first ? `showed: "${first.text.slice(0, 120)}"` : 'no pop-up at all (this is the B1 failure)'
    );

    // ---- Item 1b: dismiss it, reload, get the NEXT thing, not a repeat ----
    let second = null;
    if (first) {
      const buttons = page.locator('[role="dialog"] button');
      const labels = await buttons.allInnerTexts().catch(() => []);
      console.log('  dialog buttons:', JSON.stringify(labels));
      // Prefer an explicit dismiss; fall back to the last button.
      const dismiss = page
        .locator('[role="dialog"] button')
        .filter({ hasText: /ignore|not now|maybe later|no thanks|close|dismiss|skip/i })
        .first();
      if ((await dismiss.count()) > 0) {
        await dismiss.click({ timeout: 15000 }).catch(() => {});
      } else {
        await buttons.last().click({ timeout: 15000 }).catch(() => {});
      }
      await page.waitForTimeout(4000);

      second = await readPopup(page, 'b1-02-second-open.png');
      const repeated = Boolean(second && second.text === first.text);
      record(
        '1b. a second sign-in the same day shows the next thing, not a repeat',
        !repeated,
        second
          ? repeated
            ? 'the same message came back'
            : `next message: "${second.text.slice(0, 120)}"`
          : 'no pop-up on the second open (nothing else was due)'
      );
    }
    console.log('dismissals after item 1:', JSON.stringify(await dismissals()));

    // ---- Item 2: clear only this member's dismissal rows, re-decide ----
    const { data: cleared } = await admin
      .from('member_root_popup_dismissals')
      .delete()
      .eq('member_id', MEMBER_ID)
      .select('message_key');
    console.log(`cleared ${cleared?.length ?? 0} of this member's own dismissal rows`);

    const redecided = await readPopup(page, 'b1-03-after-clearing-dismissals.png');
    record(
      '2. with her own dismissals cleared, the chain re-decides from the top',
      redecided !== null,
      redecided ? `showed: "${redecided.text.slice(0, 120)}"` : 'nothing at all'
    );

    // ---- Item 3: exactly one event row for one real showing ----
    // The day's claim (member_daily_priorities.shown_at) is already spent,
    // so release only this member's own claim for today, then load Home
    // once and count. This is the same member-scoped simulation earlier
    // builds used for dismissal rows.
    const beforeRe = await countEvents('re_entry_shown', today);
    const beforePs = await countEvents('priority_shown', today);
    console.log(`before releasing the claim: re_entry_shown=${beforeRe} priority_shown=${beforePs}`);

    await admin
      .from('member_daily_priorities')
      .update({ shown_at: null, shown_presentation: null })
      .eq('member_id', MEMBER_ID)
      .eq('local_date', today);

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: path.join(SHOTS, 'b2-01-home-after-claim-released.png') });
    // A second and third load, to prove the claim holds against a reload
    // and a double-tap, not just against one render.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(6000);
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(SHOTS, 'b2-02-today.png') });

    const afterRe = await countEvents('re_entry_shown', today);
    const afterPs = await countEvents('priority_shown', today);
    record(
      '3. one real showing writes exactly one re_entry_shown row',
      afterRe - beforeRe === 1,
      `re_entry_shown ${beforeRe} -> ${afterRe} (delta ${afterRe - beforeRe}), across three renders on two screens`
    );
    record(
      '3b. priority_shown still lands exactly once alongside it',
      afterPs - beforePs === 1,
      `priority_shown ${beforePs} -> ${afterPs} (delta ${afterPs - beforePs})`
    );

    // ---- Item 4: console errors and em dashes on every screen visited ----
    const screens = ['/dashboard', '/today', '/progress', '/root-score'];
    for (const screen of screens) {
      await page.goto(`${BASE}${screen}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(5000);
      const body = await page.evaluate(() => document.body.innerText);
      if (body.includes('—')) {
        const line = body.split('\n').find((l) => l.includes('—')) ?? '';
        emDashScreens.push(`${screen}: ${line.slice(0, 120)}`);
      }
      await page.screenshot({
        path: path.join(SHOTS, `b1-screen-${screen.replace(/\//g, '_')}.png`),
      });
    }
    record('4a. zero console errors on every screen visited', consoleErrors.length === 0,
      consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : `${screens.length + 4} loads, none`);
    record('4b. zero em dashes on every screen visited', emDashScreens.length === 0,
      emDashScreens.length ? emDashScreens.join(' | ') : `${screens.length} screens checked`);

    console.log('\nfinal dismissals:', JSON.stringify(await dismissals()));
  } finally {
    await retireSession(minted);
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error('run failed:', error);
  process.exit(2);
});
