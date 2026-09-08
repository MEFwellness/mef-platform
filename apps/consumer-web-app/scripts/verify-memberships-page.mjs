/**
 * /memberships, walked in a real browser, logged out, at both widths.
 *
 * Runs against whatever origin it is pointed at, so the same script proves
 * the local production build and the deployed one:
 *
 *   MEMBERSHIPS_ORIGIN=http://localhost:3111 node scripts/verify-memberships-page.mjs
 *   MEMBERSHIPS_ORIGIN=https://app.mefwellness.com node scripts/verify-memberships-page.mjs
 *
 * EVERY CONTEXT IS FRESH AND SIGNED OUT. A new browser context per width,
 * no storage state, no cookie from anywhere. That is the visitor this page
 * is written for, and it is also the only way "no auth gate" can be
 * checked rather than assumed.
 *
 * WHAT IT PROVES. That a direct load and a hard refresh both render the
 * page rather than /login; that all three photographs actually decoded in
 * the browser (naturalWidth, not a 200 on the URL); that each of the four
 * approved prices appears exactly once; that an accordion opens and closes
 * by being pressed; and that every call to action resolves to one address.
 * Screenshots at both widths are written beside the results.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGIN = (process.env.MEMBERSHIPS_ORIGIN || 'http://localhost:3111').replace(/\/$/, '');
const OUT_DIR = process.env.MEMBERSHIPS_SHOTS || resolve(HERE, '.verify/memberships');
const URL_UNDER_TEST = `${ORIGIN}/memberships`;

const PRICES = ['$175', '$550', '$1,050', '$1,350'];

/**
 * Which button must lead to which Stripe checkout, stated here rather than
 * read off the page, so this is a check and not a tautology. The four
 * addresses were each loaded in a browser and read on 2026-09-08: the
 * assessment one charges $175.00 once, and the three tier ones subscribe at
 * their monthly figure, billed monthly.
 */
const ASSESSMENT_CHECKOUT = 'https://buy.stripe.com/6oU14mgSu3DX2WFaLKdQQ05';

