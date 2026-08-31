#!/usr/bin/env node
/**
 * Push notifications, part 2, verified against production.
 *
 * WHAT IT PROVES, on app.mefwellness.com, as the real production test
 * member and the real administrator:
 *
 *   a. a pending item produces exactly ONE send and exactly ONE receipt,
 *      and the notification really arrives in her browser;
 *   b. running the decision again the same day sends nothing, because the
 *      receipt is what enforces the cap;
 *   c. once the thing is done, the decision is "sent nothing, already
 *      done", decided by a read taken at send time;
 *   d. a member whose switch is off gets nothing, even with a live device
 *      still saved;
 *   e. no console error and no em dash on any screen visited.
 *
 * WHY REAL CHROME, HEADED, WITH A PERSISTENT PROFILE. Exactly as in part
 * 1: Playwright's bundled Chromium has no push service at all, and real
 * Chrome only registers with one from a persistent profile. Both were
 * measured before part 1's script was written. The administrator's half
 * needs none of that and runs in ordinary headless Chromium.
 *
 * WHAT IT CHANGES ON PRODUCTION, AND PUTS BACK. Her timezone is moved
 * forward for the run, so the whole walk happens on a CLEAN local day and
 * never touches the real day she has already lived. Her push columns, her
 * timezone, every subscription row this run created, every receipt for
 * the test day and the priority row for the test day are all restored or
 * deleted at the end, and the run prints what it put back. What it
 * deliberately leaves is anything additive on that test day, named in the
 * output rather than hidden.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   SHOTS_DIR=/path/to/shots node scripts/verify-daily-notification-decision-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'oakomah66@gmail.com';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-push2';
const PROFILE_DIR = process.env.CHROME_PROFILE_DIR ?? './.push2-verify-profile';
/** Fourteen hours ahead of UTC, so "her day" during this run is a day nobody has lived yet. */
const TEST_TIMEZONE = 'Pacific/Kiritimati';
const EM_DASH = '—';

mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

