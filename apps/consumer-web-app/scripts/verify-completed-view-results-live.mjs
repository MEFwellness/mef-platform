#!/usr/bin/env node
/**
 * The "View results" link on the Completed rows, driven on production.
 *
 * WHAT THIS BUILD CHANGED, and therefore what has to be checked on the real
 * site rather than in a test: three Completed rows (the Rooted Reset Health
 * Appraisal Questionnaire, the Rooted Reset Fuel Pattern Assessment and the
 * Health & Lifestyle Intake) each rendered a full results card further down
 * the SAME client Detail page and offered only Assign Again, because their
 * template ids were missing from ASSESSMENT_RESULT_ANCHORS. They now point
 * at the cards that were always there.
 *
 * READ ONLY. This run writes NOTHING. It signs in as the coach through a
 * one-time minted session retired afterwards with scope 'local', opens a
 * client Detail page, presses links that only scroll, and reads the DOM.
 * No assignment is sent, cancelled or altered, so it is safe against a real
 * client's ledger.
 *
 * WHAT IS CHECKED, on a 390px phone:
 *
 *   1. THE HAQ ROW IS IN COMPLETED AND CARRIES "View results", BESIDE its
 *      Assign Again rather than instead of it.
 *   2. PRESSING IT LANDS ON THE HAQ CARD. The owning section opens and
 *      detail-card-health-appraisal is really in the viewport afterwards,
 *      which is the failure a unit test cannot see: a folded section
 *      cannot be scrolled to.
 *   3. THE NEWEST SITTING IS THE TOP ENTRY of that card, and its link
 *      carries that sitting's own id.
 *   4. THE OTHER TWO NEWLY WIRED ROWS land on their own cards, the Intake
 *      across a section boundary into Health Context.
 *   5. THE ROWS WITH NO VIEW ARE UNCHANGED: Four Doctors, Nutrition &
 *      Lifestyle and the Short Health Assessment offer no link.
 *   6. Zero console errors and zero em dashes on every screen visited.
 *   7. THE MEMBER SIDE IS UNTOUCHED: her own questionnaire shelf and her
 *      Health Appraisal results render exactly as before, with no coach
 *      control anywhere on them.
 *
 * Environment:
 *   BASE_URL      default https://app.mefwellness.com
 *   STAFF_EMAIL   the coach to sign in as
 *   CLIENT_ID     optional; discovered from the coach's caseload when absent
 *   MEMBER_EMAIL  optional; the member-side spot check is skipped without it
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/completed-view-results';

const PHONE = { width: 390, height: 844 };
const EM_DASH = '—';

/** The three rows this build wired, and the card each one must land on. */
const WIRED = [
  { row: 'haq', card: 'detail-card-health-appraisal', name: 'Health Appraisal' },
  { row: 'fuel-pattern', card: 'detail-card-fuel-pattern', name: 'Fuel Pattern' },
  {
    row: 'health-lifestyle-intake',
    card: 'detail-card-health-intake',
    name: 'Health & Lifestyle Intake',
  },
];

/** The rows that genuinely have no results card, which must stay as they were. */
const UNWIRED = ['four-doctors', 'chek-hlc1-nutrition-lifestyle', 'short-haq'];

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

function serviceClient() {
  return createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
    { auth: { persistSession: false } }
  );
}

