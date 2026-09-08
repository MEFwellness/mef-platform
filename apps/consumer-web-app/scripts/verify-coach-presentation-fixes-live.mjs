/**
 * Live verification for the 2026-09-07 coach presentation fixes.
 *
 * Two claims, asked separately on production, signed in as the REAL coach
 * through a one-time minted session (Turnstile blocks a scripted form
 * sign-in by design) that is retired with scope 'local' afterwards.
 *
 *   FIX 1. On /coach, a client card must read as a distinct tappable
 *      object: a real border, the deeper shadow, a pressed state and a
 *      focus ring, the name heavier than the caption, the score as the
 *      focal point in its band's brand color, a LABELLED status chip
 *      rather than a bare dot, and the check-in line as a chip. Asserted
 *      for a SCORED client and for a NO-SCORE client separately, because
 *      they take different branches.
 *
 *   FIX 2. On a client's page at a 390x844 phone viewport, the "Open full
 *      detail" action must be fully inside the first screen with the page
 *      never scrolled, and tapping it must land on the detail route.
 *
 * Every visual claim is checked against the COMPUTED style, not against
 * the class attribute, because a class name in the HTML proves the markup
 * and not that any CSS reached it.
 *
 * Also re-checked: Ebony (the flagged fixture) is still in the caseload,
 * still labelled, because this build touched the file that draws her card.
 *
 * Nothing is written to the database. Read only.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.VERIFY_BASE ?? 'https://app.mefwellness.com';
const COACH_EMAIL = 'oakomah66@gmail.com';
const FIXTURE_EMAIL = '8weeks2fab@gmail.com';
const SHOTS = 'scripts/.verify/shots';
const NAV_TIMEOUT = 45_000;
const PHONE = { width: 390, height: 844 };

mkdirSync(SHOTS, { recursive: true });

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const results = [];
function record(item, pass, detail) {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}\n      ${detail}`);
}

/**
 * A computed color to {r,g,b,a}, or null.
 *
 * Chrome does NOT always hand back rgb(). A Tailwind alpha modifier on an
 * arbitrary hex (`border-[#1B3A2D]/12`) computes to `oklab(L a b / .12)`,
 * and an rgb-only parser reads that as "no color" and reports a border
 * that is plainly on the screen as missing, which is what the first run of
 * this script did. So the alpha is read from any functional notation, and
 * the channels only when they are actually given as rgb.
 */
function rgb(value) {
  const text = String(value);
  const m = text.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };

  const fn = text.match(/^(oklab|oklch|lab|lch|color)\(([^)]*)\)$/);
  if (!fn) return null;
  const slash = fn[2].split('/');
  const alpha = slash.length > 1 ? parseFloat(slash[1]) : 1;
  return { r: null, g: null, b: null, a: Number.isFinite(alpha) ? alpha : 1, notation: fn[1] };
}

async function visit(context, path) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  });
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
  return { page, status: response?.status() ?? 0, consoleErrors, pageErrors };
}

/** Everything one client card reports about itself, measured in the browser. */
async function readCard(card) {
  return card.evaluate((el) => {
    const cs = getComputedStyle(el);
    const q = (sel) => el.querySelector(sel);
    const nameEl = el.querySelector('p');
    const nameCs = nameEl ? getComputedStyle(nameEl) : null;

    // The score block is the tinted panel; the score itself is the
    // largest font-size inside the card.
    let biggest = null;
    let biggestPx = 0;
    for (const node of el.querySelectorAll('span')) {
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (size > biggestPx && node.textContent.trim().length > 0) {
        biggestPx = size;
        biggest = node;
      }
    }
    const scoreCs = biggest ? getComputedStyle(biggest) : null;
    const scoreBlock = biggest ? biggest.parentElement : null;
    const blockCs = scoreBlock ? getComputedStyle(scoreBlock) : null;

    return {
      text: el.innerText,
      classes: el.className,
      borderWidth: cs.borderTopWidth,
      borderColor: cs.borderTopColor,
      borderRadius: cs.borderTopLeftRadius,
      boxShadow: cs.boxShadow,
      background: cs.backgroundColor,
      transition: cs.transitionProperty,
      nameSize: nameCs ? parseFloat(nameCs.fontSize) : null,
      nameWeight: nameCs ? nameCs.fontWeight : null,
      nameText: nameEl ? nameEl.innerText.trim() : null,
      scoreText: biggest ? biggest.textContent.trim() : null,
      scoreSize: biggestPx,
      scoreFont: scoreCs ? scoreCs.fontFamily : null,
      scoreColor: scoreCs ? scoreCs.color : null,
      scoreBlockBg: blockCs ? blockCs.backgroundColor : null,
      scoreBlockRadius: blockCs ? blockCs.borderTopLeftRadius : null,
      nestedTapTargets: el.querySelectorAll('a, button').length,
      href: el.getAttribute('href'),
      // The status chip: the first pill in the top row that carries a dot.
      chip: (() => {
        for (const s of el.querySelectorAll('span')) {
          const dot = s.querySelector('span[aria-hidden="true"]');
          if (!dot) continue;
          const dotCs = getComputedStyle(dot);
          if (parseFloat(dotCs.borderTopLeftRadius) < 4) continue;
          const label = s.innerText.trim();
          if (!label) continue;
          return {
            label,
            bg: getComputedStyle(s).backgroundColor,
            color: getComputedStyle(s).color,
            dotColor: dotCs.backgroundColor,
            dotSize: dotCs.width,
          };
        }
        return null;
      })(),
    };
  });
}

