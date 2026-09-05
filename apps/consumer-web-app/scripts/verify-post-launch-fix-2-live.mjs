/**
 * POST-LAUNCH FIX 2, DRIVEN ON app.mefwellness.com.
 *
 * Three things a real person found on a phone, checked on the live site in
 * a 390x844 viewport, as a real signed-in member.
 *
 *   a  The priority pop-up's buttons match the state that produced its
 *      message, the primary really opens the thing, "Not today" writes no
 *      completion, the server refuses a completion claim for an offer, and
 *      a genuinely self-reported priority still gets its honest Done.
 *   b  Every closing screen ends in one clear styled way out, and the
 *      inline next-experience invitation is untouched.
 *   c  The Root Map's first screenful at a real phone size, and the gold
 *      segments still agreeing with the account's own rows.
 *
 * NOTHING IS TYPED INTO THE LOGIN FORM. Turnstile is live on it by design.
 * Sessions are minted once through the Auth Admin API and retired with
 * scope 'local' immediately after (scripts/lib/mint-session.mjs).
 *
 * WHAT IT WRITES, AND PUTS BACK. Stage (a) needs one self-reported
 * priority, and no test account naturally had one today: every one of them
 * was on an offer rung. So it captures a fixture account's own stored row
 * and its coaching decision row, rewrites the priority to the engine's own
 * real `gentle_focus` copy for the length of the check, and restores both
 * byte for byte in a finally block, reading them back. That state is
 * arranged, and the report says so.
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com node scripts/verify-post-launch-fix-2-live.mjs all
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const PHONE = { width: 390, height: 844 };
const STAGE = process.argv[2] || 'all';

/** The account the bug was found on. Now `profiles.is_test = true`. */
const OFFER_ACCOUNT = 'oakomah66+quiztest6@gmail.com';
/** A pure fixture, used for the one state nobody was naturally in today. */
const SELF_REPORT_ACCOUNT = 'oakomah66+quiztest1@gmail.com';

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function note(text) {
  console.log(`      ${text}`);
}

let browser;
const consoleErrors = [];

