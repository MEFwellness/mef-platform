import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL, VIEWPORT } from './scripts/screenshots/config.mjs';

const OVERLAY_SELECTOR = 'div[aria-hidden="true"].fixed.inset-0';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const account = ACCOUNTS.memberPopulated;

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  const t0 = Date.now();
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 }),
    page.getByRole('button', { name: 'Log in' }).click(),
  ]);
  console.log('url changed at +', Date.now() - t0, 'ms:', page.url());

  for (let i = 0; i < 20; i++) {
    const count = await page.locator(OVERLAY_SELECTOR).count();
    const visible = count > 0 ? await page.locator(OVERLAY_SELECTOR).first().isVisible() : false;
    console.log(`+${Date.now() - t0}ms  overlay count=${count} visible=${visible}`);
    if (count > 0 && !visible) {
      const cls = await page.locator(OVERLAY_SELECTOR).first().getAttribute('class');
      console.log('   class=', cls);
    }
    await page.waitForTimeout(300);
  }

  await context.close();
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
