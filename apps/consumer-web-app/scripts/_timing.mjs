import { chromium } from 'playwright';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
process.env.PROD_SUPABASE_URL='https://piafgqstbibvllsnuike.supabase.co';
const BASE='https://app.mefwellness.com';
const browser = await chromium.launch();
const minted = await mintSessionContext(browser,'8weeks2fab@gmail.com',{baseUrl:BASE,viewport:{width:390,height:844},contextOptions:{reducedMotion:'no-preference'}});
const page = await minted.context.newPage();
const timings = [];
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/body-systems') || u.includes('/api/body-systems')) {
    const t = r.request().timing();
    timings.push({ url: u.replace(BASE,''), method: r.request().method(), status: r.status(), ms: Math.round(t.responseEnd - t.requestStart) });
  }
});
let t0 = Date.now();
await page.goto(`${BASE}/body-systems`, { waitUntil:'domcontentloaded' });
console.log('GET /body-systems domcontentloaded', Date.now()-t0, 'ms');
await page.waitForSelector('text=Begin', { timeout: 60000 });
console.log('intro visible', Date.now()-t0, 'ms');
for (let a=0;a<20;a++){ await page.getByRole('button',{name:'Begin'}).click().catch(()=>{}); if (await page.locator('text=/section 1 of 11/i').count()) break; await page.waitForTimeout(300); }
await page.waitForSelector('text=/section 1 of 11/i', { timeout: 60000 });

const answer = async () => {
  const rows = page.locator('ol > li');
  const n = await rows.count();
  for (let i=0;i<n;i++){
    const r = rows.nth(i).locator('[role="radio"]').first();
    for (let a=0;a<25;a++){ await r.click(); if (await r.getAttribute('aria-checked')==='true') break; await page.waitForTimeout(150); }
  }
};
for (let s=0;s<4;s++){
  await answer();
  for (let a=0;a<120;a++){ if (!(await page.getByRole('button',{name:'Continue'}).isDisabled())) break; await page.waitForTimeout(250); }
  const before = await page.evaluate(()=>document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '');
  const t = Date.now();
  await page.getByRole('button', { name:'Continue' }).click();
  let beatStart = null, beatEnd = null;
  for (let a=0;a<200;a++){
    const txt = await page.evaluate(()=>document.body.innerText);
    if (/Section complete/i.test(txt) && beatStart===null) beatStart = Date.now();
    const now = txt.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '';
    if (!/Section complete/i.test(txt) && now && now !== before) { beatEnd = Date.now(); break; }
    await page.waitForTimeout(100);
  }
  console.log(`screen ${s}: continue -> next screen ${beatEnd ? beatEnd - t : 'never'} ms, beat visible ${beatStart&&beatEnd ? beatEnd-beatStart : 'n/a'} ms`);
}
console.log('\nnetwork:');
for (const t of timings.slice(-25)) console.log(`  ${t.method} ${t.status} ${t.ms}ms ${t.url.slice(0,70)}`);
await retireSession(minted); await browser.close();
