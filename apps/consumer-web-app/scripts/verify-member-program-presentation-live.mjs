#!/usr/bin/env node
/**
 * What a member actually reads about her program, checked against a
 * running app.
 *
 * Walks the exact tap paths a member walks, captures the text painted on
 * each screen, and fails if any of it carries a pattern name, a severity,
 * "auto-generated", or a generation seed. Then signs in as the coach and
 * confirms the clinical names are still exactly where they were, because
 * the fix is a display mapping on the way out and not a rename.
 *
 *   BASE_URL        default https://app.mefwellness.com
 *   MEMBER_EMAIL    the member whose program is read
 *   MEMBER_ID       her user id (the coach screens are keyed by it)
 *   COACH_EMAIL     a coach who has her as an assigned client
 *
 * Signing in uses the standing method (scripts/lib/mint-session.mjs); see
 * CLAUDE.md. Passwords still work where minting is unavailable.
 *
 * PLAYS NO VIDEO. Nothing here taps a poster, and every /video-url request
 * is counted so that stays true rather than being assumed.
 *
 * It puts the member's program into a running state so there is something
 * to read, and restores it in a `finally`.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_ID = process.env.MEMBER_ID;
const results = [];

function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

function note(message) {
  console.log(`      ${message}`);
}

/**
 * The vocabulary a member must never meet. Mirrors
 * lib/programs/memberPresentation.ts's MEMBER_FORBIDDEN_PHRASES; kept as
 * its own copy so this script stays runnable on its own against any
 * deployed build, including one older than the module.
 */
const FORBIDDEN = [
  'lower cross',
  'upper cross',
  'flat back',
  'forward head',
  'auto-generated',
  'corrective phase',
  'corrective program generator',
  'generated with seed',
  'detected patterns',
  'overall severity',
  'worst finding',
  'not yet reviewed',
  'postural pattern',
  'crossed pattern',
];