function watch(page, bag) {
  page.on('console', (m) => {
    if (m.type() === 'error') bag.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => bag.push(`${page.url()} :: ${e.message}`));
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
}

/** Opens Assessments and Findings and waits for the status block to really be there. */
async function openAssessments(page, clientId) {
  await page.goto(`${BASE}/coach/clients/${clientId}/detail`, { waitUntil: 'domcontentloaded' });
  const header = page.locator('button[aria-controls="detail-section-assessments-content"]');
  await header.waitFor({ timeout: 45000 });
  // A header that is painted is not a header that is listening: a tap that
  // lands before hydration does nothing and says nothing about it.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await header.click();
    const opened = await page
      .waitForSelector('section[aria-label="Assessment Status"]', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
    if ((await header.getAttribute('aria-expanded')) === 'true') await header.click();
  }
  throw new Error('Assessments and Findings never opened');
}

/** Which group a row sits in, and the labels of the controls on it. */
async function readRow(page, rowId) {
  return page.evaluate((id) => {
    const row = document.querySelector(`[data-assessment-row="${id}"]`);
    if (!row) return null;
    return {
      group: row.closest('[data-assessment-group]')?.getAttribute('data-assessment-group') ?? null,
      buttons: [...row.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()),
      text: (row.innerText ?? '').replace(/\s+/g, ' ').trim(),
    };
  }, rowId);
}

/** Presses the View results control on one row. */
async function pressViewResults(page, rowId) {
  return page.evaluate((id) => {
    const row = document.querySelector(`[data-assessment-row="${id}"]`);
    if (!row) return false;
    const link = [...row.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'View results'
    );
    if (!link) return false;
    link.click();
    return true;
  }, rowId);
}

/** Whether a card is rendered and actually inside the viewport now. */
async function cardInView(page, cardId) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { present: false, inView: false };
    const r = el.getBoundingClientRect();
    return {
      present: true,
      // Any part of it on screen counts: the card is taller than a phone.
      inView: r.top < window.innerHeight && r.bottom > 0,
      top: Math.round(r.top),
    };
  }, cardId);
}

