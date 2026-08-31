/**
 * Live verification for Food Lens Phase 2, "a meal photo estimates grams,
 * and they count once she confirms" (migration 194).
 *
 * The real journey, in a real browser, signed in as the production test
 * member. The only thing simulated is the camera itself: getUserMedia is
 * replaced with a canvas stream painting a real photograph of a real meal,
 * because a headless machine has no lens. Everything downstream of the
 * shutter is production: the upload to storage, the server actions, the
 * live vision call, the writes, the ledger read.
 *
 * Five questions, asked separately:
 *
 *   1. Does a scan come back with estimated grams, per item and in total?
 *   2. Does adjusting one item's serving scale all three of its macros?
 *   3. Does confirming move Today's Protein by exactly what it said?
 *   4. Does the ledger entry name the photo lane and offer its carbs and fat?
 *   5. Does a scan she does NOT confirm contribute exactly zero?
 *
 * The session is minted one-time (Turnstile blocks a scripted form sign-in
 * by design) and retired with scope 'local'. Every row this run creates is
 * deleted at the end, so the account is left as it was found.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const SHOTS = 'scripts/.verify/shots';
const NAV_TIMEOUT = 60_000;
const ANALYSIS_TIMEOUT = 90_000;
const PHOTO_PATH = process.env.MEAL_PHOTO_PATH;

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

const createdScanIds = [];
const createdLogEntryIds = [];

async function memberId() {
  const { data: users, error } = await service.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const user = users.users.find((u) => u.email === MEMBER_EMAIL);
  if (!user) throw new Error(`${MEMBER_EMAIL} not found on production`);
  return user.id;
}

/** Replaces the camera with a canvas painting one real photograph. Everything after the shutter is the real pipeline. */
function fakeCameraScript(dataUrl) {
  return `
    (() => {
      const SRC = ${JSON.stringify(dataUrl)};
      const image = new Image();
      image.src = SRC;
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      function paint() {
        if (image.complete && image.naturalWidth > 0) {
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        } else {
          ctx.fillStyle = '#888';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        requestAnimationFrame(paint);
      }
      paint();
      const stream = canvas.captureStream(30);
      navigator.mediaDevices = navigator.mediaDevices || {};
      navigator.mediaDevices.getUserMedia = async () => stream;
      navigator.mediaDevices.enumerateDevices = async () => [
        { kind: 'videoinput', deviceId: 'fake', label: 'fake', groupId: 'fake', toJSON: () => ({}) },
      ];
    })();
  `;
}

/** Drives /food-lens through the shutter and returns the scan id from the result URL. */
async function runScan(page) {
  await page.goto(`${BASE}/food-lens/new`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.getByRole('button', { name: 'Scan a meal' }).first().click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Capture photo' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Use this photo' }).click({ timeout: 30_000 });
  await page.waitForURL(/\/food-lens\/[0-9a-f-]{36}$/, { timeout: ANALYSIS_TIMEOUT });
  const scanId = page.url().split('/').pop();
  createdScanIds.push(scanId);
  // The result page streams, so a body snapshot taken on domcontentloaded
  // can catch the skeleton rather than the answer. Wait for the section
  // this run is actually here to read.
  await page.waitForSelector('text=Estimated macros', { timeout: 30_000 });
  return scanId;
}

