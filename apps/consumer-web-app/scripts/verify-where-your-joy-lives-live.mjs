#!/usr/bin/env node
/**
 * Where Your Joy Lives, driven end to end on production.
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
 *   6. THE CLOSING HOLDS, and it carries the right two answers. Her
 *      question four answer and her question six answer are both on screen
 *      verbatim under the one fixed line, and they are STILL there several
 *      seconds and several server round trips later. It only leaves when
 *      she taps.
 *   7. Question eight is stored in its own column, so a later feature can
 *      read the twenty minute thing rather than digging in a blob.
 *   8. The experiment starts through the shared machinery and its card
 *      appears on Home carrying the approved daily question.
 *   9. The coach's card shows question seven on top and all nine answers
 *      underneath, and the /detail assignment list names this experience
 *      rather than calling it "Assessment".
 *  10. MIGRATION 212 DID NOT BREAK THE TEMPLATE BESIDE IT. That migration
 *      rewrote a policy Owning Your Value depends on, so this run checks
 *      that its card is still standing on the same coach screen.
 *  11. No em dash and no console error on any screen either of them saw.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in
 * a `finally` whether the run passes or not. Every delete is scoped by
 * experience_key, because two templates now share one table and this run
 * must never remove a sitting it did not create.
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
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-where-your-joy-lives';
const DEFINITION_ID = 'b3e9c85a-47d1-4f26-9c0b-1a5e8d37f402';
const EXPERIENCE_KEY = 'where-your-joy-lives';
const LABEL = 'Where Your Joy Lives';
const TABLE = 'member_happiness_deep_dive_sessions';

const CLOSING_LINE = 'One of these empties slower. One of these fills. You wrote both.';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

/** Her nine answers, distinctive enough that finding them proves they are hers. */
const ANSWERS = [
  'Two Saturdays ago in my sisters kitchen, everybody talking over each other, and I was not managing any of it.',
  'I used to paint badly on Sunday afternoons with the radio on. That version of me was slower and much less careful.',
  'My oldest friend Nadia. She has known me long enough that I do not have to be the competent one.',
  'I reach for my phone and then the second episode. Afterwards I feel less empty, but nothing has actually been added.',
  'Swimming. Getting into the car for it feels enormous and I have never once regretted having gone.',
  'Thursday evenings when I am cooking something complicated with nobody waiting for it.',
  'I would drive to the coast on my own and walk until it got dark, with no plan to be anywhere after.',
  'Twenty minutes of painting badly at the kitchen table before anybody else is up.',
  'It says that is a lot of setting up for something you will only half finish, and that somebody needs you.',
];
/** The two the closing screen places side by side: question four and question six. */
const REACH_FOR = ANSWERS[3];
const TIME_FASTEST = ANSWERS[5];
/** The one stored in its own column: question eight. */
const TWENTY_MINUTE = ANSWERS[7];
/** The one the coach's card opens with: question seven. */
const OPENER = ANSWERS[6];

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

/** Removes only this template's rows. Two templates share this table. */
async function clearFixture(service) {
  await service.from(TABLE).delete().eq('member_id', MEMBER_ID).eq('experience_key', EXPERIENCE_KEY);
  await service
    .from('lifestyle_experiments')
    .delete()
    .eq('member_id', MEMBER_ID)
    .eq('source_experience_key', EXPERIENCE_KEY);
  await service
    .from('assessment_assignments')
    .delete()
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', DEFINITION_ID);
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', DEFINITION_ID);
  // The run taps "Maybe later" on the pop-up, which writes a dismissal row
  // keyed to the assignment. Deleting the assignment does not take it with
  // it, so it is removed here by its own key prefix. Found by checking
  // production after the first clean run rather than by reading the code.
  await service
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER_ID)
    .like('message_key', `${EXPERIENCE_KEY.replace(/-/g, '_')}:%`);
}

/**
 * Opens the "Assessments and Findings" fold on the coach's client screen.
 *
 * The six sections on that page are collapsed on arrival and a folded
 * section renders NOTHING into the document (see DetailSection.tsx), so
 * every card inside it is genuinely absent until a coach presses the
 * header. A run that looked for the panel without pressing it would report
 * a missing card that is not missing. Found while building template 3, on
 * a run whose very first check failed for this reason.
 *
 * Idempotent: it presses only when the header says it is closed, and it
 * waits for the panel itself rather than for a fixed number of
 * milliseconds.
 */
