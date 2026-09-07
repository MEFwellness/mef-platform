#!/usr/bin/env node
/**
 * The Weight of Yes, driven end to end on production, TWICE.
 *
 * WHY TWICE. This is the first template that can follow on from an earlier
 * one, and the two paths are genuinely different experiences rather than
 * two settings of one. A single run could only ever prove one of them, and
 * the more important half is the negative: a member who never sat down with
 * The Giving Ledger must find NO evidence anywhere that it exists.
 *
 *   RUN A, STANDALONE. No completed The Giving Ledger on the account.
 *     Question one runs in its standalone version, no screen she sees
 *     mentions the earlier template, and the coach's card shows no
 *     follow-up band. The experiment is DECLINED here, which exercises the
 *     decline path and leaves the shared two-slot cap alone for run B.
 *
 *   RUN B, FOLLOW-UP. A real The Giving Ledger sitting is completed first,
 *     by typing nine real answers into the real screens including the
 *     deposit question. Then question one quotes that deposit verbatim, the
 *     closing holds and prints her question eight rewrite under the one
 *     fixed line, the experiment starts and its dashboard card carries the
 *     approved daily question, and the coach's card shows the follow-up
 *     band with both answers side by side and question seven on top.
 *
 * BOTH RUNS ALSO PROVE, each time: save and resume across a genuinely new
 * page, exactly one delivery receipt though two surfaces fire the tracker,
 * the real name on the /detail assignment list, the three earlier template
 * cards standing before and after, zero em dashes and zero console errors.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in a
 * `finally` whether the run passes or not. Every delete is scoped by
 * experience_key, because four templates now share one table and this run
 * must never remove a sitting it did not create. The pop-up dismissal rows
 * that "Maybe later" writes are removed too: they are keyed to the
 * assignment by a string rather than by a foreign key, so deleting the
 * assignment does not take them with it.
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
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-the-weight-of-yes';
const TABLE = 'member_happiness_deep_dive_sessions';

const TWOY = {
  key: 'the-weight-of-yes',
  label: 'The Weight of Yes',
  definitionId: 'e2a8d16b-5c34-4f79-a0e5-3b7c9d248f16',
  dismissalPrefix: 'the_weight_of_yes',
};
const TGL = {
  key: 'the-giving-ledger',
  label: 'The Giving Ledger',
  definitionId: 'd4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9',
  dismissalPrefix: 'the_giving_ledger',
};

/** The three templates that must still be standing at the end of both runs. */
const SIBLINGS = ['Owning Your Value', 'Where Your Joy Lives', 'The Giving Ledger'];
const SIBLING_KEYS = ['owning-your-value', 'where-your-joy-lives'];

const CLOSING_LINE = 'A no to them is a yes to you. You already wrote it.';
const CLOSING_LABEL = 'Your no, in your own words';
const DAILY_QUESTION = 'Did you say a no today, or swallow one? Either answer counts as noticing.';
const EXPERIMENT_ACTION = 'Say one small no this week. Any size counts.';
const STANDALONE_Q1 =
  'Think of the last time you said yes when everything in you wanted to say no. What was the request, and what did the yes cost you?';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

/** Her nine The Weight of Yes answers, distinctive enough that finding them proves they are hers. */
const TWOY_ANSWERS = [
  'PLACEHOLDER, replaced per run so the two runs cannot read each other.',
  'I imagine they go quiet and stay quiet, and that everybody hears about it by Thursday. In twenty years that has happened exactly once, and it was not about a no, it was about something else entirely.',
  'Easiest is the man who does the boiler. Hardest is my mother, and after her my line manager. The difference is whether I think they will still be there afterwards.',
  'Right across the top of my chest, and then a heat up the back of my neck. It sits there for about two days and I get very tidy.',
  'I said yes to covering a shift and missed my daughter reading at assembly. She did not make a thing of it, which was worse than if she had.',
  'That people who say no are difficult, and difficult women end up on their own. Nobody said that out loud. It was just clearly the arrangement.',
  'No, Mum. I am not driving over on Sunday. I have said yes to that for two years and I am finished, and I need you to stop asking me every Friday as if it is new.',
  'Mum, I am not able to do Sundays any more. I want to see you, so let us find a day that works for both of us, but it will not be every week.',
  'I would get one day a week back that nobody has already spent. I think I would stop being angry with people who have not actually done anything to me.',
];
const TWOY_Q1_STANDALONE_ANSWER =
  'My neighbour asked me to take her cat again for three weeks. I said yes before she finished the sentence, and it cost me the only fortnight I had with nothing in it.';
