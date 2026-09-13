/**
 * The production walk for the Home editorial pass (2026-09-13).
 *
 * It measures rather than admires. Every check below is a number or a
 * fact read off the real rendered page at 390x844 on app.mefwellness.com,
 * as the seeded test member, through a one-time session minted from the
 * service-role key and retired immediately afterwards. Turnstile is live
 * on the auth forms and correctly refuses a scripted browser, which is
 * why this never touches the login form.
 *
 * WHAT IT REFUSES TO DO. It never files a check-in, never logs an
 * experiment day, never completes an assignment. It opens things and
 * comes back, which is exactly what "nothing functional broke" needs.
 *
 * WHAT IT WILL NOT PRETEND. A section that does not exist for this
 * account (no program assigned, nothing outstanding) is reported as NOT
 * APPLICABLE, never as a pass. The four ways a verification script can
 * print PASS over a real defect are written up in
 * docs/BUILD_STATUS.md; the ones that apply here are "assert on the URL,
 * not on text read mid-navigation" and "a check that cannot fail is
 * worse than none".
 *
 *   OUT_DIR=... TEST_MEMBER_EMAIL=... PROD_SUPABASE_URL=... \
 *   PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   node scripts/verify-home-editorial-live.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const OUT = process.env.OUT_DIR;
const EMAIL = process.env.TEST_MEMBER_EMAIL;

const results = [];
const pass = (name, detail) => results.push({ ok: true, name, detail });
const fail = (name, detail) => results.push({ ok: false, name, detail });
const skip = (name, detail) => results.push({ ok: null, name, detail });
const check = (ok, name, detail) => (ok ? pass(name, detail) : fail(name, detail));

const browser = await chromium.launch();
let minted = null;
try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) throw new Error('could not mint a session');

  const page = await minted.context.newPage();
  page.setDefaultTimeout(45000);
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  async function settle() {
    await page
      .waitForFunction(() => document.querySelectorAll('[data-settling="true"]').length === 0, null, {
        timeout: 60000,
      })
      .catch(() => {});
    await page.waitForTimeout(2500);
  }

  async function hideOverlays() {
    return page.evaluate(() => {
      const hidden = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || el.matches('nav') || el.closest('nav')) continue;
        const r = el.getBoundingClientRect();
        if (
          (r.width > innerWidth * 0.7 && r.height > innerHeight * 0.5) ||
          el.getAttribute('role') === 'dialog'
        ) {
          el.setAttribute('style', 'display:none !important');
          hidden.push(el.getAttribute('role') || el.tagName);
        }
      }
      document.body.style.position = '';
      document.body.style.overflow = '';
      document.body.style.top = '';
      document.body.style.width = '';
      return hidden;
    });
  }

  /** Walk the whole page so every RevealOnScroll section has actually painted. */
  async function revealAll() {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 500) {
      await page.evaluate((v) => scrollTo(0, v), y);
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(600);
  }

  async function openHome() {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await settle();
    await hideOverlays();
    await revealAll();
  }

  await openHome();
  if (OUT) await page.screenshot({ path: path.join(OUT, 'editorial-1-fold.png') });

  // =================================================================
  // 1. THE ORDER, BY MEASURED POSITION ON THE PAGE
  // =================================================================
  const order = await page.evaluate(() => {
    const main = document.querySelector('main');
    const y = (el) => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : null);
    const labelled = (text) =>
      [...main.querySelectorAll('p')].find(
        (p) => p.textContent?.trim().toLowerCase() === text.toLowerCase(),
      ) ?? null;
    const hero = main.previousElementSibling;
    const priorityLabel = labelled('your priority today');
    const focusLine = [...main.querySelectorAll('a')].find((a) =>
      /today/i.test(a.getAttribute('href') ?? ''),
    );
    const program = main.querySelector('a[href^="/programs"]');
    return {
      heroBottom: hero ? Math.round(hero.getBoundingClientRect().bottom + scrollY) : null,
      priority: y(priorityLabel?.closest('section') ?? priorityLabel) ?? y(focusLine),
      quickActions: y(labelled('quick actions')),
      quickRow: y(main.querySelector('.mef-home-quick-row')),
      assigned: y(labelled('assigned to you')),
      program: y(program),
      today: y(labelled('today')),
      noticing: y(labelled('what root is noticing')),
      energy: y(labelled('energy trend')),
      yourPath: y(labelled('your path')),
      docHeight: Math.round(document.documentElement.scrollHeight),
    };
  });

  check(
    order.priority !== null && order.heroBottom !== null && order.priority >= order.heroBottom,
    '1. HERO leads, and the day’s one action sits directly under it',
    `hero ends ${order.heroBottom}px, priority at ${order.priority}px`,
  );
  check(
    order.quickActions !== null && order.priority !== null && order.quickActions > order.priority,
    '2. QUICK ACTIONS is second, under the hero and the day’s action',
    `quick actions at ${order.quickActions}px`,
  );
  if (order.assigned === null) {
    skip('3. ASSIGNED TO YOU is third', 'nothing is assigned to this account today');
  } else {
    check(
      order.assigned > order.quickActions,
      '3. ASSIGNED TO YOU is third, under Quick Actions',
      `assigned at ${order.assigned}px`,
    );
  }
  if (order.program === null) {
    skip('4. YOUR PROGRAM is fourth', 'this account has no live program');
  } else {
    const above = order.assigned ?? order.quickActions;
    check(
      order.program > above,
      '4. YOUR PROGRAM is fourth, under what is assigned to her',
      `program at ${order.program}px, section above at ${above}px`,
    );
  }
  if (order.today === null) {
    skip('5. WEEKLY / ACTIVE is fifth', 'no weekly or active block renders for this account');
  } else {
    check(
      order.today > (order.program ?? order.assigned ?? order.quickActions),
      '5. WEEKLY / ACTIVE is fifth',
      `Today at ${order.today}px`,
    );
  }
  const insights = order.noticing ?? order.energy;
  if (insights === null) {
    skip('6. INSIGHTS is sixth', 'neither insight section renders for this account');
  } else {
    check(
      insights > (order.today ?? order.program ?? order.quickActions),
      '6. INSIGHTS is sixth',
      `first insight section at ${insights}px`,
    );
  }
  if (order.yourPath === null) {
    skip('7. YOUR PATH is last', 'this account has no Your Path section');
  } else {
    check(
      order.yourPath > (insights ?? order.today ?? order.quickActions),
      '7. YOUR PATH / history is last',
      `Your Path at ${order.yourPath}px`,
    );
  }

  // =================================================================
  // 2. THE CAROUSEL: the peek is the whole promise
  // =================================================================
  const row = await page.evaluate(() => {
    const el = document.querySelector('.mef-home-quick-row');
    if (!el) return null;
    const main = document.querySelector('main');
    const rr = el.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    const kids = [...el.children].map((c) => ({
      text: c.innerText.replace(/\n/g, ' | '),
      href: c.getAttribute('href'),
      r: c.getBoundingClientRect(),
      radius: getComputedStyle(c).borderTopLeftRadius,
      shadow: getComputedStyle(c).boxShadow,
    }));
    const third = kids[2];
    const visible = third
      ? Math.max(0, Math.min(third.r.right, rr.right) - Math.max(third.r.left, rr.left))
      : 0;
    return {
      count: kids.length,
      tiles: kids.map((k) => ({
        text: k.text,
        href: k.href,
        left: Math.round(k.r.left),
        width: Math.round(k.r.width),
        height: Math.round(k.r.height),
        radius: k.radius,
      })),
      contentLeft: Math.round(main.getBoundingClientRect().left + parseFloat(mainStyle.paddingLeft)),
      rowLeft: Math.round(rr.left),
      peekPx: Math.round(visible),
      peekPct: third ? Math.round((visible / third.r.width) * 100) : 0,
      scrollable: el.scrollWidth > el.clientWidth,
      maxScroll: Math.round(el.scrollWidth - el.clientWidth),
      pageOverflowsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      clipped: [...el.querySelectorAll('.mef-home-quick-label, .mef-home-quick-hint')]
        .filter((e) => e.scrollWidth > e.clientWidth + 1)
        .map((e) => e.textContent),
      litTiles: kids.filter((k) => k.shadow.includes('196, 160, 80')).map((k) => k.text),
    };
  });

  if (!row) {
    fail('the Quick Actions row exists', 'no .mef-home-quick-row on the page');
  } else {
    check(row.count >= 3, 'the row holds at least three tiles', `${row.count} tiles`);
    check(
      row.rowLeft === row.contentLeft,
      'the first tile aligns with the page content column',
      `row left ${row.rowLeft}px, content left ${row.contentLeft}px`,
    );
    check(
      row.peekPct >= 15 && row.peekPct <= 25,
      'the next tile is 15 to 25 percent visible at rest',
      `${row.peekPx}px of ${row.tiles[2]?.width}px = ${row.peekPct}%`,
    );
    check(row.scrollable, 'the row really scrolls', `${row.maxScroll}px of travel`);
    check(!row.pageOverflowsX, 'the page itself does not scroll sideways', 'no document overflow');
    check(row.clipped.length === 0, 'no tile label or hint is cut off', row.clipped.join(', ') || 'none');
    check(
      row.litTiles.length <= 1,
      'at most one tile is lit, so the glow still means something',
      row.litTiles.length ? `lit: ${row.litTiles[0]}` : 'none lit (today is already logged)',
    );
    check(
      row.tiles.every((t) => t.radius === '18px'),
      'every tile carries the 18px action radius',
      [...new Set(row.tiles.map((t) => t.radius))].join(', '),
    );
    check(
      row.tiles.some((t) => t.href === '/checkin'),
      'Daily Reset is reachable from the Quick Actions row',
      row.tiles.map((t) => `${t.text} -> ${t.href}`).join(' ; '),
    );
  }

  // Swipe it, and read the position off the real element afterwards.
  if (row?.scrollable) {
    const swiped = await page.evaluate(() => {
      const el = document.querySelector('.mef-home-quick-row');
      el.scrollLeft = el.scrollWidth;
      return new Promise((resolve) =>
        setTimeout(() => {
          const kids = [...el.children];
          const last = kids[kids.length - 1].getBoundingClientRect();
          const rr = el.getBoundingClientRect();
          resolve({
            scrollLeft: Math.round(el.scrollLeft),
            lastFullyVisible: last.right <= rr.right + 1 && last.left >= rr.left - 1,
            lastText: kids[kids.length - 1].innerText.replace(/\n/g, ' | '),
          });
        }, 700),
      );
    });
    check(
      swiped.scrollLeft > 0 && swiped.lastFullyVisible,
      'swiping the row brings the last tile fully into view',
      `scrolled ${swiped.scrollLeft}px, last tile "${swiped.lastText}"`,
    );
    await page.evaluate(() => {
      document.querySelector('.mef-home-quick-row').scrollLeft = 0;
    });
  }

  // =================================================================
  // 3. THE DAILY RESET IS NO LONGER A BIG CARD ON HOME
  // =================================================================
  const dailyReset = await page.evaluate(() => {
    const main = document.querySelector('main');
    const big = [...main.querySelectorAll('section, a, div')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 250 || r.height < 140) return false;
        if (el.closest('.mef-home-quick-row')) return false;
        return /daily reset|check.?in/i.test(el.innerText ?? '');
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)} "${el.innerText.trim().slice(0, 50)}"`;
      });
    const navButton = document.querySelector('nav a[href="/checkin"]');
    const nb = navButton?.getBoundingClientRect();
    return {
      bigBlocks: big.slice(0, 3),
      navHref: navButton?.getAttribute('href') ?? null,
      navSize: nb ? `${Math.round(nb.width)}x${Math.round(nb.height)}` : null,
    };
  });
  check(
    dailyReset.bigBlocks.length === 0,
    'the Daily Reset is not a large card on Home any more',
    dailyReset.bigBlocks.join(' ; ') || 'no large check-in block in <main>',
  );
  check(
    dailyReset.navHref === '/checkin',
    'the gold + button still reaches the Daily Reset from every screen',
    `${dailyReset.navHref}, ${dailyReset.navSize}`,
  );

  // =================================================================
  // 4. THE RADIUS LADDER, WHICH IS THE HIERARCHY
  // =================================================================
  const ladder = await page.evaluate(() => {
    const main = document.querySelector('main');
    const feature = main.querySelector('.mef-home-feature');
    const assigned = [...main.querySelectorAll('.mef-assigned-card')];
    const program = main.querySelector('a[href^="/programs"]');
    return {
      feature: feature ? getComputedStyle(feature).borderTopLeftRadius : null,
      assigned: [...new Set(assigned.map((a) => getComputedStyle(a).borderTopLeftRadius))],
      assignedCount: assigned.length,
      program: program ? getComputedStyle(program).borderTopLeftRadius : null,
      hairlines: [...main.querySelectorAll('.mef-home-section-quiet')].length,
    };
  });
  if (ladder.feature === null) {
    skip('the day’s action is the 32px feature surface', 'today’s priority is already done or saved');
  } else {
    check(
      ladder.feature === '32px',
      'the day’s action is the 32px feature surface',
      ladder.feature,
    );
  }
  if (ladder.assignedCount === 0) {
    skip('an assigned card is the 24px medium surface', 'nothing assigned to this account today');
  } else {
    check(
      ladder.assigned.length === 1 && ladder.assigned[0] === '24px',
      'every assigned card is the 24px medium surface',
      `${ladder.assignedCount} cards at ${ladder.assigned.join(', ')}`,
    );
  }
  if (ladder.program === null) {
    skip('the program card is the 32px feature surface', 'this account has no live program');
  } else {
    check(ladder.program === '32px', 'the program card is the 32px feature surface', ladder.program);
  }
  check(
    ladder.hairlines >= 1,
    'the quieter half of the page opens with a hairline rather than another card',
    `${ladder.hairlines} hairline sections`,
  );

  // =================================================================
  // 5. NOTHING BROKE: three taps, each asserted on the URL
  // =================================================================
  async function tapAndReturn(name, selector) {
    const href = await page.getAttribute(selector, 'href').catch(() => null);
    if (!href) {
      skip(name, 'nothing of that kind is on this account’s Home');
      return;
    }
    await page.click(selector);
    await page.waitForURL((u) => !u.pathname.endsWith('/dashboard'), { timeout: 30000 }).catch(() => {});
    const landed = new URL(page.url()).pathname;
    check(landed !== '/dashboard' && landed.startsWith(href.split('?')[0].slice(0, 8)), name, `${href} -> ${landed}`);
    await openHome();
  }

  await tapAndReturn(
    'tapping a Quick Action opens its screen',
    '.mef-home-quick-row a[href="/progress"]',
  );
  await tapAndReturn(
    'tapping an assigned item opens its screen',
    '.mef-assigned-card a[href]',
  );
  await tapAndReturn('tapping the program opens it', 'main a[href^="/programs"]');

  if (OUT) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'editorial-2-full.png'), fullPage: true });
  }

  check(consoleErrors.length === 0, 'no console or page errors on any screen visited', consoleErrors.join(' | ') || 'none');
} finally {
  if (minted) await retireSession(minted);
  await browser.close();
}

const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
for (const r of results) {
  console.log(`${r.ok === null ? 'N/A ' : r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ::  ${r.detail}`);
}
console.log(
  `\n${results.length - failed.length - skipped.length}/${results.length - skipped.length} passed, ${skipped.length} not applicable`,
);
process.exitCode = failed.length ? 1 : 0;