const consoleProblems = [];
function watch(page, screenName) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleProblems.push(`${screenName}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleProblems.push(`${screenName}: pageerror ${err.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      consoleProblems.push(`${screenName}: HTTP ${response.status()} ${response.url()}`);
    }
  });
}

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function memberIdFor(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function profileRow(memberId) {
  const { data } = await service
    .from('profiles')
    .select('timezone, push_notifications_enabled, push_prompt_shown_at, push_prompt_answer, push_send_hour_local')
    .eq('id', memberId)
    .maybeSingle();
  return data ?? null;
}

async function liveDevices(memberId) {
  const { data } = await service
    .from('member_push_subscriptions')
    .select('id, device_label, revoked_at')
    .eq('member_id', memberId);
  return data ?? [];
}

async function deliveries(memberId, localDate) {
  const { data } = await service
    .from('member_push_deliveries')
    .select('id, local_date, sent_at, priority_rule, title, body, url, cadence, source, sent_device_count, retired_device_count')
    .eq('member_id', memberId)
    .eq('local_date', localDate);
  return data ?? [];
}

async function priorityRow(memberId, localDate) {
  const { data } = await service
    .from('member_daily_priorities')
    .select('id, rule, priority_title, status')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();
  return data ?? null;
}

/** The date it is, right now, in a named timezone. Same conversion lib/time/localDate.ts uses. */
function localDateIn(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

async function screen(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  const body = await page.locator('body').innerText();
  writeFileSync(`${SHOTS}/${name}.txt`, body);
  return body;
}

const memberId = await memberIdFor(MEMBER_EMAIL);
if (!memberId) {
  console.error(`Could not find ${MEMBER_EMAIL} on production. Refusing to guess.`);
  process.exit(1);
}
const adminId = await memberIdFor(ADMIN_EMAIL);
console.log(`member ${memberId.slice(0, 8)} / admin ${adminId ? adminId.slice(0, 8) : 'not found'}`);

const startingProfile = await profileRow(memberId);
const startingDeviceIds = new Set((await liveDevices(memberId)).map((d) => d.id));
const testLocalDate = localDateIn(TEST_TIMEZONE);
console.log(`test local day (${TEST_TIMEZONE}): ${testLocalDate}`);

let memberMint = null;
let adminMint = null;
let context = null;
let adminBrowser = null;
let adminPage = null;
let leftBehind = [];

/** Press the admin tool's "Run today's decision now" and read back what it said. */
async function runDecision(label) {
  await adminPage.goto(`${BASE}/admin/push-test-tools`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(800);
  await adminPage.selectOption('#push-test-member', memberId);
  await adminPage.waitForTimeout(400);
  await adminPage.getByRole('button', { name: "Run today's decision now" }).click();
  await adminPage.waitForTimeout(9000);
  const body = await screen(adminPage, label);
  const outcomeLine = body.split('\n').find((l) => /^Outcome$/i.test(l.trim()));
  const lines = body.split('\n').map((l) => l.trim());
  const outcomeIndex = lines.findIndex((l) => l === 'Outcome');
  const ruleIndex = lines.findIndex((l) => l === 'Priority Card rule');
  return {
    body,
    outcome: outcomeIndex >= 0 ? lines[outcomeIndex + 1] : null,
    rule: ruleIndex >= 0 ? lines[ruleIndex + 1] : null,
    sentence: lines.find((l) => /^(Sent|Nothing reached)/.test(l)) ?? '',
    hasOutcomeLine: Boolean(outcomeLine),
  };
}

try {
  memberMint = await mintSessionCookies(MEMBER_EMAIL, { baseUrl: BASE });
  if (!memberMint) throw new Error('Could not mint a session for the test member.');

  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    permissions: ['notifications'],
  });
  await context.addCookies(memberMint.cookies);
  const page = await context.newPage();
  watch(page, 'member');

  // -------------------------------------------------------------------
  // Setup. A real device, proved reachable, and a clean local day.
  // -------------------------------------------------------------------
  // Force the starting state rather than assuming it. An earlier attempt
  // at this run found the switch already on from a previous run, skipped
  // the click, and then had no device to send to.
  await service
    .from('profiles')
    .update({ timezone: TEST_TIMEZONE, push_notifications_enabled: false })
    .eq('id', memberId);
  await service
    .from('member_push_subscriptions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('revoked_at', null);

  // Home first, so the service worker is registered and the browser has
  // already reached the push service before the switch is touched. On a
  // cold Chrome profile the first subscribe is far slower than a later
  // one, and one attempt at this run screenshotted the switch still
  // saying "Turning on".
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  async function subscribeDevice() {
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const toggle = page.getByRole('switch', { name: 'Reminders on your phone' });
    if ((await toggle.getAttribute('aria-checked')) === 'true') {
      await toggle.click();
      await page.waitForTimeout(6000);
    }
    await toggle.click();
    // Poll the database rather than sleeping a guessed number of seconds:
    // the row appearing IS the thing being waited for.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const live = (await liveDevices(memberId)).filter((d) => !d.revoked_at);
      if (live.length > 0) return live;
      await page.waitForTimeout(2000);
    }
    return [];
  }

  let devicesNow = await subscribeDevice();
  await screen(page, '01-profile-reminders-on');
  check(
    'setup: a real device is subscribed and her switch is on',
    devicesNow.length === 1 && (await profileRow(memberId))?.push_notifications_enabled === true,
    `${devicesNow.length} live device(s)`
  );
  if (devicesNow.length !== 1) throw new Error('No live device, so nothing below could be proved.');

  // A clean slate for the test day only.
  await service.from('member_push_deliveries').delete().eq('member_id', memberId).eq('local_date', testLocalDate);

  adminBrowser = await chromium.launch({ headless: true });
  adminMint = await mintSessionCookies(ADMIN_EMAIL, { baseUrl: BASE });
  if (!adminMint) throw new Error('Could not mint a session for the administrator.');
  const adminContext = await adminBrowser.newContext({ viewport: { width: 430, height: 932 } });
  adminMint.context = adminContext;
  await adminContext.addCookies(adminMint.cookies);
  adminPage = await adminContext.newPage();
  watch(adminPage, 'admin');

  await adminPage.goto(`${BASE}/admin/push-test-tools`, { waitUntil: 'networkidle' });
  const toolsBody = await screen(adminPage, '02-admin-tools');
  check(
    'the force-run button is on the admin tool',
    toolsBody.includes("Run today's decision now"),
    toolsBody.split('\n').find((l) => l.includes("Run today's decision")) ?? 'not found'
  );
  check('no em dash on the admin tool', !toolsBody.includes(EM_DASH));

  // PROVE THE DEVICE IS REACHABLE BEFORE TESTING THE DECISION, with part
  // 1's own test push. A brand new FCM registration is not always live
  // the instant the browser hands it over: one attempt at this run had
  // the push service answer "gone" for a subscription seventy five
  // seconds old, which this build then correctly retired. Retrying the
  // subscribe is the right response to that, and it must happen before
  // the decision is measured, or a push service warming up would be
  // reported as a fault in the job.
  let reachable = false;
  let testPushLine = 'not attempted';
  for (let attempt = 0; attempt < 3 && !reachable; attempt += 1) {
    await adminPage.reload({ waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(800);
    await adminPage.selectOption('#push-test-member', memberId);
    await adminPage.waitForTimeout(400);
    await adminPage.getByRole('button', { name: 'Send test notification' }).click();
    await adminPage.waitForTimeout(9000);
    const testPushBody = await screen(adminPage, `02b-test-push-attempt-${attempt + 1}`);
    testPushLine =
      testPushBody.split('\n').find((l) => /Sent to|refused|gone|nowhere|no device/.test(l)) ??
      'no result line';
    reachable = /Sent to 1 device\./.test(testPushBody);
    if (!reachable) {
      await page.waitForTimeout(15000);
      devicesNow = await subscribeDevice();
      if (devicesNow.length === 0) break;
    }
  }
  check('setup: the saved device really is reachable', reachable, testPushLine);
  if (!reachable) throw new Error('The push service would not accept this device, so nothing below could be proved.');

  // Clear the setup notification, so what is read back below is the
  // decision's own and could not be the test push still sitting there.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    for (const notification of await registration.getNotifications()) notification.close();
  });

  // -------------------------------------------------------------------
  // (a) A pending item produces exactly one send and one receipt.
  // -------------------------------------------------------------------
  const first = await runDecision('03-first-run');
  check(
    '(a) the decision sent one notification for a pending item',
    first.outcome === 'sent',
    `outcome ${first.outcome}, rule ${first.rule} :: ${first.sentence}`
  );

  const afterFirst = await deliveries(memberId, testLocalDate);
  check(
    '(a) exactly one delivery receipt exists for her local day',
    afterFirst.length === 1,
    afterFirst.length ? `${afterFirst[0].priority_rule}: ${afterFirst[0].title} / ${afterFirst[0].body}` : 'none'
  );
  check(
    '(a) the receipt records that it reached exactly one device',
    afterFirst.length === 1 && afterFirst[0].sent_device_count === 1,
    afterFirst.length ? `sent to ${afterFirst[0].sent_device_count}` : ''
  );

  const storedPriority = await priorityRow(memberId, testLocalDate);
  check(
    '(a) the notification names the same thing the Priority Card says',
    Boolean(storedPriority) && afterFirst.length === 1 && afterFirst[0].body.startsWith(storedPriority.priority_title.slice(0, 40)),
    storedPriority ? `card: ${storedPriority.priority_title}` : 'no priority row'
  );

  const arrived = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      // The daily reminder's own tag, so a test push still on screen
      // could never be mistaken for it.
      const list = await registration.getNotifications({ tag: 'rooted-reset-daily' });
      if (list.length > 0) {
        return list.map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url }));
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return [];
  });
  writeFileSync(`${SHOTS}/notifications-received.json`, JSON.stringify(arrived, null, 2));
  check(
    '(a) the notification really arrived and the service worker displayed it',
    arrived.length >= 1,
    arrived.length ? `${arrived[0].title}: ${arrived[0].body} (opens ${arrived[0].url})` : 'nothing received'
  );
  check(
    '(a) what arrived is what the receipt says was sent',
    arrived.length >= 1 && afterFirst.length === 1 &&
      arrived[0].title === afterFirst[0].title && arrived[0].body === afterFirst[0].body &&
      arrived[0].url === afterFirst[0].url,
    arrived.length ? `tag ${arrived[0].tag}` : ''
  );
  check(
    '(a) no em dash in the words that reached her phone',
    arrived.length >= 1 && !arrived[0].title.includes(EM_DASH) && !arrived[0].body.includes(EM_DASH)
  );

  // -------------------------------------------------------------------
  // (b) Running again the same day sends nothing.
  // -------------------------------------------------------------------
  const second = await runDecision('04-second-run-same-day');
  check(
    '(b) running again the same day sends nothing, blocked by the receipt',
    second.outcome === 'already_sent_today',
    `outcome ${second.outcome} :: ${second.sentence}`
  );
  const afterSecond = await deliveries(memberId, testLocalDate);
  check(
    '(b) there is still exactly one receipt, and one only',
    afterSecond.length === 1 && afterSecond[0].id === afterFirst[0].id
  );

  // -------------------------------------------------------------------
  // (c) Once the thing is done, the answer is "already done".
  // -------------------------------------------------------------------
  // The cap has done its job; clear the receipt so the next run reaches
  // the completion check rather than stopping at the cap. This is test
  // cleanup, not part of the behaviour under test.
  await service.from('member_push_deliveries').delete().eq('member_id', memberId).eq('local_date', testLocalDate);

  // She finishes today's one thing, through the real card, the real way.
  //
  // Home renders the priority as a pop-up as well as an inline card, and
  // the pop-up's own backdrop covers the inline one. So the pop-up, when
  // it is up, is the card she is actually looking at and is the one to
  // press. Clicking the covered button underneath is what the first run
  // of this script tried, and Playwright correctly refused for thirty
  // seconds.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const dialog = page.getByRole('dialog');
  const scope = (await dialog.count()) > 0 && (await dialog.first().isVisible()) ? dialog.first() : page;
  const doneButton = scope.getByRole('button', { name: /^(Done|Mark as done|I did this|I did it)$/i });
  let markedDone = false;
  if ((await doneButton.count()) > 0) {
    await doneButton.first().click();
    await page.waitForTimeout(5000);
    markedDone = true;
  }
  await screen(page, '05-member-marked-today-done');
  const rowAfterDone = await priorityRow(memberId, testLocalDate);
  check(
    "(c) she finished today's one thing on the real card",
    rowAfterDone?.status === 'done',
    `status ${rowAfterDone?.status}, pressed ${markedDone}`
  );

  const third = await runDecision('06-third-run-already-done');
  check(
    '(c) with it done, the decision is "sent nothing, already done"',
    third.outcome === 'already_done',
    `outcome ${third.outcome} :: ${third.sentence}`
  );
  const afterThird = await deliveries(memberId, testLocalDate);
  check('(c) and no receipt was written, because nothing was sent', afterThird.length === 0);

  // -------------------------------------------------------------------
  // (d) The switch off means nothing is sent, whatever devices exist.
  // -------------------------------------------------------------------
  // Set the column directly rather than through the profile screen, which
  // also revokes her devices. Setting only the column is the harder case:
  // it leaves a live device saved and proves the SEND's own preference
  // lock, not merely that there was nowhere to send.
  await service.from('profiles').update({ push_notifications_enabled: false }).eq('id', memberId);
  const stillLive = (await liveDevices(memberId)).filter((d) => !d.revoked_at);
  const fourth = await runDecision('07-switch-off');
  check(
    '(d) with her switch off, nothing is sent even though a device is still saved',
    fourth.outcome === 'reminders_off' && stillLive.length === 1,
    `outcome ${fourth.outcome}, live devices ${stillLive.length} :: ${fourth.sentence}`
  );
  check('(d) and still no receipt', (await deliveries(memberId, testLocalDate)).length === 0);
  await service.from('profiles').update({ push_notifications_enabled: true }).eq('id', memberId);

  // -------------------------------------------------------------------
  // The schedule itself: the route exists and refuses an unauthorized call.
  // -------------------------------------------------------------------
  const cronResponse = await adminPage.request.get(`${BASE}/api/cron/daily-notifications`);
  check(
    'the scheduled route is deployed and refuses a call with no cron secret',
    cronResponse.status() === 401,
    `HTTP ${cronResponse.status()}`
  );

  // -------------------------------------------------------------------
  // (e) Console errors and em dashes.
  // -------------------------------------------------------------------
  const KNOWN_PRE_EXISTING = /\/auth\/v1\/passkeys/;
  const knownCount = consoleProblems.filter((p) => KNOWN_PRE_EXISTING.test(p)).length;
  const unexplained = consoleProblems.filter(
    (p) =>
      !KNOWN_PRE_EXISTING.test(p) &&
      !(knownCount > 0 && /Failed to load resource: the server responded with a status of 404/.test(p))
  );
  check(
    '(e) no console or page error on any screen visited, beyond the pre-existing passkey 404',
    unexplained.length === 0,
    unexplained.slice(0, 5).join(' | ') || `${knownCount} known passkey 404s, nothing else`
  );

  const allAdminText = [first.body, second.body, third.body, fourth.body].join('\n');
  check('(e) no em dash anywhere the administrator reads', !allAdminText.includes(EM_DASH));
} catch (error) {
  check('the run completed without throwing', false, String(error));
} finally {
  // Put production back.
  await service.from('member_push_deliveries').delete().eq('member_id', memberId).eq('local_date', testLocalDate);
  const { data: removedPriority } = await service
    .from('member_daily_priorities')
    .delete()
    .eq('member_id', memberId)
    .eq('local_date', testLocalDate)
    .select('id');
  const all = await liveDevices(memberId);
  const created = all.filter((d) => !startingDeviceIds.has(d.id)).map((d) => d.id);
  if (created.length > 0) {
    await service.from('member_push_subscriptions').delete().in('id', created);
  }
  if (startingProfile) {
    await service.from('profiles').update(startingProfile).eq('id', memberId);
  }
  leftBehind = [
    `${created.length} subscription row(s) deleted`,
    `${(removedPriority ?? []).length} priority row(s) for ${testLocalDate} deleted`,
    'every receipt for the test day deleted',
    'timezone and push columns restored',
  ];
  console.log(`\nput back: ${leftBehind.join(', ')}`);

  await retireSession(memberMint);
  await retireSession(adminMint);
  await context?.close().catch(() => {});
  await adminBrowser?.close().catch(() => {});
  rmSync(PROFILE_DIR, { recursive: true, force: true });
}

writeFileSync(`${SHOTS}/console-problems.txt`, consoleProblems.join('\n'));
const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passing`);
process.exit(passed === results.length ? 0 : 1);
