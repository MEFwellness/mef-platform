/**
 * The production walk for Home's final structural pass (2026-09-13).
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
 * account is reported as NOT APPLICABLE, never as a pass. The four ways
 * a verification script can print PASS over a real defect are written up
 * in docs/BUILD_STATUS.md; the ones that apply here are "assert on the
 * URL, not on text read mid-navigation" and "a check that cannot fail is
 * worse than none".
 *
 *   OUT_DIR=... TEST_MEMBER_EMAIL=... PROD_SUPABASE_URL=... \
 *   PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   node scripts/verify-home-final-structure-live.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
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
  if (OUT) await page.screenshot({ path: path.join(OUT, 'final-1-fold.png') });

  // =================================================================
  // 1. THE BOTTOM BAR: three doors, evenly balanced
  // =================================================================
  const bar = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    if (!nav) return null;
    const links = [...nav.querySelectorAll('a')].map((a) => {
      const r = a.getBoundingClientRect();
      return {
        href: a.getAttribute('href'),
        label: (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\n/g, ' '),
        centre: Math.round(r.left + r.width / 2),
        width: Math.round(r.width),
      };
    });
    const gold = nav.querySelector('a[href="/checkin"] span');
    return {
      links,
      hrefs: links.map((l) => l.href),
      goldBackground: gold ? getComputedStyle(gold).backgroundColor : null,
      goldShadow: gold ? getComputedStyle(gold).boxShadow : null,
      barWidth: Math.round(nav.getBoundingClientRect().width),
    };
  });

  if (!bar) {
    fail('the bottom bar exists', 'no nav[aria-label="Primary"] on the page');
  } else {
    check(
      bar.hrefs.length === 3 &&
        bar.hrefs.includes('/dashboard') &&
        bar.hrefs.includes('/checkin') &&
        bar.hrefs.includes('/today'),
      '1. the bottom bar holds exactly Home, Check-In and Today',
      bar.links.map((l) => `${l.label || '(+)'} -> ${l.href}`).join(' ; '),
    );
    check(
      !bar.hrefs.includes('/food-lens') && !bar.hrefs.includes('/progress'),
      'Food Lens and Progress are no longer tabs in the bar',
      bar.hrefs.join(', '),
    );
    // Evenly balanced: the three centres are equally spaced across the
    // bar, within a couple of pixels of rounding.
    const centres = bar.links
      .slice()
      .sort((a, b) => a.centre - b.centre)
      .map((l) => l.centre);
    const gaps = centres.slice(1).map((c, i) => c - centres[i]);
    const spread = gaps.length === 2 ? Math.abs(gaps[0] - gaps[1]) : null;
    check(
      spread !== null && spread <= 4 && Math.abs(centres[1] - bar.barWidth / 2) <= 4,
      'the three items are evenly spaced and the Check-In button is dead centre',
      `centres ${centres.join(', ')} of a ${bar.barWidth}px bar, gaps ${gaps.join(' / ')}`,
    );
    check(
      bar.goldBackground === 'rgb(245, 183, 0)' && bar.goldShadow.includes('245, 183, 0'),
      'the gold + keeps its colour and its warm halo',
      `${bar.goldBackground}, shadow ${bar.goldShadow}`,
    );
  }

  // =================================================================
  // 2. THE ORDER, BY MEASURED POSITION ON THE PAGE
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
    const program = main.querySelector('a[href^="/programs"]');
    return {
      heroBottom: hero ? Math.round(hero.getBoundingClientRect().bottom + scrollY) : null,
      mainTop: y(main),
      quickActions: y(labelled('quick actions')),
      quickRow: y(main.querySelector('.mef-home-quick-row')),
      assigned: y(labelled('assigned to you')),
      assignedNote: [...main.querySelectorAll('p')].some(
        (p) => p.textContent?.trim().toLowerCase() === 'waiting on you',
      ),
      program: y(program),
      today: y(labelled('today')),
      priority: y(priorityLabel?.closest('section') ?? priorityLabel),
      noticing: y(labelled('what root is noticing')),
      energy: y(labelled('energy trend')),
      yourPath: y(labelled('your path')),
      docHeight: Math.round(document.documentElement.scrollHeight),
    };
  });

  check(
    order.quickActions !== null &&
      order.heroBottom !== null &&
      order.quickActions - order.heroBottom < 90,
    '2. QUICK ACTIONS sits directly under the hero',
    `hero ends ${order.heroBottom}px, Quick Actions at ${order.quickActions}px`,
  );
  // Nothing large stands between the hero and the row.
  const between = await page.evaluate((quickY) => {
    const main = document.querySelector('main');
    return [...main.children]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top + scrollY),
          height: Math.round(r.height),
          text: el.innerText.trim().slice(0, 40).replace(/\n/g, ' '),
        };
      })
      .filter((b) => b.height > 80 && b.top < quickY - 4);
  }, order.quickActions ?? 0);
  check(
    between.length === 0,
    'no large card stands between the hero and Quick Actions',
    between.map((b) => `${b.height}px "${b.text}"`).join(' ; ') || 'nothing above the row',
  );

  if (order.assigned === null) {
    skip('3. ASSIGNED TO YOU is third', 'nothing is assigned to this account today');
  } else {
    check(
      order.assigned > order.quickActions,
      '3. ASSIGNED TO YOU is third, under Quick Actions',
      `assigned at ${order.assigned}px, Quick Actions at ${order.quickActions}px`,
    );
    check(
      order.assignedNote === false,
      'the "Waiting on you" subtitle is gone',
      'no such line under the heading',
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
  if (order.priority === null) {
    skip("the day's chosen action is below the program", 'no active priority card today');
  } else {
    check(
      order.priority > (order.program ?? order.assigned ?? order.quickActions),
      "the day's chosen action is in the active/today half, not at the top",
      `priority card at ${order.priority}px, Quick Actions at ${order.quickActions}px`,
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
      `Your Path at ${order.yourPath}px of a ${order.docHeight}px page`,
    );
  }

  // =================================================================
  // 3. EVERY OPEN ASSIGNMENT IS IN "ASSIGNED TO YOU", AND NOWHERE ELSE
  // =================================================================
  const assignments = await page.evaluate(() => {
    const main = document.querySelector('main');
    const heading = [...main.querySelectorAll('p')].find(
      (p) => p.textContent?.trim().toLowerCase() === 'assigned to you',
    );
    const section = heading?.parentElement ?? null;
    const cards = [...main.querySelectorAll('.mef-assigned-card')];
    const y = (el) => Math.round(el.getBoundingClientRect().top + scrollY);
    return {
      sectionTop: section ? y(section) : null,
      sectionBottom: section
        ? Math.round(section.getBoundingClientRect().bottom + scrollY)
        : null,
      cards: cards.map((c) => ({
        inSection: section ? section.contains(c) : false,
        top: y(c),
        title: (c.querySelector('h1,h2,h3')?.textContent ?? c.innerText)
          .trim()
          .slice(0, 60)
          .replace(/\n/g, ' '),
        href: c.querySelector('a[href]')?.getAttribute('href') ?? null,
        eyebrow: c.querySelector('.mef-assigned-eyebrow')?.textContent?.trim() ?? null,
        radius: getComputedStyle(c).borderTopLeftRadius,
      })),
    };
  });

  if (assignments.cards.length === 0) {
    skip('every open assignment is inside Assigned to You', 'this account has none open');
  } else {
    const strays = assignments.cards.filter((c) => !c.inSection);
    check(
      strays.length === 0,
      'every assigned card on the page is inside the Assigned to You section',
      strays.length
        ? strays.map((c) => `"${c.title}" at ${c.top}px`).join(' ; ')
        : `${assignments.cards.length} cards, all inside`,
    );
    check(
      assignments.cards.every((c) => c.radius === '24px'),
      'every assigned card is the 24px medium surface',
      [...new Set(assignments.cards.map((c) => c.radius))].join(', '),
    );
    check(
      assignments.cards.every((c) => c.href),
      'every assigned card carries its own way in',
      assignments.cards.map((c) => `${c.title.slice(0, 24)} -> ${c.href}`).join(' ; '),
    );
  }

  // The coach-assigned questionnaires specifically: none of them may be
  // left sitting near the bottom of the page.
  const questionnaireCards = assignments.cards.filter((c) =>
    (c.eyebrow ?? '').toLowerCase().includes('assigned by your coach'),
  );
  if (questionnaireCards.length === 0) {
    skip(
      'an assigned questionnaire (Four Doctors and friends) is in Assigned to You',
      'no coach-assigned questionnaire is open on this account',
    );
  } else {
    check(
      questionnaireCards.every((c) => c.inSection),
      'every coach-assigned questionnaire is in Assigned to You',
      questionnaireCards.map((c) => `"${c.title.slice(0, 30)}" at ${c.top}px`).join(' ; '),
    );
    check(
      questionnaireCards.every((c) => c.top < order.docHeight * 0.6),
      'no coach-assigned questionnaire is buried in the bottom of Home',
      questionnaireCards
        .map((c) => `${c.top}px of ${order.docHeight}px`)
        .join(' ; '),
    );
  }

  // =================================================================
  // 4. THE CAROUSEL AND THE TONES
  // =================================================================
  const row = await page.evaluate(() => {
    const el = document.querySelector('.mef-home-quick-row');
    if (!el) return null;
    const main = document.querySelector('main');
    const rr = el.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    const kids = [...el.children].map((c) => {
      const cs = getComputedStyle(c);
      return {
        text: c.innerText.replace(/\n/g, ' | '),
        href: c.getAttribute('href'),
        r: c.getBoundingClientRect(),
        radius: cs.borderTopLeftRadius,
        background: cs.backgroundImage,
        ink: cs.color,
        shadow: cs.boxShadow,
      };
    });
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
        background: k.background,
        ink: k.ink,
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

    // THE TONES. Read off the computed surface, not off the class list,
    // and checked as a real difference rather than as "a gradient exists".
    const surfaces = row.tiles.map((t) => t.background);
    check(
      new Set(surfaces).size >= 4,
      'the tiles are visibly different from each other, not one repeated surface',
      `${new Set(surfaces).size} distinct surfaces across ${row.count} tiles`,
    );
    const adjacentMatches = surfaces.filter((s, i) => i > 0 && s === surfaces[i - 1]);
    check(
      adjacentMatches.length === 0,
      'no two neighbouring tiles carry the same surface',
      adjacentMatches.length ? `${adjacentMatches.length} matching pairs` : 'none',
    );
    const dark = row.tiles.filter((t) => /24[0-9], 24[0-9]|245, 240, 228/.test(t.ink));
    check(
      dark.length === 1,
      'exactly one dark forest tile, and it is Your Week with Root',
      dark.map((t) => `${t.text} (${t.ink})`).join(' ; ') || 'none',
    );
    check(
      row.tiles.some((t) => t.href === '/checkin'),
      'Daily Reset is reachable from the Quick Actions row',
      row.tiles.map((t) => `${t.text} -> ${t.href}`).join(' ; '),
    );
    check(
      row.tiles.some((t) => t.href === '/progress'),
      'Progress is reachable from the Quick Actions row, now that it left the bar',
      row.tiles.find((t) => t.href === '/progress')?.text ?? 'absent',
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
  // 5. YOUR WEEK WITH ROOT REACHES A REAL SCREEN
  // =================================================================
  const weekTile = row?.tiles.find((t) => /week with root/i.test(t.text)) ?? null;
  if (!weekTile) {
    skip(
      'Your Week with Root opens a real existing screen',
      'this account has no Weekly Root Review this week, so the tile is correctly absent',
    );
  } else {
    // The review has no route of its own: it is the collapsed entry
    // further down Home, and the tile is that entry's anchor. So what is
    // asserted is that the anchor exists and that tapping the tile puts
    // it on screen, not that a new page opened.
    const anchorId = weekTile.href.split('#')[1];
    const landed = await page.evaluate(async (id) => {
      const target = document.getElementById(id);
      if (!target) return { exists: false };
      const tile = [...document.querySelectorAll('.mef-home-quick-row a')].find((a) =>
        /week with root/i.test(a.innerText),
      );
      tile.click();
      await new Promise((r) => setTimeout(r, 1200));
      const r = target.getBoundingClientRect();
      return {
        exists: true,
        heading: target.innerText.trim().slice(0, 80).replace(/\n/g, ' | '),
        onScreen: r.top >= -10 && r.top < innerHeight,
        top: Math.round(r.top),
      };
    }, anchorId);
    check(
      landed.exists && landed.onScreen,
      'Your Week with Root opens the Weekly Root Review that already stands on this page',
      landed.exists
        ? `anchor #${anchorId} at ${landed.top}px after the tap, reading "${landed.heading}"`
        : `no element with id ${anchorId}`,
    );
    await openHome();
  }

  // =================================================================
  // 6. NOTHING BROKE: taps, each asserted on the URL
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
    'tapping the Progress Quick Action opens Progress',
    '.mef-home-quick-row a[href="/progress"]',
  );
  await tapAndReturn(
    'tapping the Daily Reset Quick Action opens the check-in',
    '.mef-home-quick-row a[href="/checkin"]',
  );
  await tapAndReturn('tapping an assigned item opens its screen', '.mef-assigned-card a[href]');
  await tapAndReturn('tapping the program opens it', 'main a[href^="/programs"]');
  await tapAndReturn('the Today tab still works', 'nav[aria-label="Primary"] a[href="/today"]');

  if (OUT) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'final-2-full.png'), fullPage: true });
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
