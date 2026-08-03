import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL, VIEWPORT } from './scripts/screenshots/config.mjs';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const account = ACCOUNTS.memberPopulated;

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 }),
    page.getByRole('button', { name: 'Log in' }).click(),
  ]);
  console.log('final url:', page.url());

  const docCookie = await page.evaluate(() => document.cookie);
  console.log('document.cookie (client-visible):', docCookie);

  const allCookies = await context.cookies();
  console.log('all cookies (via CDP):', allCookies.filter(c => c.name.startsWith('mef_entry')).map(c => ({ name: c.name, httpOnly: c.httpOnly, value: c.value.slice(0, 12) })));

  await context.close();
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