const TWOY_Q1_FOLLOWUP_ANSWER =
  'I did ask him, on the phone, on the Tuesday. He said yes straight away and then sounded surprised that I had asked, which I am still thinking about.';
/** Question eight, the kind version. The closing screen prints this one. */
const KIND_NO = TWOY_ANSWERS[7];
/** Question seven, the raw no. The coach's card opens with this one. */
const RAW_NO = TWOY_ANSWERS[6];

/** Her nine The Giving Ledger answers for run B's setup, typed into the real screens. */
const TGL_ANSWERS = [
  'Work, my mother, the two girls, and a book group I stopped enjoying in the spring.',
  'I chose work and the girls. My mother and the book group I drifted into and never decided on.',
  'My mother. It changed after she stopped driving, and nobody ever asked me whether it could.',
  'My brother, when he actually turns up. It feels like putting a bag down.',
  'My friend Nadia. She asks straight out and she never makes me guess what she wants.',
  'The book group. I keep going because leaving would be a whole conversation I do not want to have.',
  'I am overpaying on Sundays by about double. A fair price is every other week.',
  'I could ask my brother to take one Sunday in two, starting with this coming one.',
  'My ledger says I have been paying full price for things I never agreed to buy.',
];
/** Question eight of The Giving Ledger: the deposit run B's question one must quote verbatim. */
const DEPOSIT = TGL_ANSWERS[7];

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

/** Removes only one template's rows. Four templates share this table. */
async function clearTemplate(service, template) {
  await service.from(TABLE).delete().eq('member_id', MEMBER_ID).eq('experience_key', template.key);
  await service
    .from('lifestyle_experiments')
    .delete()
    .eq('member_id', MEMBER_ID)
    .eq('source_experience_key', template.key);
  const { data: rows } = await service
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', template.definitionId);
  for (const row of rows ?? []) {
    await service.from('member_assignment_deliveries').delete().eq('assignment_id', row.id);
  }
  await service
    .from('assessment_assignments')
    .delete()
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', template.definitionId);
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', template.definitionId);
  await service
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER_ID)
    .like('message_key', `${template.dismissalPrefix}:%`);
}

/**
 * Opens the "Assessments and Findings" fold on the coach's client screen.
 *
 * The six sections on that page are collapsed on arrival and a folded
 * section renders NOTHING into the document, so every card inside it is
 * genuinely absent until a coach presses the header.
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
      // The caller checks and reports.
    });
  await page.waitForTimeout(800);
}

/** Presses a template's own Assign button on the coach screen and returns the assignment row. */
async function assignFromCoachScreen(coachPage, service, template) {
  await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
    waitUntil: 'domcontentloaded',
  });
  await coachPage.waitForTimeout(2500);
  await openAssessmentsFold(coachPage, template.label);

  const panel = coachPage.locator(`section[aria-label="${template.label}"]`);
  if ((await panel.count()) !== 1) {
    throw new Error(`No ${template.label} panel on the coach screen. Refusing to guess.`);
  }
  await panel.getByRole('button', { name: new RegExp(`Assign ${template.label}`) }).click();
  await coachPage.waitForTimeout(3500);

  const { data } = await service
    .from('assessment_assignments')
    .select('id, status, due_at')
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', template.definitionId)
    .eq('status', 'pending');
  return data ?? [];
}

/** Walks all nine questions of a template, filling each in turn, and finishes. */
async function answerAll(page, answers) {
  for (let i = 0; i < answers.length; i++) {
    await page.locator('textarea').fill(answers[i]);
    const last = i === answers.length - 1;
    await page.getByRole('button', { name: last ? 'Finish' : 'Continue' }).click();
    await page.waitForTimeout(last ? 4500 : 1800);
  }
}

/**
 * Completes a real The Giving Ledger sitting, through the real screens.
 *
 * Run B needs a genuine completed earlier sitting with a real typed deposit
 * answer, because the whole point of the follow-up is that it quotes what
 * she actually wrote. Seeding that row directly would prove the read and
 * not the write.
 */
