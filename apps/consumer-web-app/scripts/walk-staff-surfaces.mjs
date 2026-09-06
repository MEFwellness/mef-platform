#!/usr/bin/env node
/**
 * A working coach's walk through every coach and admin surface, on
 * production, with the scroll cost of each screen measured.
 *
 * This is the instrument for the coach side experience pass. It is not a
 * pass/fail verification: it visits each screen, screenshots it, and
 * records the three numbers that describe "how hard is this to work in" —
 * the full page height on a phone, how many screens of scrolling that is,
 * and how many separate cards are stacked on it. Run it once before the
 * pass and once after, into two different SHOTS_DIRs, and the two
 * manifests are the before/after evidence.
 *
 * It also captures console errors and em dashes, because a walk of every
 * screen is the cheapest place to catch either.
 *
 * Environment:
 *   BASE_URL      default https://app.mefwellness.com
 *   STAFF_EMAIL   the coach/admin account to walk as
 *   CLIENT_ID     a client whose record is opened (optional, discovered)
 *   SHOTS_DIR     where screenshots and manifest.json land
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.walk/before';
const PHONE = { width: 390, height: 844 };
const EM_DASH = '—';

/** Every surface behind the coach or admin role, in the order a coach meets them. */
const SURFACES = [
  ['coach-home',            '/coach'],
  ['coach-assign',          '/coach/assign'],
  ['coach-programs',        '/coach/programs'],
  ['coach-programs-new',    '/coach/programs/new'],
  ['coach-corrective',      '/coach/corrective-programs'],
  ['coach-generate',        '/coach/generate'],
  ['coach-generate-workout','/coach/generate/workout'],
  ['coach-generate-program','/coach/generate/program'],
  ['coach-questions',       '/coach/questions'],
  ['coach-review-queue',    '/coach/review-queue'],
  ['coach-protein-review',  '/coach/protein-review'],
  ['admin-home',            '/admin'],
  ['admin-home-teston',     '/admin?includeTest=1'],
  ['admin-access',          '/admin/access'],
  ['admin-analytics',       '/admin/analytics'],
  ['admin-analytics-funnel','/admin/analytics/funnel'],
  ['admin-analytics-features','/admin/analytics/features'],
  ['admin-analytics-dropoff','/admin/analytics/drop-off'],
  ['admin-analytics-members','/admin/analytics/members'],
  ['admin-analytics-insights','/admin/analytics/insights'],
  ['admin-blueprints',      '/admin/blueprints'],
  ['admin-acquisition',     '/admin/acquisition'],
  ['admin-acquisition-links','/admin/acquisition/links'],
  ['admin-acquisition-patterns','/admin/acquisition/patterns'],
  ['admin-cvs-tools',       '/admin/cvs-test-tools'],
  ['admin-reset-tools',     '/admin/reset-plan-test-tools'],
  ['admin-push-tools',      '/admin/push-test-tools'],
  ['exercises',             '/exercises'],
  ['movement-profile',      '/movement/profile'],
];

/** Per-client screens, appended once a client id is known. */
const CLIENT_SURFACES = (id) => [
  ['client-overview',  `/coach/clients/${id}`],
  ['client-detail',    `/coach/clients/${id}/detail`],
  ['client-entries',   `/coach/clients/${id}/entries`],
  ['client-programs',  `/coach/clients/${id}/programs`],
];

async function main() {
  if (!canMintSessions()) throw new Error('Minting env not set');
  if (!STAFF_EMAIL) throw new Error('STAFF_EMAIL not set');
  mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const minted = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!minted) throw new Error(`Could not mint a session for ${STAFF_EMAIL}`);
  const { context, session, service } = minted;

  // The coach's own caseload decides which client record gets walked, so
  // the run never types an id it guessed.
  let clientId = process.env.CLIENT_ID ?? null;
  if (!clientId) {
    const { data } = await service
      .from('coach_client_assignments')
      .select('client_id')
      .eq('coach_id', session.user.id)
      .eq('status', 'active')
      .limit(1);
    clientId = data?.[0]?.client_id ?? null;
  }

  const all = clientId ? [...SURFACES, ...CLIENT_SURFACES(clientId)] : SURFACES;
  const manifest = [];

  for (const [name, path] of all) {
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    let status = 0;
    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
      status = res?.status() ?? 0;
    } catch (e) {
      errors.push(`goto: ${e.message}`);
    }

    // Let anything that animates in settle before it is measured.
    await page.waitForTimeout(900);

    const metrics = await page.evaluate(() => {
      const body = document.body;
      const main = document.querySelector('main');
      const cardOf = (root) =>
        root ? root.querySelectorAll('[class*="rounded-[28px]"]').length : 0;
      return {
        height: Math.max(body?.scrollHeight ?? 0, document.documentElement.scrollHeight),
        cards: cardOf(main ?? body),
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        hasBack: Boolean(
          Array.from(document.querySelectorAll('a,button')).find((el) =>
            /back|coach dashboard|^admin$/i.test(el.textContent?.trim() ?? '')
          )
        ),
        text: (document.body?.innerText ?? ''),
      };
    }).catch(() => ({ height: 0, cards: 0, h1: null, hasBack: false, text: '' }));

    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});

    const emDash = metrics.text.includes(EM_DASH);
    manifest.push({
      name, path, status,
      height: metrics.height,
      screens: Number((metrics.height / PHONE.height).toFixed(1)),
      cards: metrics.cards,
      h1: metrics.h1,
      hasBack: metrics.hasBack,
      emDash,
      errors,
    });
    console.log(
      `${String(status).padEnd(4)} ${name.padEnd(28)} ${String(metrics.height).padStart(6)}px ` +
      `${String((metrics.height / PHONE.height).toFixed(1)).padStart(5)} screens  ` +
      `cards=${String(metrics.cards).padStart(3)}  back=${metrics.hasBack ? 'y' : 'n'}` +
      `${emDash ? '  EM-DASH' : ''}${errors.length ? `  ERR:${errors.length}` : ''}`
    );
    await page.close();
  }

  writeFileSync(`${SHOTS}/manifest.json`, JSON.stringify({ clientId, manifest }, null, 2));

  const total = manifest.reduce((s, m) => s + m.height, 0);
  console.log(`\nTotal height across ${manifest.length} screens: ${total}px`);
  console.log(`No back control: ${manifest.filter((m) => !m.hasBack).map((m) => m.name).join(', ')}`);
  console.log(`Console errors:  ${manifest.filter((m) => m.errors.length).map((m) => m.name).join(', ') || 'none'}`);
  console.log(`Em dashes:       ${manifest.filter((m) => m.emDash).map((m) => m.name).join(', ') || 'none'}`);

  await retireSession(minted);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
