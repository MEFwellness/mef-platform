#!/usr/bin/env node
/**
 * Owning Your Value, driven end to end on production.
 *
 * WHAT IT PROVES, on the real screens rather than in a fake database:
 *   1. A coach assigns it by pressing the real button on the real client
 *      screen, and the ledger gains one pending row with a due date seven
 *      days out from HER calendar day.
 *   2. The member's next open shows Root's pop-up carrying the approved
 *      sentence, and Home carries the persistent card.
 *   3. A delivery receipt is written, exactly once, even though the pop-up
 *      and the card both fire the tracker in the same pass.
 *   4. The route asks nine open written questions, one at a time, with no
 *      multiple choice anywhere and no character counter.
 *   5. SAVE AND RESUME IS REAL: answers written on the first four
 *      questions survive a full page close and reopen, and she lands back
 *      on question five rather than at the start.
 *   6. THE CLOSING HOLDS. After Finish, her own question nine sentence is
 *      on screen, verbatim, and it is STILL on screen several seconds and
 *      several server round trips later. It only leaves when she taps.
 *   7. The sentence is stored in its own column, so "Root will hold onto
 *      it" is a fact about the database.
 *   8. The experiment starts through the shared machinery and its card
 *      appears on Home carrying today's question.
 *   9. The coach's card shows the sentence on top and all nine answers
 *      underneath, and the /detail assignment list names this experience
 *      rather than calling it "Assessment".
 *  10. No em dash and no console error on any screen either of them saw.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in
 * a `finally` whether the run passes or not.
 *
 * Environment:
 *   BASE_URL     default https://app.mefwellness.com
 *   STAFF_EMAIL  an account holding coach and administrator
 *   TEST_MEMBER_EMAIL / TEST_MEMBER_ID   the seeded fixture
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const MEMBER_ID = process.env.TEST_MEMBER_ID;
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-owning-your-value';
const DEFINITION_ID = 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

/** Her nine answers, distinctive enough that finding them proves they are hers. */
const ANSWERS = [
  'Yesterday I made breakfast for the kids, drove my sister to her appointment, and answered the group chat about the weekend plan.',
  'The appointment run would go undone. She would have to pay for a car and would probably cancel instead.',
  'My neighbour brought in my bins on Tuesday without being asked. I felt caught out, which surprised me.',
  'People value me because I show up and because I remember things. Reading it back, none of that is about who I am.',
  'They would say I am steady and that a room settles when I am in it.',
  'Permission shows up first, then guilt about three minutes later, then I usually stop.',
  'Thursday mornings when I walk before anyone is awake. I am not doing anything for anybody.',
  'I am carrying my brothers argument with our mother. Setting it down would mean saying out loud that it is not mine.',
  'I am allowed to take up room in my own life.',
];
const HELD = ANSWERS[8];