async function completeGivingLedger(coachPage, memberPage, service) {
  const assignments = await assignFromCoachScreen(coachPage, service, TGL);
  check('setup: The Giving Ledger was assigned from its own real button', assignments.length === 1);

  await memberPage.goto(`${BASE}/${TGL.key}`, { waitUntil: 'domcontentloaded' });
  await memberPage.waitForTimeout(3000);
  await memberPage.getByRole('button', { name: 'Begin' }).click();
  await memberPage.waitForTimeout(1500);
  await answerAll(memberPage, TGL_ANSWERS);

  // Decline its experiment: this run needs the shared two-slot cap left
  // alone for the experiment The Weight of Yes is about to start.
  const decline = memberPage.getByRole('button', { name: 'Not right now' });
  const forward = memberPage.getByRole('button', { name: 'Continue' });
  if (await forward.count()) {
    await forward.first().click();
    await memberPage.waitForTimeout(1800);
  }
  if (await decline.count()) {
    await decline.first().click();
    await memberPage.waitForTimeout(2500);
  }

  const { data: rows } = await service
    .from(TABLE)
    .select('id, completed_at, deposit_request')
    .eq('member_id', MEMBER_ID)
    .eq('experience_key', TGL.key);
  check(
    'setup: her The Giving Ledger sitting is completed, with the deposit she typed',
    (rows ?? []).length === 1 && Boolean(rows?.[0]?.completed_at) && rows?.[0]?.deposit_request === DEPOSIT,
    rows?.[0]?.deposit_request ? `stored: ${String(rows[0].deposit_request).slice(0, 50)}` : 'no row'
  );
  await shot(memberPage, 'B00-giving-ledger-done');
}

/**
 * One whole pass through The Weight of Yes.
 *
 * mode 'standalone' or 'followUp'. Everything both runs share lives here so
 * the two cannot drift into being checked differently.
 */