async function main() {
  if (!canMintSessions()) throw new Error('minting env missing');
  if (!STAFF_EMAIL) throw new Error('STAFF_EMAIL is required');
  mkdirSync(SHOTS, { recursive: true });

  const db = serviceClient();

  /*
    WHICH CLIENT TO READ. A client whose ledger actually holds a finished
    Health Appraisal, because a row that has never been completed is not in
    the Completed group at all and would prove nothing either way.
  */
  const { data: defRow, error: defErr } = await db
    .from('unified_assessment_definitions')
    .select('id')
    .eq('key', 'haq')
    .eq('active', true)
    .maybeSingle();
  if (defErr) throw new Error(`reading the haq definition: ${defErr.message}`);
  const haqDefId = defRow?.id ?? null;
  if (!haqDefId) throw new Error('no haq definition in unified_assessment_definitions');

  let clientId = process.env.CLIENT_ID ?? null;
  if (!clientId) {
    // A FINISHED SITTING, not merely a finished assignment: the card is
    // drawn from the sessions table, so that is the row that decides
    // whether there is anything for the link to land on.
    const { data: done, error } = await db
      .from('unified_assessment_sessions')
      .select('member_id, completed_at')
      .eq('assessment_definition_id', haqDefId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(25);
    if (error) throw new Error(`finding a client with a finished HAQ: ${error.message}`);
    clientId = done?.[0]?.member_id ?? null;
    if (!clientId) throw new Error('no client on this project has a finished Health Appraisal');
  }
  note(`client under test: ${clientId}`);

  const browser = await chromium.launch();
  const errors = [];
  let staff = null;
  let member = null;

  try {
    staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE, viewport: PHONE });
    if (!staff) throw new Error(`could not mint a session for ${STAFF_EMAIL}`);
    const page = await staff.context.newPage();
    watch(page, errors);

    await openAssessments(page, clientId);
    await shot(page, '01-assessment-status');

    // 1. The HAQ row, in Completed, offering both controls.
    const haq = await readRow(page, 'haq');
    check('the Health Appraisal row is on the page', Boolean(haq), haq ? haq.group : 'missing');
    if (haq) {
      check('it sits in Completed', haq.group === 'completed', `group=${haq.group}`);
      check(
        'it offers View results',
        haq.buttons.includes('View results'),
        `controls: ${haq.buttons.join(', ')}`
      );
      check(
        'View results sits BESIDE Assign Again, not instead of it',
        haq.buttons.includes('View results') && haq.buttons.includes('Assign Again'),
        `controls: ${haq.buttons.join(', ')}`
      );
    }

    // 2, 4. Each wired row lands on its own card.
    for (const target of WIRED) {
      const row = await readRow(page, target.row);
      if (!row || row.group !== 'completed') {
        note(`${target.name}: not in Completed on this client (group=${row?.group ?? 'absent'}), skipped`);
        continue;
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const pressed = await pressViewResults(page, target.row);
      check(`${target.name}: View results is pressable`, pressed);
      if (!pressed) continue;
      await page.waitForTimeout(1600);
      const card = await cardInView(page, target.card);
      check(
        `${target.name}: lands on ${target.card}`,
        card.present && card.inView,
        `present=${card.present} inView=${card.inView} top=${card.top ?? 'n/a'}`
      );
      await shot(page, `02-landed-${target.row}`);
      await openAssessments(page, clientId);
    }

    // 3. The newest sitting is the top entry of the HAQ card.
    const haqRow = await readRow(page, 'haq');
    if (haqRow?.group === 'completed') {
      await pressViewResults(page, 'haq');
      await page.waitForTimeout(1600);
      const sittings = await page.evaluate(() => {
        const list = document.querySelector('[data-testid="haq-sitting-list"]');
        if (!list) return null;
        return [...list.querySelectorAll('a')].map((a) => ({
          href: a.getAttribute('href'),
          text: (a.innerText ?? '').replace(/\s+/g, ' ').trim(),
        }));
      });
      check('the HAQ card lists its sittings', Array.isArray(sittings) && sittings.length > 0,
        sittings ? `${sittings.length} sitting(s)` : 'list not found');

      if (sittings?.length) {
        const { data: rows } = await db
          .from('unified_assessment_sessions')
          .select('id, completed_at')
          .eq('member_id', clientId)
          .eq('assessment_definition_id', haqDefId)
          .eq('status', 'completed')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(5);
        const newest = rows?.[0]?.id ?? null;
        check(
          'the top entry is the newest sitting the database holds',
          Boolean(newest) && (sittings[0].href ?? '').endsWith(newest),
          `top=${sittings[0].href} newest=${newest}`
        );
        note(`sittings on screen: ${sittings.map((s) => s.text).join(' | ')}`);
      }
      await shot(page, '03-haq-card');
      await openAssessments(page, clientId);
    }

    // 5. The rows with no results view are untouched.
    for (const rowId of UNWIRED) {
      const row = await readRow(page, rowId);
      if (!row) {
        note(`${rowId}: no row on this client, skipped`);
        continue;
      }
      if (row.group !== 'completed') {
        check(
          `${rowId} offers no View results (group ${row.group})`,
          !row.buttons.includes('View results'),
          `controls: ${row.buttons.join(', ')}`
        );
        continue;
      }
      check(
        `${rowId} is Completed and still offers no View results`,
        !row.buttons.includes('View results'),
        `controls: ${row.buttons.join(', ')}`
      );
    }

    // 6. Nothing broken, nothing with an em dash.
    const coachText = await page.evaluate(() => document.body.innerText ?? '');
    check('no em dash on the coach screen', !coachText.includes(EM_DASH));

    // 7. The member side, untouched.
    if (MEMBER_EMAIL) {
      member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
      if (!member) {
        note(`could not mint a member session for ${MEMBER_EMAIL}, member check skipped`);
      } else {
        const mp = await member.context.newPage();
        watch(mp, errors);
        for (const path of ['/questionnaires', '/health-appraisal/results']) {
          await mp.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
          await mp.waitForTimeout(1200);
          const text = await mp.evaluate(() => document.body.innerText ?? '');
          check(`member ${path} renders`, text.trim().length > 0);
          check(
            `member ${path} carries no coach control`,
            !text.includes('View results') &&
              !text.includes('Assign Again') &&
              !text.includes('Assessment Status'),
            'looking for View results / Assign Again / Assessment Status'
          );
          check(`no em dash on member ${path}`, !text.includes(EM_DASH));
          await shot(mp, `04-member-${path.replace(/\W+/g, '-')}`);
        }
      }
    } else {
      note('MEMBER_EMAIL not set, member-side spot check skipped');
    }

    check('zero console and page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    // Retired with scope 'local', never 'global', which would sign the
    // real person out of their own phone.
    if (staff) await retireSession(staff).catch(() => {});
    if (member) await retireSession(member).catch(() => {});
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('RUN FAILED', e.message);
  process.exitCode = 1;
});
