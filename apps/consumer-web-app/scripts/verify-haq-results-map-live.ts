#!/usr/bin/env npx tsx
/**
 * LIVE VERIFICATION, production: her Health Appraisal results MAP.
 *
 * WHAT IT PROVES, on app.mefwellness.com, signed in as the real test
 * member, on a phone sized viewport:
 *
 *   1  the page opens on her finished sitting
 *   2  the three counts on the strip are what the database actually holds
 *   3  the ten Parts stand in the instrument's order, each holding its own
 *      sections in their original order, twenty one rows in all
 *   4  every row wears exactly one colour, and its bar is that band's width
 *   5  the only digits on the page are her three counts: no total, no
 *      cutoff, no hidden value, no 0, 1, 4 or 8
 *   6  a bar below the fold starts empty, fills when the row arrives, and
 *      does NOT start again when she scrolls away and back
 *   7  the strip emphasises one colour without reordering, removing or
 *      hiding a single row, and a second tap puts the page back
 *   8  a row opens on its own approved sentence, one at a time
 *   9  the trend chips match what her previous sitting actually held, and
 *      the comparison line appears exactly once
 *  10  reduced motion draws the same widths with no transition at all
 *  11  the coach's Deep Dive still reads exactly as it did, numbers and all
 *
 * NOTHING IS WRITTEN. Every check is a read. It refuses to run against an
 * account that is not flagged is_test.
 *
 * THE KEYS ARE NEVER WRITTEN DOWN. The standing method passes the service
 * and anon keys as file PATHS so nothing secret reaches a command line. This
 * run goes one step further and never puts them on a disk either: it asks
 * the Supabase CLI for them over the owner's existing login, holds them in
 * this process only, and lets them die with it. PROD_SUPABASE_URL,
 * PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE are still honoured when they
 * are set, so the documented method keeps working unchanged.
 *
 * Sessions are minted, because Turnstile blocks a scripted form sign in by
 * design, and retired afterwards with scope 'local' so nobody is signed out
 * of their own phone.
 *
 * Usage: npx tsx scripts/verify-haq-results-map-live.ts
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HAQ_PARTS, HAQ_SECTIONS } from '../lib/haq/questionBank';
import { HAQ_BAND_FILL } from '../lib/haq/resultsView';
import { haqTrend } from '../lib/haq/results';
import {
  HAQ_MEMBER_LABELS,
  HAQ_RESULTS_COMPARISON_LINE,
  HAQ_RESULTS_INTRO,
  HAQ_RESULTS_TITLE,
  HAQ_RESULT_EXPLANATIONS,
  HAQ_TREND_LABELS,
  haqAreaCountLabel,
} from '../lib/haq/copy';
import type { HaqResultColor } from '../lib/haq/types';

const require = createRequire(import.meta.url);
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker.js');
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url.js');

const run = promisify(execFile);

const BASE = 'https://app.mefwellness.com';
const PROJECT_REF = 'piafgqstbibvllsnuike';
const MEMBER_EMAIL = process.env.HAQ_MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const PHONE = { width: 390, height: 844 };

const results: Array<{ item: string; pass: boolean; detail: string }> = [];
function record(item: string, pass: boolean, detail = ''): void {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}${detail ? `\n      ${detail}` : ''}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* KEYS, HELD IN MEMORY AND NOWHERE ELSE.                              */
/* ------------------------------------------------------------------ */

type Keys = { url: string; anon: string; service: string };

async function resolveKeys(): Promise<Keys> {
  const url = process.env.PROD_SUPABASE_URL ?? `https://${PROJECT_REF}.supabase.co`;

  if (process.env.PROD_SERVICE_KEY_FILE && process.env.PROD_ANON_KEY_FILE) {
    return {
      url,
      service: readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
      anon: readFileSync(process.env.PROD_ANON_KEY_FILE, 'utf8').trim(),
    };
  }

  const { stdout } = await run(
    'npx',
    ['supabase', 'projects', 'api-keys', '--project-ref', PROJECT_REF, '--output', 'json'],
    { maxBuffer: 1024 * 1024 }
  );
  const rows = JSON.parse(stdout) as Array<{ name: string; api_key: string }>;
  const pick = (name: string) => rows.find((row) => row.name === name)?.api_key;
  const anon = pick('anon');
  const service = pick('service_role');
  if (!anon || !service) throw new Error('Could not resolve the project keys');
  return { url, anon, service };
}

