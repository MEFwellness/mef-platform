#!/usr/bin/env node
/**
 * The assignment delivery receipt and the due date, checked on production.
 *
 * WHAT IT PROVES, in the real app rather than in a fake database:
 *   1. Assigning the Stress & Load Deep-Dive writes a due date seven days
 *      out, counted in the MEMBER's calendar day. This one only means
 *      something live: at the moment of this run the server's UTC day and
 *      her New York day are DIFFERENT days, so a deadline counted in the
 *      wrong zone lands on the wrong date and the check fails.
 *   2. Home really does write a receipt, once, on a real display.
 *   3. A second and third visit write nothing and never move the stamp.
 *   4. The coach screen reads it back as one sentence, and flags overdue
 *      only when the due day is genuinely behind her.
 *   5. Cancelling drops the overdue flag rather than leaving a late row
 *      standing.
 *
 * IT TOUCHES ONE SEEDED TEST ACCOUNT and cleans up after itself. The one
 * assignment it makes is deleted in a `finally` whether the run passes or
 * not, and deleting it cascades the receipt.
 *
 * Environment:
 *   BASE_URL              default https://app.mefwellness.com
 *   MEMBER_EMAIL / MEMBER_ID   the seeded test member
 *   STAFF_EMAIL           an account holding coach and administrator
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_ID = process.env.MEMBER_ID;
const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const STRESS_LOAD_DEFINITION_ID = '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834';

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

/** Her own calendar day, the same way lib/time/localDate.ts resolves it. */
function todayIn(timeZone) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (!canMintSessions()) throw new Error('minting is not configured');
  if (!MEMBER_ID || !MEMBER_EMAIL || !STAFF_EMAIL) throw new Error('member/staff not configured');

  const service = serviceClient();
  const browser = await chromium.launch();
  const sessions = [];
  let assignmentId = null;

  try {
    const { data: profile } = await service
      .from('profiles')
      .select('id, display_name, timezone, is_test')
      .eq('id', MEMBER_ID)
      .maybeSingle();
    if (!profile) throw new Error('the member id does not resolve to a profile');
    check('the fixture really is a seeded test account', profile.is_test === true, String(profile.is_test));
    const zone = profile.timezone ?? 'America/New_York';
    const memberToday = todayIn(zone);
    const serverToday = todayIn('UTC');
    note(`her day is ${memberToday} (${zone}); the server's day is ${serverToday}`);
    check(
      'the two days are different right now, so a zone mistake cannot pass by luck',
      memberToday !== serverToday,
      `${memberToday} vs ${serverToday}`
    );

    // Nothing may be open before we start, or the assign is a no-op.
    const { data: existing } = await service
      .from('assessment_assignments')
      .select('id')
      .eq('member_id', MEMBER_ID)
      .eq('assessment_definition_id', STRESS_LOAD_DEFINITION_ID)
      .eq('status', 'pending');
    check('nothing of this kind is open before the run', (existing ?? []).length === 0);

    // ---- 1. The coach assigns it, on the real screen ----
    const staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
    if (!staff) throw new Error('could not mint a staff session');
    sessions.push(staff);
    const coachPage = await staff.context.newPage();
    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, { waitUntil: 'domcontentloaded' });

    const assignButton = coachPage.getByRole('button', { name: /^Assign Stress & Load Deep-Dive$/ });
    await assignButton.waitFor({ state: 'visible', timeout: 30000 });
    await assignButton.click();
    await coachPage.waitForTimeout(6000);

    const { data: made } = await service
      .from('assessment_assignments')
      .select('id, due_at, status, created_at')
      .eq('member_id', MEMBER_ID)
      .eq('assessment_definition_id', STRESS_LOAD_DEFINITION_ID)
      .eq('status', 'pending')
      .maybeSingle();
    check('the assign button made exactly one open assignment', Boolean(made), made?.id ?? 'none');
    if (!made) throw new Error('nothing was assigned, so the rest cannot be checked');
    assignmentId = made.id;

    const dueDay = made.due_at ? new Date(made.due_at).toISOString().slice(0, 10) : null;
    const expected = addDays(memberToday, 7);
    check('it carries a due date at all', dueDay !== null, String(dueDay));
    check(
      'the due date is seven days from HER day, not the server’s',
      dueDay === expected,
      `${dueDay} expected ${expected}`
    );
    check(
      'counting from the server’s day would have given a different answer',
      addDays(serverToday, 7) !== expected
    );

    // ---- 2. Home writes the receipt, once ----
    const member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE });
    if (!member) throw new Error('could not mint a member session');
    sessions.push(member);
    const memberPage = await member.context.newPage();

    const readReceipts = async () => {
      const { data } = await service
        .from('member_assignment_deliveries')
        .select('assignment_id, delivered_at, presentation')
        .eq('assignment_id', assignmentId);
      return data ?? [];
    };

    check('there is no receipt before she opens anything', (await readReceipts()).length === 0);

    await memberPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await memberPage.waitForTimeout(12000);
    let receipts = await readReceipts();
    check('one visit to Home writes exactly one receipt', receipts.length === 1, JSON.stringify(receipts));
    const firstStamp = receipts[0]?.delivered_at ?? null;
    check(
      'the receipt names a real presentation',
      ['popup', 'home_card'].includes(receipts[0]?.presentation),
      receipts[0]?.presentation ?? 'none'
    );

    await memberPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await memberPage.waitForTimeout(8000);
    await memberPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await memberPage.waitForTimeout(8000);
    receipts = await readReceipts();
    check('two more visits write no second row', receipts.length === 1, String(receipts.length));
    check(
      'and never move the first timestamp',
      receipts[0]?.delivered_at === firstStamp,
      `${receipts[0]?.delivered_at} vs ${firstStamp}`
    );

    // ---- 3. The coach reads it back ----
    const stressPanelText = async () => {
      await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, { waitUntil: 'domcontentloaded' });
      const panel = coachPage.locator('section', { hasText: 'Stress & Load Deep-Dive' }).last();
      await panel.waitFor({ state: 'visible', timeout: 30000 });
      return (await panel.innerText()).replace(/\s+/g, ' ');
    };

    let text = await stressPanelText();
    check('the coach line says it was sent', /Sent [A-Z][a-z]+ \d+\./.test(text), text.slice(0, 200));
    check('and that it has been seen', /Seen [A-Z][a-z]+ \d+, not completed\./.test(text), text.slice(0, 200));
    check('and names the deadline', /Due [A-Z][a-z]+ \d+\./.test(text), text.slice(0, 200));
    check('an on-time assignment is not badged overdue', !/\bOverdue\b/.test(text));

    // ---- 4. Overdue, from a due date genuinely behind her ----
    await service
      .from('assessment_assignments')
      .update({ due_at: `${addDays(memberToday, -3)}T00:00:00.000Z` })
      .eq('id', assignmentId);
    text = await stressPanelText();
    check('a due day three days behind her reads as overdue', /Overdue since [A-Z][a-z]+ \d+ \(3 days\)\./.test(text), text.slice(0, 240));

    // Due TODAY is the boundary, and it is not late.
    await service
      .from('assessment_assignments')
      .update({ due_at: `${memberToday}T00:00:00.000Z` })
      .eq('id', assignmentId);
    text = await stressPanelText();
    check('due today is not late', /Due today/.test(text) && !/Overdue since/.test(text), text.slice(0, 240));

    // ---- 5. Cancelling closes it, and a closed row is never late ----
    await service
      .from('assessment_assignments')
      .update({ due_at: `${addDays(memberToday, -5)}T00:00:00.000Z` })
      .eq('id', assignmentId);
    text = await stressPanelText();
    check('back to overdue before the cancel, so the next check means something', /Overdue since/.test(text));

    await service
      .from('assessment_assignments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', assignmentId);
    text = await stressPanelText();
    check(
      'a cancelled assignment is no longer offered, and is never late',
      !/Overdue/.test(text) && /Assign Stress & Load Deep-Dive/.test(text),
      text.slice(0, 240)
    );

    // The member's own screens stop offering it too.
    await memberPage.goto(`${BASE}/stress-load`, { waitUntil: 'domcontentloaded' });
    await memberPage.waitForTimeout(4000);
    check(
      'her own route no longer opens a cancelled assignment as a new sitting',
      !/Begin/i.test(await memberPage.locator('main').innerText().catch(() => '')),
      memberPage.url()
    );
  } finally {
    if (assignmentId) {
      await serviceClient().from('assessment_assignments').delete().eq('id', assignmentId);
      note(`cleaned up assignment ${assignmentId} (its receipt cascades)`);
    }
    for (const s of sessions) await retireSession(s).catch(() => {});
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