/** Today's protein total, computed the way the ledger page computes it, straight from production. */
async function todaysProteinFromDb(uid, timezone) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const from = new Date(`${today}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${today}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 2);

  const { data: rows } = await service
    .from('member_food_log')
    .select('id, product_id, servings, consumed_at, estimated_protein_g')
    .eq('member_id', uid)
    .gte('consumed_at', from.toISOString())
    .lt('consumed_at', to.toISOString());

  const inToday = (rows ?? []).filter(
    (r) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(r.consumed_at)) === today
  );
  const productIds = [...new Set(inToday.map((r) => r.product_id).filter(Boolean))];
  const { data: nutrients } = productIds.length
    ? await service.from('product_nutrients').select('product_id, protein_g').in('product_id', productIds)
    : { data: [] };
  const perServing = new Map((nutrients ?? []).map((n) => [n.product_id, n.protein_g]));

  let total = 0;
  for (const row of inToday) {
    const value = row.product_id ? perServing.get(row.product_id) : row.estimated_protein_g;
    if (value !== null && value !== undefined) total += Number(value) * Number(row.servings);
  }
  return Math.round(total);
}

async function main() {
  if (!PHOTO_PATH) throw new Error('MEAL_PHOTO_PATH is required');
  const dataUrl = `data:image/jpeg;base64,${readFileSync(PHOTO_PATH).toString('base64')}`;
  const uid = await memberId();

  const { data: profile } = await service
    .from('profiles')
    .select('timezone')
    .eq('id', uid)
    .maybeSingle();
  const timezone = profile?.timezone ?? 'UTC';

  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  let minted = null;
  try {
    minted = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 420, height: 900 },
    });
    if (!minted) throw new Error('could not mint a session for the test member');
    await minted.context.grantPermissions(['camera'], { origin: BASE });
    await minted.context.addInitScript(fakeCameraScript(dataUrl));

    const page = await minted.context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    const baseline = await todaysProteinFromDb(uid, timezone);
    console.log(`\nBaseline: today's protein reads ${baseline}g in ${timezone}\n`);

    // ---- 1. A scan comes back with estimated grams --------------------
    const scanId = await runScan(page);
    await page.screenshot({ path: `${SHOTS}/macro-grams-result.png`, fullPage: true });

    const body = await page.locator('body').innerText();
    record(
      'The result screen shows an Estimated macros section',
      /Estimated macros/i.test(body),
      `scan ${scanId}`
    );
    record(
      'It says the numbers are estimates that need confirming',
      body.includes('Estimated from your photo. Confirm or adjust before it counts toward your day.'),
      'the exact result-screen line'
    );

    const { data: itemGrams } = await service
      .from('food_lens_item_macro_estimates')
      .select('detected_item_id, protein_g, carb_g, fat_g, portion_description')
      .eq('scan_id', scanId);
    record(
      'Per-item grams were stored, not just displayed',
      (itemGrams ?? []).length > 0,
      `${(itemGrams ?? []).length} item rows: ${(itemGrams ?? [])
        .map((g) => `${g.protein_g}p/${g.carb_g}c/${g.fat_g}f`)
        .join(', ')}`
    );

    const { data: mealEstimate } = await service
      .from('food_lens_macro_estimates')
      .select('protein_g, carb_g, fat_g, created_at')
      .eq('scan_id', scanId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const summedProtein = (itemGrams ?? []).reduce(
      (t, g) => t + (g.protein_g === null ? 0 : Number(g.protein_g)),
      0
    );
    record(
      'The stored meal total equals the sum of its items',
      mealEstimate !== null && Math.abs(Number(mealEstimate.protein_g) - summedProtein) < 0.01,
      `meal ${mealEstimate?.protein_g}g protein vs items summing to ${summedProtein}g`
    );

    const panel = page.locator('text=Estimated macros').locator('xpath=ancestor::div[1]');
    const totalsBefore = await panel.innerText();
    record(
      'Protein, carbs and fat totals are all on screen',
      /PROTEIN/i.test(totalsBefore) && /CARBS/i.test(totalsBefore) && /FAT/i.test(totalsBefore),
      totalsBefore.split('\n').slice(0, 8).join(' | ')
    );
    record(
      'Carbs and fat are shown without a target',
      body.includes('there is no daily target for either'),
      'the information-only line'
    );
    record(
      'No calorie figure appears anywhere on the result screen',
      !/calorie/i.test(body),
      'searched the whole rendered page'
    );

    // ---- 2. One serving step scales all three macros -------------------
    const firstItem = page.locator('li').filter({ hasText: 'protein,' }).first();
    const itemTextBefore = await firstItem.innerText();
    await firstItem.getByRole('button', { name: /^More / }).click();
    await page.waitForTimeout(300);
    const itemTextAfter = await firstItem.innerText();
    const parse = (text) => {
      const m = text.match(/(\d+)g protein, (\d+)g carbs, (\d+)g fat/);
      return m ? { p: +m[1], c: +m[2], f: +m[3] } : null;
    };
    const before = parse(itemTextBefore);
    const after = parse(itemTextAfter);
    const ratio = 1.25;
    const scaledTogether =
      before !== null &&
      after !== null &&
      Math.abs(after.p - before.p * ratio) <= 1 &&
      Math.abs(after.c - before.c * ratio) <= 1 &&
      Math.abs(after.f - before.f * ratio) <= 1;
    record(
      'One serving step scales protein, carbs and fat together',
      scaledTogether,
      `${itemTextBefore.replace(/\n/g, ' ')} -> ${itemTextAfter.replace(/\n/g, ' ')}`
    );

    // Put it back so the confirmed figure is the honest 1x estimate.
    await firstItem.getByRole('button', { name: /^Less / }).click();
    await page.waitForTimeout(300);

    const totalsText = await panel.innerText();
    const shownProtein = Number((totalsText.match(/(\d+)g\s*\n?\s*PROTEIN/i) ?? [])[1] ?? NaN);

    // ---- 3. Confirming moves Today's Protein by what it said ----------
    await page.getByRole('button', { name: 'Confirm and count toward my day' }).click();
    await page.waitForSelector('text=/counted\\./', { timeout: 30_000 });
    const confirmation = await page.locator('text=/of protein counted/').innerText();
    const countedGrams = Number((confirmation.match(/(\d+)g of protein counted/) ?? [])[1] ?? NaN);
    await page.screenshot({ path: `${SHOTS}/macro-grams-confirmed.png`, fullPage: true });

    record(
      'Confirming reports the grams it wrote',
      Number.isFinite(countedGrams) && countedGrams > 0,
      confirmation
    );
    record(
      'The number it counted is the number it showed',
      Number.isFinite(shownProtein) && Math.abs(countedGrams - shownProtein) <= 1,
      `screen showed ${shownProtein}g, action counted ${countedGrams}g`
    );

    const { data: writtenRows } = await service
      .from('member_food_log')
      .select('id, entry_source, servings, estimated_protein_g, estimated_carb_g, estimated_fat_g')
      .eq('scan_id', scanId);
    (writtenRows ?? []).forEach((r) => createdLogEntryIds.push(r.id));
    // A row is tagged as the confirmed photo lane if, and only if, it
    // actually carries grams. An item the model could not size is logged
    // honestly as a photo row with no number, exactly as it was before this
    // build, rather than being relabelled as an estimate that counts zero.
    const sized = (writtenRows ?? []).filter((r) => r.estimated_protein_g !== null);
    const unsized = (writtenRows ?? []).filter((r) => r.estimated_protein_g === null);
    record(
      'Every item with grams wrote a row tagged as the photo lane, per serving',
      sized.length > 0 && sized.every((r) => r.entry_source === 'photo_estimated'),
      `${sized.length} sized rows: ${sized
        .map((r) => `${r.servings}x ${r.estimated_protein_g}p/${r.estimated_carb_g}c/${r.estimated_fat_g}f`)
        .join(', ')}`
    );
    record(
      'An item the model could not size is never dressed up as a confirmed estimate',
      unsized.every((r) => r.entry_source === null),
      unsized.length === 0 ? 'every item was sized on this scan' : `${unsized.length} unsized rows left untagged`
    );

    const afterConfirm = await todaysProteinFromDb(uid, timezone);
    record(
      "Today's protein moved by exactly the confirmed amount",
      Math.abs(afterConfirm - baseline - countedGrams) <= 1,
      `${baseline}g -> ${afterConfirm}g, confirmed ${countedGrams}g`
    );

    // ---- 4. The ledger names the lane and offers carbs and fat --------
    await page.goto(`${BASE}/food-lens/protein/ledger`, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });
    const ledgerBody = await page.locator('body').innerText();
    record(
      'The ledger labels the entry as a photo estimate',
      ledgerBody.includes('Photo (estimated)'),
      'source label on the entry row'
    );
    record(
      "Today's protein card shows the higher total",
      new RegExp(`\\b${afterConfirm}g\\b`).test(ledgerBody),
      `looked for ${afterConfirm}g on the page`
    );
    await page.getByRole('button', { name: 'Carbs and fat' }).first().click();
    await page.waitForTimeout(250);
    const expanded = await page.locator('body').innerText();
    record(
      "Carbs and fat are on the entry's detail, with no target attached",
      /Carbs \d+g, fat \d+g/.test(expanded) && expanded.includes('neither\nhas a daily target') ||
        /Carbs \d+g, fat \d+g/.test(expanded) && /neither\s+has a daily target/.test(expanded),
      (expanded.match(/Carbs \d+g, fat \d+g[^\n]*/) ?? ['not found'])[0]
    );
    await page.screenshot({ path: `${SHOTS}/macro-grams-ledger.png`, fullPage: true });

    // ---- 5. An unconfirmed scan contributes exactly zero --------------
    const totalBeforeSecond = await todaysProteinFromDb(uid, timezone);
    const secondScanId = await runScan(page);
    const secondBody = await page.locator('body').innerText();
    record(
      'A second scan analyzes and shows its own estimates',
      /Estimated macros/i.test(secondBody),
      `scan ${secondScanId}`
    );

    const { data: unconfirmedRows } = await service
      .from('member_food_log')
      .select('id')
      .eq('scan_id', secondScanId);
    record(
      'An unconfirmed scan writes no food log row at all',
      (unconfirmedRows ?? []).length === 0,
      `${(unconfirmedRows ?? []).length} rows for scan ${secondScanId}`
    );

    const totalAfterSecond = await todaysProteinFromDb(uid, timezone);
    record(
      "An unconfirmed scan moves Today's Protein by zero",
      totalAfterSecond === totalBeforeSecond,
      `${totalBeforeSecond}g before, ${totalAfterSecond}g after`
    );

    record('No page error on any screen visited', pageErrors.length === 0, pageErrors.join(' | ') || 'none');
  } finally {
    // Leave the account exactly as it was found.
    if (createdLogEntryIds.length > 0) {
      await service.from('member_food_log').delete().in('id', createdLogEntryIds);
    }
    if (createdScanIds.length > 0) {
      await service.from('member_food_log').delete().in('scan_id', createdScanIds);
      await service.from('food_lens_scans').delete().in('id', createdScanIds);
    }
    await retireSession(minted);
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} of ${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
