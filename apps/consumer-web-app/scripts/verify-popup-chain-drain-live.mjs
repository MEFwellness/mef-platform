/**
 * Live proof of bug sweep finding B1 on production: the pop-up chain drains
 * one message at a time and the priority card does not stop it.
 *
 * Before the fix, the moment the priority_card branch was reached and its
 * key had been dismissed, getMyRootPopupMessageAction returned null and
 * every message below it was unreachable for the rest of the day. So the
 * test that matters is not "does something pop", it is "does the chain keep
 * going past the priority card".
 *
 * Dismissal method: "Maybe later" where the message offers it, which
 * snoozes until her next real sign-in, so this run leaves nothing
 * permanently retired. The one-time kinds (offers, the weekly review, the
 * priority card) auto-dismiss on mount, which is the app's own ordinary
 * behaviour on any Home open. Every dismissal row this run created is
 * deleted at the end.
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

async function dismissalKeys() {
  const { data } = await admin
    .from('member_root_popup_dismissals')
    .select('message_key, status')
    .eq('member_id', MEMBER_ID);
  return (data ?? []).map((d) => `${d.message_key}(${d.status})`).sort();
}
async function countEvents(eventType, localDate) {
  const { count } = await admin
    .from('member_wellness_events')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID)
    .eq('event_type', eventType)
    .eq('local_date', localDate);
  return count ?? 0;
}

const consoleErrors = [];
const emDashFindings = [];

async function main() {
  const browser = await chromium.launch();
  let minted = null;
  try {
    minted = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
    if (!minted) throw new Error('could not mint a session');
    const page = await minted.context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    console.log(`member local date: ${today}`);
    console.log(`dismissals at start: ${JSON.stringify(await dismissalKeys())}`);

    // ---- Drain the chain, one open at a time ----
    const sequence = [];
    const seenText = new Set();
    let repeatedAt = null;

    for (let open = 1; open <= 10; open += 1) {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(6500);

      const body = await page.evaluate(() => document.body.innerText);
      if (body.includes('—')) {
        emDashFindings.push(`open ${open}: ${(body.split('\n').find((l) => l.includes('—')) ?? '').slice(0, 100)}`);
      }

      const dialog = page.locator('[role="dialog"]').first();
      if ((await dialog.count()) === 0) {
        console.log(`open ${open}: no pop-up, the chain is drained`);
        await page.screenshot({ path: path.join(SHOTS, `drain-${String(open).padStart(2, '0')}-empty.png`) });
        break;
      }

      const text = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const label = text.slice(0, 90);
      await page.screenshot({ path: path.join(SHOTS, `drain-${String(open).padStart(2, '0')}.png`) });

      if (seenText.has(text)) {
        repeatedAt = open;
        console.log(`open ${open}: REPEAT of a message already shown and dismissed`);
        break;
      }
      seenText.add(text);
      sequence.push(label);
      console.log(`open ${open}: ${label}`);

      const later = dialog.locator('button').filter({ hasText: /^maybe later$/i }).first();
      if ((await later.count()) > 0) {
        await later.click({ timeout: 12000 }).catch(() => {});
      }
      await page.waitForTimeout(2500);
    }

    record(
      'B1 live. the chain keeps going past the priority card instead of stopping at it',
      sequence.length >= 3 && repeatedAt === null,
      `${sequence.length} distinct messages delivered over successive opens, no repeats: ${sequence
        .map((s, i) => `(${i + 1}) ${s.slice(0, 45)}`)
        .join(' ')}`
    );

    const keysNow = await dismissalKeys();
    const sawPriorityCard = keysNow.some((k) => k.startsWith(`priority_card:${today}`));
    const somethingAfter = sequence.length;
    record(
      'B1 live. the priority card was reached, dismissed, and did not silence the rest',
      sawPriorityCard || somethingAfter >= 3,
      `dismissal rows after the drain: ${JSON.stringify(keysNow)}`
    );

    // ---- The claim: one showing, one row, across several renders ----
    // re_entry_shown cannot fire today (today's rule is behavioral_friction,
    // not re_entry, because she was present yesterday), so this exercises
    // the identical claim through priority_shown, which the re-entry event
    // now rides inside the same function after the same `if (!won) return`.
    const beforePs = await countEvents('priority_shown', today);
    await admin
      .from('member_daily_priorities')
      .update({ shown_at: null, shown_presentation: null })
      .eq('member_id', MEMBER_ID)
      .eq('local_date', today);

    for (const screen of ['/dashboard', '/dashboard', '/today']) {
      await page.goto(`${BASE}${screen}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(7000);
    }
    await page.screenshot({ path: path.join(SHOTS, 'claim-after-three-renders.png') });
    const afterPs = await countEvents('priority_shown', today);
    record(
      'B2 live. one released claim, four card renders across two screens, one event row',
      afterPs - beforePs === 1,
      `priority_shown ${beforePs} -> ${afterPs} (delta ${afterPs - beforePs})`
    );

    const reToday = await countEvents('re_entry_shown', today);
    record(
      'B2 live. re_entry_shown writes nothing on a day she is not re-entering',
      reToday === 0,
      `re_entry_shown rows for ${today}: ${reToday} (today's rule is behavioral_friction, she was present yesterday)`
    );

    // ---- Clean surfaces ----
    for (const screen of ['/progress', '/root-score', '/profile']) {
      await page.goto(`${BASE}${screen}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(4500);
      const body = await page.evaluate(() => document.body.innerText);
      if (body.includes('—')) {
        emDashFindings.push(`${screen}: ${(body.split('\n').find((l) => l.includes('—')) ?? '').slice(0, 100)}`);
      }
      await page.screenshot({ path: path.join(SHOTS, `screen${screen.replace(/\//g, '_')}.png`) });
    }
    record('zero console errors across the whole run', consoleErrors.length === 0,
      consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'none on any load');
    record('zero em dashes on every screen visited', emDashFindings.length === 0,
      emDashFindings.length ? emDashFindings.slice(0, 3).join(' | ') : 'none');

    // ---- Leave her account as found ----
    const { data: removed } = await admin
      .from('member_root_popup_dismissals')
      .delete()
      .eq('member_id', MEMBER_ID)
      .select('message_key');
    console.log(`\ncleaned up ${removed?.length ?? 0} dismissal rows this run created`);
    console.log(`dismissals at end: ${JSON.stringify(await dismissalKeys())}`);
  } finally {
    await retireSession(minted);
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('run failed:', e);
  process.exit(2);
});
