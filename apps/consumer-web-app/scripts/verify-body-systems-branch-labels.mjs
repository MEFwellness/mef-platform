/**
 * The two Section 11 branch option labels, read off the real screen.
 *
 * WHY A SECOND SCRIPT AND NOT THE FULL WALK. The full walk
 * (verify-body-systems-live.mjs) finishes the survey, writes a completed
 * sitting, an attempt, eleven Root Map rows and a second sitting. All of
 * it is torn down, but none of it is needed to read two labels. This walks
 * only as far as the branch screen, reads it, and abandons the sitting, so
 * the smallest possible amount of state ever exists on production.
 *
 * Same environment variables as the full walk, same discipline: keys
 * arrive as file PATHS, never on a command line.
 *
 *   BODY_SYSTEMS_BASE_URL   the app under test
 *   PROD_SUPABASE_URL       the database behind it
 *   PROD_SERVICE_KEY_FILE   a PATH to the service role key
 *   PROD_ANON_KEY_FILE      a PATH to the anon key
 *   BODY_SYSTEMS_MEMBER_EMAIL   the seeded test account to walk as
 *
 * The member id is resolved FROM that email rather than passed in, and the
 * run refuses to start unless the resolved profile has is_test true.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { readFileSync } from 'node:fs';

const BASE = process.env.BODY_SYSTEMS_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;
const MEMBER_EMAIL = process.env.BODY_SYSTEMS_MEMBER_EMAIL;
const DEFINITION = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';

const EXPECT_A = 'Cycles, hot flashes, and monthly changes';
const EXPECT_B = 'Energy, drive, muscle, and recovery';
const OLD_A = 'The set about cycles, hot flashes and monthly changes';
const OLD_B = 'The set about energy, drive, muscle and recovery';

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exit(1);
}
if (!MEMBER_EMAIL) {
  console.error('Set BODY_SYSTEMS_MEMBER_EMAIL.');
  process.exit(1);
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

/*
  NEVER MINT FOR AN EMAIL THAT IS NOT ALREADY AN ACCOUNT. generateLink
  CREATES the account when the address does not exist, so a typo would mint
  a session for a brand new stranger and walk the survey as them.
*/
const { data: userPage, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw new Error(`could not list users: ${listError.message}`);
const found = userPage.users.find((u) => u.email?.toLowerCase() === MEMBER_EMAIL.toLowerCase());
if (!found) throw new Error(`REFUSING TO RUN: ${MEMBER_EMAIL} is not an existing account`);
const MEMBER = found.id;
console.log(`identity confirmed: ${MEMBER_EMAIL} is ${MEMBER}`);

const { data: targetProfile } = await admin
  .from('profiles')
  .select('is_test, display_name, body_systems_branch')
  .eq('id', MEMBER)
  .maybeSingle();
if (targetProfile?.is_test !== true) {
  throw new Error(`REFUSING TO RUN: ${MEMBER} is not a seeded test account`);
}
console.log(`target is the test account "${targetProfile.display_name}"`);
const BRANCH_BEFORE = targetProfile.body_systems_branch ?? null;
console.log(`her stored branch before this run: ${BRANCH_BEFORE ?? 'null'}`);

// Somebody has to be named as the assigner. Her own coach if she has one,
// otherwise any coach, and never a made up id.
let COACH = null;
const { data: caseRows } = await admin
  .from('coach_client_assignments')
  .select('coach_id')
  .eq('client_id', MEMBER)
  .eq('status', 'active')
  .limit(1);
COACH = caseRows?.[0]?.coach_id ?? null;
if (!COACH) {
  const { data: anyCoach } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'coach')
    .limit(1)
    .maybeSingle();
  COACH = anyCoach?.id ?? null;
}
if (!COACH) throw new Error('REFUSING TO RUN: no coach to name as the assigner');
console.log(`assigner: ${COACH}`);

/** Everything this run creates, removed. Run before the walk and again after it. */
async function clean() {
  await admin.from('member_body_systems_sessions').delete().eq('member_id', MEMBER);
  await admin
    .from('assessment_assignments')
    .delete()
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', DEFINITION);
  await admin
    .from('assessment_attempts')
    .delete()
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', DEFINITION);
  await admin
    .from('registry_entries')
    .delete()
    .eq('member_id', MEMBER)
    .eq('source_feature', 'body_systems_survey_finding');
  // A "Maybe later" tap leaves a dismissal row keyed by a string, not an
  // FK, so deleting the assignment does not take it with it.
  await admin
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER)
    .like('message_key', 'body_systems:%');
  await admin.from('profiles').update({ body_systems_branch: BRANCH_BEFORE }).eq('id', MEMBER);
}

