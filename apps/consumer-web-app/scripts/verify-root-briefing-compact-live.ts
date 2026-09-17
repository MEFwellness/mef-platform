#!/usr/bin/env npx tsx
/**
 * LIVE VERIFICATION, production: the compact coach briefing and Restore.
 *
 * One run, at a 390 px phone viewport, signed in as the standing coach
 * account with a one-time minted session (Turnstile blocks a scripted form
 * sign-in by design, which is not a failure):
 *
 *   1. With every View evidence closed, measures the three priority cards
 *      and screenshots them.
 *   2. Each card draws its shared source once; a finding from another
 *      source carries the short inline label.
 *   3. No headline or card sentence names a map entry or a category; the
 *      map entry names are inside View evidence.
 *   4. Changed answers read "Answer changed" with movement and dates, and
 *      the question separates an answer change from a symptom change.
 *   5. The counts reconcile: connections checked, priority findings, the
 *      view all remainder and the dismissed count.
 *   6. Discuss next session, then Reviewed, then Restore on one card: the
 *      card returns where it ranked, its history holds every entry, and its
 *      evidence is unchanged.
 *   7. Safety block position, the pinned section, and the member side.
 *
 * CLEANUP. The coach's review rows for this member and her visit stamp are
 * read before anything runs; every review row the run adds is deleted and
 * the visit stamp is put back, then both are recounted.
 *
 * Usage: PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   npx tsx scripts/verify-root-briefing-compact-live.ts
 */
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { selectAllRows, writeInChunks } from '../lib/data/pagedSelect';
import { readRootNoticed } from '../lib/cross-system-root/noticedRead';
import { loadSignalLibrary } from '../lib/cross-system-signals/contentData';
import { listRelationships } from '../lib/cross-system-relationships/data';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const MEMBER_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const COACH_EMAIL = process.env.COACH_EMAIL ?? 'oakomah66@gmail.com';
const SHOTS = 'scripts/.verify/root-briefing-compact';
const VIEWPORT = { width: 390, height: 844 };

const COACH_ONLY_WORDS = [
  'Root Noticed',
  'Whole-Body Association Map',
  'Coach briefing',
  'Why review together',
  'Discuss next session',
  'Why this ranked here',
  'Answer changed',
  'Answers changed since your review',
  'Reviewed or not relevant',
  'priority findings',
  'Root checked',
  'Your review history',
  'Restored to the briefing',
  'cross_system_root_briefing',
];

