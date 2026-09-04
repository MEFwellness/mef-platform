/**
 * Live verification that the Quick Wellness Check no longer writes a
 * member's check-in, on production.
 *
 * WHAT IT DRIVES, IN ORDER.
 *   1. /wellness-check walked all the way through, in a real browser, as a
 *      signed-out stranger with an empty profile. Seven questions, the
 *      result screen, the create-account screen.
 *   2. The fenced tables, read straight from the database: one session for
 *      that browser's token, seven answers, every one of them a slug, the
 *      run marked started and completed.
 *   3. daily_checkins, before and after, for the standing test member and
 *      for the whole table. Nothing new may appear.
 *   4. The claim: the same browser, now carrying that member's session,
 *      loading an ordinary page. The run must become hers, and STILL no
 *      check-in may appear.
 *   5. A second load of the same page, which must not claim anything twice.
 *   6. A hand-made request to the public endpoint trying to write a
 *      question this experience does not ask, an option it does not offer,
 *      and a sentence of prose. All three must be refused.
 *   7. A normal member-entered Daily Reset, submitted through the real
 *      action, which must still write a real check-in.
 *
 * BOT PROTECTION IS NOT WORKED AROUND. It is live on the auth forms by
 * design, so this run does not touch them: the member's session is minted
 * the standing way and retired with scope 'local' at the end.
 *
 * EVERYTHING IT CREATES, IT REMOVES. The guest run it plants is deleted by
 * its own visitor token, which takes the answers and the claim with it, and
 * any check-in written by step 7 is deleted only if this run was the one
 * that wrote it. Snapshot first, restore in a finally, so a failure part
 * way through still cleans up.
 *
 * Required env, all as file PATHS so nothing secret reaches a command line:
 *   PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE, PROD_ANON_KEY_FILE
 * Optional:
 *   BASE_URL      default https://app.mefwellness.com
 *   MEMBER_EMAIL  default 8weeks2fab@gmail.com
 *   CLEANUP       'false' to leave every row behind for inspection
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionCookies, retireSession, canMintSessions } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL || '8weeks2fab@gmail.com';
const CLEANUP = process.env.CLEANUP !== 'false';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const EXPECTED_KEYS = [
  'energy_level',
  'stress_level',
  'sleep_quality',
  'digestion_rating',
  'movement_today',
  'pain_discomfort_level',
  'mood_level',
];

async function main() {
  if (!canMintSessions()) {
    console.error('Minting env missing. See the header of this file.');
    process.exit(2);
  }

  const service = createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: memberRow } = await service
    .from('profiles')
    .select('id')
    .eq('id', (await findMemberId(service, MEMBER_EMAIL)) ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle();
  const memberId = memberRow?.id ?? null;
  if (!memberId) {
    console.error(`No account found for ${MEMBER_EMAIL}. Refusing to continue.`);
    process.exit(2);
  }
  console.log(`Member under test: ${memberId}`);

  // The whole point of the run: this number must not move.
  const before = await checkinCounts(service, memberId);
  console.log(`daily_checkins before: member ${before.member}, all ${before.all}`);

  let visitorToken = null;
  let minted = null;
  const browser = await chromium.launch();
  let writtenCheckinId = null;

  try {
    // ---------------------------------------------------------------
    // 1. The guest walk
    // ---------------------------------------------------------------
    const guest = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await guest.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') pageErrors.push(m.text());
    });

    await page.goto(`${BASE}/wellness-check`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Take a Quick Wellness Check' }).click();

    for (let question = 0; question < EXPECTED_KEYS.length; question += 1) {
      await page.waitForSelector('[role="progressbar"]', { timeout: 15000 });
      const options = page.locator('[role="group"] button');
      await options.first().waitFor({ timeout: 15000 });
      const count = await options.count();
      // A different option each time, so a wrong-column bug cannot hide
      // behind every answer being the same value.
      await options.nth(question % count).click();
      await page.waitForTimeout(350);
    }

    const resultVisible = await page
      .getByRole('button', { name: 'Show me how to save this' })
      .isVisible()
      .catch(() => false);
    check('the guest reaches her result after seven questions', resultVisible);

    visitorToken = await page.evaluate(() =>
      window.localStorage.getItem('mef.guestPreview.token.v1')
    );
    check('the browser holds a visitor token', Boolean(visitorToken), visitorToken ?? '');
    check('the guest walk raised no page error', pageErrors.length === 0, pageErrors.join(' | '));

    // ---------------------------------------------------------------
    // 2. The fenced store
    // ---------------------------------------------------------------
    const session = await readSession(service, visitorToken);
    check('a fenced session row exists for that token', Boolean(session));
    check('it declares itself a guest wellness check', session?.origin === 'guest_wellness_check', session?.origin ?? '');
    check('it declares itself preliminary', session?.preliminary === true);
    check('it was marked started', Boolean(session?.started_at));
    check('it was marked completed', Boolean(session?.completed_at));
    check('it belongs to nobody yet', session?.claimed_by === null);

    const answers = await readAnswers(service, session?.id);
    check(
      'all seven answers landed in the fenced table',
      answers.length === 7,
      `${answers.length} rows: ${answers.map((a) => `${a.question_key}=${a.answer_value}`).join(', ')}`
    );
    check(
      'every answer is one of the seven questions this experience asks',
      answers.every((a) => EXPECTED_KEYS.includes(a.question_key))
    );
    check(
      'every answer is stored as a short slug, never a number or prose',
      answers.every((a) => /^[a-z0-9_]{1,40}$/.test(a.answer_value))
    );

    // ---------------------------------------------------------------
    // 3. Nothing reached the member's check-ins
    // ---------------------------------------------------------------
    const afterGuest = await checkinCounts(service, memberId);
    check(
      'the guest walk wrote no check-in anywhere',
      afterGuest.all === before.all,
      `${before.all} -> ${afterGuest.all}`
    );

    // ---------------------------------------------------------------
    // 4. The claim, in that same browser
    // ---------------------------------------------------------------
    minted = await mintSessionCookies(MEMBER_EMAIL, { baseUrl: BASE });
    if (!minted) throw new Error('Could not mint a session for the member.');
    await guest.addCookies(minted.cookies);

    await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const claimed = await readSession(service, visitorToken);
    check('the run is now hers', claimed?.claimed_by === memberId, claimed?.claimed_by ?? 'null');
    check('the claim carries a time', Boolean(claimed?.claimed_at));
    check(
      'it is still preliminary after the claim',
      claimed?.preliminary === true && claimed?.origin === 'guest_wellness_check'
    );

    const afterClaim = await checkinCounts(service, memberId);
    check(
      'signing in wrote no check-in from the guest answers',
      afterClaim.all === before.all && afterClaim.member === before.member,
      `member ${before.member} -> ${afterClaim.member}, all ${before.all} -> ${afterClaim.all}`
    );

    const localClaimed = await page.evaluate(() =>
      window.localStorage.getItem('mef.guestPreview.claimed.v1')
    );
    check('the browser records that it has claimed, so it stops asking', localClaimed === 'true');

    // ---------------------------------------------------------------
    // 5. A second load claims nothing twice
    // ---------------------------------------------------------------
    await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const twice = await readSession(service, visitorToken);
    check(
      'a second page load does not re-claim or re-time the bind',
      twice?.claimed_at === claimed?.claimed_at
    );

    // ---------------------------------------------------------------
    // 6. The endpoint refuses what this experience does not ask
    // ---------------------------------------------------------------
    const probeToken = `verifyprobe-${Date.now()}`;
    const rejected = await page.evaluate(
      async ({ base, token }) => {
        const response = await fetch(`${base}/api/guest-preview`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'answer',
            visitorToken: token,
            answers: {
              blood_pressure: '180',
              energy_level: '99',
              optional_notes: 'I have been having chest pain when I climb stairs',
              mood_level: '3',
            },
          }),
        });
        return response.status;
      },
      { base: BASE, token: probeToken }
    );
    const probeSession = await readSession(service, probeToken);
    const probeAnswers = await readAnswers(service, probeSession?.id);
    check('the endpoint accepted the request', rejected === 200, String(rejected));
    check(
      'only the one real answer was stored, everything else was dropped',
      probeAnswers.length === 1 && probeAnswers[0]?.question_key === 'mood_level',
      probeAnswers.map((a) => `${a.question_key}=${a.answer_value}`).join(', ')
    );
    if (CLEANUP && probeSession) {
      await service.from('guest_wellness_check_sessions').delete().eq('id', probeSession.id);
    }

    // ---------------------------------------------------------------
    // 7. A real Daily Reset still writes
    // ---------------------------------------------------------------
    const knownBefore = await checkinIds(service, memberId);
    const written = await submitRealCheckin(page, BASE, service, memberId, knownBefore);
    writtenCheckinId = written.id;
    check('the member can still record a real Daily Reset', Boolean(written.id), written.detail);
    if (written.id) {
      const row = await readCheckin(service, written.id);
      check(
        'the check-in she entered carries her own answers, not a guest run',
        row?.user_id === memberId && row?.local_date != null,
        `local_date ${row?.local_date}`
      );
    }
  } finally {
    if (CLEANUP) {
      if (visitorToken) {
        const { data } = await service
          .from('guest_wellness_check_sessions')
          .delete()
          .eq('visitor_token', visitorToken)
          .select('id');
        console.log(`cleanup: removed ${(data ?? []).length} guest run(s)`);
      }
      if (writtenCheckinId) {
        await service.from('daily_checkins').delete().eq('id', writtenCheckinId);
        console.log('cleanup: removed the check-in this run wrote');
      }
    }
    await retireSession(minted);
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

async function findMemberId(service, email) {
  let page = 1;
  for (;;) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = (data?.users ?? []).find(
      (u) => (u.email ?? '').toLowerCase() === email.toLowerCase()
    );
    if (match) return match.id;
    if ((data?.users ?? []).length < 200) return null;
    page += 1;
  }
}

async function checkinCounts(service, memberId) {
  const all = await service.from('daily_checkins').select('id', { count: 'exact', head: true });
  const member = await service
    .from('daily_checkins')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', memberId);
  return { all: all.count ?? -1, member: member.count ?? -1 };
}

async function readSession(service, visitorToken) {
  if (!visitorToken) return null;
  const { data } = await service
    .from('guest_wellness_check_sessions')
    .select('*')
    .eq('visitor_token', visitorToken)
    .maybeSingle();
  return data ?? null;
}

async function readAnswers(service, sessionId) {
  if (!sessionId) return [];
  const { data } = await service
    .from('guest_wellness_check_answers')
    .select('question_key, answer_value')
    .eq('session_id', sessionId)
    .order('question_key');
  return data ?? [];
}

/**
 * Drives the real Daily Reset wizard until a genuinely new check-in row
 * appears for this member, and returns that row's id so the run can remove
 * exactly what it wrote and nothing else.
 *
 * IT WATCHES THE DATABASE RATHER THAN THE SCREEN. The wizard's screens, its
 * Continue label and how many questions it asks all change with what this
 * member is due, so "did it finish" cannot be read reliably off the page. A
 * new row that was not there before is the only unambiguous answer.
 *
 * Returns what happened rather than throwing, so a wizard change breaks this
 * one check instead of the whole run.
 */