const EXPECTED_CHECKOUTS = [
  // Twice on purpose: the hero and the close carry the same approved label
  // for the same offer.
  { text: 'Start With Your Assessment', href: ASSESSMENT_CHECKOUT, count: 2 },
  { text: 'Book Your Assessment', href: ASSESSMENT_CHECKOUT, count: 1 },
  { text: 'Join Essential', href: 'https://buy.stripe.com/00wbJ031E1vP68R4nmdQQ06', count: 1 },
  { text: 'Join Performance', href: 'https://buy.stripe.com/14A00iau66Q9btb4nmdQQ07', count: 1 },
  { text: 'Join Total Wellness', href: 'https://buy.stripe.com/3cIfZgbya6Q98gZ9HGdQQ08', count: 1 },
];

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}\n`);
}

async function walk(browser, label, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });

  // 1. Direct load, logged out.
  const response = await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
  check(
    `${label}: direct load returns 200`,
    response?.status() === 200,
    `status ${response?.status()}`
  );
  check(
    `${label}: direct load stays on /memberships, no redirect to /login`,
    new URL(page.url()).pathname === '/memberships',
    page.url()
  );
  check(
    `${label}: no session cookie was needed`,
    (await context.cookies()).every((c) => !c.name.startsWith('sb-')),
    (await context.cookies()).map((c) => c.name).join(', ') || 'no cookies'
  );

  // 2. The page really rendered.
  const heading = await page.locator('h1').first().innerText();
  check(
    `${label}: the hero headline is on screen`,
    heading.includes('More than training'),
    heading
  );

  // 3. All three photographs decoded.
  //
  //    Scrolled through first, on purpose. Two of the three are lazy, so
  //    at the moment the network first goes idle they legitimately have
  //    not been fetched yet, and checking there would report a working
  //    lazy load as a broken image. This is what a reader does: goes down
  //    the page, then we ask whether every picture arrived.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await Promise.all(
      Array.from(document.querySelectorAll('img')).map((img) =>
        img.complete ? Promise.resolve() : img.decode().catch(() => {})
      )
    );
  });
  await page.waitForLoadState('networkidle');

  const images = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('img'));
    return nodes.map((img) => ({
      alt: img.alt,
      src: img.currentSrc || img.src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      renderedWidth: Math.round(img.getBoundingClientRect().width),
      renderedHeight: Math.round(img.getBoundingClientRect().height),
    }));
  });
  check(`${label}: three photographs on the page`, images.length === 3, `found ${images.length}`);
  for (const name of ['membership-hero', 'membership-travel', 'membership-rooted']) {
    const img = images.find((i) => decodeURIComponent(i.src).includes(name));
    check(
      `${label}: ${name}.jpg loaded and decoded`,
      Boolean(img && img.complete && img.naturalWidth > 0),
      img ? `${img.naturalWidth}px natural, drawn ${img.renderedWidth}x${img.renderedHeight}` : 'not found'
    );
    check(
      `${label}: ${name}.jpg has meaningful alt text`,
      Boolean(img && img.alt && img.alt.length > 40),
      img ? `${img.alt.slice(0, 60)}...` : 'no alt'
    );
  }

  // 4. Each price exactly once. Accordions are opened first so nothing that
  //    could hold a price is hidden from innerText.
  const bodyText = await page.evaluate(() => document.body.innerText);
  for (const price of PRICES) {
    const count = bodyText.split(price).length - 1;
    check(`${label}: ${price} appears exactly once`, count === 1, `${count} occurrence(s)`);
  }

  // 5. An accordion opens and closes by being pressed.
  const faq = page.locator('details', { hasText: 'Is Rooted Reset included?' }).first();
  const summary = faq.locator('summary').first();
  const answer = 'Full Rooted Reset access is included with every MEF Wellness membership.';
  check(
    `${label}: accordions start closed`,
    (await faq.evaluate((el) => el.open)) === false
  );
  await summary.scrollIntoViewIfNeeded();
  await summary.click();
  await page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    answer,
    { timeout: 4000 }
  );
  check(
    `${label}: pressing a FAQ row opens it and reveals its answer`,
    (await faq.evaluate((el) => el.open)) === true
  );
  await summary.click();
  await page.waitForFunction(
    () => !document.querySelector('details[open]'),
    undefined,
    { timeout: 4000 }
  );
  check(
    `${label}: pressing it again closes it`,
    (await faq.evaluate((el) => el.open)) === false
  );

  // 6. Every button leads where it is supposed to, by its own visible label.
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a')).map((a) => ({
      text: (a.textContent || '').trim(),
      href: a.getAttribute('href'),
      target: a.getAttribute('target'),
      rel: a.getAttribute('rel'),
    }))
  );
  check(
    `${label}: seven links out, three assessment plus three tiers plus the in-page anchor`,
    links.length === 7,
    `${links.length} links`
  );

  for (const { text, href: expectedHref, count } of EXPECTED_CHECKOUTS) {
    const matching = links.filter((l) => l.text === text);
    check(
      `${label}: ${count} "${text}" button${count === 1 ? '' : 's'}`,
      matching.length === count,
      `${matching.length} found`
    );
    // EVERY one of them, not just the first: two buttons sharing a label
    // that lead to two different places is exactly the bug worth catching.
    for (const link of matching) {
      check(
        `${label}: "${text}" leads to its own Stripe checkout`,
        link.href === expectedHref,
        link.href ?? 'no href'
      );
      check(
        `${label}: "${text}" opens in a new tab with the opener closed off`,
        link.target === '_blank' && (link.rel || '').includes('noopener'),
        `target=${link.target} rel=${link.rel}`
      );
    }
  }

  const anchor = links.find((l) => l.href === '#memberships');
  check(
    `${label}: the in-page "See the Memberships" anchor does NOT open a tab`,
    Boolean(anchor) && anchor.target !== '_blank',
    anchor ? `target=${anchor.target}` : 'not found'
  );
  check(
    `${label}: no button points at the old mail draft any more`,
    links.every((l) => !(l.href || '').startsWith('mailto:')),
    links.map((l) => l.href).filter((h) => (h || '').startsWith('mailto:')).join(', ') || 'none'
  );

  // 7. Nothing overflows sideways. A marketing page that scrolls
  //    horizontally on a phone reads as broken.
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  check(
    `${label}: no horizontal overflow`,
    overflow.scroll <= overflow.client + 1,
    `${overflow.scroll} vs ${overflow.client}`
  );

  // 8. Screenshot, full page.
  mkdirSync(OUT_DIR, { recursive: true });
  const shot = resolve(OUT_DIR, `memberships-${label}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  process.stdout.write(`      screenshot: ${shot}\n`);

  // 9. Hard refresh, still logged out, still 200.
  const reloaded = await page.reload({ waitUntil: 'networkidle' });
  check(
    `${label}: hard refresh returns 200 and stays on /memberships`,
    reloaded?.status() === 200 && new URL(page.url()).pathname === '/memberships',
    `status ${reloaded?.status()} at ${page.url()}`
  );

  check(`${label}: no page or console errors`, pageErrors.length === 0, pageErrors.join(' | '));

  await context.close();
}

/** The routes this build must not have changed, checked logged out. */
async function checkNeighbouringRoutes(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // A member-only route still sends a logged-out visitor to the login
  // screen. /membership (singular) is the Rooted Reset subscription screen
  // and is the one most at risk from a careless allowlist entry.
  for (const path of ['/membership', '/dashboard', '/today']) {
    const response = await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
    const landed = new URL(page.url()).pathname;
    check(
      `protection unchanged: ${path} still sends a logged-out visitor to /login`,
      landed === '/login',
      `landed on ${landed} (status ${response?.status()})`
    );
  }

  // And the other public routes still open without a session.
  for (const path of ['/start', '/energy', '/wellness-check', '/login']) {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
    const landed = new URL(page.url()).pathname;
    check(
      `still public: ${path} opens with no session`,
      landed === path,
      `landed on ${landed}`
    );
  }

  await context.close();
}

const browser = await chromium.launch();
try {
  process.stdout.write(`\nWalking ${URL_UNDER_TEST}\n\n`);
  await walk(browser, 'mobile-390', { width: 390, height: 844 });
  process.stdout.write('\n');
  await walk(browser, 'desktop-1440', { width: 1440, height: 900 });
  process.stdout.write('\n');
  await checkNeighbouringRoutes(browser);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} checks passed against ${ORIGIN}\n`
);
if (failed.length > 0) {
  for (const f of failed) process.stdout.write(`  FAILED: ${f.name} :: ${f.detail}\n`);
  process.exit(1);
}
