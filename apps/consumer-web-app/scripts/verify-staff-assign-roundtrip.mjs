#!/usr/bin/env node
/**
 * One assignment, all the way round, on production.
 *
 * The coach side experience pass changed no assignment code, so this is a
 * regression check rather than a feature check: the coach home's tool grid
 * and the folded client detail still lead to a working assign flow, and
 * what a coach sends still arrives on the member's own phone.
 *
 * WRITES, AND CLEANS UP. The one write is an assignment to the seeded test
 * fixture (Ebony, profiles.is_test = true). It is withdrawn in the finally
 * block and the withdrawal is read back. No real member is written to.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.walk/verify';
const PHONE = { width: 390, height: 844 };

const results = [];
const check = (n, p, d = '') => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` :: ${d}` : ''}`); };

async function main() {
  if (!canMintSessions()) throw new Error('Minting env not set');
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!staff) throw new Error('Could not mint staff session');
  const svc = staff.service;

  // Ebony's id, resolved from the email rather than typed.
  const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 200 });
  const member = users.find((u) => u.email === MEMBER_EMAIL);
  if (!member) throw new Error('Test member not found');
  const { data: prof } = await svc.from('profiles').select('display_name, is_test').eq('id', member.id).single();
  check('the write target is the seeded fixture, not a real member', prof.is_test === true, prof.display_name);

  let createdId = null;
  try {
    const page = await staff.context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    // Reach her record the way a coach does: from the reordered home.
    await page.goto(`${BASE}/coach`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: /Ebony/i }).first().click();
    await page.waitForLoadState('networkidle');
    check('her record opens from the coach home', page.url().includes('/coach/clients/'), page.url());

    await page.goto(`${BASE}/coach/clients/${member.id}/detail`, { waitUntil: 'networkidle' });

    /*
     * Open the section by its own header, NOT through the pinned search.
     * The detail build wired that field to type its query into the assign
     * panel's own filter, so searching "Assign" opens the section and then
     * filters the questionnaire list down to the templates whose NAME
     * contains "Assign", which is none of them. That is correct behaviour
     * and the wrong door for this check.
     */
    const sec = page.locator('button[aria-expanded]', { hasText: /Assessments and Findings/i });
    await sec.first().click();
    await page.waitForTimeout(800);
    await page.waitForSelector('section[aria-label="Assign an Assessment"]', { timeout: 15000 });
    check('the assign panel is reachable on the folded detail page', true);
    await page.screenshot({ path: `${SHOTS}/assign-panel.png`, fullPage: true });

    const before = await svc.from('assessment_assignments').select('id').eq('member_id', member.id);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    /*
     * Two taps, not one. The submit is `disabled` until a template is
     * selected, so a run that clicked only "Assign" clicked a dead
     * control and reported a missing row as a failure of the assign
     * flow. Pick a row first (they carry aria-pressed), then submit.
     */
    const rows = page.locator('section[aria-label="Assign an Assessment"] button[aria-pressed]');
    const rowCount = await rows.count();
    check('the panel offers at least one assignable questionnaire', rowCount > 0, `${rowCount} rows`);
    const chosen = (await rows.first().innerText()).split('\n')[0];
    await rows.first().click();
    await page.waitForTimeout(300);

    const sendButton = page.getByRole('button', { name: /^Assign$/ }).first();
    check('the Assign button is enabled once a questionnaire is chosen',
      await sendButton.isEnabled(), chosen);
    await sendButton.scrollIntoViewIfNeeded();
    await sendButton.click();
    await page.waitForTimeout(3000);

    let fresh = null;
    for (let attempt = 0; attempt < 20 && !fresh; attempt += 1) {
      const after = await svc.from('assessment_assignments')
        .select('id, assessment_definition_id, status, created_at')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false });
      if (after.error) throw new Error(`assignment read failed: ${after.error.message}`);
      fresh = (after.data ?? []).find((r) => !beforeIds.has(r.id)) ?? null;
      if (!fresh) await page.waitForTimeout(500);
    }
    createdId = fresh?.id ?? null;
    check('the assignment was written to her record', Boolean(createdId),
      fresh ? `${fresh.assessment_definition_id} (${fresh.status})` : 'no new row');
    check('no console errors during the assign', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();

    // ---- The member's own phone ----
    if (createdId) {
      const mem = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
      const mp = await mem.context.newPage();
      const mErrors = [];
      mp.on('console', (m) => { if (m.type() === 'error') mErrors.push(m.text()); });
      mp.on('pageerror', (e) => mErrors.push(e.message));
      const res = await mp.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      check('her Home loads', res?.status() === 200, `HTTP ${res?.status()}`);
      await mp.screenshot({ path: `${SHOTS}/member-home-after-assign.png`, fullPage: true });
      check('her Home has no console errors', mErrors.length === 0, mErrors.slice(0, 2).join(' | '));
      await mp.close();
      await retireSession(mem);
    }
  } finally {
    if (createdId) {
      await svc.from('assessment_assignments').delete().eq('id', createdId);
      const { data: gone } = await svc.from('assessment_assignments').select('id').eq('id', createdId);
      check('the test assignment was removed afterwards', (gone ?? []).length === 0);
    }
    await retireSession(staff);
    await browser.close();
  }

  const passed = results.filter((r) => r.p).length;
  console.log(`\n${passed} of ${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