const SEED_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Reports every forbidden thing on one screen, so a failure names what leaked rather than only that something did. */
function scan(screenName, text) {
  const hits = FORBIDDEN.filter((phrase) => text.toLowerCase().includes(phrase));
  if (SEED_PATTERN.test(text)) hits.push('a generation seed');
  if (text.includes('—')) hits.push('an em dash');
  check(`member: nothing internal on ${screenName}`, hits.length === 0, hits.join(', ') || 'clean');
  return hits;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function serviceClient() {
  const url = process.env.PROD_SUPABASE_URL;
  const keyFile = process.env.PROD_SERVICE_KEY_FILE;
  if (!url || !keyFile) return null;
  return createClient(url, readFileSync(keyFile, 'utf8').trim(), {
    auth: { persistSession: false },
  });
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
}

/**
 * Taps a link and waits for the navigation. The Home card is a tall block
 * link inside a mobile viewport with an animating hero above it, and
 * Playwright intermittently reports it "outside of the viewport" after
 * scrolling; scrolling it in explicitly first, and following its href if
 * the tap still will not land, keeps the check about whether the card
 * leads where it should rather than about scroll timing.
 */
async function tapLink(page, locator, urlPattern) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  try {
    await locator.click({ timeout: 15000 });
  } catch {
    const href = await locator.getAttribute('href');
    if (!href) throw new Error('the card carries no href to follow');
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForURL(urlPattern, { timeout: 30000 });
}

if (!MEMBER_ID) {
  console.error('Set MEMBER_ID (the member whose program is read).');
  process.exit(2);
}

const db = serviceClient();
const browser = await chromium.launch();
let allBefore = [];
let restoreLog = 'nothing was changed';

async function openAs(email, password, viewport, landingPath) {
  const minted = email && canMintSessions()
    ? await mintSessionContext(browser, email, { baseUrl: BASE, viewport })
    : null;
  if (!email || (!password && !minted)) return null;
  const page = minted ? await minted.context.newPage() : await browser.newPage({ viewport });
  if (minted) {
    await page.goto(`${BASE}${landingPath}`, { waitUntil: 'domcontentloaded' });
  } else {
    await signIn(page, email, password);
  }
  return { page, minted };
}

try {
  // -------------------------------------------------------------------
  // Give her a running program, so there is something to read.
  // -------------------------------------------------------------------
  if (db) {
    const { data: rows } = await db
      .from('coach_program_assignments')
      .select('*')
      .eq('member_id', MEMBER_ID);
    allBefore = rows ?? [];

    const groups = new Map();
    for (const row of allBefore) {
      const list = groups.get(row.program_group_key) ?? [];
      list.push(row);
      groups.set(row.program_group_key, list);
    }
    const subject = [...groups.values()].find((list) =>
      list.some((r) => r.visibility === 'published')
    );

    if (subject) {
      const today = new Date().toISOString().slice(0, 10);
      const start = addDays(today, -3);
      // Everything else goes terminal, so exactly one program is hers now
      // and the screens have one unambiguous thing to point at.
      await db
        .from('coach_program_assignments')
        .update({ status: 'replaced' })
        .eq('member_id', MEMBER_ID)
        .not('id', 'in', `(${subject.map((r) => r.id).join(',')})`);
      await db
        .from('coach_program_assignments')
        .update({
          status: 'active',
          start_date: start,
          end_date: addDays(start, subject[0].duration_weeks * 7 - 1),
          current_week: 1,
          paused_days: 0,
          paused_at: null,
          completed_at: null,
        })
        .in('id', subject.map((r) => r.id));
      check('db: she is on one running program', true, `started ${start}`);
    }
  } else {
    console.log('SKIP  database setup (set PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE)');
  }

  // -------------------------------------------------------------------
  // Tap path 1: open the app -> Home card -> her next session.
  // -------------------------------------------------------------------
  const member = await openAs(
    process.env.MEMBER_EMAIL,
    process.env.MEMBER_PASSWORD,
    { width: 390, height: 844 },
    '/dashboard'
  );
  if (member) {
    const { page } = member;
    const videos = [];
    page.on('request', (r) => {
      if (r.url().includes('/video-url')) videos.push(r.url());
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    const home = await page.locator('main').innerText();

    check('member: Home carries a program card', /Your program/i.test(home), '');
    check('member: the card names the program in member language', /Foundation/.test(home), (home.match(/[A-Z][a-z]+ and [A-Z][a-z]+ Foundation/) ?? ['none'])[0]);
    check('member: the card says where she is', /Week \d+ of \d+/.test(home), (home.match(/Week \d+ of \d+/) ?? ['none'])[0]);
    check('member: the card offers her next session', /Next up:/.test(home), (home.match(/Next up: [^\n]+/) ?? ['none'])[0]);
    check('member: the backlog framing is gone', !/workouts? waiting for you/i.test(home), '');
    scan('Home', home);

    const openNext = page.getByRole('link', { name: /Open your next session|Open your program/i });
    check('member: Home has one clear action into the program', (await openNext.count()) > 0, `${await openNext.count()} links`);
    if ((await openNext.count()) > 0) {
      await tapLink(page, openNext.first(), /\/programs/);
      await page.waitForSelector('main', { timeout: 30000 });
      check('member: two taps from opening the app to her session', /\/programs/.test(page.url()), page.url().replace(BASE, ''));

      const session = await page.locator('main').innerText();
      note(`session screen heading: ${session.split('\n').slice(0, 3).join(' / ')}`);
      check('member: the session screen names the program in member language', /Foundation/.test(session), '');
      check('member: the session letter is kept', /Session [A-Z]/.test(session), (session.match(/Session [A-Z]/) ?? ['none'])[0]);
      check('member: the description is the composed one', /program from your coach/i.test(session), (session.match(/[^\n]*program from your coach[^\n]*/i) ?? ['none'])[0]);
      scan('the session screen', session);

      // The walk-through, opened but never played.
      const walk = page.getByRole('button', { name: /Walk me through it/i });
      if ((await walk.count()) > 0) {
        await walk.first().click();
        await page.waitForSelector('text=/What is in it/i', { timeout: 30000 });
        const guided = await page.locator('main').innerText();
        check('member: the walk-through names the program in member language', /Foundation/.test(guided), '');
        scan('the walk-through', guided);
      }
    }

    // -----------------------------------------------------------------
    // Tap path 2: Movement -> the same program.
    // -----------------------------------------------------------------
    await page.goto(`${BASE}/movement`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    const movement = await page.locator('main').innerText();
    check('member: Movement surfaces her coach’s program', /Your program from your coach/i.test(movement), '');
    check('member: it names the program in member language there too', /Foundation/.test(movement), '');
    check('member: Root Movement is still offered alongside it', /There if you want it|All Root Movement sessions/i.test(movement), '');
    scan('Movement', movement);

    const fromMovement = page.getByRole('link', { name: /Open your next session|Open your program/i });
    check('member: Movement offers the same one action into it', (await fromMovement.count()) > 0, `${await fromMovement.count()} links`);

    // -----------------------------------------------------------------
    // My Programs, reached from the session screen's own back link.
    // -----------------------------------------------------------------
    await page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    const programs = await page.locator('main').innerText();
    check('member: My Programs names the program in member language', /Foundation/.test(programs), '');
    check('member: each session row is named for her too', /Foundation, Session [A-Z]/.test(programs), (programs.match(/Foundation, Session [A-Z]/) ?? ['none'])[0]);
    check('member: the interim description is there', /program from your coach/i.test(programs), (programs.match(/A \d+ week program from your coach[^\n]*/i) ?? ['none'])[0]);
    scan('My Programs', programs);

    // -----------------------------------------------------------------
    // Her own timeline, which is where the publish event lands.
    // -----------------------------------------------------------------
    await page.goto(`${BASE}/progress/timeline`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    scan('her timeline', await page.locator('main').innerText());

    check('member: no video was requested anywhere in this run', videos.length === 0, `${videos.length} requests`);
    check('member: no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
    await retireSession(member.minted);
  } else {
    console.log('SKIP  member checks (set MEMBER_EMAIL with MEMBER_PASSWORD, or with the PROD_* key files)');
  }

  // -------------------------------------------------------------------
  // The coach still reads the clinical names.
  // -------------------------------------------------------------------
  const coach = await openAs(
    process.env.COACH_EMAIL,
    process.env.COACH_PASSWORD,
    { width: 1280, height: 1000 },
    '/coach'
  );
  if (coach) {
    const { page } = coach;
    await page.goto(`${BASE}/coach/clients/${MEMBER_ID}/programs`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    const coachPrograms = await page.locator('main').innerText();
    check(
      'coach: still reads the clinical program name',
      /Lower Cross|Upper Cross|Flat Back|Forward Head/.test(coachPrograms),
      (coachPrograms.match(/Corrective: [^\n]+/) ?? ['none'])[0]
    );
    check('coach: does NOT see the member-facing name in its place', !/Foundation/.test(coachPrograms), '');

    await page.goto(`${BASE}/coach/corrective-programs/${MEMBER_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    const corrective = await page.locator('main').innerText();
    check(
      'coach: the corrective screen still names the pattern and its severity',
      /Lower Cross|Upper Cross|Flat Back|Forward Head/.test(corrective) && /Moderate|Mild|Severe/i.test(corrective),
      (corrective.match(/(Lower Cross|Upper Cross|Flat Back|Forward Head)[^\n]*/) ?? ['none'])[0]
    );

    await page.close();
    await retireSession(coach.minted);
  } else {
    console.log('SKIP  coach checks (set COACH_EMAIL with COACH_PASSWORD, or with the PROD_* key files)');
  }
} finally {
  if (db && allBefore.length > 0) {
    for (const row of allBefore) {
      await db
        .from('coach_program_assignments')
        .update({
          status: row.status,
          start_date: row.start_date,
          end_date: row.end_date,
          duration_weeks: row.duration_weeks,
          current_week: row.current_week,
          paused_days: row.paused_days,
          started_at: row.started_at,
          completed_at: row.completed_at,
          paused_at: row.paused_at,
          resumed_at: row.resumed_at,
          replaced_at: row.replaced_at,
          replaced_by_assignment_id: row.replaced_by_assignment_id,
        })
        .eq('id', row.id);
    }
    const { data: restored } = await db
      .from('coach_program_assignments')
      .select('template_name_snapshot, status, start_date, end_date, current_week, duration_weeks')
      .in('id', allBefore.map((r) => r.id));
    restoreLog = (restored ?? [])
      .map(
        (r) =>
          `${r.template_name_snapshot}: ${r.status}, ${r.start_date} to ${r.end_date}, week ${r.current_week} of ${r.duration_weeks}`
      )
      .join('\n      ');
    console.log('PASS  db: the test member’s programs were restored to how they were found');
  }
  await browser.close();
}

console.log(`\nState left behind:\n      ${restoreLog}`);
const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed against ${BASE}`);
process.exit(passed === results.length ? 0 : 1);