await clean();

const { error: assignError } = await admin.from('assessment_assignments').insert({
  member_id: MEMBER,
  assessment_definition_id: DEFINITION,
  assigned_by: COACH,
  is_required: true,
  stage: 'standard',
  due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z',
});
if (assignError) {
  console.error('could not assign', assignError);
  process.exit(1);
}

async function tap(scope, name, exact = true) {
  const button = scope.getByRole('button', { name, exact });
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await button.click();
    if ((await button.getAttribute('aria-pressed')) === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`tap never registered: ${name}`);
}

async function waitForContinue(page, label, timeoutMs = 40000) {
  const button = page.getByRole('button', { name: label });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await button.isDisabled())) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

const consoleErrors = [];
const browser = await chromium.launch();
const minted = await mintSessionContext(browser, MEMBER_EMAIL, {
  baseUrl: BASE,
  viewport: { width: 390, height: 844 },
});
if (!minted) {
  console.error('could not mint');
  process.exit(1);
}
const page = await minted.context.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const SHOTS = process.env.BODY_SYSTEMS_SHOT_DIR ?? '/tmp';

try {
  await page.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=nothing about it is a test', { timeout: 30000 });
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('text=/section 1 of 11/i', { timeout: 20000 });

  for (;;) {
    const eyebrow = await page.locator('text=/section \\d+ of 11/i').first().innerText();
    const section = Number(eyebrow.match(/(\d+)/)[1]);

    if (section === 11) {
      await page.waitForSelector('text=Which set of questions fits your body?', { timeout: 20000 });
      const branchText = await page.evaluate(() => document.body.innerText);
      check('section 11 opens with the branch question',
        branchText.includes('Which set of questions fits your body?'));

      const labels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button[aria-pressed]')).map((b) =>
          (b.textContent ?? '').trim()
        )
      );
      console.log('branch buttons on screen:', JSON.stringify(labels));

      check(`option A reads "${EXPECT_A}"`, labels.includes(EXPECT_A));
      check(`option B reads "${EXPECT_B}"`, labels.includes(EXPECT_B));
      check('the old option A placeholder is gone', !branchText.includes(OLD_A));
      check('the old option B placeholder is gone', !branchText.includes(OLD_B));
      check('no em dash on the branch screen', !branchText.includes(String.fromCharCode(0x2014)));
      check('no en dash on the branch screen', !branchText.includes(String.fromCharCode(0x2013)));

      await page.screenshot({ path: `${SHOTS}/body-systems-section-11.png` });

      /*
        AND NOW CHOOSE ONE, BECAUSE THE PROFILE CARD DEPENDS ON IT.

        `/profile` renders the "Hormonal Health question set" setting behind
        `{bodySystemsBranch && ...}`, so a member who has never chosen a
        branch has no card there to read. That is right: there is nothing
        for her to change yet. It also means this walk cannot see the second
        screen without making the choice first, so it makes it, and the
        teardown puts her stored branch back exactly where it was.

        The branch buttons UNMOUNT once she has chosen, so the tap is
        confirmed by the hormonal questions arriving rather than by
        aria-pressed.
      */
      for (let attempt = 0; attempt < 25; attempt += 1) {
        await page.getByRole('button', { name: /cycles, hot flashes/i }).click().catch(() => {});
        if (await page.locator('text=My cycle has become irregular').count()) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await page.waitForSelector('text=My cycle has become irregular', { timeout: 20000 });
      check('choosing option A opens the branch it names', true);
      // No break. Section eleven's own questions still have to be answered
      // and Continue pressed, because THAT is what saves, and the save is
      // what puts her branch on her profile. Falling through to the item
      // loop below is how this walk stays a real member's walk.
    }

    const items = await page.locator('ol > li').count();
    for (let i = 0; i < items; i += 1) {
      const item = page.locator('ol > li').nth(i);
      if (section === 3 && i === 1) {
        await tap(item, 'I do not drink');
        continue;
      }
      await tap(item, 'Never');
    }
    if (!(await waitForContinue(page, 'Continue'))) {
      throw new Error(`Continue stayed disabled on section ${section}`);
    }
    await page.getByRole('button', { name: 'Continue' }).click();

    /*
      SECTION ELEVEN'S CONTINUE DOES NOT LEAD TO A SECTION TWELVE.

      It leads to the six red flag questions, so waiting for the next
      eyebrow here would wait forever on a screen that is working. This
      waits for whichever of the two actually arrives.
    */
    if (section === 11) {
      await page.waitForSelector('text=Six last questions', { timeout: 40000 });
      check('section eleven hands over to the red flag questions', true);
      break;
    }
    await page.waitForSelector(`text=/section ${section + 1} of 11/i`, { timeout: 40000 });
  }

  // The same two words on the OTHER screen that reads this copy row. Her
  // branch has to have landed on her profile row before that card renders.
  let storedBranch = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data: row } = await admin
      .from('profiles')
      .select('body_systems_branch')
      .eq('id', MEMBER)
      .maybeSingle();
    storedBranch = row?.body_systems_branch ?? null;
    if (storedBranch) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // Said out loud, because a poll that simply ran out of attempts and a
  // poll that succeeded look identical from the screen that follows.
  check('her tap is remembered on her profile row', storedBranch === 'a', `stored ${storedBranch}`);
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Hormonal Health question set', { timeout: 30000 });
  const profileText = await page.evaluate(() => document.body.innerText);
  check(`profile setting shows "${EXPECT_A}"`, profileText.includes(EXPECT_A));
  check(`profile setting shows "${EXPECT_B}"`, profileText.includes(EXPECT_B));
  check('the old placeholders are gone from the profile setting',
    !profileText.includes(OLD_A) && !profileText.includes(OLD_B));
  await page.screenshot({ path: `${SHOTS}/body-systems-profile-setting.png` });

  check('no console or page errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
  check('the walk reached the end', true);
} catch (walkError) {
  /*
    A THROW MUST BECOME A FAILED CHECK, NOT A SILENT PASS.

    The `finally` below ends in process.exit, and process.exit inside a
    finally DISCARDS the exception on its way out. The first run of this
    script threw on the profile screen, the finally exited zero because no
    check had recorded a failure, and it printed "12 of 12 checks passing"
    for a walk that never finished. A run that did not get to the end has
    to say so in the same tally as everything else.
  */
  check('the walk reached the end', false, String(walkError).slice(0, 300));
  try {
    await page.screenshot({ path: `${SHOTS}/body-systems-where-it-stopped.png` });
    console.log('WHERE IT STOPPED:', page.url());
    console.log(
      (await page.evaluate(() => document.body.innerText)).slice(0, 700).replace(/\n+/g, ' | ')
    );
  } catch {
    console.log('could not photograph where it stopped');
  }
} finally {
  await clean();

  // Teardown confirmed by an INDEPENDENT read, not by the delete returning
  // no error: a delete matching no policy returns zero rows and no error.
  const fresh = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
    auth: { persistSession: false },
  });
  const { count: sittings } = await fresh
    .from('member_body_systems_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER);
  const { count: assignments } = await fresh
    .from('assessment_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', DEFINITION);
  const { count: attempts } = await fresh
    .from('assessment_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', DEFINITION);
  const { count: dismissals } = await fresh
    .from('member_root_popup_dismissals')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER)
    .like('message_key', 'body_systems:%');
  const { data: after } = await fresh
    .from('profiles')
    .select('body_systems_branch')
    .eq('id', MEMBER)
    .maybeSingle();

  check('teardown: no sitting left', sittings === 0, `count ${sittings}`);
  check('teardown: no assignment left', assignments === 0, `count ${assignments}`);
  check('teardown: no attempt left', attempts === 0, `count ${attempts}`);
  check('teardown: no pop-up dismissal left', dismissals === 0, `count ${dismissals}`);
  check(
    'teardown: her stored branch is back where it started',
    (after?.body_systems_branch ?? null) === BRANCH_BEFORE,
    `${after?.body_systems_branch ?? 'null'} (was ${BRANCH_BEFORE ?? 'null'})`
  );

  // And the two copy rows, read straight out of the database.
  const { data: copyRows } = await fresh
    .from('body_systems_copy')
    .select('copy_key, value')
    .in('copy_key', ['member.branch_option_a', 'member.branch_option_b'])
    .order('copy_key');
  console.log('stored copy rows:', JSON.stringify(copyRows));

  await retireSession(minted);
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passing`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  ${f.name} ${f.note}`);
  }
  process.exit(failed.length ? 1 : 0);
}