async function openAs(email) {
  const minted = await mintSessionCookies(email, { baseUrl: BASE });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  const context = await browser.newContext({ viewport: PHONE });
  await context.addCookies(minted.cookies);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${email}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${email}: ${String(e)}`));
  return { page, context, minted };
}

async function closeAs(session) {
  await session.context.close().catch(() => {});
  await retireSession({ ...session.minted, context: null });
}

async function memberIdFor(email) {
  const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`no account for ${email}`);
  return user.id;
}

async function localDateFor(memberId) {
  const { data } = await service.from('profiles').select('timezone').eq('id', memberId).maybeSingle();
  const tz = data?.timezone || 'America/New_York';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

async function priorityRow(memberId, localDate) {
  const { data } = await service
    .from('member_daily_priorities')
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();
  return data;
}

async function decisionRow(memberId, localDate) {
  const { data } = await service
    .from('member_coaching_decisions')
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();
  return data;
}

// =====================================================================
// a. The pop-up's buttons, and what a tap writes.
// =====================================================================

async function stageA() {
  console.log('\n=== a. Priority pop-up honesty ===\n');

  const memberId = await memberIdFor(OFFER_ACCOUNT);
  const localDate = await localDateFor(memberId);
  const before = await priorityRow(memberId, localDate);

  check(
    'the offer state is real: a movement session, never opened',
    before?.rule === 'movement_session' && !!before?.priority_href && before?.status === 'active',
    `${before?.rule} ${before?.priority_href} ${before?.status}`
  );
  note(`stored title: "${before?.priority_title}"`);

  // The pop-up marks itself shown the instant it mounts, so it had already
  // retired for today. Clearing that one dismissal is what makes it due
  // again; it re-marks itself the moment it appears.
  await service
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', memberId)
    .eq('message_key', `priority_card:${localDate}`);

  const s = await openAs(OFFER_ACCOUNT);
  try {
    await s.page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    // Home streams, and the first request to a freshly promoted deployment
    // pays a cold start on top of that. The wait is generous on purpose.
    await s.page.waitForTimeout(3000);
    const dialog = s.page.locator('[role="dialog"][aria-label="Your priority today"]');
    await dialog.waitFor({ state: 'visible', timeout: 45000 });

    const text = (await dialog.innerText()).replace(/\s+/g, ' ').trim();
    note(`pop-up reads: ${text}`);

    check('the pop-up still carries the offer as written', text.includes('Morning Mobility is there if you want it today.'));
    check('its primary opens the session by name', text.includes('Open Morning Mobility'));
    check('it offers the respectful decline', text.includes('Not today'));
    check('"Help me" is unchanged', text.includes('Help me'));
    check('NO completion claim is offered', !/\bDone\b/.test(text) && !text.includes('Save for later'), text);

    const openLink = dialog.locator('a', { hasText: 'Open Morning Mobility' });
    const href = await openLink.getAttribute('href');
    check('the primary points at the session the row named', href === before.priority_href, `${href}`);

    await openLink.click();
    await s.page.waitForURL(/\/movement\/sessions\/morning_mobility/, { timeout: 45000 });
    check('tapping it lands on that session', /morning_mobility/.test(s.page.url()), s.page.url());

    const afterOpen = await priorityRow(memberId, localDate);
    check(
      'opening it claimed nothing: the row is still active with no done_at',
      afterOpen.status === 'active' && afterOpen.done_at === null,
      `${afterOpen.status} done_at=${afterOpen.done_at}`
    );

    // --- "Not today", on the inline card this time ---------------------
    await s.page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
    const notToday = s.page.locator('button', { hasText: /^Not today$/ }).first();
    await notToday.waitFor({ state: 'visible', timeout: 45000 });
    await notToday.click();
    await s.page.waitForTimeout(2500);

    const afterDecline = await priorityRow(memberId, localDate);
    check(
      '"Not today" set it aside and wrote no completion',
      afterDecline.status === 'saved' && afterDecline.done_at === null,
      `status=${afterDecline.status} done_at=${afterDecline.done_at}`
    );
    const declineDecision = await decisionRow(memberId, localDate);
    check(
      'the ledger heard "later", never "done"',
      declineDecision?.member_response === 'later',
      `member_response=${declineDecision?.member_response}`
    );

    // --- the server's own refusal --------------------------------------
    const refused = await s.page.request.post(`${BASE}/api/popup-response`, {
      data: { kind: 'priority_done' },
      headers: { 'content-type': 'application/json' },
    });
    const body = await refused.json();
    check('the server refuses a done claim posted straight at it', body?.ok === false, JSON.stringify(body));

    const afterRefusal = await priorityRow(memberId, localDate);
    check(
      'and it wrote nothing: no status change, no done_at',
      afterRefusal.status === 'saved' && afterRefusal.done_at === null,
      `status=${afterRefusal.status} done_at=${afterRefusal.done_at}`
    );
    const refusedDecision = await decisionRow(memberId, localDate);
    check(
      'the ledger still says "later"',
      refusedDecision?.member_response === 'later',
      `member_response=${refusedDecision?.member_response}`
    );
  } finally {
    await closeAs(s);
  }
}

// =====================================================================
// a2. A genuinely self-reported priority still gets its honest Done.
// =====================================================================

async function stageASelfReport() {
  console.log('\n=== a2. The honest Done, on a self-reported priority ===\n');

  const memberId = await memberIdFor(SELF_REPORT_ACCOUNT);
  const localDate = await localDateFor(memberId);
  const captured = await priorityRow(memberId, localDate);
  const capturedDecision = await decisionRow(memberId, localDate);
  if (!captured) throw new Error('the fixture account has no priority row today');

  note(`captured row: ${captured.rule} href=${captured.priority_href} status=${captured.status}`);

  // The engine's own gentle_focus copy, verbatim from lib/priority/copy.ts.
  // The no-goal variant deliberately: it makes no claim about her at all,
  // which is the honest thing to write onto an account whose own stated
  // goal this run has no business asserting.
  const TITLE = 'Nothing is waiting on you today. Notice one moment where your body felt good.';
  const HELP = 'There is nothing to do here. If you want one small thing, take three slow breaths before your next task.';

  const s = await openAs(SELF_REPORT_ACCOUNT);
  try {
    await service
      .from('member_daily_priorities')
      .update({
        rule: 'gentle_focus',
        priority_key: null,
        priority_title: TITLE,
        priority_help: HELP,
        priority_href: null,
        status: 'active',
        done_at: null,
      })
      .eq('member_id', memberId)
      .eq('local_date', localDate);

    await s.page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
    const card = s.page.locator('section', { hasText: TITLE }).first();
    await card.waitFor({ state: 'visible', timeout: 45000 });
    const text = (await card.innerText()).replace(/\s+/g, ' ').trim();
    note(`card reads: ${text}`);

    check('a priority only she can witness still offers Done', /\bDone\b/.test(text));
    check('and sets aside with "Save for later"', text.includes('Save for later'));
    check('it offers no Open, because there is nothing to open', !text.includes('Open '), text);

    const accepted = await s.page.request.post(`${BASE}/api/popup-response`, {
      data: { kind: 'priority_done' },
      headers: { 'content-type': 'application/json' },
    });
    const body = await accepted.json();
    check('the server accepts a done claim for this one', body?.ok === true, JSON.stringify(body));

    const afterDone = await priorityRow(memberId, localDate);
    check(
      'and it really recorded the completion',
      afterDone.status === 'done' && afterDone.done_at !== null,
      `status=${afterDone.status} done_at=${afterDone.done_at}`
    );
  } finally {
    // Put the fixture back exactly as it was found, and read it back.
    await service
      .from('member_daily_priorities')
      .update({
        rule: captured.rule,
        priority_key: captured.priority_key,
        priority_title: captured.priority_title,
        priority_help: captured.priority_help,
        priority_href: captured.priority_href,
        status: captured.status,
        done_at: captured.done_at,
      })
      .eq('member_id', memberId)
      .eq('local_date', localDate);

    if (capturedDecision) {
      await service
        .from('member_coaching_decisions')
        .update({
          member_response: capturedDecision.member_response,
          responded_at: capturedDecision.responded_at,
        })
        .eq('member_id', memberId)
        .eq('local_date', localDate);
    }

    const restored = await priorityRow(memberId, localDate);
    const restoredDecision = await decisionRow(memberId, localDate);
    check(
      'the fixture account was put back exactly as found',
      restored.rule === captured.rule &&
        restored.priority_title === captured.priority_title &&
        restored.priority_href === captured.priority_href &&
        restored.status === captured.status &&
        restored.done_at === captured.done_at &&
        (restoredDecision?.member_response ?? null) === (capturedDecision?.member_response ?? null),
      `${restored.rule} ${restored.status} response=${restoredDecision?.member_response}`
    );
    await closeAs(s);
  }
}

// =====================================================================
// b. The way out of a closing screen.
// =====================================================================

async function assertSharedExit(page, label, expectedLabel = 'Back to Home') {
  const exit = page.locator(`a[href^="/"]:has-text("${expectedLabel}")`).last();
  const visible = await exit.isVisible().catch(() => false);
  check(`${label}: the shared way out is on the screen`, visible);
  if (!visible) return null;

  const box = await exit.boundingBox();
  // The column, not `main`: main carries its own 20px side padding, so the
  // control is full width of the content it sits in, never of the element
  // that pads it.
  const columnWidth = await exit.evaluate((el) => {
    const parent = el.parentElement;
    const style = getComputedStyle(parent);
    return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  });
  check(
    `${label}: it is full width`,
    box.width > columnWidth - 4,
    `${Math.round(box.width)}px of ${Math.round(columnWidth)}px`
  );
  check(`${label}: it is at a real tap height`, box.height >= 48, `${Math.round(box.height)}px`);
  const border = await exit.evaluate((el) => getComputedStyle(el).borderTopWidth);
  check(`${label}: it has a visible edge`, parseFloat(border) > 0, `border ${border}`);
  const body = await page.locator('body').innerText();
  check(`${label}: nothing on it still says Return to Dashboard`, !body.includes('Return to Dashboard'));
  return exit;
}

async function stageB() {
  console.log('\n=== b. The closing screen exit ===\n');

  const memberId = await memberIdFor(OFFER_ACCOUNT);
  const { data: sessions } = await service
    .from('unified_assessment_sessions')
    .select('id, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', 'af1f72dd-d0fc-4688-8794-4190a7299bac')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1);
  const sessionId = sessions?.[0]?.id;
  if (!sessionId) throw new Error('that account has no completed Core Values Snapshot');

  const s = await openAs(OFFER_ACCOUNT);
  try {
    // --- the screen from the screenshot --------------------------------
    await s.page.goto(`${BASE}/assessments/core-values-snapshot/results/${sessionId}`, {
      waitUntil: 'networkidle',
    });
    await s.page.waitForTimeout(1500);
    const exit = await assertSharedExit(s.page, 'Core Values Snapshot closing');
    if (exit) {
      await exit.click();
      await s.page.waitForURL(/\/dashboard/, { timeout: 45000 });
      check('and it goes Home', /\/dashboard/.test(s.page.url()), s.page.url());
    }

    // --- the trial arc's two closings, same package, same control ------
    await s.page.goto(`${BASE}/trial/week`, { waitUntil: 'networkidle' });
    await s.page.waitForTimeout(1500);
    await assertSharedExit(s.page, 'trial arc day 6 recap');

    await s.page.goto(`${BASE}/trial/close`, { waitUntil: 'networkidle' });
    await s.page.waitForTimeout(1500);
    await assertSharedExit(s.page, 'trial arc day 7 close');

    // --- WHERE A COMPLETION ACTUALLY LANDS -----------------------------
    // Walked to the end, because it is not what the code reads like:
    // finishing a take does NOT stop on the taker's own closing beat.
    await s.page.goto(`${BASE}/assessments/core-values-snapshot`, { waitUntil: 'networkidle' });
    await s.page.waitForTimeout(1500);
    const begin = s.page
      .locator('button:visible')
      .filter({ hasText: /Take it again|Let's begin|Resume/ })
      .first();
    if (await begin.isVisible().catch(() => false)) {
      await begin.click();
      await s.page.waitForURL(/\/take/, { timeout: 60000 });
    } else {
      await s.page.goto(`${BASE}/assessments/core-values-snapshot/take`, { waitUntil: 'networkidle' });
    }
    await s.page.waitForTimeout(2000);

    let reachedClose = false;
    let closeSnapshot = '';
    let closeExitBox = null;
    for (let step = 0; step < 40; step += 1) {
      const main = (await s.page.locator('main').innerText()).replace(/\s+/g, ' ');
      if (main.includes('Start the Life Signal Check')) {
        // Captured the instant it is seen. It does not stay: see below.
        reachedClose = true;
        closeSnapshot = main;
        closeExitBox = await s.page
          .locator('a[href="/dashboard"]:has-text("Back to Home")')
          .last()
          .boundingBox()
          .catch(() => null);
        break;
      }
      if (/\/results\//.test(s.page.url())) break;

      const groups = await s.page.locator('[role="radiogroup"]').count();
      if (groups > 0) {
        for (let g = 0; g < groups; g += 1) {
          await s.page.locator('[role="radiogroup"]').nth(g).locator('button').first().click().catch(() => {});
          await s.page.waitForTimeout(110);
        }
      } else {
        // Q12 is two big tiles with no radiogroup role.
        const tile = s.page
          .locator('main button:visible')
          // Never the closing beat's own controls: clicking one of those
          // would navigate off the screen this run exists to look at.
          .filter({
            hasNotText:
              /^(Back|Continue|See what Root learned|Let's begin|Start the Life Signal Check|Not now, back to Home|Back to Home|I'm in: start the 7 days)$/,
          })
          .first();
        if (await tile.isVisible().catch(() => false)) {
          await tile.click().catch(() => {});
          await s.page.waitForTimeout(300);
        }
      }

      const cont = s.page
        .locator('button:visible')
        .filter({ hasText: /^(Continue|See what Root learned|Let's begin)$/ })
        .first();
      if ((await cont.isVisible().catch(() => false)) && !(await cont.isDisabled())) {
        await cont.click();
        await s.page.waitForTimeout(1300);
        continue;
      }
      if ((await s.page.locator('main button:visible').count()) === 0) {
        await s.page.waitForTimeout(2500);
        continue;
      }
      break;
    }

    const landed = s.page.url();
    note(`a completed take landed on: ${landed}`);
    check(
      'the closing a member actually reaches carries the shared way out',
      /\/results\//.test(landed) || reachedClose,
      landed
    );
    if (!reachedClose) {
      note('FINDING: the taker\'s own closing beat (the journey line, Root\'s noticing,');
      note('"What Root knows so far" and the handoff into the next conversation) is not');
      note('reached. Completing is a Server Action, its response re-renders the take');
      note('route, and that route redirects a completed session to the results screen.');
      note('Pre-existing, not caused by this build. See the report.');
    }
    if (/\/results\//.test(landed)) {
      await s.page.waitForTimeout(1200);
      await assertSharedExit(s.page, 'the closing a completion really lands on');
    }
    if (reachedClose) {
      check('the closing beat still invites her into the next conversation', closeSnapshot.includes('Start the Life Signal Check'));
      check(
        'its own decline names Home, so one screen names one place once',
        closeSnapshot.includes('Not now, back to Home'),
        closeSnapshot.includes('back to dashboard') ? 'still says dashboard' : ''
      );
      check(
        'the journey line and What Root knows are untouched on it',
        closeSnapshot.includes('Conversation') && closeSnapshot.includes('What Root knows so far'),
        closeSnapshot.slice(0, 140)
      );
      check(
        'and it ends in the same shared full-width way out',
        !!closeExitBox && closeExitBox.width > 300 && closeExitBox.height >= 48,
        closeExitBox ? `${Math.round(closeExitBox.width)}x${Math.round(closeExitBox.height)}` : 'not found'
      );

      // FOUND HERE, AND IT IS NOT THIS BUILD'S. The closing beat renders
      // and is then replaced: completing is a Server Action, its response
      // re-renders the take route, and that route sends a completed
      // session to the results screen (lib/assessment-runtime/entry.ts's
      // `already_completed` branch, added 2026-08-27). So the premium
      // closing appears for a moment and the member reads the results
      // screen instead. Measured rather than asserted.
      await s.page.waitForTimeout(4000);
      const settled = (await s.page.locator('main').innerText()).replace(/\s+/g, ' ');
      const stillOnClose = settled.includes('Start the Life Signal Check');
      note(`four seconds later the screen is: ${stillOnClose ? 'still the closing beat' : 'the results screen'}`);
      note(`url now: ${s.page.url()}`);
      if (!stillOnClose) {
        note('FINDING (pre-existing, not from this build): the taker closing beat does not');
        note('stay. See the report.');
        await assertSharedExit(s.page, 'the screen it settles on');
      }
    }
  } finally {
    await closeAs(s);
  }
}

// =====================================================================
// c. The Root Map's first screenful.
// =====================================================================

async function stageC() {
  console.log('\n=== c. The Root Map first screenful ===\n');

  const email = process.env.ROOT_MAP_EMAIL || OFFER_ACCOUNT;
  const s = await openAs(email);
  try {
    await s.page.goto(`${BASE}/root-map`, { waitUntil: 'networkidle' });
    await s.page.waitForTimeout(1800);

    const m = await s.page.evaluate(function () {
      function box(sel) {
        var el = document.querySelector(sel);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top + window.scrollY),
          bottom: Math.round(r.bottom + window.scrollY),
        };
      }
      function findText(needle) {
        var all = document.querySelectorAll('p, h1, h2, summary, span');
        for (var i = 0; i < all.length; i += 1) {
          var el = all[i];
          // The colour key's two entries each wrap a coloured dot, so
          // "no children" would skip exactly the elements being measured.
          if (el.querySelector('p, h1, h2, summary')) continue;
          if ((el.textContent || '').indexOf(needle) !== -1) {
            var r = el.getBoundingClientRect();
            return {
              top: Math.round(r.top + window.scrollY),
              bottom: Math.round(r.bottom + window.scrollY),
              text: (el.textContent || '').trim(),
            };
          }
        }
        return null;
      }
      return {
        scrollHeight: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
        svg: box('svg[role="img"]'),
        goldKey: findText('Gold:'),
        greenKey: findText('Green:'),
        orientation: findText('Your wellbeing across'),
        reveal: box('#root-map-all-areas'),
        revealOpen: (document.getElementById('root-map-all-areas') || {}).open === true,
        entryCount: document.querySelectorAll('#root-map-all-areas li').length,
      };
    });

    note(`page is ${m.scrollHeight}px tall in a ${m.viewport}px viewport`);
    note(`ring ${m.svg?.top}..${m.svg?.bottom}, key ${m.goldKey?.top}, orientation ${m.orientation?.top}, reveal ${m.reveal?.top}`);
    note(`orientation line: "${m.orientation?.text}"`);

    check('the ring is in the first screenful', m.svg && m.svg.bottom < m.viewport, `ring ends at ${m.svg?.bottom}`);
    check('the gold and green key is too', m.goldKey && m.greenKey && m.greenKey.bottom < m.viewport, `key ends at ${m.greenKey?.bottom}`);
    check('and one line of orientation', m.orientation && m.orientation.bottom < m.viewport, `line ends at ${m.orientation?.bottom}`);
    // Not required by the brief, and reported rather than asserted: the
    // fold's own summary sits just under the fold on this account, because
    // her one thing today and the named area both come first now.
    note(`the "See all 12 areas" summary sits at ${m.reveal?.top}px, ${m.reveal?.top - m.viewport}px below the fold`);
    check('it is folded when she arrives', m.revealOpen === false);
    check('the page is no longer several screens long', m.scrollHeight < m.viewport * 2, `${m.scrollHeight}px`);

    // --- open it -------------------------------------------------------
    await s.page.locator('#root-map-all-areas summary').click();
    await s.page.waitForTimeout(600);
    const opened = await s.page.evaluate(function () {
      var reveal = document.getElementById('root-map-all-areas');
      var chips = reveal.querySelectorAll('li button span[aria-hidden="true"]');
      var gold = 0;
      var names = [];
      for (var i = 0; i < chips.length; i += 1) {
        var bg = getComputedStyle(chips[i]).backgroundColor;
        var label = chips[i].parentElement.textContent || '';
        if (bg === 'rgb(245, 183, 0)') {
          gold += 1;
          names.push(label.replace(/^\d+/, '').trim());
        }
      }
      // The domains that actually render a finding entry. Gold means "this
      // one has a real earned finding", and those entries are what that
      // finding IS, so the two lists have to be the same list.
      var seeingNames = [];
      reveal.querySelectorAll('[id^="root-map-domain-"]').forEach(function (card) {
        var text = card.textContent || '';
        if (text.indexOf("What We're Seeing") === -1) return;
        var heading = card.querySelector('p, h2, h3');
        if (heading) seeingNames.push((heading.textContent || '').trim());
      });
      return {
        open: reveal.open,
        keyEntries: chips.length,
        gold: gold,
        goldNames: names,
        seeingNames: seeingNames,
        seeing: (reveal.textContent || '').indexOf("What We're Seeing") !== -1,
        building: (reveal.textContent || '').indexOf('Building') !== -1,
        notCovered: (reveal.textContent || '').indexOf('Not Covered Yet') !== -1,
      };
    });

    check('it opens', opened.open === true);
    check('all twelve areas are named inside it', opened.keyEntries === 12, `${opened.keyEntries}`);
    check('with every group of entries', opened.seeing && opened.notCovered, `seeing=${opened.seeing} notCovered=${opened.notCovered}`);
    note(`gold areas on the key: ${opened.gold} (${opened.goldNames.join(', ') || 'none'})`);

    const counted = /Gold marks the (\d+|one)\b/.exec(m.orientation?.text || '');
    const claimed = counted ? (counted[1] === 'one' ? 1 : Number(counted[1])) : 0;
    check(
      'the counted line says exactly what the map paints gold',
      claimed === opened.gold,
      `line says ${claimed}, key shows ${opened.gold}`
    );

    // --- gold, against the entries that ARE the finding -----------------
    note(`entries carrying a real finding: ${opened.seeingNames.join(', ') || 'none'}`);
    const sameSet =
      opened.goldNames.length === opened.seeingNames.length &&
      opened.goldNames.every((name) => opened.seeingNames.includes(name));
    check(
      'every gold area is an area with a real finding behind it, and no other is gold',
      sameSet,
      `gold [${opened.goldNames.join(', ')}] vs findings [${opened.seeingNames.join(', ')}]`
    );

    // --- a tap on a segment still lands --------------------------------
    await s.page.locator('#root-map-all-areas summary').click();
    await s.page.waitForTimeout(400);
    const wedge = s.page.locator('svg[role="img"] path[role="button"]').nth(4);
    await wedge.click();
    await s.page.waitForTimeout(1400);
    const landed = await s.page.evaluate(function () {
      var reveal = document.getElementById('root-map-all-areas');
      return { revealOpen: reveal.open, scrolled: window.scrollY };
    });
    check('tapping a ring segment opens the reveal and scrolls into it', landed.revealOpen === true && landed.scrolled > 0, `scrollY=${landed.scrolled}`);
  } finally {
    await closeAs(s);
  }
}

// =====================================================================

async function main() {
  browser = await chromium.launch();
  try {
    if (STAGE === 'a' || STAGE === 'all') await stageA();
    if (STAGE === 'a2' || STAGE === 'all') await stageASelfReport();
    if (STAGE === 'b' || STAGE === 'all') await stageB();
    if (STAGE === 'c' || STAGE === 'all') await stageC();
  } finally {
    await browser.close();
  }

  console.log('\n--- console and page errors ---');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : 'none');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} (${f.detail})`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
