import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL, VIEWPORT } from './scripts/screenshots/config.mjs';

const OVERLAY_SELECTOR = 'div[aria-hidden="true"].fixed.inset-0';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const account = ACCOUNTS.memberPopulated;
  page.on('console', (msg) => {
    if (msg.text().includes('entry-debug')) console.log('BROWSER:', msg.text());
  });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 }),
    page.getByRole('button', { name: 'Log in' }).click(),
  ]);
  console.log('final url:', page.url());
  for (let i = 0; i < 20; i++) {
    console.log(`+${i * 200}ms overlay count:`, await page.locator(OVERLAY_SELECTOR).count());
    await page.waitForTimeout(200);
  }

  await context.close();
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