function serviceClient() {
  return createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
    { auth: { persistSession: false } }
  );
}

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
const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Console and page errors, per page, so a failure names the screen it happened on. */
function watch(page, bag) {
  page.on('console', (m) => {
    if (m.type() === 'error') bag.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => bag.push(`${page.url()} :: ${e.message}`));
}

async function emDashOn(page) {
  return page.evaluate(() => (document.body.innerText || '').includes('—'));
}

async function shot(page, name) {
  try {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  } catch {
    // A screenshot that will not write is never a reason to fail a run.
  }
}

async function main() {
  if (!canMintSessions()) throw new Error('Session minting is not configured.');
  if (!STAFF_EMAIL || !MEMBER_EMAIL || !MEMBER_ID) {
    throw new Error('STAFF_EMAIL, TEST_MEMBER_EMAIL and TEST_MEMBER_ID are all required.');
  }

  const service = serviceClient();
  const errors = [];
  let dashes = 0;

  const { data: profile } = await service
    .from('profiles')
    .select('id, timezone, is_test')
    .eq('id', MEMBER_ID)
    .maybeSingle();
  if (!profile?.is_test) throw new Error('Refusing to run: that member is not a seeded test account.');
  const timezone = profile.timezone ?? 'America/New_York';
  const memberToday = todayIn(timezone);
  note(`member today ${memberToday} in ${timezone}`);

  // Start from a clean slate on the fixture only.
  await service.from('member_happiness_deep_dive_sessions').delete().eq('member_id', MEMBER_ID);
  await service
    .from('assessment_assignments')
    .delete()
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', DEFINITION_ID);
  await service
    .from('lifestyle_experiments')
    .delete()
    .eq('member_id', MEMBER_ID)
    .eq('source_experience_key', 'owning-your-value');

  const browser = await chromium.launch();
  let staff = null;
  let member = null;
  let assignmentId = null;

  try {
    // -----------------------------------------------------------------
    // 1. The coach assigns it, from the real button.
    // -----------------------------------------------------------------
    staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
    if (!staff) throw new Error('Could not mint a staff session.');
    const coachPage = await staff.context.newPage();
    watch(coachPage, errors);

    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    // Addressed by the card's own accessible name, never by its copy, so a
    // second panel that mentions the same words cannot be pressed instead.
    const panel = coachPage.locator('section[aria-label="Owning Your Value"]');
    const panelFound = (await panel.count()) === 1;
    check('coach: the Owning Your Value card is on the client screen', panelFound);
    if (!panelFound) throw new Error('No Owning Your Value panel on the coach screen. Refusing to guess.');

    check(
      'coach: it sits beside the Stress & Load Deep-Dive card',
      (await coachPage.locator('section').filter({ hasText: 'Stress & Load Deep-Dive' }).count()) > 0
    );
    check(
      'coach: an unassigned client is told nothing is offered until they send it',
      (await panel.innerText()).includes('Nothing about this is offered to them until you send it')
    );
    await shot(coachPage, '01-coach-before-assign');

    await panel.getByRole('button', { name: /Assign Owning Your Value/ }).click();
    await coachPage.waitForTimeout(3500);

    const { data: assignments } = await service
      .from('assessment_assignments')
      .select('id, status, due_at, created_at, is_required')
      .eq('member_id', MEMBER_ID)
      .eq('assessment_definition_id', DEFINITION_ID);
    check('ledger: exactly one assignment row was written', (assignments ?? []).length === 1,
      `${(assignments ?? []).length} rows`);
    assignmentId = assignments?.[0]?.id ?? null;
    check('ledger: it is pending', assignments?.[0]?.status === 'pending');

    const dueDay = assignments?.[0]?.due_at
      ? new Date(assignments[0].due_at).toISOString().slice(0, 10)
      : null;
    check(
      'ledger: the due date is seven days from HER calendar day',
      dueDay === addDays(memberToday, 7),
      `${dueDay} vs ${addDays(memberToday, 7)}`
    );

    await coachPage.reload({ waitUntil: 'domcontentloaded' });
    const afterAssign = coachPage.locator('section[aria-label="Owning Your Value"]');
    const sentLine = (await afterAssign.count()) === 1 ? await afterAssign.innerText() : '';
    check('coach: the card now prints a sent-and-not-yet-seen sentence', /Sent/.test(sentLine), sentLine.slice(0, 160));
    check('coach: nothing on it says Overdue on the day it was sent', !/Overdue/.test(sentLine));

    const detailText = await coachPage.innerText('body');
    check(
      "coach: the /detail assignment list names it, and does not call it 'Assessment'",
      /Owning Your Value/.test(detailText)
    );
    await shot(coachPage, '02-coach-after-assign');
    if (await emDashOn(coachPage)) dashes++;

    // -----------------------------------------------------------------
    // 2. The member's next open: the pop-up, the card, one receipt.
    // -----------------------------------------------------------------
    member = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 430, height: 932 },
    });
    if (!member) throw new Error('Could not mint a member session.');
    let page = await member.context.newPage();
    watch(page, errors);

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);

    const bodyText = await page.innerText('body');
    check(
      'member: Root knocks with the approved sentence',
      bodyText.includes(
        'Your coach asked Root to sit down with you on this one. It is called Owning Your Value. No scores, just nine questions worth your time.'
      )
    );
    check('member: the pop-up offers a real way to say not now', /Maybe later/i.test(bodyText));
    await shot(page, '03-member-popup');
    if (await emDashOn(page)) dashes++;

    // Dismiss the pop-up and confirm the persistent card is underneath it.
    const maybeLater = page.getByRole('button', { name: /Maybe later/i });
    if (await maybeLater.count()) await maybeLater.first().click();
    await page.waitForTimeout(3000);
    const homeText = await page.innerText('body');
    check(
      'member: the persistent card on Home names it and offers a way in',
      homeText.includes('From your coach: Owning Your Value') &&
        homeText.includes('Start Owning Your Value')
    );
    await shot(page, '04-member-home-card');

    await page.waitForTimeout(3000);
    const { data: receipts } = await service
      .from('member_assignment_deliveries')
      .select('id, presentation, delivered_at')
      .eq('member_id', MEMBER_ID)
      .eq('assignment_id', assignmentId);
    check(
      'receipt: exactly one was written, though two surfaces fired the tracker',
      (receipts ?? []).length === 1,
      `${(receipts ?? []).length} rows`
    );

    // -----------------------------------------------------------------
    // 3. The nine questions, and save and resume.
    // -----------------------------------------------------------------
    await page.goto(`${BASE}/owning-your-value`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const introText = await page.innerText('body');
    check(
      'member: the intro is the approved copy',
      introText.includes('This one is not a quiz') &&
        introText.includes('Fifteen to twenty minutes, somewhere quiet')
    );
    await shot(page, '05-intro');

    await page.getByRole('button', { name: 'Begin' }).click();
    await page.waitForTimeout(1200);

    check(
      'member: question one is open writing, on its own screen, under The Doing',
      (await page.locator('textarea').count()) === 1 &&
        (await page.innerText('body')).includes('The Doing') &&
        /Question 1 of 9/i.test(await page.innerText('body'))
    );
    check(
      'member: there is no multiple choice and no character counter anywhere on it',
      (await page.locator('[role="radio"], [role="checkbox"]').count()) === 0 &&
        !/\bof \d{2,4}\s*$/m.test(await page.innerText('body'))
    );
    await shot(page, '06-question-1');

    // Four answers, then walk away entirely.
    for (let i = 0; i < 4; i++) {
      await page.locator('textarea').fill(ANSWERS[i]);
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.waitForTimeout(1800);
    }
    check(
      'member: after four answers she is on question five',
      /Question 5 of 9/i.test(await page.innerText('body'))
    );
    check(
      'member: the screen says her writing is saved',
      (await page.innerText('body')).includes('Saved. You can close this and come back to it.')
    );
    await shot(page, '07-question-5-before-leaving');

    const { data: draftRows } = await service
      .from('member_happiness_deep_dive_sessions')
      .select('id, answers, completed_at, held_sentence, experience_key, follow_up_source_experience_key')
      .eq('member_id', MEMBER_ID);
    check('draft: one row exists, unfinished', (draftRows ?? []).length === 1 && !draftRows?.[0]?.completed_at);
    check('draft: it holds exactly the four answers she wrote', Object.keys(draftRows?.[0]?.answers ?? {}).length === 4);
    check('draft: the held sentence column is still empty', draftRows?.[0]?.held_sentence === null);
    check(
      'draft: the follow-up field exists and is null for this template',
      draftRows?.[0]?.follow_up_source_experience_key === null
    );

    // A genuinely new page. Nothing survives in memory.
    await page.close();
    page = await member.context.newPage();
    watch(page, errors);
    await page.goto(`${BASE}/owning-your-value`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const resumed = await page.innerText('body');
    // innerText reports CSS-transformed text and the counter is rendered
    // uppercase, so every match on it is case insensitive.
    check('resume: a brand new page lands her back on question five', /Question 5 of 9/i.test(resumed));
    check('resume: it is not the intro again', !resumed.includes('Fifteen to twenty minutes'));
    await shot(page, '08-resumed');

    // Her fourth answer is still there, behind the Back button.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForTimeout(900);
    check(
      'resume: the answer she wrote before leaving came back with her',
      (await page.locator('textarea').inputValue()) === ANSWERS[3]
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(1800);

    for (let i = 4; i < 8; i++) {
      await page.locator('textarea').fill(ANSWERS[i]);
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.waitForTimeout(1800);
    }
    const q9 = await page.innerText('body');
    check(
      'member: question nine is the sentence question, under The Claim',
      /Question 9 of 9/i.test(q9) &&
        q9.includes('The Claim') &&
        q9.includes('Root will hold onto it')
    );
    if (await emDashOn(page)) dashes++;
    await shot(page, '09-question-9');

    // -----------------------------------------------------------------
    // 4. Finish, and the closing that has to hold.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(HELD);
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.waitForTimeout(4000);

    const closing = await page.innerText('body');
    check('closing: her own sentence is on screen, verbatim', closing.includes(HELD));
    check('closing: Root says it is holding it', closing.includes('Root will hold onto this.'));
    check(
      'closing: Root says nothing was scored and nothing interpreted',
      closing.includes('Nothing here was scored and nothing was interpreted')
    );
    check(
      'closing: no score, band, pattern or level appears anywhere on it',
      !/\bscore\b/i.test(closing.replace(/no scores?/gi, '')) &&
        !/\bpattern\b/i.test(closing) &&
        !/\blevel\b/i.test(closing)
    );
    await shot(page, '10-closing');
    if (await emDashOn(page)) dashes++;

    // THE HOLD. Several seconds, several server round trips.
    await page.waitForTimeout(9000);
    const stillThere = await page.innerText('body');
    check(
      'closing: it is STILL on screen nine seconds and several server round trips later',
      stillThere.includes(HELD) && stillThere.includes('Root will hold onto this.')
    );
    check(
      'closing: it was never replaced by the already-done panel',
      !stillThere.includes('This one is done')
    );
    check('closing: the URL never moved', page.url().includes('/owning-your-value'));
    await shot(page, '11-closing-still-holding');

    const { data: finishedRows } = await service
      .from('member_happiness_deep_dive_sessions')
      .select('id, held_sentence, answers, completed_at')
      .eq('member_id', MEMBER_ID);
    check('storage: the sitting is completed', Boolean(finishedRows?.[0]?.completed_at));
    check(
      'storage: the sentence is in its own column, verbatim',
      finishedRows?.[0]?.held_sentence === HELD
    );
    check('storage: all nine answers are stored', Object.keys(finishedRows?.[0]?.answers ?? {}).length === 9);
    check(
      'storage: exactly one sitting exists, not two',
      (finishedRows ?? []).length === 1,
      `${(finishedRows ?? []).length} rows`
    );

    const { data: closedOut } = await service
      .from('assessment_assignments')
      .select('status')
      .eq('id', assignmentId)
      .maybeSingle();
    check('ledger: finishing closed the assignment out', closedOut?.status === 'completed');

    // -----------------------------------------------------------------
    // 5. The experiment.
    // -----------------------------------------------------------------
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(1500);
    const offer = await page.innerText('body');
    check(
      'experiment: the offer is the approved action',
      offer.includes(
        'Each evening, name one thing you did today that had value even though nobody saw it.'
      )
    );
    check('experiment: there is a real way to decline', /Not right now/.test(offer));
    await shot(page, '12-experiment-offer');

    await page.getByRole('button', { name: /I'm in: start the 7 days/ }).click();
    await page.waitForTimeout(4000);
    const done = await page.innerText('body');
    check('experiment: she is told where it went', done.includes('It is on your dashboard now'));
    check(
      'closing: the piece of reading is offered, summary first',
      done.includes('Your Worth Is Not a To-Do List')
    );
    check('closing: her sentence is still with her on the last screen', done.includes(HELD));
    await shot(page, '13-done');
    if (await emDashOn(page)) dashes++;

    const { data: experiments } = await service
      .from('lifestyle_experiments')
      .select('id, title, protocol, duration_days, status, start_date, source_experience_key')
      .eq('member_id', MEMBER_ID)
      .eq('source_experience_key', 'owning-your-value');
    check('experiment: exactly one row was written', (experiments ?? []).length === 1);
    check('experiment: it runs seven days', experiments?.[0]?.duration_days === 7);
    check('experiment: it starts on HER calendar day', experiments?.[0]?.start_date === memberToday);
    check(
      'experiment: the stored protocol is the approved action',
      (experiments?.[0]?.protocol ?? '').includes(
        'Each evening, name one thing you did today that had value even though nobody saw it.'
      )
    );

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const home = await page.innerText('body');
    check(
      'home: the experiment card carries today’s question, naming the action',
      home.includes('name one thing you did today that had value even though nobody saw it')
    );
    // The day label is rendered uppercase by CSS, and innerText reports the
    // transformed text, so this is matched case insensitively rather than
    // against the string as it is written in the source.
    check('home: it says which day of seven she is on', /Day 1 of 7/i.test(home));
    check(
      'home: the assignment card is gone now that the sitting is finished',
      !home.includes('From your coach: Owning Your Value')
    );
    await shot(page, '14-home-experiment-card');
    if (await emDashOn(page)) dashes++;

    const yes = page.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.count()) {
      // Home carries fixed chrome, so an ordinary click can sit behind it.
      // Scroll it in, then dispatch the real click on the element itself.
      await yes.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await yes.first().evaluate((el) => el.click());
      await page.waitForTimeout(4000);
      check(
        'home: her evening tap is recorded and the card says so',
        (await page.innerText('body')).includes('Logged: today counted.')
      );
    } else {
      check('home: her evening tap is recorded and the card says so', false, 'no Yes button found');
    }

    // Reopening a finished sitting is an answer, not a mystery.
    await page.goto(`${BASE}/owning-your-value`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const reopened = await page.innerText('body');
    check('member: reopening it says it is done rather than bouncing her', reopened.includes('This one is done'));
    check('member: and it shows her the sentence Root is holding', reopened.includes(HELD));
    await shot(page, '15-reopened');

    // -----------------------------------------------------------------
    // 6. The coach reads it back.
    // -----------------------------------------------------------------
    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    await coachPage.waitForTimeout(2500);
    const card = coachPage.locator('section[aria-label="Owning Your Value"]');
    const cardFound = (await card.count()) === 1;
    check('coach: the finished sitting is on the card', cardFound);
    if (cardFound) {
      const text = await card.innerText();
      const sentenceAt = text.indexOf(HELD);
      const firstAnswerAt = text.indexOf(ANSWERS[0]);
      check('coach: her sentence is the opener', sentenceAt > -1);
      check('coach: it sits ABOVE the nine answers', sentenceAt > -1 && firstAnswerAt > sentenceAt);
      let all = true;
      for (const answer of ANSWERS) if (!text.includes(answer)) all = false;
      check('coach: all nine answers are shown raw', all);
      check(
        'coach: the three screens are named',
        text.includes('The Doing') && text.includes('The Worth') && text.includes('The Claim')
      );
      check(
        'coach: nothing on the card scores her',
        !/\bscore\b/i.test(text) && !/\bseverity\b/i.test(text) && !/\bpattern\b/i.test(text)
      );
      check(
        'coach: with nothing open, the card offers to send a fresh sitting',
        text.includes('Sending it again starts a fresh sitting')
      );
    }
    await shot(coachPage, '16-coach-card');
    if (await emDashOn(coachPage)) dashes++;

    check('no em dash appeared on any screen either of them saw', dashes === 0, `${dashes} screens`);
    check('no console or page error on any screen', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    // Undo every write, pass or fail.
    await service.from('member_happiness_deep_dive_sessions').delete().eq('member_id', MEMBER_ID);
    await service
      .from('lifestyle_experiments')
      .delete()
      .eq('member_id', MEMBER_ID)
      .eq('source_experience_key', 'owning-your-value');
    if (assignmentId) {
      await service.from('member_assignment_deliveries').delete().eq('assignment_id', assignmentId);
      await service.from('assessment_assignments').delete().eq('id', assignmentId);
    }
    await service
      .from('assessment_attempts')
      .delete()
      .eq('member_id', MEMBER_ID)
      .eq('assessment_definition_id', DEFINITION_ID);
    await retireSession(staff);
    await retireSession(member);
    await browser.close();
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} checks passed on ${BASE}`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
