#!/usr/bin/env node
/**
 * Live check, protein half: signs in to app.mefwellness.com as the
 * production test member, logs a meal through a NON-ledger entry point
 * (Food Lens manual entry, then that result screen's own Add to food log),
 * confirms Today's Protein moved by exactly those grams and that the meal
 * appears once, then logs a second entry through a ledger lane (quick add)
 * and confirms the two sum with no double counting.
 *
 * This one WRITES to the shared production test account, so it reports at
 * the end exactly which entries it created and leaves them named in the
 * output. Both are ordinary member food log entries and can be deleted
 * from the ledger screen itself.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL;
const PASSWORD = process.env.MEMBER_PASSWORD;
const SHOTS = process.env.SHOTS_DIR ?? './live-shots';
mkdirSync(SHOTS, { recursive: true });

const MANUAL_PROTEIN = 31;
const QUICK_GRAMS = 12;
const MANUAL_NAME = `Live check food ${new Date().toISOString().slice(11, 19)}`;

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 950 } });

async function ledgerText() {
  await page.goto(`${BASE}/food-lens/protein/ledger`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return page.locator('body').innerText();
}

/** The running total on the ledger's own progress card. Reads the first "Ng" that is not part of a target phrase. */
function totalFrom(text) {
  const m =
    text.match(/(\d+)\s*g\s+of\s+\d+\s*g/i) ??
    text.match(/Protein ledger[\s\S]{0,200}?(\d+)\s*g/i);
  return m ? Number(m[1]) : null;
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  check('member signs in', true, page.url());

  const before = await ledgerText();
  await page.screenshot({ path: `${SHOTS}/p01-ledger-before.png`, fullPage: true });
  const baseline = totalFrom(before);
  console.log('--- ledger before ---');
  console.log(before.replace(/\n{2,}/g, '\n').slice(0, 700));
  console.log(`--- baseline parsed: ${baseline} ---`);

  // ---- non-ledger lane: Food Lens manual entry ----
  await page.goto(`${BASE}/food-lens/manual/new`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SHOTS}/p02-manual-form.png`, fullPage: true });

  // The name field carries no type attribute, so it is addressed by its
  // own placeholder; protein is the second numeric field (calories first).
  await page.locator('input[placeholder="e.g. Homemade lentil soup"]').fill(MANUAL_NAME);
  await page.locator('input[type="number"]').nth(1).fill(String(MANUAL_PROTEIN));
  await page.screenshot({ path: `${SHOTS}/p03-manual-filled.png`, fullPage: true });

  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/food-lens\/barcode\//, { timeout: 90000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/p04-manual-result.png`, fullPage: true });
  check('manual entry reaches its result screen', true, page.url());

  const addButton = page.getByRole('button', { name: /add to (my )?(food )?log/i }).first();
  const addCount = await addButton.count();
  check('the result screen offers Add to food log', addCount > 0);
  if (addCount > 0) {
    await addButton.scrollIntoViewIfNeeded();
    await addButton.click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/p05-added.png`, fullPage: true });
  }

  const afterManual = await ledgerText();
  await page.screenshot({ path: `${SHOTS}/p06-ledger-after-manual.png`, fullPage: true });
  const manualTotal = totalFrom(afterManual);
  console.log(`--- after manual parsed: ${manualTotal} ---`);
  const occurrences = (afterManual.match(new RegExp(MANUAL_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;

  check(
    'Today’s Protein reflects a meal logged outside the ledger lanes',
    baseline !== null && manualTotal !== null && manualTotal - baseline === MANUAL_PROTEIN,
    `${baseline}g -> ${manualTotal}g (expected +${MANUAL_PROTEIN})`
  );
  check('that meal appears exactly once in the day’s entries', occurrences === 1, `occurrences: ${occurrences}`);

  // ---- ledger lane: quick add ----
  await page.goto(`${BASE}/food-lens/protein/ledger`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const quickTab = page.getByRole('button', { name: /quick add/i }).first();
  if ((await quickTab.count()) > 0) {
    await quickTab.click();
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `${SHOTS}/p07-quick-add-lane.png`, fullPage: true });

  await page.locator('input[placeholder="e.g. 25"]').fill(String(QUICK_GRAMS));
  await page.locator('input[placeholder="e.g. Protein shake"]').fill('Live check shake');
  await page.screenshot({ path: `${SHOTS}/p08-quick-add-filled.png`, fullPage: true });
  await page.getByRole('button', { name: 'Add to today' }).click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SHOTS}/p09-after-quick-add.png`, fullPage: true });

  const afterQuick = await ledgerText();
  await page.screenshot({ path: `${SHOTS}/p10-ledger-after-quick-add.png`, fullPage: true });
  const quickTotal = totalFrom(afterQuick);
  console.log('--- ledger after both ---');
  console.log(afterQuick.replace(/\n{2,}/g, '\n').slice(0, 1100));
  console.log(`--- after quick add parsed: ${quickTotal} ---`);

  check(
    'the two lanes sum, with no double counting',
    baseline !== null && quickTotal !== null && quickTotal - baseline === MANUAL_PROTEIN + QUICK_GRAMS,
    `${baseline}g -> ${quickTotal}g (expected +${MANUAL_PROTEIN + QUICK_GRAMS})`
  );

  console.log(`\nEntries this run created on the test member: "${MANUAL_NAME}" (${MANUAL_PROTEIN}g) and a ${QUICK_GRAMS}g quick add.`);
} finally {
  await browser.close();
  console.log('\n---- SUMMARY ----');
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
  const failed = results.filter((r) => !r.passed).length;
  console.log(`${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}
