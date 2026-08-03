import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL, VIEWPORT } from './scripts/screenshots/config.mjs';

const OVERLAY_SELECTOR = 'div[aria-hidden="true"].fixed.inset-0';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const account = ACCOUNTS.memberPopulated;
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

  const t0 = Date.now();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 }),
    page.getByRole('button', { name: 'Log in' }).click(),
  ]);
  console.log('url changed at +', Date.now() - t0, 'ms:', page.url());

  const cookies = await context.cookies();
  console.log('mef_entry cookies:', cookies.filter(c => c.name.startsWith('mef_entry')));

  for (let i = 0; i < 10; i++) {
    const count = await page.locator(OVERLAY_SELECTOR).count();
    console.log(`+${Date.now() - t0}ms overlay count=${count}`);
    await page.waitForTimeout(400);
  }

  await context.close();
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