async function runOnce({ mode, service, staff, member, browser, errors, memberToday, tag }) {
  const isFollowUp = mode === 'followUp';
  const p = (name) => `${tag}: ${name}`;
  let dashes = 0;
  let assignmentId = null;

  const coachPage = await staff.context.newPage();
  watch(coachPage, errors);

  // -------------------------------------------------------------------
  // 1. The coach assigns it, from the real button.
  // -------------------------------------------------------------------
  await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
    waitUntil: 'domcontentloaded',
  });
  await coachPage.waitForTimeout(2500);
  await openAssessmentsFold(coachPage, TWOY.label);

  const panel = coachPage.locator(`section[aria-label="${TWOY.label}"]`);
  const panelFound = (await panel.count()) === 1;
  check(p('coach: The Weight of Yes card is on the client screen'), panelFound);
  if (!panelFound) throw new Error('No The Weight of Yes panel on the coach screen.');

  // The three templates beside it must be standing before this run touches
  // anything: migration 214 dropped and recreated a policy all of them
  // depend on.
  for (const sibling of SIBLINGS) {
    check(
      p(`coach: the ${sibling} card is standing BEFORE the run`),
      (await coachPage.locator(`section[aria-label="${sibling}"]`).count()) === 1
    );
  }

  check(
    p('coach: an unassigned client is told nothing is offered until they send it'),
    (await panel.innerText()).includes('Nothing about this is offered to them until you send it')
  );
  await shot(coachPage, `${tag}-01-coach-before-assign`);

  const assignments = await assignFromCoachScreen(coachPage, service, TWOY);
  check(p('ledger: exactly one assignment row was written'), assignments.length === 1, `${assignments.length} rows`);
  assignmentId = assignments[0]?.id ?? null;
  check(p('ledger: it is pending'), assignments[0]?.status === 'pending');

  const dueDay = assignments[0]?.due_at ? new Date(assignments[0].due_at).toISOString().slice(0, 10) : null;
  check(
    p('ledger: the due date is seven days from HER calendar day'),
    dueDay === addDays(memberToday, 7),
    `${dueDay} vs ${addDays(memberToday, 7)}`
  );

  await coachPage.reload({ waitUntil: 'domcontentloaded' });
  await coachPage.waitForTimeout(2500);
  await openAssessmentsFold(coachPage, TWOY.label);
  const sentLine = await coachPage.locator(`section[aria-label="${TWOY.label}"]`).innerText();
  check(p('coach: the card now prints a sent-and-not-yet-seen sentence'), /Sent/.test(sentLine), sentLine.slice(0, 140));
  check(p('coach: nothing on it says Overdue on the day it was sent'), !/Overdue/.test(sentLine));
  check(
    p("coach: the /detail assignment list names it, and does not call it 'Assessment'"),
    new RegExp(TWOY.label).test(await coachPage.innerText('body'))
  );
  await shot(coachPage, `${tag}-02-coach-after-assign`);
  if (await emDashOn(coachPage)) dashes++;

  // -------------------------------------------------------------------
  // 2. The member's next open: the pop-up, the card, one receipt.
  // -------------------------------------------------------------------
  let page = await member.context.newPage();
  watch(page, errors);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const homeFirst = await page.innerText('body');
  check(
    p('member: Root knocks with the approved sentence'),
    homeFirst.includes(
      'Your coach asked Root to sit down with you on this one. It is called The Weight of Yes. Nine questions about the yeses you give away.'
    )
  );
  check(p('member: the pop-up offers a real way to say not now'), /Maybe later/i.test(homeFirst));
  if (!isFollowUp) {
    check(
      p('member: the knock itself mentions no other experience'),
      !/Giving Ledger/i.test(homeFirst.slice(0, homeFirst.length))
        || !homeFirst.includes('It is called The Giving Ledger')
    );
  }
  await shot(page, `${tag}-03-member-popup`);
  if (await emDashOn(page)) dashes++;

  const maybeLater = page.getByRole('button', { name: /Maybe later/i });
  if (await maybeLater.count()) await maybeLater.first().click();
  await page.waitForTimeout(3000);
  const homeText = await page.innerText('body');
  check(
    p('member: the persistent card on Home names it and offers a way in'),
    homeText.includes(`From your coach: ${TWOY.label}`) && homeText.includes(`Start ${TWOY.label}`)
  );
  await shot(page, `${tag}-04-member-home-card`);

  await page.waitForTimeout(3000);
  const { data: receipts } = await service
    .from('member_assignment_deliveries')
    .select('id, presentation')
    .eq('member_id', MEMBER_ID)
    .eq('assignment_id', assignmentId);
  check(
    p('receipt: exactly one was written, though two surfaces fired the tracker'),
    (receipts ?? []).length === 1,
    `${(receipts ?? []).length} rows`
  );

  // -------------------------------------------------------------------
  // 3. Question one, in the mode this run is testing.
  // -------------------------------------------------------------------
  await page.goto(`${BASE}/${TWOY.key}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const introText = await page.innerText('body');
  check(
    p('member: the intro is the approved copy'),
    introText.includes('No scores, no right answers') &&
      introText.includes('Root has nine questions about the yeses you give away and what each one weighs') &&
      introText.includes('Fifteen to twenty minutes, somewhere quiet')
  );
  await shot(page, `${tag}-05-intro`);

  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForTimeout(1500);

  const q1 = await page.innerText('body');
  check(
    p('member: question one is open writing, on its own screen, under The Automatic Yes'),
    (await page.locator('textarea').count()) === 1 &&
      /The Automatic Yes/i.test(q1) &&
      /Question 1 of 9/i.test(q1)
  );
  check(
    p('member: there is no multiple choice and no character counter anywhere on it'),
    (await page.locator('[role="radio"], [role="checkbox"]').count()) === 0 &&
      !/\bof \d{2,4}\s*$/m.test(q1)
  );

  if (isFollowUp) {
    check(
      p('member: question one runs as a FOLLOW-UP and quotes her deposit verbatim'),
      q1.includes(`Last time, you told Root you could ask someone for this: ${DEPOSIT}`) &&
        q1.includes('Did you ask? What happened, or what stopped you?'),
      q1.includes(DEPOSIT) ? 'deposit present' : 'deposit MISSING'
    );
    check(p('member: it is not the standalone version'), !q1.includes(STANDALONE_Q1));
  } else {
    check(p('member: question one runs STANDALONE, as the approved sentence'), q1.includes(STANDALONE_Q1));
    check(
      p('member: it is not the follow-up version'),
      !q1.includes('Last time, you told Root you could ask someone for this')
    );
  }
  await shot(page, `${tag}-06-question-1`);

  const answers = [...TWOY_ANSWERS];
  answers[0] = isFollowUp ? TWOY_Q1_FOLLOWUP_ANSWER : TWOY_Q1_STANDALONE_ANSWER;

  // -------------------------------------------------------------------
  // 4. Save and resume, across a genuinely new page.
  // -------------------------------------------------------------------
  const seenScreens = [];
  for (let i = 0; i < 4; i++) {
    await page.locator('textarea').fill(answers[i]);
    seenScreens.push(await page.innerText('body'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(1800);
  }
  check(p('member: after four answers she is on question five'), /Question 5 of 9/i.test(await page.innerText('body')));
  check(
    p('member: the screen says her writing is saved'),
    (await page.innerText('body')).includes('Saved. You can close this and come back to it.')
  );
  await shot(page, `${tag}-07-question-5-before-leaving`);

  const { data: draftRows } = await service
    .from(TABLE)
    .select('id, answers, completed_at, kind_no, experience_key, follow_up_source_experience_key')
    .eq('member_id', MEMBER_ID)
    .eq('experience_key', TWOY.key);
  check(p('draft: one row exists, unfinished'), (draftRows ?? []).length === 1 && !draftRows?.[0]?.completed_at);
  check(p('draft: it holds exactly the four answers she wrote'), Object.keys(draftRows?.[0]?.answers ?? {}).length === 4);
  check(p('draft: the kind-no column is still empty'), draftRows?.[0]?.kind_no === null);
  check(
    p('draft: it is stored under this template, not one of the three beside it'),
    draftRows?.[0]?.experience_key === TWOY.key
  );
  check(
    isFollowUp
      ? p('draft: the follow-up flag records the earlier experience')
      : p('draft: the follow-up flag is null, because the standalone version ran'),
    draftRows?.[0]?.follow_up_source_experience_key === (isFollowUp ? TGL.key : null),
    String(draftRows?.[0]?.follow_up_source_experience_key)
  );

  // A genuinely new page. Nothing survives in memory.
  await page.close();
  page = await member.context.newPage();
  watch(page, errors);
  await page.goto(`${BASE}/${TWOY.key}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const resumed = await page.innerText('body');
  check(p('resume: a brand new page lands her back on question five'), /Question 5 of 9/i.test(resumed));
  check(p('resume: it is not the intro again'), !resumed.includes('Fifteen to twenty minutes'));
  await shot(page, `${tag}-08-resumed`);

  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForTimeout(1200);
  check(
    p('resume: the answer she wrote before leaving came back with her'),
    (await page.locator('textarea').inputValue()) === answers[3]
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(1800);

  for (let i = 4; i < 8; i++) {
    await page.locator('textarea').fill(answers[i]);
    seenScreens.push(await page.innerText('body'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(1800);
  }
  const q9 = await page.innerText('body');
  seenScreens.push(q9);
  check(
    p('member: question nine is the last one, under The No'),
    /Question 9 of 9/i.test(q9) &&
      /The No/i.test(q9) &&
      q9.includes('What would become possible in your life if that no was said and survived?')
  );
  if (await emDashOn(page)) dashes++;
  await shot(page, `${tag}-09-question-9`);

  // -------------------------------------------------------------------
  // 5. Finish, and the closing that has to hold.
  // -------------------------------------------------------------------
  await page.locator('textarea').fill(answers[8]);
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.waitForTimeout(4500);

  const closing = await page.innerText('body');
  seenScreens.push(closing);
  check(p('closing: her question eight rewrite is on screen, verbatim'), closing.includes(KIND_NO));
  check(p('closing: the one fixed line is printed exactly as approved'), closing.includes(CLOSING_LINE));
  check(p('closing: her rewrite is labelled as hers and nothing else'), new RegExp(CLOSING_LABEL, 'i').test(closing));
  check(
    p('closing: Root says nothing was graded and nothing interpreted'),
    closing.includes('Nothing here was graded') &&
      closing.includes('Root scored none of this and interpreted none of it')
  );
  check(
    p('closing: no score, band, pattern or level appears anywhere on it'),
    !/\bscore[sd]?\b/i.test(closing.replace(/no scores?|scored none of this/gi, '')) &&
      !/\bpattern\b/i.test(closing) &&
      !/\blevel\b/i.test(closing)
  );
  check(
    p('closing: none of her other eight answers is printed on it'),
    answers.filter((_, i) => i !== 7).every((answer) => !closing.includes(answer))
  );
  await shot(page, `${tag}-10-closing`);
  if (await emDashOn(page)) dashes++;

  // THE HOLD. Several seconds, several server round trips.
  await page.waitForTimeout(9000);
  const stillThere = await page.innerText('body');
  check(
    p('closing: it is STILL on screen nine seconds and several server round trips later'),
    stillThere.includes(KIND_NO) && stillThere.includes(CLOSING_LINE)
  );
  check(p('closing: it was never replaced by the already-done panel'), !stillThere.includes('This one is done'));
  check(p('closing: the URL never moved'), page.url().includes(`/${TWOY.key}`));
  await shot(page, `${tag}-11-closing-still-holding`);

  const { data: finishedRows } = await service
    .from(TABLE)
    .select('id, kind_no, answers, completed_at, follow_up_source_experience_key')
    .eq('member_id', MEMBER_ID)
    .eq('experience_key', TWOY.key);
  check(p('storage: the sitting is completed'), Boolean(finishedRows?.[0]?.completed_at));
  check(p('storage: question eight is in its own column, verbatim'), finishedRows?.[0]?.kind_no === KIND_NO);
  check(p('storage: all nine answers are stored'), Object.keys(finishedRows?.[0]?.answers ?? {}).length === 9);
  check(p('storage: exactly one sitting exists, not two'), (finishedRows ?? []).length === 1);
  check(
    isFollowUp
      ? p('storage: the finished sitting records that it ran as a follow-up')
      : p('storage: the finished sitting records that it ran standalone'),
    finishedRows?.[0]?.follow_up_source_experience_key === (isFollowUp ? TGL.key : null)
  );

  const { data: closedOut } = await service
    .from('assessment_assignments')
    .select('status')
    .eq('id', assignmentId)
    .maybeSingle();
  check(p('ledger: finishing closed the assignment out'), closedOut?.status === 'completed');

  // -------------------------------------------------------------------
  // 6. The experiment. Declined on run A, accepted on run B.
  // -------------------------------------------------------------------
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(1800);
  const offer = await page.innerText('body');
  seenScreens.push(offer);
  check(p('experiment: the offer is the approved action'), offer.includes(EXPERIMENT_ACTION));
  check(p('experiment: there is a real way to decline'), /Not right now/.test(offer));
  await shot(page, `${tag}-12-experiment-offer`);

  if (isFollowUp) {
    await page.getByRole('button', { name: /I'm in: start the 7 days/ }).click();
    await page.waitForTimeout(4500);
    const done = await page.innerText('body');
    seenScreens.push(done);
    check(p('experiment: she is told where it went'), done.includes('It is on your dashboard now'));
    check(p('closing: the piece of reading is offered, summary first'), done.includes('No Is a Complete Sentence'));
    check(p('closing: her own rewrite is still with her on the last screen'), done.includes(KIND_NO));
    await shot(page, `${tag}-13-done`);
    if (await emDashOn(page)) dashes++;

    const { data: experiments } = await service
      .from('lifestyle_experiments')
      .select('id, title, protocol, duration_days, status, start_date')
      .eq('member_id', MEMBER_ID)
      .eq('source_experience_key', TWOY.key);
    check(p('experiment: exactly one row was written'), (experiments ?? []).length === 1);
    check(p('experiment: it runs seven days'), experiments?.[0]?.duration_days === 7);
    check(p('experiment: it starts on HER calendar day'), experiments?.[0]?.start_date === memberToday);
    check(
      p('experiment: the stored protocol is the approved action'),
      (experiments?.[0]?.protocol ?? '').includes(EXPERIMENT_ACTION)
    );
    check(
      p('experiment: the stored protocol never bakes her own answer into it'),
      !(experiments?.[0]?.protocol ?? '').includes(KIND_NO) &&
        !(experiments?.[0]?.protocol ?? '').includes(DEPOSIT)
    );

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    const home = await page.innerText('body');
    seenScreens.push(home);
    check(p('home: the experiment card carries the approved daily question'), home.includes(DAILY_QUESTION));
    const experimentCard = page.locator('div', { hasText: DAILY_QUESTION }).last();
    const cardText = (await experimentCard.count()) ? await experimentCard.innerText() : '';
    check(p('home: it says which day of seven she is on'), /Day 1 of 7/i.test(cardText), cardText.slice(0, 80));
    check(
      p('home: the assignment card is gone now that the sitting is finished'),
      !home.includes(`From your coach: ${TWOY.label}`)
    );
    await shot(page, `${tag}-14-home-experiment-card`);
    if (await emDashOn(page)) dashes++;

    const yes = experimentCard.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.count()) {
      await yes.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await yes.first().evaluate((el) => el.click());
      await page.waitForTimeout(4000);
      check(
        p('home: her evening tap is recorded and the card says so'),
        (await page.innerText('body')).includes('Logged: you said one.')
      );
    } else {
      check(p('home: her evening tap is recorded and the card says so'), false, 'no Yes button found');
    }
  } else {
    await page.getByRole('button', { name: 'Not right now' }).click();
    await page.waitForTimeout(3000);
    const declined = await page.innerText('body');
    seenScreens.push(declined);
    check(
      p('experiment: declining loses nothing and says so'),
      declined.includes('No problem. Nothing is lost, and your answers are already saved.')
    );
    check(p('closing: the piece of reading is offered, summary first'), declined.includes('No Is a Complete Sentence'));
    check(p('closing: her own rewrite is still with her on the last screen'), declined.includes(KIND_NO));
    const { data: experiments } = await service
      .from('lifestyle_experiments')
      .select('id')
      .eq('member_id', MEMBER_ID)
      .eq('source_experience_key', TWOY.key);
    check(p('experiment: declining started nothing'), (experiments ?? []).length === 0);
    await shot(page, `${tag}-13-declined`);
    if (await emDashOn(page)) dashes++;
  }

  // -------------------------------------------------------------------
  // 7. THE NEGATIVE, on run A: nothing she saw mentioned the other one.
  // -------------------------------------------------------------------
  if (!isFollowUp) {
    const leaked = seenScreens.filter((text) => /Giving Ledger/i.test(text));
    check(
      p('member: NO screen she saw in the whole standalone run mentions The Giving Ledger'),
      leaked.length === 0,
      `${leaked.length} of ${seenScreens.length} screens`
    );
    const gestured = seenScreens.filter((text) =>
      /Last time, you told Root/i.test(text)
    );
    check(
      p('member: and nothing gestured at an earlier sitting either'),
      gestured.length === 0,
      `${gestured.length} screens`
    );
  }

  // Reopening a finished sitting is an answer, not a mystery.
  await page.goto(`${BASE}/${TWOY.key}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const reopened = await page.innerText('body');
  check(p('member: reopening it says it is done rather than bouncing her'), reopened.includes('This one is done'));
  check(p('member: and it shows her own rewrite again'), reopened.includes(KIND_NO));
  await shot(page, `${tag}-15-reopened`);

  // -------------------------------------------------------------------
  // 8. The coach reads it back.
  // -------------------------------------------------------------------
  await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, { waitUntil: 'domcontentloaded' });
  await coachPage.waitForTimeout(3000);
  await openAssessmentsFold(coachPage, TWOY.label);
  const card = coachPage.locator(`section[aria-label="${TWOY.label}"]`);
  const cardFound = (await card.count()) === 1;
  check(p('coach: the finished sitting is on the card'), cardFound);
  if (cardFound) {
    const text = await card.innerText();
    const bandAt = text.search(/Follow-up from The Giving Ledger/i);
    const openerAt = text.indexOf(RAW_NO);
    // Measured against the answer list's own heading, NOT against her first
    // answer. On a follow-up sitting her question one answer legitimately
    // appears twice: once in the band at the very top, and once in the list
    // below. Anchoring on the first of those would report the opener as
    // out of order on exactly the runs where the band is doing its job.
    const answersHeadingAt = text.search(/What they wrote/i);
    const firstAnswerAt = answersHeadingAt > -1 ? text.indexOf(answers[0], answersHeadingAt) : -1;

    check(p('coach: question seven is the opener'), openerAt > -1);
    check(
      p('coach: it sits ABOVE the nine answers'),
      openerAt > -1 && answersHeadingAt > openerAt && firstAnswerAt > openerAt,
      `opener ${openerAt}, heading ${answersHeadingAt}, first answer ${firstAnswerAt}`
    );
    check(
      p('coach: the opener is labelled as the thing to start the session with'),
      /Open the session with this/i.test(text)
    );

    if (isFollowUp) {
      check(p('coach: the follow-up band is on the card, clearly labelled'), bandAt > -1);
      check(p('coach: the band sits ABOVE the session opener'), bandAt > -1 && openerAt > bandAt);
      check(p('coach: it shows what she said THEN, her deposit, verbatim'), text.includes(DEPOSIT));
      check(p('coach: beside what she says NOW, her question one answer'), text.includes(answers[0]));
      check(
        p('coach: both sides are named so neither is mistaken for the other'),
        /The deposit they named then/i.test(text) && /What they say now/i.test(text)
      );
    } else {
      check(p('coach: there is NO follow-up band on a standalone sitting'), bandAt === -1);
      check(
        p('coach: and the card says out loud that it ran standalone'),
        /This sitting ran on its own, with the standalone first question/i.test(text)
      );
      check(p('coach: nothing on the card mentions The Giving Ledger'), !/Giving Ledger/i.test(text));
    }

    let all = true;
    for (const answer of answers) if (!text.includes(answer)) all = false;
    check(p('coach: all nine answers are shown raw'), all);
    check(
      p('coach: the three screens are named'),
      text.includes('The Automatic Yes') && text.includes('The Cost') && text.includes('The No')
    );
    check(
      p('coach: nothing on the card scores her'),
      !/\bscore\b/i.test(text) && !/\bseverity\b/i.test(text) && !/\bpattern\b/i.test(text)
    );
  }
  await shot(coachPage, `${tag}-16-coach-card`);
  if (await emDashOn(coachPage)) dashes++;

  for (const sibling of SIBLINGS) {
    check(
      p(`coach: the ${sibling} card is STILL standing after the whole run`),
      (await coachPage.locator(`section[aria-label="${sibling}"]`).count()) === 1
    );
  }

  check(p('no em dash appeared on any screen either of them saw'), dashes === 0, `${dashes} screens`);

  await page.close();
  await coachPage.close();
  return { assignmentId };
}

async function main() {
  if (!canMintSessions()) throw new Error('Session minting is not configured.');
  if (!STAFF_EMAIL || !MEMBER_EMAIL || !MEMBER_ID) {
    throw new Error('STAFF_EMAIL, TEST_MEMBER_EMAIL and TEST_MEMBER_ID are all required.');
  }

  const service = serviceClient();
  const errors = [];

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

  // How many rows the templates beside these two hold before the run, so
  // the regression check at the end can prove this run touched none.
  const siblingBefore = {};
  for (const key of SIBLING_KEYS) {
    const { count } = await service
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', key);
    siblingBefore[key] = count ?? 0;
  }

  await clearTemplate(service, TWOY);
  await clearTemplate(service, TGL);

  const browser = await chromium.launch();
  let staff = null;
  let member = null;

  try {
    staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
    if (!staff) throw new Error('Could not mint a staff session.');
    member = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 430, height: 932 },
    });
    if (!member) throw new Error('Could not mint a member session.');

    // ---------------- RUN A: STANDALONE ----------------
    console.log('\n=== RUN A, standalone: no completed The Giving Ledger on the account ===');
    const { data: noEarlier } = await service
      .from(TABLE)
      .select('id')
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', TGL.key);
    check('run A: the account genuinely holds no The Giving Ledger sitting', (noEarlier ?? []).length === 0);
    await runOnce({ mode: 'standalone', service, staff, member, browser, errors, memberToday, tag: 'A' });

    // Clear run A entirely, so run B starts from nothing of its own.
    await clearTemplate(service, TWOY);

    // ---------------- RUN B: FOLLOW-UP ----------------
    console.log('\n=== RUN B, follow-up: a real The Giving Ledger sitting first ===');
    const setupCoach = await staff.context.newPage();
    watch(setupCoach, errors);
    const setupMember = await member.context.newPage();
    watch(setupMember, errors);
    await completeGivingLedger(setupCoach, setupMember, service);
    await setupCoach.close();
    await setupMember.close();

    await runOnce({ mode: 'followUp', service, staff, member, browser, errors, memberToday, tag: 'B' });

    // ---------------- REGRESSION AND CLEANLINESS ----------------
    for (const key of SIBLING_KEYS) {
      const { count } = await service
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('member_id', MEMBER_ID)
        .eq('experience_key', key);
      check(
        `regression: this run touched no ${key} sitting`,
        (count ?? 0) === siblingBefore[key],
        `${siblingBefore[key]} before, ${count ?? 0} after`
      );
    }
    check('no console or page error on any screen', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    await clearTemplate(service, TWOY);
    await clearTemplate(service, TGL);
    await retireSession(staff);
    await retireSession(member);
    await browser.close();
  }

  // ---------------- THE ACCOUNT IS LEFT AS IT WAS FOUND ----------------
  const { data: leftSittings } = await service
    .from(TABLE)
    .select('id, experience_key')
    .eq('member_id', MEMBER_ID)
    .in('experience_key', [TWOY.key, TGL.key]);
  check('cleanup: no sitting from either run is left on production', (leftSittings ?? []).length === 0,
    JSON.stringify(leftSittings ?? []));

  const { data: leftAssignments } = await service
    .from('assessment_assignments')
    .select('id, assessment_definition_id')
    .eq('member_id', MEMBER_ID)
    .in('assessment_definition_id', [TWOY.definitionId, TGL.definitionId]);
  check('cleanup: no assignment from either run is left', (leftAssignments ?? []).length === 0);

  const { data: leftExperiments } = await service
    .from('lifestyle_experiments')
    .select('id, source_experience_key')
    .eq('member_id', MEMBER_ID)
    .in('source_experience_key', [TWOY.key, TGL.key]);
  check('cleanup: no experiment from either run is left', (leftExperiments ?? []).length === 0);

  const { data: leftActive } = await service
    .from('lifestyle_experiments')
    .select('id, title, status')
    .eq('member_id', MEMBER_ID)
    .eq('status', 'active');
  check(
    'cleanup: the account carries no active experiment at all, including the two pre-existing leftovers',
    (leftActive ?? []).length === 0,
    JSON.stringify(leftActive ?? [])
  );

  const { data: leftJoy } = await service
    .from(TABLE)
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('experience_key', 'where-your-joy-lives');
  check('cleanup: the pre-existing Where Your Joy Lives sitting is gone too', (leftJoy ?? []).length === 0);

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} checks passed on ${BASE}`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