/* ------------------------------------------------------------------ */
/* A REAL SESSION, WITHOUT THE LOGIN FORM.                             */
/* ------------------------------------------------------------------ */

async function mintContext(
  browser: Browser,
  keys: Keys,
  service: SupabaseClient,
  email: string,
  contextOptions: Record<string, unknown> = {}
): Promise<{ context: BrowserContext; accessToken: string }> {
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    throw new Error(`Could not mint a session for ${email}`);
  }

  const publicClient = createClient(keys.url, keys.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyError } = await publicClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError || !verified?.session) throw new Error(`Could not redeem a session for ${email}`);

  const cookieName = `sb-${new URL(keys.url).hostname.split('.')[0]}-auth-token`;
  const chunks = createChunks(
    cookieName,
    `base64-${stringToBase64URL(JSON.stringify(verified.session))}`
  );

  const context = await browser.newContext({ viewport: PHONE, ...contextOptions });
  await context.addCookies(
    chunks.map((chunk: { name: string; value: string }) => ({
      name: chunk.name,
      value: chunk.value,
      domain: new URL(BASE).hostname,
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax' as const,
    }))
  );

  return { context, accessToken: verified.session.access_token };
}

async function go(page: Page, route: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await page.goto(`${BASE}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      return response?.status() ?? 0;
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(2000 * (attempt + 1));
    }
  }
  return 0;
}

/** What the browser can see of one results row. */
type LiveRow = {
  sectionId: string;
  color: string;
  dimmed: string;
  text: string;
  barFill: string;
  barWidth: string;
  trend: string | null;
  expanded: string | null;
  panelHidden: string | null;
  panelText: string;
};

async function readRows(page: Page): Promise<LiveRow[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="haq-result-card-"]')).map((node) => {
      const sectionId = (node.getAttribute('data-testid') ?? '').replace('haq-result-card-', '');
      const bar = node.querySelector(`[data-testid="haq-bar-${sectionId}"]`) as HTMLElement | null;
      const panel = document.getElementById(`haq-detail-${sectionId}`);
      return {
        sectionId,
        color: node.getAttribute('data-result') ?? '',
        dimmed: node.getAttribute('data-dimmed') ?? '',
        text: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
        barFill: bar?.getAttribute('data-fill') ?? '',
        // The computed width, as a share of the track, so a transition that
        // never ran is visible as 0.
        barWidth: bar
          ? `${Math.round(
              (bar.getBoundingClientRect().width /
                Math.max(1, (bar.parentElement as HTMLElement).getBoundingClientRect().width)) *
                100
            )}%`
          : '',
        trend:
          node.querySelector(`[data-testid="haq-trend-${sectionId}"]`)?.textContent?.trim() ?? null,
        expanded: node.querySelector('button')?.getAttribute('aria-expanded') ?? null,
        panelHidden: panel?.getAttribute('aria-hidden') ?? null,
        panelText: (panel?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      };
    })
  );
}

const screenText = (page: Page) =>
  page.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' ').trim());

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const keys = await resolveKeys();
  const service = createClient(keys.url, keys.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* The account, and the refusal that keeps this off a real member. */
  // Every page of accounts, not the first: listUsers stops at perPage.
  let member: { id: string; email?: string } | undefined;
  for (let page = 1; !member; page += 1) {
    const { data: users, error: usersError } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (usersError) throw new Error(usersError.message);
    member = users.users.find((user) => user.email === MEMBER_EMAIL);
    if (users.users.length < 200) break;
  }
  if (!member) throw new Error(`No account for ${MEMBER_EMAIL}`);
  const { data: profile } = await service
    .from('profiles')
    .select('id, is_test')
    .eq('id', member.id)
    .maybeSingle();
  if (!profile?.is_test) throw new Error('Refusing to run: that account is not flagged is_test');
  record('the account under test is the flagged test member', true, MEMBER_EMAIL);

  /* Her sittings, and the truth the page is measured against. */
  const { data: sittings } = await service
    .from('unified_assessment_sessions')
    .select('id, completed_at, assessment_definition_id')
    .eq('member_id', member.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);

  const haqSittings: Array<{ id: string; completed_at: string | null }> = [];
  for (const sitting of sittings ?? []) {
    // scale-exempt: one sitting's section results, exactly 21 rows by the instrument
    const { data: rows } = await service
      .from('haq_section_results')
      .select('section_id')
      .eq('session_id', sitting.id)
      .limit(21);
    if ((rows ?? []).length > 0) haqSittings.push(sitting as { id: string; completed_at: string | null });
  }
  if (haqSittings.length === 0) throw new Error('The test member has no completed Health Appraisal');

  const truthOf = async (sessionId: string) => {
    // scale-exempt: one sitting's section results, exactly 21 rows by the instrument
    const { data } = await service
      .from('haq_section_results')
      .select('section_id, result_color, member_result_label')
      .eq('session_id', sessionId)
      .limit(21);
    return new Map(
      (data ?? []).map((row) => [
        row.section_id as string,
        row.result_color as HaqResultColor,
      ])
    );
  };

  const current = await truthOf(haqSittings[0]!.id);
  const previous = haqSittings[1] ? await truthOf(haqSittings[1]!.id) : null;
  const counts = { red: 0, yellow: 0, green: 0 } as Record<HaqResultColor, number>;
  for (const color of current.values()) counts[color] += 1;
  const previousCounts = { red: 0, yellow: 0, green: 0 } as Record<HaqResultColor, number>;
  for (const color of previous?.values() ?? []) previousCounts[color] += 1;

  record(
    'the database holds her sitting',
    current.size === 21,
    `${current.size} sections, ${haqSittings.length} finished sitting(s), counts red ${counts.red} / yellow ${counts.yellow} / green ${counts.green}`
  );

  const browser = await chromium.launch();
  let memberContext: { context: BrowserContext; accessToken: string } | null = null;
  let reducedContext: { context: BrowserContext; accessToken: string } | null = null;
  let coachContext: { context: BrowserContext; accessToken: string } | null = null;

  try {
    memberContext = await mintContext(browser, keys, service, MEMBER_EMAIL);
    const page = await memberContext.context.newPage();

    /* 1. The page opens. */
    const status = await go(page, '/health-appraisal/results');
    await page.waitForSelector('[data-testid="haq-results"]', { timeout: 40_000 });
    const top = await screenText(page);
    record(
      'her results page opens on her own sitting',
      status === 200 && top.includes(HAQ_RESULTS_TITLE) && top.includes(HAQ_RESULTS_INTRO),
      `HTTP ${status}`
    );

    /* 2. The three counts are the database's own. */
    const summaryText = await page
      .locator('[data-testid="haq-results-summary"]')
      .innerText()
      .then((value) => value.replace(/\s+/g, ' ').trim());
    const countsOk = (['red', 'yellow', 'green'] as HaqResultColor[]).every(
      (color) =>
        summaryText.includes(HAQ_MEMBER_LABELS[color]) &&
        summaryText.includes(haqAreaCountLabel(counts[color]))
    );
    record('the summary strip counts what the database holds', countsOk, summaryText);
    /*
     * THE PAGE SHOWS HER NEWEST SITTING, which is the retake, not the first
     * one. 13 Red / 1 Yellow / 7 Green is the shape of the FIRST sitting and
     * is still exactly what the database holds for it. Asserting it against
     * the page would assert that her results page ignores her retake, so it
     * is asserted where it actually lives, and the page is measured against
     * the sitting it is really showing.
     */
    record(
      'the page is showing her NEWEST sitting, and the first one still holds its own shape',
      JSON.stringify(previousCounts) === JSON.stringify({ red: 13, yellow: 1, green: 7 }),
      `newest red ${counts.red} / yellow ${counts.yellow} / green ${counts.green}; ` +
        `first red ${previousCounts.red} / yellow ${previousCounts.yellow} / green ${previousCounts.green}`
    );

    /* 3. Ten Parts, in order, each holding its own sections in order. */
    const partOrder = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="haq-part-"]')).map((node) => ({
        partId: (node.getAttribute('data-testid') ?? '').replace('haq-part-', ''),
        heading: node.querySelector('h2')?.textContent?.trim() ?? '',
        sections: Array.from(node.querySelectorAll('[data-testid^="haq-result-card-"]')).map(
          (row) => (row.getAttribute('data-testid') ?? '').replace('haq-result-card-', '')
        ),
      }))
    );
    const partsOk =
      partOrder.length === HAQ_PARTS.length &&
      partOrder.every((group, index) => group.partId === HAQ_PARTS[index]!.id) &&
      partOrder.every((group, index) => group.heading === HAQ_PARTS[index]!.name);
    const sectionsOk = partOrder.every((group) => {
      const expected = HAQ_SECTIONS.filter((section) => section.partId === group.partId).map(
        (section) => section.id
      );
      return JSON.stringify(group.sections) === JSON.stringify(expected);
    });
    record(
      'the ten Parts stand in the instrument\'s order, named and not numbered',
      partsOk,
      partOrder.map((group) => group.heading).join(' | ')
    );
    record(
      'and every section stands in its own original order inside its Part',
      sectionsOk && partOrder.flatMap((group) => group.sections).length === 21
    );
    record(
      'no Part numeral reaches her results page',
      !/\bPart\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/.test(top) && !/\bPart\b/.test(top)
    );

    /* 4. One colour a row, and the bar is that band. */
    const rows = await readRows(page);
    const oneColour = rows.every((row) => {
      const truth = current.get(row.sectionId);
      if (!truth || row.color !== truth) return false;
      if (!row.text.includes(HAQ_MEMBER_LABELS[truth])) return false;
      return (['red', 'yellow', 'green'] as HaqResultColor[])
        .filter((other) => other !== truth)
        .every((other) => !row.text.includes(HAQ_MEMBER_LABELS[other]));
    });
    record('every row wears exactly one colour, and it is its own result', oneColour);

    const bandOk = rows.every((row) => {
      const truth = current.get(row.sectionId)!;
      return row.barFill === HAQ_BAND_FILL[truth];
    });
    record(
      'and its bar is that band: a third, two thirds, or the whole track',
      bandOk,
      rows
        .slice(0, 4)
        .map((row) => `${row.sectionId} ${row.color} ${row.barFill}`)
        .join(', ')
    );

    /* 5. The only digits are her three counts. */
    const digits = (top.match(/\d+/g) ?? []).sort();
    const expectedDigits = [
      String(counts.red),
      String(counts.yellow),
      String(counts.green),
    ].sort();
    record(
      'the only digits on the page are her three counts',
      JSON.stringify(digits) === JSON.stringify(expectedDigits),
      `found ${JSON.stringify(digits)}`
    );
    record(
      'no total, percentage, cutoff, priority or overall result anywhere on it',
      !/%|overall|out of|Low Priority|Moderate Priority|High Priority|grade|raw|cutoff/i.test(top)
    );

    /* 6. The bars fill once, and never start again. */
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
    const lastSection = HAQ_SECTIONS[HAQ_SECTIONS.length - 1]!.id;
    const beforeScroll = (await readRows(page)).find((row) => row.sectionId === lastSection)!;
    record(
      'a bar below the fold has not filled yet',
      beforeScroll.barWidth === '0%',
      `${lastSection} at ${beforeScroll.barWidth}`
    );

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1800);
    const afterScroll = (await readRows(page)).find((row) => row.sectionId === lastSection)!;
    const targetWidth = HAQ_BAND_FILL[current.get(lastSection)!];
    record(
      'it fills to its band when the row arrives',
      afterScroll.barWidth === targetWidth,
      `${lastSection} at ${afterScroll.barWidth}, expected ${targetWidth}`
    );

    /* Away, and back: the fill must still be there the instant it returns. */
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(600);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(120);
    const onReturn = (await readRows(page)).find((row) => row.sectionId === lastSection)!;
    record(
      'and it does NOT start again when she scrolls away and back',
      onReturn.barWidth === targetWidth,
      `${lastSection} at ${onReturn.barWidth} within 120ms of returning, expected ${targetWidth}`
    );

    const allFilled = (await readRows(page)).every(
      (row) => row.barWidth === HAQ_BAND_FILL[current.get(row.sectionId)!]
    );
    record('after one pass every one of the 21 bars stands at its band', allFilled);

    /* 7. The strip emphasises, and never filters. */
    const orderBefore = (await readRows(page)).map((row) => row.sectionId);
    for (const color of ['red', 'yellow', 'green'] as HaqResultColor[]) {
      await page.click(`[data-testid="haq-summary-${color}"]`);
      await sleep(450);
      const during = await readRows(page);
      const orderKept = JSON.stringify(during.map((row) => row.sectionId)) === JSON.stringify(orderBefore);
      const dimmedRight = during.every(
        (row) => row.dimmed === (row.color === color ? 'false' : 'true')
      );
      record(
        `tapping ${HAQ_MEMBER_LABELS[color]} holds that colour up without reordering or removing a row`,
        orderKept && dimmedRight && during.length === 21,
        `${during.filter((row) => row.dimmed === 'false').length} rows held up, ${during.length} rows still on the page`
      );

      await page.click(`[data-testid="haq-summary-${color}"]`);
      await sleep(450);
      const after = await readRows(page);
      record(
        `and a second tap on ${HAQ_MEMBER_LABELS[color]} puts the whole map back`,
        after.every((row) => row.dimmed === 'false') && after.length === 21
      );
    }

    /* 8. A row opens, one at a time. */
    const firstSection = HAQ_SECTIONS[0]!.id;
    const secondSection = HAQ_SECTIONS[1]!.id;
    await page.click(`[data-testid="haq-result-card-${firstSection}"] button`);
    await sleep(500);
    let opened = await readRows(page);
    const firstRow = opened.find((row) => row.sectionId === firstSection)!;
    record(
      'a row opens on its own approved sentence',
      firstRow.expanded === 'true' &&
        firstRow.panelHidden === 'false' &&
        firstRow.panelText === HAQ_RESULT_EXPLANATIONS[current.get(firstSection)!],
      firstRow.panelText
    );

    await page.click(`[data-testid="haq-result-card-${secondSection}"] button`);
    await sleep(500);
    opened = await readRows(page);
    record(
      'and opening a second closes the first, so only one is ever open',
      opened.filter((row) => row.expanded === 'true').length === 1 &&
        opened.find((row) => row.sectionId === secondSection)!.expanded === 'true'
    );
    await page.click(`[data-testid="haq-result-card-${secondSection}"] button`);
    await sleep(300);

    /* 9. The trend, only against a real previous sitting. */
    const comparisonCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="haq-results-comparison-line"]').length
    );
    if (previous) {
      const chipsOk = rows.every((row) => {
        const was = previous.get(row.sectionId);
        const expected = was ? HAQ_TREND_LABELS[haqTrend(was, current.get(row.sectionId)!)] : null;
        return row.trend === expected;
      });
      record(
        'every trend chip says what her previous sitting actually held',
        chipsOk,
        `${rows.filter((row) => row.trend).length} chips against ${previous.size} previous sections`
      );
      record('and the comparison line stands at the top exactly once', comparisonCount === 1);
      record(
        'the comparison line is the approved sentence, word for word',
        top.includes(HAQ_RESULTS_COMPARISON_LINE)
      );
      record(
        'no chip is ever framed as better or worse',
        !/improv|worse|better|deteriorat|declin|recover|relaps|healed|cured/i.test(top)
      );
    } else {
      record(
        'a first sitting carries no chip and no comparison line',
        comparisonCount === 0 &&
          rows.every((row) => row.trend === null) &&
          !/Quieter|Unchanged|Louder|Compared with/.test(top)
      );
    }

    /* 10. Reduced motion: the same widths, without the travel. */
    reducedContext = await mintContext(browser, keys, service, MEMBER_EMAIL, {
      reducedMotion: 'reduce',
    });
    const reducedPage = await reducedContext.context.newPage();
    await go(reducedPage, '/health-appraisal/results');
    await reducedPage.waitForSelector('[data-testid="haq-results"]', { timeout: 40_000 });
    await sleep(500);
    const reducedRows = await reducedPage.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="haq-bar-"]')).map((node) => ({
        sectionId: (node.getAttribute('data-testid') ?? '').replace('haq-bar-', ''),
        width: (node as HTMLElement).style.width,
        transition: (node as HTMLElement).style.transition,
      }))
    );
    record(
      'under reduced motion every bar is already at its band, with no transition at all',
      reducedRows.length === 21 &&
        reducedRows.every(
          (row) =>
            row.width === HAQ_BAND_FILL[current.get(row.sectionId)!] && row.transition === 'none'
        ),
      `${reducedRows.length} bars, first ${reducedRows[0]?.width} / ${reducedRows[0]?.transition}`
    );

    /* 11. The coach's Deep Dive, untouched. */
    // scale-exempt: one member's active coach assignments, one row by the product
    const { data: assignment } = await service
      .from('coach_client_assignments')
      .select('coach_id')
      .eq('client_id', member.id)
      .eq('status', 'active')
      .limit(5);
    const coachId = (assignment ?? [])[0]?.coach_id as string | undefined;
    if (!coachId) {
      record('the coach Deep Dive could not be checked', false, 'the test member has no active coach');
    } else {
      const { data: coachUser } = await service.auth.admin.getUserById(coachId);
      const coachEmail = coachUser?.user?.email;
      if (!coachEmail) throw new Error('Could not read the assigned coach email');

      coachContext = await mintContext(browser, keys, service, coachEmail, {
        viewport: { width: 1280, height: 900 },
      });
      const coachPage = await coachContext.context.newPage();
      const coachStatus = await go(
        coachPage,
        `/coach/clients/${member.id}/health-appraisal/${haqSittings[0]!.id}`
      );
      const coachText = await screenText(coachPage);

      // scale-exempt: one sitting's section results, exactly 21 rows by the instrument
      const { data: coachRows } = await service
        .from('haq_section_results')
        .select('section_id, raw_total, original_priority')
        .eq('session_id', haqSittings[0]!.id)
        .limit(21);

      const totalsShown = (coachRows ?? []).filter((row) =>
        coachText.includes(String(row.raw_total))
      ).length;
      // innerText reflects text-transform, and the coach's priority chip is
      // uppercased in CSS, so the comparison is case insensitive.
      const upperCoachText = coachText.toUpperCase();
      const prioritiesShown = (coachRows ?? []).every((row) =>
        upperCoachText.includes(String(row.original_priority).toUpperCase())
      );
      record(
        'the coach Deep Dive still opens, and still carries the numbers the member never sees',
        coachStatus === 200 && totalsShown > 0 && prioritiesShown,
        `HTTP ${coachStatus}, ${totalsShown} of 21 raw totals visible, priority wording ${prioritiesShown ? 'present' : 'absent'}`
      );
      record(
        'and it still names every one of the 21 sections',
        HAQ_SECTIONS.every((section) => coachText.includes(section.title))
      );
    }
  } finally {
    for (const minted of [memberContext, reducedContext, coachContext]) {
      if (!minted) continue;
      await service.auth.admin.signOut(minted.accessToken, 'local').catch(() => {});
      await minted.context.close().catch(() => {});
    }
    await browser.close();
  }

  const failed = results.filter((entry) => !entry.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\nFAILED:');
    for (const entry of failed) console.log(`  ${entry.item}${entry.detail ? ` (${entry.detail})` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