mkdirSync(SHOTS, { recursive: true });
const service = createClient(
  process.env.PROD_SUPABASE_URL!,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const anonKey = readFileSync(process.env.PROD_ANON_KEY_FILE!, 'utf8').trim();

const results: Array<{ item: string; pass: boolean; detail: string }> = [];
function record(item: string, pass: boolean, detail = ''): void {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}${detail ? `\n      ${detail}` : ''}`);
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Walk = { consoleErrors: string[]; bodies: Array<{ url: string; body: string }> };
function listen(page: Page, walk: Walk): void {
  page.on('console', (message) => {
    if (message.type() === 'error') walk.consoleErrors.push(`${page.url()}: ${message.text().slice(0, 160)}`);
  });
  page.on('pageerror', (error) => walk.consoleErrors.push(`${page.url()}: ${String(error).slice(0, 160)}`));
  page.on('response', async (response) => {
    try {
      const type = response.headers()['content-type'] ?? '';
      if (!/text|json|javascript|x-component/.test(type)) return;
      if (!response.url().startsWith(BASE)) return;
      walk.bodies.push({ url: response.url(), body: await response.text() });
    } catch {
      /* a body that cannot be read carried nothing */
    }
  });
}

async function go(page: Page, route: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await pause(2000 * (attempt + 1));
    }
  }
}

async function coachId(): Promise<string> {
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((user) => user.email === COACH_EMAIL);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  throw new Error('no coach account');
}

type ReviewRow = { id: string; target_key: string; action: string; acted_at: string };
async function reviewRows(coach: string): Promise<ReviewRow[]> {
  const { rows } = await selectAllRows<ReviewRow>(() =>
    service
      .from('cross_system_root_briefing_reviews')
      .select('id, target_key, action, acted_at')
      .eq('coach_id', coach)
      .eq('member_id', MEMBER_ID)
      .order('acted_at')
      .order('id')
  );
  return rows;
}
async function visitRow(coach: string): Promise<string | null> {
  // scale-exempt: primary key (coach_id, member_id), at most one row
  const { data } = await service
    .from('cross_system_root_briefing_visits')
    .select('visited_at')
    .eq('coach_id', coach)
    .eq('member_id', MEMBER_ID)
    .maybeSingle();
  return (data as { visited_at: string } | null)?.visited_at ?? null;
}

// ---------------------------------------------------------------------
// Reading the page
// ---------------------------------------------------------------------

type CardText = {
  targetKey: string;
  headline: string;
  markers: string[];
  source: string[];
  reported: string;
  related: string;
  inlineSources: string[];
  why: string;
  explore: string;
  whole: string;
};

async function openSection(page: Page): Promise<{ section: Locator; digest: string }> {
  const header = page.locator('#detail-section-root-noticed > button[aria-expanded]').first();
  await header.waitFor({ timeout: 30_000 });
  const digest = (await header.innerText()).replace(/\s+/g, ' ').trim();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const section = page.locator('#detail-section-root-noticed-content');
  await section.locator('[data-root-briefing]').waitFor({ timeout: 30_000 });
  return { section, digest };
}

async function readCardText(card: Locator): Promise<CardText> {
  const part = async (name: string) =>
    (await card.locator(`[data-briefing-part="${name}"]`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  return {
    targetKey: (await card.getAttribute('data-briefing-card')) ?? '',
    headline: (await card.locator('h3').innerText()).trim(),
    markers: await card.locator('[data-briefing-marker]').allInnerTexts(),
    source: (await card.locator('[data-briefing-source]').allInnerTexts()).map((text) => text.trim()),
    reported: await part('reported'),
    related: await part('related'),
    inlineSources: (await card.locator('[data-briefing-inline-source]').allInnerTexts()).map((text) => text.trim()),
    why: await part('why'),
    explore: await part('explore'),
    whole: (await card.innerText()).replace(/\s+/g, ' ').trim(),
  };
}

async function openCoachPage(context: BrowserContext, walk: Walk) {
  const page = await context.newPage();
  listen(page, walk);
  await go(page, `/coach/clients/${MEMBER_ID}/detail`);
  const { section, digest } = await openSection(page);
  const priority = section.locator('[data-briefing-priority-cards] > [data-briefing-card]');
  const pinned = section.locator('[data-briefing-pinned] [data-briefing-card]');
  const sectionText = (await section.locator('[data-root-briefing]').innerText()).replace(/\s+/g, ' ');
  return { page, section, digest, priority, pinned, sectionText };
}

async function evidenceText(card: Locator): Promise<{ text: string; history: string[] }> {
  const toggle = card.getByRole('button', { name: /View evidence|Hide evidence/ }).first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const block = card.locator('[data-briefing-evidence]');
  await block.waitFor({ timeout: 15_000 });
  const history = await block.locator('[data-briefing-history] li').allInnerTexts();
  const text = await block.evaluate((node) => {
    const clone = node.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-briefing-history]')?.remove();
    return clone.innerText;
  });
  await toggle.click();
  return { text, history };
}

async function fullEvidence(section: Locator): Promise<string> {
  const toggle = section.locator('[data-root-full-evidence-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await pause(300);
  const text = await section.evaluate((node) => {
    const all = (node as HTMLElement).innerText;
    return all.slice(all.toLowerCase().lastIndexOf('all evidence root checked'));
  });
  await toggle.click();
  return text;
}

/**
 * Taps an action and waits until its row is really stored. The server
 * action rebuilds her whole briefing before it saves, which takes seconds on
 * production, so a fixed pause can read the page before the row exists.
 */
async function act(coach: string, card: Locator, action: string): Promise<boolean> {
  const before = (await reviewRows(coach)).length;
  await card.locator(`[data-briefing-action="${action}"]`).first().click();
  for (let waited = 0; waited < 60; waited += 1) {
    const rows = await reviewRows(coach);
    if (rows.length > before) return rows[rows.length - 1]!.action === action;
    if ((await card.getByText('That did not save. Try again.').count().catch(() => 0)) > 0) return false;
    await pause(500);
  }
  return false;
}

// ---------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------

async function main(): Promise<void> {
  const coach = await coachId();
  const baselineReviews = await reviewRows(coach);
  const baselineVisit = await visitRow(coach);
  console.log(`baseline: ${baselineReviews.length} review rows, visit ${baselineVisit ?? 'none'}`);

  const built = await readRootNoticed(service, MEMBER_ID, { viewerId: coach });
  const briefing = built.briefing!;
  const library = await loadSignalLibrary(service);
  const relationships = await listRelationships(service);
  const mapNames = [...new Set(relationships.summaries.map((summary) => summary.current.patternName))];
  const categoryWords = [...new Set(
    [...library.categories.values()]
      .flatMap((category) => [category.displayName, ...category.displayName.split('/')])
      .map((word) => word.trim())
      .filter((word) => word.length > 0 && word.toLowerCase() !== 'other')
  )];

  const browser = await chromium.launch();
  const walk: Walk = { consoleErrors: [], bodies: [] };
  const minted = await mintSessionContext(browser, COACH_EMAIL, {
    baseUrl: BASE,
    viewport: VIEWPORT,
    contextOptions: { deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  if (!minted) throw new Error('the coach session could not be minted');
  let member: Awaited<ReturnType<typeof mintSessionContext>> = null;

  try {
    // ---- 1, 2, 3, 4, 5: the read, evidence closed.
    const first = await openCoachPage(minted.context, walk);
    const { page, section } = first;
    const count = await first.priority.count();
    record('The live page serves this build (shared source markup present)', (await section.locator('[data-briefing-source]').count()) > 0);
    const openEvidence = await section.locator('[data-briefing-evidence]').count();
    const box = await first.priority.evaluateAll((nodes) => {
      const top = nodes[0]!.getBoundingClientRect().top + window.scrollY;
      const last = nodes[nodes.length - 1]!.getBoundingClientRect();
      return {
        top: Math.round(top),
        height: Math.round(last.bottom + window.scrollY - top),
        each: nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
        scrollWidth: document.documentElement.scrollWidth,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
      };
    });
    const screens = box.height / box.innerHeight;
    record(
      '1. Three priority cards, every View evidence closed, fit in about 1.5 to 2 screens',
      count === 3 && openEvidence === 0 && screens <= 2.05,
      `${count} cards, ${box.height} px tall (${box.each.join(' + ')} plus gaps) at a ${box.innerWidth} x ${box.innerHeight} viewport = ${screens.toFixed(2)} screens; page scroll width ${box.scrollWidth}`
    );
    record('1. No sideways scroll at 390 px', box.scrollWidth <= VIEWPORT.width, `${box.scrollWidth}`);
    // Screenshots, one viewport each, from the top of the first card.
    for (let shot = 0; shot * box.innerHeight < box.height + 40; shot += 1) {
      await page.evaluate((y) => window.scrollTo(0, y), box.top - 60 + shot * (box.innerHeight - 60));
      await pause(400);
      await page.screenshot({ path: `${SHOTS}/priority-cards-390-part${shot + 1}.png` });
    }

    const cards: CardText[] = [];
    for (let index = 0; index < count; index += 1) cards.push(await readCardText(first.priority.nth(index)));
    writeFileSync(`${SHOTS}/cards.json`, JSON.stringify(cards, null, 2));

    // 2. Shared source once, inline labels only where the source differs.
    for (const [index, card] of cards.entries()) {
      const expected = briefing.cards[index]!;
      const repeats = card.whole.split('(covers ').length - 1;
      record(
        `2. Card ${index + 1} draws its shared source once, and no line under it repeats it`,
        card.source.length === 1 && card.source[0] === expected.sharedSource && repeats <= 1 && !/Reported [A-Z][a-z]{2} \d/.test(card.whole),
        `"${card.source.join(' | ')}"`
      );
      const expectedInline = expected.related.map((line) => line.inlineSource).filter((label): label is string => Boolean(label));
      record(
        `2. Card ${index + 1} labels exactly the findings from another source`,
        JSON.stringify(card.inlineSources) === JSON.stringify(expectedInline) &&
          card.inlineSources.every((label) => /^\(.+, [A-Z][a-z]{2} \d{1,2}\)$/.test(label)),
        card.inlineSources.length > 0 ? card.related : 'no cross source finding on this card'
      );
    }

    // 3. No map entry or category name on a card; map names in View evidence.
    const offenders: string[] = [];
    for (const card of cards) {
      const anchor = briefing.cards.find((entry) => entry.targetKey === card.targetKey)!.anchorName;
      const beyond = card.headline.startsWith(anchor) ? card.headline.slice(anchor.length) : card.headline;
      for (const word of categoryWords) {
        if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(beyond)) offenders.push(`headline "${card.headline}": ${word}`);
      }
      for (const text of [card.headline, card.why, card.explore, card.reported, card.related]) {
        for (const name of mapNames) if (text.includes(name)) offenders.push(`"${text.slice(0, 60)}": ${name}`);
        if (/\bsignals\b|association map/i.test(text)) offenders.push(`"${text.slice(0, 60)}": map wording`);
      }
    }
    record('3. No headline or card sentence names a map entry or a category', offenders.length === 0, offenders.join(' | ') || cards.map((card) => card.headline).join(' || '));
    const firstEvidence = await evidenceText(first.priority.nth(0));
    const namesInEvidence = mapNames.filter((name) => firstEvidence.text.includes(name));
    record('3. The map entry names are inside View evidence', namesInEvidence.length > 0, namesInEvidence.slice(0, 2).join(' | '));

    // 4. Answer changed.
    const changed = cards.filter((card) => card.markers.includes('Answer changed'));
    const movement = /Answer changed(?: for [^:]+)?: (Almost always|Often|Sometimes|Rarely|Never) \(([A-Z][a-z]{2} \d{1,2})\) from (Almost always|Often|Sometimes|Rarely|Never) \(([A-Z][a-z]{2} \d{1,2})\)/;
    record(
      '4. Changed answers read "Answer changed" with the movement and both dates',
      changed.length > 0 && changed.every((card) => movement.test(card.reported)),
      changed.map((card) => movement.exec(card.reported)?.[0] ?? card.reported).join(' || ')
    );
    record(
      '4. The question separates a change in her answer from a change in her symptoms',
      changed.every((card) => /this time and .+ previously\. Does that reflect a change in your symptoms or in how you understood the question\?/.test(card.explore)),
      changed.map((card) => card.explore).join(' || ')
    );
    record(
      '4. No old change wording anywhere in the briefing',
      !/Changed since last time|What changed for you|Changed since your review/.test(first.sectionText)
    );

    // 5. Counts.
    const connections = Number(/Root checked (\d+) connections?/.exec(first.digest)?.[1] ?? NaN);
    const priorityCount = Number(/(\d+) priority findings?/i.exec(first.sectionText)?.[1] ?? NaN);
    const more = Number(/View all findings \((\d+) more\)/i.exec(first.sectionText)?.[1] ?? 0);
    const dismissedCount = Number(/Reviewed or not relevant \((\d+)\)/i.exec(first.sectionText)?.[1] ?? 0);
    const total = briefing.pinned.length + briefing.cards.length + briefing.dismissed.length;
    record('5. The section header says "Root checked N connections" and N is the connections the view holds', connections === built.findingCount, `header "${first.digest}", view ${built.findingCount}`);
    record(
      '5. Priority findings, the view all remainder and the dismissed count add up to every card',
      priorityCount === count && priorityCount + more + dismissedCount === total,
      `${priorityCount} priority + ${more} more + ${dismissedCount} reviewed or not relevant = ${priorityCount + more + dismissedCount} of ${total} cards`
    );
    record('5. Nothing is described as waiting for review', !/to review|awaiting/i.test(`${first.digest} ${first.sectionText}`));

    // 7. Safety and pinned, before anything is tapped.
    const safetyBlocks = await page.locator('[data-root-noticed-safety]').count();
    const safetyInside = await section.locator('[data-root-noticed-safety]').count();
    record('7. Safety block drawn outside the section only (none for her: no red flag Yes)', safetyInside === 0 && safetyBlocks === (briefing.safety ? 1 : 0), `${safetyBlocks} outside, ${safetyInside} inside`);
    record('7. No pinned section before any action', (await section.locator('[data-briefing-pinned]').count()) === 0);

    const beforeFull = await fullEvidence(section);
    const target = cards[0]!.targetKey;
    const targetCard = () => section.locator(`[data-briefing-card="${target}"]`).first();
    const targetEvidenceBefore = firstEvidence.text;
    await page.close();

    // ---- 6 and 7: pin, review, restore.
    const pinPage = await openCoachPage(minted.context, walk);
    record('6. Discuss next session saved', await act(coach, pinPage.section.locator(`[data-briefing-card="${target}"]`).first(), 'discuss_next_session'));
    await pinPage.page.close();
    const pinned = await openCoachPage(minted.context, walk);
    const pinnedKeys = await pinned.pinned.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-briefing-card')));
    const pinnedPriority = await pinned.priority.count();
    const pinnedMore = Number(/View all findings \((\d+) more\)/i.exec(pinned.sectionText)?.[1] ?? 0);
    const pinnedAt = pinned.sectionText.toLowerCase().indexOf('discuss next session (1)');
    const priorityAt = pinned.sectionText.search(/\d+ priority findings?/i);
    record(
      '7. The pinned section is its own section above the priority cards and takes no priority slot',
      JSON.stringify(pinnedKeys) === JSON.stringify([target]) && pinnedAt > -1 && pinnedAt < priorityAt && pinnedPriority === 3 && 1 + pinnedPriority + pinnedMore === total,
      `pinned ${pinnedKeys.join(',')}, "Discuss next session (1)", ${pinnedPriority} priority + ${pinnedMore} more`
    );
    record('6. Reviewed on the pinned card saved', await act(coach, pinned.pinned.first(), 'reviewed'));
    await pinned.page.close();

    const folded = await openCoachPage(minted.context, walk);
    const foldedPriority = await folded.priority.count();
    const foldedMore = Number(/View all findings \((\d+) more\)/i.exec(folded.sectionText)?.[1] ?? 0);
    const foldedDismissed = Number(/Reviewed or not relevant \((\d+)\)/i.exec(folded.sectionText)?.[1] ?? 0);
    record(
      '6. The reviewed card is folded, unpinned, and counted on its own',
      (await folded.section.locator(`[data-briefing-card="${target}"]`).count()) === 0 && (await folded.section.locator('[data-briefing-pinned]').count()) === 0 && foldedDismissed === 1 && foldedPriority + foldedMore + foldedDismissed === total,
      `${foldedPriority} priority + ${foldedMore} more + ${foldedDismissed} reviewed or not relevant = ${total}`
    );
    const foldToggle = folded.section.locator('[data-briefing-dismissed-fold] > button');
    await foldToggle.click();
    const foldItem = folded.section.locator(`[data-briefing-dismissed="${target}"]`);
    await foldItem.waitFor({ timeout: 10_000 });
    const foldLine = (await foldItem.innerText()).replace(/\s+/g, ' ');
    record('6. The fold line offers Restore and never says it waits for review', /Restore/.test(foldLine) && !/to review|awaiting/i.test(foldLine), foldLine);
    await folded.page.screenshot({ path: `${SHOTS}/restore-fold-390.png` });
    const restoreSaved = await act(coach, foldItem, 'restored');
    await pause(500);
    record('6. Restore saved, and the card is back on this screen at once', restoreSaved && (await folded.section.locator(`[data-briefing-card="${target}"]`).count()) === 1);
    await folded.page.close();

    const restored = await openCoachPage(minted.context, walk);
    const restoredKeys = await restored.priority.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-briefing-card')));
    const restoredMore = Number(/View all findings \((\d+) more\)/i.exec(restored.sectionText)?.[1] ?? 0);
    const restoredDismissed = Number(/Reviewed or not relevant \((\d+)\)/i.exec(restored.sectionText)?.[1] ?? 0);
    record(
      '6. After a reload the card is back where the rules rank it, and the fold is gone',
      JSON.stringify(restoredKeys) === JSON.stringify(cards.map((card) => card.targetKey)) && restoredDismissed === 0 && 3 + restoredMore === total,
      `order ${restoredKeys.join(', ')}; ${restoredMore} more; dismissed ${restoredDismissed}`
    );
    const after = await evidenceText(restored.section.locator(`[data-briefing-card="${target}"]`).first());
    record(
      '6. Its history shows the pin, the review and the restore, oldest first',
      after.history.length === 3 && /^Discuss next session, /.test(after.history[0]!) && /^Reviewed, /.test(after.history[1]!) && /^Restored to the briefing, /.test(after.history[2]!),
      after.history.join(' | ')
    );
    record('6. View evidence is intact: identical before and after', after.text === targetEvidenceBefore, `${targetEvidenceBefore.length} and ${after.text.length} characters`);
    record('6. The full evidence is identical before and after', (await fullEvidence(restored.section)) === beforeFull, `${beforeFull.length} characters`);
    const rows = (await reviewRows(coach)).filter((row) => !baselineReviews.some((held) => held.id === row.id));
    record(
      '6. Stored as three appended rows, none deleted',
      rows.map((row) => row.action).join(',') === 'discuss_next_session,reviewed,restored' && (await reviewRows(coach)).length === baselineReviews.length + 3,
      rows.map((row) => `${row.action} ${row.acted_at}`).join(' | ')
    );
    const endDismissed = restoredDismissed;
    record('6. No leftover review taps: nothing is folded under Reviewed or not relevant', endDismissed === 0 && baselineReviews.length === 0, `${baselineReviews.length} review rows existed before this run`);
    await restored.page.screenshot({ path: `${SHOTS}/after-restore-390.png` });
    await restored.page.close();
    record('No console errors on the coach page', walk.consoleErrors.length === 0, walk.consoleErrors.slice(0, 4).join(' | '));

    // ---- 7: the member side.
    member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
    if (!member) throw new Error('the member session could not be minted');
    const memberWalk: Walk = { consoleErrors: [], bodies: [] };
    for (const route of ['/dashboard', '/today', '/checkin', '/body-systems', '/progress', '/profile']) {
      const routePage = await member.context.newPage();
      listen(routePage, memberWalk);
      await go(routePage, route);
      await pause(1500);
      await routePage.close();
    }
    const leaks: string[] = [];
    for (const { url, body } of memberWalk.bodies) for (const word of COACH_ONLY_WORDS) if (body.includes(word)) leaks.push(`"${word}" in ${url.slice(0, 90)}`);
    record('7. Zero coach-only phrases in every member response body', leaks.length === 0, leaks.length ? leaks.slice(0, 6).join(' | ') : `${memberWalk.bodies.length} response bodies across six member routes`);
    record('7. Zero console errors on her screens', memberWalk.consoleErrors.length === 0, memberWalk.consoleErrors.slice(0, 5).join(' | '));
    const asMember = createClient(process.env.PROD_SUPABASE_URL!, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${member.session.access_token}` } },
    });
    const readable: string[] = [];
    for (const table of ['cross_system_root_briefing_reviews', 'cross_system_root_briefing_visits', 'cross_system_root_findings', 'cross_system_signals']) {
      const { data } = await asMember.from(table).select('*').limit(5);
      if ((data ?? []).length > 0) readable.push(`${table}=${data!.length}`);
    }
    record('7. Her own session reads 0 rows from the briefing tables and the Root tables', readable.length === 0, readable.join(', ') || 'all four empty to her');
  } catch (error) {
    record('The run completed without throwing', false, String(error).slice(0, 400));
  } finally {
    await retireSession(member);
    await retireSession(minted);
    await browser.close();

    // ---- Cleanup: every review row this run added, and the visit stamp.
    const added = (await reviewRows(coach)).filter((row) => !baselineReviews.some((held) => held.id === row.id));
    if (added.length > 0) {
      const removed = await writeInChunks(
        added.map((row) => row.id),
        (chunk) => service.from('cross_system_root_briefing_reviews').delete().in('id', chunk)
      );
      if (removed.error) console.log(`cleanup error: ${removed.error.message}`);
    }
    if (baselineVisit) {
      await service
        .from('cross_system_root_briefing_visits')
        .update({ visited_at: baselineVisit })
        .eq('coach_id', coach)
        .eq('member_id', MEMBER_ID);
    } else {
      await service.from('cross_system_root_briefing_visits').delete().eq('coach_id', coach).eq('member_id', MEMBER_ID);
    }
    const endReviews = await reviewRows(coach);
    const endVisit = await visitRow(coach);
    record(
      'Cleanup: the review rows and the visit stamp match the state before the run',
      JSON.stringify(endReviews) === JSON.stringify(baselineReviews) && endVisit === baselineVisit,
      `${added.length} added rows removed; ${endReviews.length} review rows now, ${baselineReviews.length} before; visit ${endVisit === baselineVisit ? 'put back' : `${endVisit} (was ${baselineVisit})`}`
    );
    writeFileSync(`${SHOTS}/results.json`, JSON.stringify(results, null, 2));
    const failed = results.filter((entry) => !entry.pass).length;
    console.log(`\n${results.length - failed} of ${results.length} passed`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