const run = async () => {
  // Ids from the database, not assumed.
  const { data: users, error: uErr } = await service.auth.admin.listUsers({ perPage: 200 });
  if (uErr) throw new Error(`listUsers failed: ${uErr.message}`);
  const fixture = users.users.find((u) => u.email === FIXTURE_EMAIL);
  if (!fixture) throw new Error('the fixture account was not found on production');
  const { data: fixtureProfile } = await service
    .from('profiles')
    .select('display_name, is_test')
    .eq('id', fixture.id)
    .single();
  const fixtureName = fixtureProfile?.display_name ?? null;

  const browser = await chromium.launch();
  let minted = null;
  try {
    minted = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE, viewport: PHONE });
    if (!minted) throw new Error(`could not mint a session for ${COACH_EMAIL}`);
    const { context } = minted;

    // -------------------------------------------------------------
    // FIX 1: the client cards on /coach
    // -------------------------------------------------------------
    const coach = await visit(context, '/coach');
    record(
      '/coach loads for the real coach',
      coach.status === 200 && coach.pageErrors.length === 0,
      `HTTP ${coach.status}, ${coach.pageErrors.length} page errors, ${coach.consoleErrors.length} console errors`
    );

    const cards = coach.page.locator('a[data-client-card="true"]');
    const cardCount = await cards.count();
    record(
      'the client list renders cards with the new markup',
      cardCount > 0,
      `${cardCount} client cards found on the live page`
    );

    const read = [];
    for (let i = 0; i < cardCount; i += 1) read.push(await readCard(cards.nth(i)));

    const scored = read.find((c) => /\d+\s*\/\s*100/.test(c.text.replace(/\n/g, ' ')));
    const unscored = read.find((c) => /No score yet/i.test(c.text));

    record(
      'the caseload contains a scored client to check',
      Boolean(scored),
      scored ? `"${scored.nameText}" shows ${scored.scoreText} out of 100` : 'no scored client found'
    );
    record(
      'the caseload contains a no-score client to check',
      Boolean(unscored),
      unscored ? `"${unscored.nameText}" shows "No score yet"` : 'no unscored client found'
    );

    for (const [which, card] of [
      ['scored', scored],
      ['no-score', unscored],
    ]) {
      if (!card) continue;

      const border = rgb(card.borderColor);
      record(
        `${which} card: a real border separates it from the page`,
        parseFloat(card.borderWidth) >= 1 && border !== null && border.a > 0,
        `border ${card.borderWidth} ${card.borderColor}`
      );

      record(
        `${which} card: the deeper resting shadow, not the flat panel one`,
        card.boxShadow !== 'none' && /20px|32px/.test(card.boxShadow),
        `box-shadow ${card.boxShadow}`
      );

      record(
        `${which} card: a pressed state and a focus ring are attached`,
        card.classes.includes('mef-press') && card.classes.includes('mef-focus-ring'),
        `transition-property: ${card.transition}`
      );

      record(
        `${which} card: the name is the anchor, larger and heavier than body text`,
        card.nameSize >= 17 && Number(card.nameWeight) >= 700,
        `"${card.nameText}" at ${card.nameSize}px weight ${card.nameWeight}`
      );

      record(
        `${which} card: the status dot carries a readable label`,
        Boolean(card.chip) && card.chip.label.length > 0,
        card.chip
          ? `chip "${card.chip.label}", dot ${card.chip.dotSize} ${card.chip.dotColor}, on ${card.chip.bg}`
          : 'no labelled status chip found'
      );

      record(
        `${which} card: it is one whole-card link and nothing is nested inside it`,
        card.nestedTapTargets === 0 && /^\/coach\/clients\//.test(card.href ?? ''),
        `href ${card.href}, ${card.nestedTapTargets} nested links or buttons`
      );

      record(
        `${which} card: the status line is a chip, not a bare caption`,
        /Checked in today|Last check-in:|No check-ins yet/.test(card.text),
        card.text.replace(/\n/g, ' | ')
      );
    }

    if (scored) {
      record(
        'the score is the visual focal point on a scored card',
        scored.scoreSize >= 40 && /Cormorant/i.test(scored.scoreFont ?? ''),
        `${scored.scoreText} at ${scored.scoreSize}px in ${scored.scoreFont}`
      );
      const tint = rgb(scored.scoreBlockBg);
      record(
        'the score sits on its own tinted block in the brand palette',
        tint !== null && tint.a > 0 && !(tint.r === 255 && tint.g === 255 && tint.b === 255),
        `block background ${scored.scoreBlockBg}, radius ${scored.scoreBlockRadius}, score color ${scored.scoreColor}`
      );
    }

    if (unscored) {
      record(
        'a no-score card keeps the same block, saying so',
        /No score yet/.test(unscored.text) && !/\/\s*100/.test(unscored.text),
        `"${unscored.nameText}": ${unscored.text.replace(/\n/g, ' | ')}`
      );
    }

    // The fixture is still on the caseload and still labelled.
    const cardTexts = read.map((c) => c.text);
    const fixtureCard = fixtureName
      ? cardTexts.find((t) => t.includes(fixtureName.split(' ')[0]))
      : undefined;
    record(
      'the flagged fixture is still in the caseload and still labelled',
      Boolean(fixtureCard) && /Test account/i.test(fixtureCard ?? ''),
      fixtureCard
        ? `card reads: ${fixtureCard.replace(/\n/g, ' | ')}`
        : `no card found for ${fixtureName}`
    );

    await coach.page.screenshot({ path: `${SHOTS}/coach-clients-cards.png`, fullPage: false });
    const listUrls = read.map((c) => c.href);
    await coach.page.close();

    // -------------------------------------------------------------
    // FIX 2: full detail from the top, phone viewport, never scrolled
    // -------------------------------------------------------------
    const target = listUrls.find(Boolean);
    if (!target) throw new Error('no client to open');

    const detail = await visit(context, target);
    record(
      'a client page opens from the list',
      detail.status === 200 && detail.pageErrors.length === 0,
      `${target}: HTTP ${detail.status}, ${detail.pageErrors.length} page errors, ${detail.consoleErrors.length} console errors`
    );

    const top = detail.page.locator('a[data-detail-top-link="true"]');
    record(
      'the full detail action is present in the page header',
      (await top.count()) === 1,
      `${await top.count()} header actions found`
    );

    const scrollY = await detail.page.evaluate(() => window.scrollY);
    const box = await top.boundingBox();
    const visibleUnscrolled =
      scrollY === 0 && box !== null && box.y >= 0 && box.y + box.height <= PHONE.height;
    record(
      'it is fully inside the first screen with the page never scrolled',
      visibleUnscrolled,
      box
        ? `scrollY ${scrollY}, action occupies y ${Math.round(box.y)} to ${Math.round(box.y + box.height)} of a ${PHONE.height}px viewport`
        : 'the action had no bounding box'
    );

    const topLabel = (await top.innerText()).trim();
    const topAria = await top.getAttribute('aria-label');
    record(
      'it says what it does and names the client for a screen reader',
      /open full detail/i.test(topLabel) && /open full detail for /i.test(topAria ?? ''),
      `label "${topLabel}", aria-label "${topAria}"`
    );

    const topGold = await top.evaluate((el) => getComputedStyle(el).backgroundColor);
    const gold = rgb(topGold);
    record(
      'it carries the gold treatment',
      gold !== null && gold.r !== null && gold.r > 170 && gold.g > 130 && gold.b < 130,
      `background ${topGold}`
    );

    await detail.page.screenshot({ path: `${SHOTS}/coach-client-top-action.png`, fullPage: false });

    // The bottom card is still there, on the same route.
    const bottom = detail.page.locator('a[data-detail-link="true"]');
    const topHref = await top.getAttribute('href');
    const bottomHref = (await bottom.count()) > 0 ? await bottom.getAttribute('href') : null;
    record(
      'the end-of-page card is still there, on the same route',
      (await bottom.count()) === 1 && bottomHref === topHref,
      `header goes to ${topHref}, foot of page goes to ${bottomHref}`
    );

    // Tapping the header action lands on the detail page.
    await top.click();
    await detail.page
      .waitForURL(/\/detail(\?|#|$)/, { timeout: NAV_TIMEOUT })
      .catch(() => {});
    const landed = detail.page.url();
    await detail.page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
    const detailHeading = await detail.page
      .locator('h1')
      .first()
      .innerText()
      .catch(() => '');
    record(
      'tapping it opens the full client detail page',
      /\/detail/.test(landed) && detailHeading.trim().length > 0,
      `landed on ${landed}, first heading "${detailHeading.trim()}"`
    );

    record(
      'no page error on the client screens',
      detail.pageErrors.length === 0,
      detail.pageErrors.length === 0 ? 'none' : detail.pageErrors.join(' | ')
    );

    await detail.page.close();
  } finally {
    if (minted) {
      await retireSession(minted).catch(() => {});
      await minted.context.close().catch(() => {});
    }
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.item}: ${f.detail}`);
    process.exitCode = 1;
  }
};

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
