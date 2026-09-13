/**
 * Measures and photographs the member Home on production, at phone width,
 * as the seeded test member. Used once before the presentation pass was
 * deployed and once after, so the comparison in the report is a measured
 * one rather than a claimed one. Retires its session immediately.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const OUT = process.env.OUT_DIR;
const LABEL = process.env.LABEL || 'run';
const EMAIL = process.env.TEST_MEMBER_EMAIL;

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

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(() => document.querySelectorAll('[data-settling="true"]').length === 0, null, {
      timeout: 60000,
    })
    .catch(() => {});
  await page.waitForTimeout(3000);

  const before = await page.evaluate(() => ({
    url: location.pathname,
    h1: document.querySelector('h1')?.textContent ?? null,
    heroHeight: Math.round(
      document.querySelector('main')?.previousElementSibling?.getBoundingClientRect().height ?? 0
    ),
    firstMainBlockTop: Math.round(
      document.querySelector('main > div')?.getBoundingClientRect().top ?? 0
    ),
    docHeight: document.documentElement.scrollHeight,
    labels: [...document.querySelectorAll('main p')]
      .filter((p) => getComputedStyle(p).textTransform === 'uppercase')
      .map((p) => p.textContent?.trim())
      .slice(0, 20),
    navLabelsTruncated: [...document.querySelectorAll('nav a span span')]
      .filter((s) => s.scrollWidth > s.clientWidth + 1)
      .map((s) => s.textContent),
  }));

  // photograph the first screenful with any pop-up out of the way
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || el.matches('nav') || el.closest('nav')) continue;
      const r = el.getBoundingClientRect();
      if ((r.width > innerWidth * 0.7 && r.height > innerHeight * 0.5) || el.getAttribute('role') === 'dialog') {
        el.setAttribute('style', 'display:none !important');
      }
    }
    document.body.style.position = '';
    document.body.style.overflow = '';
    document.body.style.top = '';
    document.body.style.width = '';
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `prod-${LABEL}-fold.png`) });

  for (let y = 0; y < 14; y++) {
    await page.evaluate((i) => window.scrollTo(0, i * innerHeight * 0.8), y);
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `prod-${LABEL}-full.png`), fullPage: true });

  console.log(JSON.stringify({ label: LABEL, ...before, consoleErrors }, null, 2));
} finally {
  await retireSession(minted);
  await browser.close();
}
