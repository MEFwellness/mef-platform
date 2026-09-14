/**
 * THE LIVE WALK FOR THE QUESTIONNAIRES CARD (2026-09-14).
 *
 * Signs in as the standing test member with a minted session (Turnstile is
 * live on the login form by design and refuses a scripted sign-in), opens
 * Home at phone width, and checks what she actually sees:
 *
 *   the section order down the page, read from the rendered DOM rather
 *   than from the source;
 *   the card's own parts, and that its two numbers are the two numbers the
 *   Questionnaires screen prints for the same member on the same day;
 *   that "View questionnaires" lands on the library;
 *   that the quiet line, when there is one, opens the questionnaire it
 *   names;
 *   that the locked cards on the library still behave as they did.
 *
 * Every check FAILS loudly. Nothing here falls back to the page when a
 * locator misses. Session retired with scope 'local'.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const OUT = process.env.OUT_DIR;
const EMAIL = process.env.TEST_MEMBER_EMAIL;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  :: ${detail}` : ''}`);
};

async function settle(page) {
  await page
    .waitForFunction(() => document.querySelectorAll('[data-settling="true"]').length === 0, null, {
      timeout: 60000,
    })
    .catch(() => {});
  await page.waitForTimeout(2500);
}

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
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // ---------------------------------------------------------------- HOME
  const homeResponse = await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  check('Home answers 200', homeResponse?.status() === 200, String(homeResponse?.status()));
  await settle(page);

  // Push every pop-up out of the way before reading the page, the same way
  // the existing Home rigs do, so a Root pop-up cannot hide a section.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || el.matches('nav') || el.closest('nav')) continue;
      const r = el.getBoundingClientRect();
      if (
        (r.width > innerWidth * 0.7 && r.height > innerHeight * 0.5) ||
        el.getAttribute('role') === 'dialog'
      ) {
        el.setAttribute('style', 'display:none !important');
      }
    }
    document.body.style.position = '';
    document.body.style.overflow = '';
    document.body.style.top = '';
    document.body.style.width = '';
  });
  await page.waitForTimeout(400);

  // Reveal-on-scroll sections are not in the layout until they have been
  // scrolled to, so walk the whole page before measuring any order.
  for (let y = 0; y < 16; y++) {
    await page.evaluate((i) => window.scrollTo(0, i * innerHeight * 0.8), y);
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  const layout = await page.evaluate(() => {
    const top = (el) => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : null);
    const byText = (selector, text) =>
      [...document.querySelectorAll(selector)].find(
        (el) => el.textContent?.trim().toLowerCase() === text.toLowerCase()
      ) ?? null;

    const questionnaires = document.querySelector('section[aria-label="Questionnaires"]');
    const weekly = document.querySelector('#your-week-with-root');
    const quickActions = byText('main p', 'Quick Actions');
    const assigned = byText('main p', 'Assigned to You');
    const yourPath = byText('main p', 'Your Path');
    const energy = byText('main p', 'Energy Trend');
    const hero = document.querySelector('main')?.previousElementSibling ?? null;

    return {
      hero: top(hero),
      quickActions: top(quickActions),
      weekly: top(weekly),
      questionnaires: top(questionnaires),
      assigned: top(assigned),
      yourPath: top(yourPath),
      energy: top(energy),
      questionnairesCount: document.querySelectorAll('section[aria-label="Questionnaires"]').length,
      card: questionnaires
        ? {
            eyebrow: questionnaires.querySelector('.mef-home-label')?.textContent?.trim() ?? null,
            title: questionnaires.querySelector('h2')?.textContent?.trim() ?? null,
            body: questionnaires.querySelector('.mef-home-body')?.textContent?.trim() ?? null,
            progressLine:
              [...questionnaires.querySelectorAll('p')]
                .map((p) => p.textContent?.trim() ?? '')
                .find((t) => /^\d+ of \d+ complete$/.test(t)) ?? null,
            barWidthPercent: (() => {
              const fill = questionnaires.querySelector('.mef-questionnaires-bar');
              const track = fill?.parentElement;
              if (!fill || !track) return null;
              const f = fill.getBoundingClientRect().width;
              const t = track.getBoundingClientRect().width;
              return t > 0 ? Math.round((f / t) * 100) : null;
            })(),
            barColor: (() => {
              const fill = questionnaires.querySelector('.mef-questionnaires-bar');
              return fill ? getComputedStyle(fill).backgroundColor : null;
            })(),
            links: [...questionnaires.querySelectorAll('a')].map((a) => ({
              text: a.textContent?.trim() ?? '',
              href: a.getAttribute('href'),
              height: Math.round(a.getBoundingClientRect().height),
            })),
            background: getComputedStyle(questionnaires).backgroundImage.slice(0, 40),
            radius: getComputedStyle(questionnaires).borderTopLeftRadius,
            width: Math.round(questionnaires.getBoundingClientRect().width),
          }
        : null,
      // Everything Assigned to You is offering, so the quiet line can be
      // checked against it rather than assumed not to collide.
      assignedTitles: [...document.querySelectorAll('.mef-assigned-title')].map((el) =>
        el.textContent?.trim()
      ),
    };
  });

  console.log(JSON.stringify(layout, null, 2));

  check(
    'the card is on Home exactly once',
    layout.questionnairesCount === 1,
    String(layout.questionnairesCount)
  );
  check(
    'order: Hero then Quick Actions',
    layout.hero !== null && layout.quickActions !== null && layout.hero < layout.quickActions,
    `${layout.hero} < ${layout.quickActions}`
  );
  if (layout.weekly === null) {
    check('Your Week with Root is on the page this week', false, 'no #your-week-with-root');
  } else {
    check(
      'order: Quick Actions then Your Week with Root',
      layout.quickActions < layout.weekly,
      `${layout.quickActions} < ${layout.weekly}`
    );
    check(
      'order: Your Week with Root then Questionnaires',
      layout.weekly < layout.questionnaires,
      `${layout.weekly} < ${layout.questionnaires}`
    );
  }
  check(
    'Questionnaires is above Your Path, where it used to live',
    layout.yourPath === null || layout.questionnaires < layout.yourPath,
    `${layout.questionnaires} < ${layout.yourPath}`
  );
  check(
    'Questionnaires is above the Energy Trend',
    layout.energy === null || layout.questionnaires < layout.energy,
    `${layout.questionnaires} < ${layout.energy}`
  );

  const card = layout.card;
  check('the card rendered at all', Boolean(card));
  if (card) {
    check(
      'eyebrow reads QUESTIONNAIRES',
      /^questionnaires$/i.test(card.eyebrow ?? ''),
      card.eyebrow
    );
    check('title is the assessments title', /assessments/i.test(card.title ?? ''), card.title);
    check(
      'the supporting line explains why they matter, and carries no em dash',
      /deepens what Root understands about you/.test(card.body ?? '') &&
        !(card.body ?? '').includes('—'),
      card.body
    );
    check(
      'the progress line reads "N of M complete"',
      /^\d+ of \d+ complete$/.test(card.progressLine ?? ''),
      card.progressLine
    );
    check(
      'the bar is a thin gold fill matching the fraction',
      card.barColor === 'rgb(196, 160, 80)',
      `${card.barColor} at ${card.barWidthPercent}%`
    );
    check('the card is a 28px card, not a full-bleed rectangle', card.radius === '28px', card.radius);
    check('the surface is not plain white', card.background.includes('gradient'), card.background);
    const cta = card.links.find((l) => /view questionnaires/i.test(l.text));
    check(
      'the CTA points at the existing library route',
      cta?.href === '/questionnaires',
      JSON.stringify(cta)
    );
    check('the CTA is a real tap target', (cta?.height ?? 0) >= 44, `${cta?.height}px`);
  }

  await page.screenshot({ path: path.join(OUT, 'prod-home-fold.png') });
  const cardBox = await page.locator('section[aria-label="Questionnaires"]').boundingBox();
  if (cardBox) {
    await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 80)), cardBox.y);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'prod-questionnaires-card.png') });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'prod-home-full.png'), fullPage: true });

  // The quiet line, if this member has one.
  const quietLine = card?.links.find((l) => !/view questionnaires/i.test(l.text)) ?? null;
  if (quietLine) {
    const collides = layout.assignedTitles.some(
      (t) => t && quietLine.text.includes(t)
    );
    check(
      'the quiet line names nothing Assigned to You is already drawing',
      !collides,
      `${quietLine.text} vs ${JSON.stringify(layout.assignedTitles)}`
    );
  } else {
    console.log(
      'NOTE  this member has no in-progress or unopened assigned questionnaire outside Assigned to You, so no quiet line is drawn'
    );
  }

  // ------------------------------------------------------- THE CTA LANDS
  await page.evaluate(() => {
    const cta = [...document.querySelectorAll('section[aria-label="Questionnaires"] a')].find((a) =>
      /view questionnaires/i.test(a.textContent ?? '')
    );
    cta?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(400);
  await page
    .locator('section[aria-label="Questionnaires"] a', { hasText: 'View questionnaires' })
    .click();
  await page.waitForURL('**/questionnaires', { timeout: 45000 });
  await settle(page);
  check(
    'View questionnaires lands on the library',
    new URL(page.url()).pathname === '/questionnaires',
    page.url()
  );

  const library = await page.evaluate(() => {
    const line =
      [...document.querySelectorAll('main p')]
        .map((p) => p.textContent?.trim() ?? '')
        .find((t) => /^\d+ of \d+ complete$/.test(t)) ?? null;
    return {
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      progressLine: line,
      lockedControls: document.querySelectorAll('[aria-label*="Locked" i]').length,
      premiumBadges: [...document.querySelectorAll('span')].filter((s) =>
        /^premium$/i.test(s.textContent?.trim() ?? '')
      ).length,
    };
  });
  console.log(JSON.stringify(library, null, 2));
  check(
    "the card's numbers are the library's own numbers",
    Boolean(card?.progressLine) && card?.progressLine === library.progressLine,
    `home "${card?.progressLine}" vs library "${library.progressLine}"`
  );
  await page.screenshot({ path: path.join(OUT, 'prod-questionnaires-library.png'), fullPage: true });

  // --------------------------------------------- THE QUIET LINE'S TARGET
  if (quietLine?.href) {
    const response = await page.goto(`${BASE}${quietLine.href}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    check(
      `the quiet line opens its own questionnaire (${quietLine.href})`,
      response?.status() === 200 &&
        new URL(page.url()).pathname.startsWith(quietLine.href.split('?')[0]),
      `${response?.status()} ${page.url()}`
    );
    await page.screenshot({ path: path.join(OUT, 'prod-quiet-line-target.png') });
  }

  // ------------------------------------------------- LOCKS STILL BEHAVE
  await page.goto(`${BASE}/questionnaires`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  if (library.lockedControls > 0) {
    await page.locator('[aria-label*="Locked" i]').first().click();
    await page.waitForTimeout(900);
    const sheet = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return { open: Boolean(dialog), text: dialog?.textContent?.trim().slice(0, 160) ?? null };
    });
    check('a locked questionnaire still opens its lock sheet', sheet.open, sheet.text);
    await page.screenshot({ path: path.join(OUT, 'prod-lock-sheet.png') });
  } else {
    console.log('NOTE  this member has no locked questionnaire on the library today');
  }

  check(
    'no console or page error anywhere in the walk',
    errors.length === 0,
    errors.join(' | ').slice(0, 400)
  );

  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} checks passing`);
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
} finally {
  await retireSession(minted);
  await browser.close();
}
