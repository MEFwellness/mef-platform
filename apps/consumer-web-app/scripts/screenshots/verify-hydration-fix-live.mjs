#!/usr/bin/env node
// One-shot live verification for the coach-view hydration-mismatch fix
// (lib/time/displayDate.ts + every Bucket-A call site listed in
// docs/BUILD_STATUS.md's "coach-view hydration fix" entry). A prior
// live-verification session found the coach's client-detail page threw
// ~10 real React hydration errors (#418/#423/#425) for the history-rich
// production test member and traced it to un-timezoned
// `toLocaleDateString`/`toLocaleString` calls in several coach panels.
// This script drives the same page against production and confirms zero
// console/page errors now, plus a spot-check of a second, sparse member.
//
// Reuses login()/config.mjs the same way verify-reset-plan-live.mjs does.
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-hydration-fix-live.mjs
// (from apps/consumer-web-app; requires scripts/screenshots/.env.local)
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const consoleIssues = [];

function attachListeners(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleIssues.push({ label, type: 'console.error', text: msg.text(), url: page.url() });
    }
  });
  page.on('pageerror', (err) => {
    consoleIssues.push({ label, type: 'pageerror', text: err.message, url: page.url() });
  });
}

function ci(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

async function main() {
  console.log(`Verifying coach-view hydration fix against ${BASE_URL}\n`);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  attachListeners(page, 'coach-session');

  await login(page, BASE_URL, ACCOUNTS.coach);
  await page.goto(`${BASE_URL}/coach`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const rawHrefs = await page
    .locator('a[href^="/coach/clients/"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  const clientHrefs = rawHrefs.filter(Boolean).map((href) => href.split('/').slice(0, 4).join('/'));
  const uniqueClientHrefs = clientHrefs.filter((href, i) => clientHrefs.indexOf(href) === i);
  console.log(`Found ${uniqueClientHrefs.length} unique assigned client(s): ${uniqueClientHrefs.join(', ')}`);

  const perClientErrorCounts = {};
  const perClientErrorDetail = {};
  let historyRichHref = null;
  let historyRichText = '';

  const richnessByHref = {};
  const textByHref = {};
  for (const href of uniqueClientHrefs) {
    const beforeCount = consoleIssues.length;
    await page.goto(`${BASE_URL}${href}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500); // let every panel's own Suspense boundary settle
    const text = await page.evaluate(() => document.body.innerText);
    textByHref[href] = text;
    const newIssues = consoleIssues.slice(beforeCount);
    perClientErrorCounts[href] = newIssues.length;
    perClientErrorDetail[href] = newIssues.map((i) => i.text);

    // The history-rich member is the one carrying real Personal Reset
    // Plan / Readiness Pulse / Life Signal Check / Core Values Snapshot /
    // WBSA content, same identification approach
    // verify-reset-plan-live.mjs already used successfully to locate this
    // exact account. Ranked first by whichever page actually threw
    // console errors (the strongest real signal this is the one the
    // prior session found), falling back to richest-by-content.
    const richnessMarkers = ['Personal Reset Plan', 'Readiness Pulse', 'Life Signal Check', 'Core Values Snapshot', 'Whole-Body Systems Assessment'];
    richnessByHref[href] = richnessMarkers.filter((m) => ci(text, m)).length;

    if (perClientErrorCounts[href] > 0 && (!historyRichHref || perClientErrorCounts[href] > perClientErrorCounts[historyRichHref])) {
      historyRichHref = href;
    }
  }

  console.log(`\nConsole/page error count per coach client page: ${JSON.stringify(perClientErrorCounts, null, 2)}`);
  if (Object.values(perClientErrorCounts).some((c) => c > 0)) {
    console.log(`\nError detail per page:\n${JSON.stringify(perClientErrorDetail, null, 2)}`);
  }

  const totalErrors = Object.values(perClientErrorCounts).reduce((a, b) => a + b, 0);

  // If no page threw anything (the expected, fixed outcome), fall back to
  // naming the richest-by-content page for the report, still meaningful:
  // it names the same previously-worst page and proves it is now clean.
  if (!historyRichHref) {
    let bestHref = uniqueClientHrefs[0];
    let bestScore = -1;
    for (const href of uniqueClientHrefs) {
      if (richnessByHref[href] > bestScore) {
        bestScore = richnessByHref[href];
        bestHref = href;
      }
    }
    historyRichHref = bestHref;
  }
  historyRichText = textByHref[historyRichHref] ?? '';

  console.log(`\n================ SUMMARY ================`);
  console.log(`History-rich client page identified as: ${historyRichHref}`);
  console.log(`Console/page errors on that page (this run): ${perClientErrorCounts[historyRichHref] ?? '(not captured on the identification pass)'}`);
  console.log(`Total console/page errors across all ${uniqueClientHrefs.length} client page(s): ${totalErrors}`);
  console.log(`Panel presence on the history-rich page: Personal Reset Plan=${ci(historyRichText, 'Personal Reset Plan')}, Readiness Pulse=${ci(historyRichText, 'Readiness Pulse')}, Life Signal Check=${ci(historyRichText, 'Life Signal Check')}, Core Values Snapshot=${ci(historyRichText, 'Core Values Snapshot')}, WBSA=${ci(historyRichText, 'Whole-Body Systems Assessment')}`);

  // Spot-check a second, different client page (the sparse member):
  // pick any unique href that is not the history-rich one.
  const otherHref = uniqueClientHrefs.find((h) => h !== historyRichHref);
  if (otherHref) {
    const beforeCount = consoleIssues.length;
    await page.goto(`${BASE_URL}${otherHref}`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const otherErrors = consoleIssues.length - beforeCount;
    console.log(`\nSpot-check second client page: ${otherHref}`);
    console.log(`Console/page errors on spot-check page (this run): ${otherErrors}`);
  } else {
    console.log('\nOnly one assigned client found under this coach account, no second page available to spot-check.');
  }

  console.log(`\n================ ALL CONSOLE / PAGE ERRORS THIS RUN ================`);
  if (consoleIssues.length === 0) {
    console.log('  none');
  } else {
    for (const c of consoleIssues) console.log(`  [${c.label}] ${c.type} @ ${c.url}: ${c.text}`);
  }

  await browser.close();
  process.exit(consoleIssues.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