async function openAssessmentsFold(page, label) {
  const header = page.locator('section#detail-section-assessments button[aria-expanded]').first();
  await header.waitFor({ state: 'visible', timeout: 20000 });
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click();
  }
  await page
    .locator(`section[aria-label="${label}"]`)
    .waitFor({ state: 'attached', timeout: 20000 })
    .catch(() => {
      // The caller checks and reports. This only stops the run from
      // racing a fold that is still mounting its children.
    });
  await page.waitForTimeout(800);
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
  if (!profile?.is_test) {
    throw new Error('Refusing to run: that member is not a seeded test account.');
  }
  const timezone = profile.timezone ?? 'America/New_York';
  const memberToday = todayIn(timezone);
  note(`member today ${memberToday} in ${timezone}`);

  // How many Owning Your Value rows exist before this run, so the
  // regression check at the end can prove this run touched none of them.
  const { count: oyvBefore } = await service
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID)
    .eq('experience_key', 'owning-your-value');

  await clearFixture(service);

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
    await coachPage.waitForTimeout(2500);
    await openAssessmentsFold(coachPage, LABEL);

    // Addressed by the card's own accessible name, never by its copy, so a
    // second panel that mentions the same words cannot be pressed instead.
    const panel = coachPage.locator(`section[aria-label="${LABEL}"]`);
    const panelFound = (await panel.count()) === 1;
    check('coach: the Where Your Joy Lives card is on the client screen', panelFound);
    if (!panelFound) throw new Error('No Where Your Joy Lives panel on the coach screen. Refusing to guess.');

    // MIGRATION 212 REGRESSION GUARD. That migration dropped and recreated
    // a policy the template beside this one depends on. If its card is
    // gone, something below it broke.
    check(
      'coach: the Owning Your Value card is STILL standing beside it after migration 212',
      (await coachPage.locator('section[aria-label="Owning Your Value"]').count()) === 1
    );

    check(
      'coach: an unassigned client is told nothing is offered until they send it',
      (await panel.innerText()).includes('Nothing about this is offered to them until you send it')
    );
    await shot(coachPage, '01-coach-before-assign');

    await panel.getByRole('button', { name: new RegExp(`Assign ${LABEL}`) }).click();
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
    await coachPage.waitForTimeout(2500);
    await openAssessmentsFold(coachPage, LABEL);
    const afterAssign = coachPage.locator(`section[aria-label="${LABEL}"]`);
    const sentLine = (await afterAssign.count()) === 1 ? await afterAssign.innerText() : '';
    check('coach: the card now prints a sent-and-not-yet-seen sentence', /Sent/.test(sentLine), sentLine.slice(0, 160));
    check('coach: nothing on it says Overdue on the day it was sent', !/Overdue/.test(sentLine));

    const detailText = await coachPage.innerText('body');
    check(
      "coach: the /detail assignment list names it, and does not call it 'Assessment'",
      new RegExp(LABEL).test(detailText)
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
    await page.waitForTimeout(8000);

    const bodyText = await page.innerText('body');
    check(
      'member: Root knocks with the approved sentence',
      bodyText.includes(
        'Your coach asked Root to sit down with you again. This one is called Where Your Joy Lives. Nine questions, no scores, worth your time.'
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
      homeText.includes(`From your coach: ${LABEL}`) && homeText.includes(`Start ${LABEL}`)
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
    await page.goto(`${BASE}/${EXPERIENCE_KEY}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const introText = await page.innerText('body');
    check(
      'member: the intro is the approved copy',
      introText.includes('No scores and no right answers here either') &&
        introText.includes('Most people have not been asked these in years') &&
        introText.includes('Fifteen to twenty minutes, somewhere quiet')
    );
    await shot(page, '05-intro');

    await page.getByRole('button', { name: 'Begin' }).click();
    await page.waitForTimeout(1500);

    check(
      'member: question one is open writing, on its own screen, under Remembering',
      (await page.locator('textarea').count()) === 1 &&
        /Remembering/i.test(await page.innerText('body')) &&
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
      .from(TABLE)
      .select('id, answers, completed_at, twenty_minute_joy, experience_key, follow_up_source_experience_key')
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', EXPERIENCE_KEY);
    check('draft: one row exists, unfinished', (draftRows ?? []).length === 1 && !draftRows?.[0]?.completed_at);
    check('draft: it holds exactly the four answers she wrote', Object.keys(draftRows?.[0]?.answers ?? {}).length === 4);
    check('draft: the twenty minute column is still empty', draftRows?.[0]?.twenty_minute_joy === null);
    check(
      'draft: the follow-up field exists and is null for this template',
      draftRows?.[0]?.follow_up_source_experience_key === null
    );
    check(
      'draft: it is stored under this template, not the one beside it',
      draftRows?.[0]?.experience_key === EXPERIENCE_KEY
    );

    // A genuinely new page. Nothing survives in memory.
    await page.close();
    page = await member.context.newPage();
    watch(page, errors);
    await page.goto(`${BASE}/${EXPERIENCE_KEY}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const resumed = await page.innerText('body');
    // innerText reports CSS-transformed text and the counter is rendered
    // uppercase, so every match on it is case insensitive.
    check('resume: a brand new page lands her back on question five', /Question 5 of 9/i.test(resumed));
    check('resume: it is not the intro again', !resumed.includes('Fifteen to twenty minutes'));
    await shot(page, '08-resumed');

    // Her fourth answer is still there, behind the Back button.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForTimeout(1200);
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
      'member: question nine is the voice question, under Making Room',
      /Question 9 of 9/i.test(q9) &&
        /Making Room/i.test(q9) &&
        q9.includes('Write down what that voice says, word for word')
    );
    if (await emDashOn(page)) dashes++;
    await shot(page, '09-question-9');

    // -----------------------------------------------------------------
    // 4. Finish, and the closing that has to hold.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(ANSWERS[8]);
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.waitForTimeout(4500);

    const closing = await page.innerText('body');
    check('closing: her question four answer is on screen, verbatim', closing.includes(REACH_FOR));
    check('closing: her question six answer is on screen, verbatim', closing.includes(TIME_FASTEST));
    check('closing: the one fixed line is printed exactly as approved', closing.includes(CLOSING_LINE));
    check(
      'closing: each answer is labelled with its own question',
      closing.includes('what do you usually reach for to feel better') &&
        closing.includes('Where in your week does time move fastest')
    );
    check(
      'closing: Root says nothing was scored and nothing interpreted',
      closing.includes('Nothing here was scored') &&
        closing.includes('Not one word of this was interpreted')
    );
    check(
      'closing: Root never says WHICH of the two empties and which fills',
      !/\bthe first one\b/i.test(closing) && !/\bthe second one\b/i.test(closing)
    );
    check(
      'closing: no score, band, pattern or level appears anywhere on it',
      !/\bscore\b/i.test(closing.replace(/no scores?|nothing here was scored/gi, '')) &&
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
      stillThere.includes(REACH_FOR) &&
        stillThere.includes(TIME_FASTEST) &&
        stillThere.includes(CLOSING_LINE)
    );
    check(
      'closing: it was never replaced by the already-done panel',
      !stillThere.includes('This one is done')
    );
    check('closing: the URL never moved', page.url().includes(`/${EXPERIENCE_KEY}`));
    await shot(page, '11-closing-still-holding');

    const { data: finishedRows } = await service
      .from(TABLE)
      .select('id, twenty_minute_joy, answers, completed_at')
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', EXPERIENCE_KEY);
    check('storage: the sitting is completed', Boolean(finishedRows?.[0]?.completed_at));
    check(
      'storage: question eight is in its own column, verbatim',
      finishedRows?.[0]?.twenty_minute_joy === TWENTY_MINUTE
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
    await page.waitForTimeout(1800);
    const offer = await page.innerText('body');
    check(
      'experiment: the offer is the approved action',
      offer.includes(
        'Do your twenty-minute version once this week. Put it in your calendar like an appointment that cannot be moved.'
      )
    );
    check('experiment: there is a real way to decline', /Not right now/.test(offer));
    await shot(page, '12-experiment-offer');

    await page.getByRole('button', { name: /I'm in: start the 7 days/ }).click();
    await page.waitForTimeout(4500);
    const done = await page.innerText('body');
    check('experiment: she is told where it went', done.includes('It is on your dashboard now'));
    check(
      'closing: the piece of reading is offered, summary first',
      done.includes('Relief Is Not Joy')
    );
    check('closing: her two answers are still with her on the last screen', done.includes(REACH_FOR));
    await shot(page, '13-done');
    if (await emDashOn(page)) dashes++;

    const { data: experiments } = await service
      .from('lifestyle_experiments')
      .select('id, title, protocol, duration_days, status, start_date, source_experience_key')
      .eq('member_id', MEMBER_ID)
      .eq('source_experience_key', EXPERIENCE_KEY);
    check('experiment: exactly one row was written', (experiments ?? []).length === 1);
    check('experiment: it runs seven days', experiments?.[0]?.duration_days === 7);
    check('experiment: it starts on HER calendar day', experiments?.[0]?.start_date === memberToday);
    check(
      'experiment: the stored protocol is the approved action',
      (experiments?.[0]?.protocol ?? '').includes(
        'Do your twenty-minute version once this week.'
      )
    );
    check(
      'experiment: the stored protocol never bakes her own answer into it',
      !(experiments?.[0]?.protocol ?? '').includes(TWENTY_MINUTE)
    );

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    const home = await page.innerText('body');
    check(
      'home: the experiment card carries the approved daily question',
      home.includes(
        'Did you protect your twenty minutes today, or did the voice from question nine win?'
      )
    );
    // The day label is rendered uppercase by CSS, and innerText reports the
    // transformed text, so this is matched case insensitively rather than
    // against the string as it is written in the source.
    check('home: it says which day of seven she is on', /Day 1 of 7/i.test(home));
    check(
      'home: the assignment card is gone now that the sitting is finished',
      !home.includes(`From your coach: ${LABEL}`)
    );
    await shot(page, '14-home-experiment-card');
    if (await emDashOn(page)) dashes++;

    const yes = page.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.count()) {
      // Home carries fixed chrome, so an ordinary click can sit behind it.
      // Scroll it in, then dispatch the real click on the element itself.
      await yes.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
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
    await page.goto(`${BASE}/${EXPERIENCE_KEY}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const reopened = await page.innerText('body');
    check('member: reopening it says it is done rather than bouncing her', reopened.includes('This one is done'));
    check('member: and it shows her the two answers again', reopened.includes(REACH_FOR) && reopened.includes(TIME_FASTEST));
    await shot(page, '15-reopened');

    // -----------------------------------------------------------------
    // 6. The coach reads it back.
    // -----------------------------------------------------------------
    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    await coachPage.waitForTimeout(3000);
    await openAssessmentsFold(coachPage, LABEL);
    const card = coachPage.locator(`section[aria-label="${LABEL}"]`);
    const cardFound = (await card.count()) === 1;
    check('coach: the finished sitting is on the card', cardFound);
    if (cardFound) {
      const text = await card.innerText();
      const openerAt = text.indexOf(OPENER);
      const firstAnswerAt = text.indexOf(ANSWERS[0]);
      check('coach: question seven is the opener', openerAt > -1);
      check('coach: it sits ABOVE the nine answers', openerAt > -1 && firstAnswerAt > openerAt);
      // The heading carries an `uppercase` class and innerText reports the
      // CSS-transformed text, so this is matched case insensitively like
      // the question counter and the day label elsewhere in this run.
      check(
        'coach: the opener is labelled as the thing to start the session with',
        /Open the session with this/i.test(text)
      );
      let all = true;
      for (const answer of ANSWERS) if (!text.includes(answer)) all = false;
      check('coach: all nine answers are shown raw', all);
      check(
        'coach: the three screens are named',
        text.includes('Remembering') && text.includes('Noticing') && text.includes('Making Room')
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

    // The template beside it is still readable at the end of the run too.
    check(
      'coach: Owning Your Value is still on the screen after the whole run',
      (await coachPage.locator('section[aria-label="Owning Your Value"]').count()) === 1
    );

    const { count: oyvAfter } = await service
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', 'owning-your-value');
    check(
      'regression: this run touched no Owning Your Value sitting',
      (oyvAfter ?? 0) === (oyvBefore ?? 0),
      `${oyvBefore ?? 0} before, ${oyvAfter ?? 0} after`
    );

    check('no em dash appeared on any screen either of them saw', dashes === 0, `${dashes} screens`);
    check('no console or page error on any screen', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    // Undo every write, pass or fail. Scoped by experience_key throughout.
    await clearFixture(service);
    if (assignmentId) {
      await service.from('member_assignment_deliveries').delete().eq('assignment_id', assignmentId);
      await service.from('assessment_assignments').delete().eq('id', assignmentId);
    }
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