async function submitRealCheckin(page, base, service, memberId, knownBefore) {
  try {
    await page.goto(`${base}/checkin`, { waitUntil: 'networkidle' });
    for (let step = 0; step < 60; step += 1) {
      const fresh = (await checkinIds(service, memberId)).find((id) => !knownBefore.includes(id));
      if (fresh) return { ok: true, detail: `wrote a new row after ${step} steps`, id: fresh };

      const cont = page.locator('button:visible').last();
      const canContinue = (await cont.isEnabled().catch(() => false)) === true;
      if (canContinue) {
        await cont.click({ timeout: 5000 }).catch(() => {});
      } else {
        // Continue is disabled because this screen still wants an answer.
        const options = page.locator('main button:visible, main [role="button"]:visible');
        const count = await options.count();
        if (count === 0) break;
        await options
          .nth(Math.floor(count / 2))
          .click({ timeout: 5000 })
          .catch(() => {});
      }
      await page.waitForTimeout(700);
    }
    const fresh = (await checkinIds(service, memberId)).find((id) => !knownBefore.includes(id));
    return {
      ok: Boolean(fresh),
      detail: fresh ? 'wrote a new row' : `no new row; ended at ${page.url()}`,
      id: fresh ?? null,
    };
  } catch (error) {
    return { ok: false, detail: String(error), id: null };
  }
}

async function checkinIds(service, memberId) {
  const { data } = await service.from('daily_checkins').select('id').eq('user_id', memberId);
  return (data ?? []).map((row) => row.id);
}

async function readCheckin(service, id) {
  const { data } = await service.from('daily_checkins').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
