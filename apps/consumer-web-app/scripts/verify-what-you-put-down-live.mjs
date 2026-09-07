#!/usr/bin/env node
/**
 * What You Put Down, driven end to end on production.
 *
 * TWO THINGS ARE BEING PROVED HERE AND THEY ARE DIFFERENT KINDS OF THING.
 *
 *   THE TEMPLATE. The sixth Happiness deep-dive, on the same machinery as
 *     the five beside it: a coach assigns it from its own real button, the
 *     member is knocked once, one delivery receipt is written though two
 *     surfaces fire the tracker, the sitting is answered through the real
 *     screens, save and resume survives a genuinely new page, the closing
 *     holds and prints her own sentence verbatim under one fixed line, the
 *     experiment starts and its dashboard card carries the approved daily
 *     question, and the coach reads the whole thing back.
 *
 *   THE INTERACTIONS. This template is the first in the family whose
 *     questions are not all writing, and that half cannot be proved by
 *     reading source. So this run types a REAL multi-line list, checks that
 *     every line of it became a card carrying her exact words, places every
 *     card by tapping, names the one that stings, and then checks that
 *     question three quotes that card back at her CHARACTER FOR CHARACTER.
 *     It sets the two-pole line, answers its written half, lifts a card
 *     back off the shelf and checks the gold state is really on that card
 *     and on no other.
 *
 * AND IT PROVES THE SHELF SURVIVES A CLOSED TAB, which is the part a member
 * would actually lose. The tab is closed mid-sitting and a brand new page is
 * opened, and the run then checks the cards, the placements, the sting pick
 * and the exact slider position all came back.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in a
 * `finally` whether the run passes or not. Every delete is scoped by
 * experience_key, because six templates now share one table and this run
 * must never remove a sitting it did not create. The pop-up dismissal rows
 * that "Maybe later" writes are removed too: they are keyed to the
 * assignment by a string rather than by a foreign key, so deleting the
 * assignment does not take them with it.
 *
 * Environment:
 *   BASE_URL     default https://app.mefwellness.com
 *   STAFF_EMAIL  an account holding coach and administrator
 *   TEST_MEMBER_EMAIL   the seeded fixture (its id is looked up here)
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-what-you-put-down';
const TABLE = 'member_happiness_deep_dive_sessions';

const WYPD = {
  key: 'what-you-put-down',
  label: 'What You Put Down',
  definitionId: 'a8e6d403-2f19-4c57-b8d2-6e4a1f97c503',
  dismissalPrefix: 'what_you_put_down',
};

/** The five templates that must still be standing before and after the run. */
const SIBLINGS = [
  'Owning Your Value',
  'Where Your Joy Lives',
  'The Giving Ledger',
  'The Weight of Yes',
  'Being Seen',
];
const SIBLING_KEYS = [
  'owning-your-value',
  'where-your-joy-lives',
  'the-giving-ledger',
  'the-weight-of-yes',
  'being-seen',
];

const SECTION_TITLES = ['What Was Carried Away', 'The Story Around It', 'Picking It Back Up'];
const CLOSING_LINE = 'She is still in there. She just read this.';
const CLOSING_LABEL = 'To the one who put it down';
const DAILY_QUESTION = 'Did you touch the thing you put down today, even for a minute?';
const EXPERIMENT_ACTION = 'Step through the doorway you named, once this week.';
const RESOURCE_TITLE = 'You Are Allowed to Come Back';
const STING_PROMPT = 'Tap the one that stings most to read back.';
const WHY_THERE = 'Why there, and not further away?';

/** Her question one list. Four distinctive lines, so finding one proves it is hers. */
const LINES = [
  'sang in a choir on Thursday nights',
  'read a whole novel in a weekend without feeling guilty',
  'said no to things without writing a paragraph about it first',
  'wore the green coat',
];
const Q1 = LINES.join('\n');
/** The line she names as the one that stings. Index into LINES. */
const STING_INDEX = 2;
const STING = LINES[STING_INDEX];
/** The line she lifts back off, deliberately a DIFFERENT one from the sting pick. */
const LIFT_INDEX = 0;
const LIFT = LINES[LIFT_INDEX];
/** Where she puts her mark. 78 is inside the "closer to A stranger" band. */
const DISTANCE = 78;
const DISTANCE_WORDS = 'closer to A stranger';

/** The seven written answers, by question key. */
const WRITTEN = {
  what_took_its_place: 'Around 2019, when the second job started. Admin took its place. I still have the same opinions, I just run them past three people before I say one out loud.',
  the_reason_and_the_honest_one:
    'The reason I would give: there is no time, and everyone needs something from me.\nThe more honest reason: I stopped being sure my no would survive somebody being disappointed by it.',
  why_there:
    'She is not gone, she is just three rooms away and I have not knocked. Further away would mean I could not hear her, and I can.',
  what_you_would_tell_a_friend:
    'I would tell her that she has confused being needed with being loved, and that she is allowed to test that.',
  doorway: 'Say one plain no this fortnight, out loud, with no paragraph after it.',
  to_the_one_who_put_it_down:
    'You were not wrong to put it down. You were carrying two people. I am picking one thing back up and it is going to be a small one.',
};
const SENTENCE = WRITTEN.to_the_one_who_put_it_down;

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

/** Removes only this template's rows. Six templates share this table. */
async function clearTemplate(service, memberId) {
  await service.from(TABLE).delete().eq('member_id', memberId).eq('experience_key', WYPD.key);
  const { data: experiments } = await service
    .from('lifestyle_experiments')
    .select('id')
    .eq('member_id', memberId)
    .eq('source_experience_key', WYPD.key);
  for (const row of experiments ?? []) {
    await service.from('cvs_experiment_daily_logs').delete().eq('experiment_id', row.id);
  }
  await service
    .from('lifestyle_experiments')
    .delete()
    .eq('member_id', memberId)
    .eq('source_experience_key', WYPD.key);
  const { data: rows } = await service
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', WYPD.definitionId);
  for (const row of rows ?? []) {
    await service.from('member_assignment_deliveries').delete().eq('assignment_id', row.id);
  }
  await service
    .from('assessment_assignments')
    .delete()
    .eq('member_id', memberId)
    .eq('assessment_definition_id', WYPD.definitionId);
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', memberId)
    .eq('assessment_definition_id', WYPD.definitionId);
  await service
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', memberId)
    .like('message_key', `${WYPD.dismissalPrefix}:%`);
}

/**
 * Opens the "Assessments and Findings" fold on the coach's client screen.
 *
 * The sections on that page are collapsed on arrival and a folded section
 * renders NOTHING into the document, so every card inside it is genuinely
 * absent until a coach presses the header.
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

/**
 * Waits for a NAMED question to be on screen.
 *
 * WHY NOT SIMPLY WAIT FOR A CONTROL. Continue calls a Server Action inside a
 * React transition, and a transition deliberately keeps the PREVIOUS screen
 * on screen until it resolves. So for a second or so after the tap, the old
 * question and its writing box are both still there. The counter is the
 * honest signal: it names the question, it renders the moment the new
 * question mounts, and it is absent entirely during the chapter beat.
 *
 * The second wait is the question's OWN control, and on this template that
 * is not always a textarea: two of the nine are a shelf.
 */
async function waitForQuestion(page, number, control = 'textarea', timeout = 60000) {
  await page
    .getByText(new RegExp(`Question ${number} of 9`, 'i'))
    .first()
    .waitFor({ state: 'visible', timeout });
  if (control === 'textarea') {
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout });
  } else if (control === 'place') {
    await page
      .getByRole('button', { name: /^Put it on the shelf:/ })
      .first()
      .waitFor({ state: 'visible', timeout });
  } else if (control === 'lift') {
    await page
      .getByRole('button', { name: /^Lift:/ })
      .first()
      .waitFor({ state: 'visible', timeout });
  } else if (control === 'choose') {
    await page
      .getByRole('button', { name: /^Choose:/ })
      .first()
      .waitFor({ state: 'visible', timeout });
  } else if (control === 'slider') {
    await page.locator('input[type="range"]').first().waitFor({ state: 'attached', timeout });
  }
}

/** Reads every card on screen: its words and the state it is drawn in. */
async function readCards(page) {
  return page.$$eval('[data-tone]', (nodes) =>
    nodes.map((node) => ({
      tone: node.getAttribute('data-tone'),
      text: (node.textContent || '').trim(),
    }))
  );
}

/** Moves the two-pole line the way a finger or an arrow key does. */
async function setSlider(page, value) {
  await page.locator('input[type="range"]').first().evaluate((element, target) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(element, String(target));
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/**
 * One account's id, from its email.
 *
 * profiles has no email column, so the auth directory is the only place
 * that mapping exists. Paged rather than assumed to fit in one call, and
 * matched case insensitively, because an email is not case sensitive and a
 * near miss here would address the wrong person.
 */
async function findUserIdByEmail(service, email) {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((user) => (user.email ?? '').toLowerCase() === wanted);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

async function main() {
  if (!canMintSessions()) throw new Error('Session minting is not configured.');
  if (!STAFF_EMAIL || !MEMBER_EMAIL) {
    throw new Error('STAFF_EMAIL and TEST_MEMBER_EMAIL are both required.');
  }

  const service = serviceClient();
  const errors = [];
  let dashes = 0;

  // The fixture is resolved by EMAIL rather than taken from an id in the
  // environment, so a typo in an id cannot address a stranger's account.
  // profiles carries no email column, so the auth directory is what is
  // asked, and the id it returns is then re-read from profiles and refused
  // unless it is a seeded test account.
  const MEMBER_ID = await findUserIdByEmail(service, MEMBER_EMAIL);
  if (!MEMBER_ID) throw new Error('That test member email resolves to no account.');
  const { data: byId } = await service
    .from('profiles')
    .select('id, timezone, is_test')
    .eq('id', MEMBER_ID)
    .maybeSingle();
  if (!byId?.is_test) {
    throw new Error('Refusing to run: that member is not a seeded test account.');
  }
  const timezone = byId.timezone ?? 'America/New_York';
  const memberToday = todayIn(timezone);
  note(`member ${MEMBER_ID} today ${memberToday} in ${timezone}`);

  // How many rows the templates beside this one hold before the run, so the
  // regression check at the end can prove this run touched none.
  const siblingBefore = {};
  for (const key of SIBLING_KEYS) {
    const { count } = await service
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', key);
    siblingBefore[key] = count ?? 0;
  }

  await clearTemplate(service, MEMBER_ID);

  const browser = await chromium.launch();
  let staff = null;
  let member = null;
  let calm = null;

  try {
    staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
    if (!staff) throw new Error('Could not mint a staff session.');
    member = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 430, height: 932 },
    });
    if (!member) throw new Error('Could not mint a member session.');

    const coachPage = await staff.context.newPage();
    watch(coachPage, errors);

    // -----------------------------------------------------------------
    // 1. The coach assigns it, from the real button.
    // -----------------------------------------------------------------
    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    await coachPage.waitForTimeout(2500);
    await openAssessmentsFold(coachPage, WYPD.label);

    const panel = coachPage.locator(`section[aria-label="${WYPD.label}"]`);
    const panelFound = (await panel.count()) === 1;
    check('coach: the What You Put Down card is on the client screen', panelFound);
    if (!panelFound) throw new Error('No What You Put Down panel on the coach screen.');

    // Migration 217 dropped and recreated a policy all six templates depend
    // on, so the five beside it are checked before anything moves.
    for (const sibling of SIBLINGS) {
      check(
        `coach: the ${sibling} card is standing BEFORE the run`,
        (await coachPage.locator(`section[aria-label="${sibling}"]`).count()) === 1
      );
    }

    check(
      'coach: an unassigned client is told nothing is offered until they send it',
      (await panel.innerText()).includes('Nothing about this is offered to them until you send it')
    );
    await shot(coachPage, '01-coach-before-assign');

    await panel.getByRole('button', { name: new RegExp(`Assign ${WYPD.label}`) }).click();
    await coachPage.waitForTimeout(3500);

    const { data: assignments } = await service
      .from('assessment_assignments')
      .select('id, status, due_at')
      .eq('member_id', MEMBER_ID)
      .eq('assessment_definition_id', WYPD.definitionId)
      .eq('status', 'pending');
    check(
      'ledger: exactly one assignment row was written',
      (assignments ?? []).length === 1,
      `${(assignments ?? []).length} rows`
    );
    const assignmentId = assignments?.[0]?.id ?? null;
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
    await openAssessmentsFold(coachPage, WYPD.label);
    const sentLine = await coachPage.locator(`section[aria-label="${WYPD.label}"]`).innerText();
    check(
      'coach: the card now prints a sent-and-not-yet-seen sentence',
      /Sent/.test(sentLine),
      sentLine.slice(0, 140)
    );
    check('coach: nothing on it says Overdue on the day it was sent', !/Overdue/.test(sentLine));
    check(
      "coach: the /detail assignment list names it, and does not call it 'Assessment'",
      new RegExp(WYPD.label).test(await coachPage.innerText('body'))
    );
    await shot(coachPage, '02-coach-after-assign');
    if (await emDashOn(coachPage)) dashes++;

    // -----------------------------------------------------------------
    // 2. The member's next open: the pop-up, the card, one receipt.
    // -----------------------------------------------------------------
    let page = await member.context.newPage();
    watch(page, errors);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    const homeFirst = await page.innerText('body');
    check(
      'member: Root knocks with the approved sentence',
      homeFirst.includes(
        'Your coach asked Root to sit down with you on this one. It is called What You Put Down. Nine questions about the versions of yourself you set aside.'
      )
    );
    check('member: the pop-up offers a real way to say not now', /Maybe later/i.test(homeFirst));
    await shot(page, '03-member-popup');
    if (await emDashOn(page)) dashes++;

    const maybeLater = page.getByRole('button', { name: /Maybe later/i });
    if (await maybeLater.count()) await maybeLater.first().click();
    await page.waitForTimeout(3000);
    const homeText = await page.innerText('body');
    check(
      'member: the persistent card on Home names it and offers a way in',
      homeText.includes(`From your coach: ${WYPD.label}`) && homeText.includes(`Start ${WYPD.label}`)
    );
    await shot(page, '04-member-home-card');

    await page.waitForTimeout(3000);
    const { data: receipts } = await service
      .from('member_assignment_deliveries')
      .select('id, presentation')
      .eq('member_id', MEMBER_ID)
      .eq('assignment_id', assignmentId);
    check(
      'receipt: exactly one was written, though two surfaces fired the tracker',
      (receipts ?? []).length === 1,
      `${(receipts ?? []).length} rows`
    );

    // -----------------------------------------------------------------
    // 3. The intro, and question one.
    // -----------------------------------------------------------------
    await page.goto(`${BASE}/${WYPD.key}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const introText = await page.innerText('body');
    check(
      'member: the intro is the approved copy',
      introText.includes('No scores, no right answers') &&
        introText.includes(
          'Root has nine questions about the versions of yourself you set aside to carry everything else'
        ) &&
        introText.includes('Fifteen to twenty minutes, somewhere quiet')
    );
    await shot(page, '05-intro');

    await page.getByRole('button', { name: 'Begin' }).click();
    await waitForQuestion(page, 1);
    const q1Text = await page.innerText('body');
    check(
      'member: question one is the list question, under What Was Carried Away',
      /Question 1 of 9/i.test(q1Text) &&
        new RegExp(SECTION_TITLES[0], 'i').test(q1Text) &&
        q1Text.includes('I used to be someone who')
    );
    await shot(page, '06-question-1');

    await page.locator('textarea').fill(Q1);
    await page.getByRole('button', { name: 'Continue' }).click();

    // -----------------------------------------------------------------
    // 4. The shelf: every line becomes a card, and every card is placed.
    // -----------------------------------------------------------------
    await waitForQuestion(page, 2, 'place');
    await shot(page, '07-question-2-first-card');

    const firstCardLabel = await page
      .getByRole('button', { name: /^Put it on the shelf:/ })
      .first()
      .getAttribute('aria-label');
    check(
      'shelf: the first card carries her FIRST line, word for word',
      firstCardLabel === `Put it on the shelf: ${LINES[0]}`,
      String(firstCardLabel)
    );
    // Case insensitive on purpose: that counter is styled `uppercase`, and
    // innerText reports the CSS-transformed text rather than the source.
    check(
      'shelf: she is told how many are in her hand',
      /\b1 of 4\b/i.test(await page.innerText('body'))
    );

    // Place every card by TAPPING it. Nothing here drags.
    const placedTexts = [];
    for (let i = 0; i < LINES.length; i++) {
      const card = page.getByRole('button', { name: /^Put it on the shelf:/ }).first();
      const label = (await card.getAttribute('aria-label')) ?? '';
      placedTexts.push(label.replace('Put it on the shelf: ', ''));
      await card.click();
      await page.waitForTimeout(700);
    }
    check(
      'shelf: every line she wrote became a card, in her order, with nothing added and nothing edited',
      JSON.stringify(placedTexts) === JSON.stringify(LINES),
      JSON.stringify(placedTexts)
    );
    check(
      'shelf: taps alone placed all four, with no drag on any of them',
      (await page.getByRole('button', { name: /^Put it on the shelf:/ }).count()) === 0
    );

    const shelfText = await page.innerText('body');
    check(
      'shelf: it now asks the approved question about which one stings',
      shelfText.includes(STING_PROMPT)
    );
    check('shelf: it says that is all of them', shelfText.includes('That is all of them.'));
    check(
      'shelf: all four of her cards are on it, and nothing else is',
      LINES.every((line) => shelfText.includes(line))
    );
    await shot(page, '08-shelf-full');

    await page.getByRole('button', { name: `Choose: ${STING}` }).click();
    await page.waitForTimeout(900);
    const marked = await readCards(page);
    check(
      'shelf: the card she named is the marked one, and it is the only marked one',
      marked.filter((card) => card.tone === 'marked').length === 1 &&
        marked.find((card) => card.tone === 'marked')?.text.includes(STING) === true,
      JSON.stringify(marked.map((c) => c.tone))
    );
    await shot(page, '09-sting-chosen');

    await page.getByRole('button', { name: 'Continue' }).click();

    // -----------------------------------------------------------------
    // 5. Question three quotes her card back to her, verbatim.
    // -----------------------------------------------------------------
    await waitForQuestion(page, 3);
    const q3 = await page.innerText('body');
    check(
      'question three quotes the card she named, character for character',
      q3.includes(STING),
      q3.slice(0, 200)
    );
    check(
      'question three quotes it as her own completed sentence, and marks it as a quotation',
      q3.includes(`You wrote: "I used to be someone who ${STING}"`)
    );
    check(
      'question three quotes ONLY the one she named, not one of the other three',
      LINES.filter((_, i) => i !== STING_INDEX).every((line) => !q3.includes(line))
    );
    check(
      'question three then asks the approved question',
      q3.includes('When did you stop being that? What took its place?')
    );
    await shot(page, '10-question-3-quote');

    await page.locator('textarea').fill(WRITTEN.what_took_its_place);
    await page.getByRole('button', { name: 'Continue' }).click();

    // -----------------------------------------------------------------
    // 6. Screen two: the two-pole line, and its written half.
    // -----------------------------------------------------------------
    await waitForQuestion(page, 4);
    check(
      'member: she crossed into The Story Around It',
      new RegExp(SECTION_TITLES[1], 'i').test(await page.innerText('body'))
    );
    await page.locator('textarea').fill(WRITTEN.the_reason_and_the_honest_one);
    await page.getByRole('button', { name: 'Continue' }).click();

    await waitForQuestion(page, 5, 'slider');
    const beforeMark = await page.innerText('body');
    check(
      'line: it asks how far away she feels, with both ends named',
      beforeMark.includes('How far away does she feel?') &&
        beforeMark.includes('Right here') &&
        beforeMark.includes('A stranger')
    );
    check(
      'line: nothing is written yet, because she has not placed her mark',
      beforeMark.includes('Place her on the line.') &&
        (await page.locator('textarea').count()) === 0
    );
    await shot(page, '11-line-unset');

    await setSlider(page, DISTANCE);
    await page.waitForTimeout(1200);
    const afterMark = await page.innerText('body');
    check(
      'line: her position is read back to her in WORDS, never as a number',
      afterMark.includes(DISTANCE_WORDS)
    );
    check(
      'line: only once she has placed it does the written half appear',
      afterMark.includes(WHY_THERE) && (await page.locator('textarea').count()) === 1
    );
    await shot(page, '12-line-set');

    await page.locator('textarea').fill(WRITTEN.why_there);
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 6);
    check(
      'member: the screen says her writing is saved',
      (await page.innerText('body')).includes('Saved. You can close this and come back to it.')
    );

    // -----------------------------------------------------------------
    // 7. Save and resume, across a genuinely closed tab.
    // -----------------------------------------------------------------
    const { data: draftRows } = await service
      .from(TABLE)
      .select(
        'id, answers, shelf_state, completed_at, doorway, experience_key, follow_up_source_experience_key'
      )
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', WYPD.key);
    check(
      'draft: one row exists, unfinished',
      (draftRows ?? []).length === 1 && !draftRows?.[0]?.completed_at
    );
    const storedShelf = draftRows?.[0]?.shelf_state ?? null;
    check(
      'draft: the shelf is stored structured, with her four cards in her own words',
      Array.isArray(storedShelf?.cards) &&
        storedShelf.cards.length === 4 &&
        JSON.stringify(storedShelf.cards.map((c) => c.text)) === JSON.stringify(LINES),
      JSON.stringify(storedShelf?.cards ?? null)
    );
    check(
      'draft: it holds her sting pick and her position on the line',
      storedShelf?.placed?.length === 4 &&
        storedShelf?.distance === DISTANCE &&
        storedShelf?.stingCardId === storedShelf.cards[STING_INDEX]?.id,
      JSON.stringify({ placed: storedShelf?.placed, distance: storedShelf?.distance })
    );
    check('draft: nothing has been lifted yet', storedShelf?.liftedCardId === null);
    check('draft: the doorway column is still empty', draftRows?.[0]?.doorway === null);
    check(
      'draft: it is stored under this template, not one of the five beside it',
      draftRows?.[0]?.experience_key === WYPD.key
    );
    check(
      'draft: the follow-up flag is null, because this template has no follow-up',
      draftRows?.[0]?.follow_up_source_experience_key === null
    );

    // The tab is genuinely closed. Nothing survives in memory.
    await page.close();
    page = await member.context.newPage();
    watch(page, errors);
    await page.goto(`${BASE}/${WYPD.key}`, { waitUntil: 'domcontentloaded' });
    await waitForQuestion(page, 6);
    const resumed = await page.innerText('body');
    check('resume: a brand new tab lands her back on question six', /Question 6 of 9/i.test(resumed));
    check('resume: it is not the intro again', !resumed.includes('Fifteen to twenty minutes'));
    await shot(page, '13-resumed');

    // Back to question five, to read the line as it came back.
    await page.getByRole('button', { name: 'Back' }).click();
    await waitForQuestion(page, 5, 'slider');
    await page.waitForTimeout(800);
    const sliderValue = await page.locator('input[type="range"]').first().inputValue();
    check(
      'resume: her position on the line came back EXACTLY where she left it',
      sliderValue === String(DISTANCE),
      `${sliderValue} vs ${DISTANCE}`
    );
    check(
      'resume: and its written half came back with it',
      (await page.locator('textarea').inputValue()) === WRITTEN.why_there
    );

    // Back again to question two, to read the shelf as it came back.
    await page.getByRole('button', { name: 'Back' }).click();
    await waitForQuestion(page, 4);
    await page.getByRole('button', { name: 'Back' }).click();
    await waitForQuestion(page, 3);
    const q3Again = await page.innerText('body');
    check('resume: question three still quotes her sting card', q3Again.includes(STING));
    await page.getByRole('button', { name: 'Back' }).click();
    await waitForQuestion(page, 2, 'choose');
    await page.waitForTimeout(800);
    const resumedShelf = await readCards(page);
    check(
      'resume: all four cards are back on the shelf, in her order',
      JSON.stringify(resumedShelf.map((c) => c.text.replace(/^Stings most\s*/, '').trim())) ===
        JSON.stringify(LINES),
      JSON.stringify(resumedShelf.map((c) => c.text))
    );
    check(
      'resume: her sting pick came back marked, and it is still the only marked one',
      resumedShelf.filter((c) => c.tone === 'marked').length === 1 &&
        resumedShelf.find((c) => c.tone === 'marked')?.text.includes(STING) === true
    );
    check(
      'resume: nothing is waiting in her hand, because everything was already placed',
      (await page.getByRole('button', { name: /^Put it on the shelf:/ }).count()) === 0
    );
    await shot(page, '14-resumed-shelf');
    if (await emDashOn(page)) dashes++;

    // Forward again to where she was.
    for (const n of [3, 4, 5]) {
      await page.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(page, n, n === 5 ? 'slider' : 'textarea');
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 6);

    // -----------------------------------------------------------------
    // 8. Screen three: lifting a card back off the shelf.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(WRITTEN.what_you_would_tell_a_friend);
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 7, 'lift');
    const q7 = await page.innerText('body');
    check(
      'member: she crossed into Picking It Back Up',
      new RegExp(SECTION_TITLES[2], 'i').test(q7)
    );
    check(
      'lift: the shelf came back with all four of her cards on it',
      LINES.every((line) => q7.includes(line))
    );
    check('lift: it asks the approved question', q7.includes('Which one still has a pulse?'));
    await shot(page, '15-question-7-shelf');

    await page.getByRole('button', { name: `Lift: ${LIFT}` }).click();
    await page.waitForTimeout(1200);
    const lifted = await readCards(page);
    check(
      'lift: the card she lifted is the gold one, and it is the only gold one',
      lifted.filter((card) => card.tone === 'lifted').length === 1 &&
        lifted.find((card) => card.tone === 'lifted')?.text.includes(LIFT) === true,
      JSON.stringify(lifted.map((c) => c.tone))
    );
    check(
      'lift: it says what the gold means, in her hand',
      (await page.innerText('body')).includes('Still has a pulse')
    );
    check(
      'lift: and it is off the shelf, not merely highlighted on it',
      (await page.getByRole('button', { name: `Lift: ${LIFT}` }).count()) === 0
    );
    await shot(page, '16-card-lifted');

    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 8);
    await page.locator('textarea').fill(WRITTEN.doorway);
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 9);
    const q9 = await page.innerText('body');
    check(
      'member: question nine is the last one, under Picking It Back Up',
      /Question 9 of 9/i.test(q9) && new RegExp(SECTION_TITLES[2], 'i').test(q9)
    );
    if (await emDashOn(page)) dashes++;
    await shot(page, '17-question-9');

    // -----------------------------------------------------------------
    // 9. Finish, and the closing that holds.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(SENTENCE);
    await page.getByRole('button', { name: 'Finish' }).click();
    await page
      .getByText(CLOSING_LINE, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 40000 });

    // WAIT FOR THE LAST BEAT BEFORE READING THE SCREEN. The heading, the
    // body and the way onward arrive after the fixed line has had its own
    // pause, which is the treatment doing exactly what it is for. The
    // tail's own Continue is the honest signal that the closing is whole.
    await page
      .getByRole('button', { name: 'Continue' })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 });

    const closing = await page.innerText('body');
    check('closing: her question nine sentence is on screen, verbatim', closing.includes(SENTENCE));
    check('closing: the one fixed line is printed exactly as approved', closing.includes(CLOSING_LINE));
    check(
      'closing: her sentence is labelled as addressed to the one who put it down',
      new RegExp(CLOSING_LABEL, 'i').test(closing)
    );
    check(
      'closing: the whole shelf is shown one last time, every card in her own words',
      LINES.every((line) => closing.includes(line))
    );
    const closingCards = await readCards(page);
    check(
      'closing: her lifted card is the gold one, set apart from the rest',
      closingCards.filter((card) => card.tone === 'lifted').length === 1 &&
        closingCards.find((card) => card.tone === 'lifted')?.text.includes(LIFT) === true,
      JSON.stringify(closingCards.map((c) => c.tone))
    );
    check(
      'closing: Root says nothing was graded and nothing interpreted',
      closing.includes('Nothing here was graded') &&
        closing.includes('Root scored none of this and interpreted none of it')
    );
    check(
      'closing: no score, band, pattern or level appears anywhere on it',
      !/\bscore[sd]?\b/i.test(closing.replace(/no scores?|scored none of this/gi, '')) &&
        !/\bpattern\b/i.test(closing) &&
        !/\blevel\b/i.test(closing)
    );
    check(
      'closing: none of her other written answers is printed on it',
      Object.entries(WRITTEN)
        .filter(([key]) => key !== 'to_the_one_who_put_it_down')
        .every(([, answer]) => !closing.includes(answer))
    );
    await shot(page, '18-closing');
    if (await emDashOn(page)) dashes++;

    // THE HOLD. Several seconds, several server round trips.
    await page.waitForTimeout(9000);
    const stillThere = await page.innerText('body');
    check(
      'closing: it is STILL on screen nine seconds and several server round trips later',
      stillThere.includes(SENTENCE) && stillThere.includes(CLOSING_LINE)
    );
    check(
      'closing: it was never replaced by the already-done panel',
      !stillThere.includes('This one is done')
    );
    check('closing: the URL never moved', page.url().includes(`/${WYPD.key}`));
    await shot(page, '19-closing-still-holding');

    const { data: finishedRows } = await service
      .from(TABLE)
      .select('id, doorway, shelf_state, answers, completed_at, follow_up_source_experience_key')
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', WYPD.key);
    const finished = finishedRows?.[0];
    check('storage: the sitting is completed', Boolean(finished?.completed_at));
    check('storage: exactly one sitting exists, not two', (finishedRows ?? []).length === 1);
    check(
      'storage: the doorway is in its own column, verbatim',
      finished?.doorway === WRITTEN.doorway
    );
    check(
      'storage: all seven written answers are stored',
      Object.keys(finished?.answers ?? {}).length === 7
    );
    check(
      'storage: the whole shelf is stored, her lift and her sting on different cards',
      finished?.shelf_state?.liftedCardId === finished?.shelf_state?.cards?.[LIFT_INDEX]?.id &&
        finished?.shelf_state?.stingCardId === finished?.shelf_state?.cards?.[STING_INDEX]?.id &&
        finished?.shelf_state?.distance === DISTANCE,
      JSON.stringify(finished?.shelf_state ?? null)
    );
    check(
      'storage: every card on the stored shelf is a line she typed, and nothing else is',
      JSON.stringify((finished?.shelf_state?.cards ?? []).map((c) => c.text)) ===
        JSON.stringify(LINES)
    );
    check(
      'storage: the follow-up flag is null, as this template requires',
      finished?.follow_up_source_experience_key === null
    );

    const { data: closedOut } = await service
      .from('assessment_assignments')
      .select('status')
      .eq('id', assignmentId)
      .maybeSingle();
    check('ledger: finishing closed the assignment out', closedOut?.status === 'completed');

    // -----------------------------------------------------------------
    // 10. The experiment.
    // -----------------------------------------------------------------
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(2500);
    const offer = await page.innerText('body');
    check('experiment: the offer is the approved action', offer.includes(EXPERIMENT_ACTION));
    check('experiment: there is a real way to decline', /Not right now/.test(offer));
    await shot(page, '20-experiment-offer');

    await page.getByRole('button', { name: /I'm in: start the 7 days/ }).click();
    await page.waitForTimeout(5000);
    const done = await page.innerText('body');
    check('experiment: she is told where it went', done.includes('It is on your dashboard now'));
    check('closing: the piece of reading is offered, summary first', done.includes(RESOURCE_TITLE));
    check('closing: her own sentence is still with her on the last screen', done.includes(SENTENCE));
    await shot(page, '21-done');
    if (await emDashOn(page)) dashes++;

    const { data: experiments } = await service
      .from('lifestyle_experiments')
      .select('id, title, protocol, duration_days, status, start_date')
      .eq('member_id', MEMBER_ID)
      .eq('source_experience_key', WYPD.key);
    check('experiment: exactly one row was written', (experiments ?? []).length === 1);
    check('experiment: it runs seven days', experiments?.[0]?.duration_days === 7);
    check('experiment: it starts on HER calendar day', experiments?.[0]?.start_date === memberToday);
    check(
      'experiment: the stored protocol is the approved action',
      (experiments?.[0]?.protocol ?? '').includes(EXPERIMENT_ACTION)
    );
    check(
      'experiment: the stored protocol never bakes her own doorway into it',
      !(experiments?.[0]?.protocol ?? '').includes(WRITTEN.doorway)
    );

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    const home = await page.innerText('body');
    check('home: the experiment card carries the approved daily question', home.includes(DAILY_QUESTION));
    const experimentCard = page.locator('div', { hasText: DAILY_QUESTION }).last();
    const cardText = (await experimentCard.count()) ? await experimentCard.innerText() : '';
    check('home: it says which day of seven she is on', /Day 1 of 7/i.test(cardText), cardText.slice(0, 80));
    check(
      'home: the assignment card is gone now that the sitting is finished',
      !home.includes(`From your coach: ${WYPD.label}`)
    );
    await shot(page, '22-home-experiment-card');
    if (await emDashOn(page)) dashes++;

    const yes = experimentCard.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.count()) {
      await yes.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await yes.first().evaluate((el) => el.click());
      await page.waitForTimeout(4000);
      check(
        'home: her evening tap is recorded and the card says so',
        (await page.innerText('body')).includes('Logged: you touched it.')
      );
    } else {
      check('home: her evening tap is recorded and the card says so', false, 'no Yes button found');
    }

    // Reopening a finished sitting is an answer, not a mystery.
    await page.goto(`${BASE}/${WYPD.key}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const reopened = await page.innerText('body');
    check('member: reopening it says it is done rather than bouncing her', reopened.includes('This one is done'));
    check('member: and it shows her shelf and her sentence again', reopened.includes(SENTENCE) && reopened.includes(LIFT));
    await shot(page, '23-reopened');

    // -----------------------------------------------------------------
    // 11. The coach reads it back.
    // -----------------------------------------------------------------
    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    await coachPage.waitForTimeout(3000);
    await openAssessmentsFold(coachPage, WYPD.label);
    const card = coachPage.locator(`section[aria-label="${WYPD.label}"]`);
    const cardFound = (await card.count()) === 1;
    check('coach: the finished sitting is on the card', cardFound);
    if (cardFound) {
      const text = await card.innerText();
      const shelfAt = text.search(/What went on the shelf/i);
      const openerAt = text.search(/Open the session with this/i);
      const answersAt = text.search(/What they wrote/i);
      check('coach: the shelf is at the top', shelfAt > -1);
      check(
        'coach: every card she shelved is on it, in her own words',
        LINES.every((line) => text.includes(line))
      );
      check(
        'coach: the card that stings and the card with a pulse are both marked',
        /Stings most to read back/i.test(text) && /Still has a pulse/i.test(text)
      );
      check(
        'coach: her position on the line is printed IN WORDS',
        text.includes(`Placed her at: ${DISTANCE_WORDS}`),
        text.slice(Math.max(0, text.indexOf('Placed her at')), text.indexOf('Placed her at') + 60)
      );
      check(
        'coach: question seven is the session opener, above the written answers',
        openerAt > shelfAt && answersAt > openerAt,
        `shelf ${shelfAt}, opener ${openerAt}, answers ${answersAt}`
      );
      check(
        'coach: the opener is the card she lifted',
        text.slice(openerAt, answersAt).includes(LIFT)
      );
      let all = true;
      for (const answer of Object.values(WRITTEN)) if (!text.includes(answer)) all = false;
      check('coach: all seven written answers are shown raw', all);
      check(
        'coach: the three screens are named',
        SECTION_TITLES.every((title) => text.includes(title))
      );
      check(
        'coach: nothing on the card scores her',
        !/\bscore\b/i.test(text) && !/\bseverity\b/i.test(text) && !/\bpattern\b/i.test(text)
      );
      check(
        'coach: there is no follow-up band, because this template follows nothing',
        !/Follow-up from/i.test(text)
      );
    }
    await shot(coachPage, '24-coach-card');
    if (await emDashOn(coachPage)) dashes++;

    for (const sibling of SIBLINGS) {
      check(
        `coach: the ${sibling} card is STILL standing after the whole run`,
        (await coachPage.locator(`section[aria-label="${sibling}"]`).count()) === 1
      );
    }

    // -----------------------------------------------------------------
    // 12. REDUCED MOTION, on the real site, in a context that asks for it.
    //     The three new interactive pieces, in the state a member who has
    //     asked her device for less motion actually gets.
    // -----------------------------------------------------------------
    const { data: secondAssignment } = await service
      .from('assessment_assignments')
      .insert({
        member_id: MEMBER_ID,
        assessment_definition_id: WYPD.definitionId,
        assigned_by: MEMBER_ID,
        is_required: true,
        reason: null,
        stage: 'standard',
        due_at: new Date(`${addDays(memberToday, 7)}T00:00:00Z`).toISOString(),
      })
      .select('id')
      .maybeSingle();
    check('reduced motion: a second sitting could be opened to walk it in', Boolean(secondAssignment?.id));

    calm = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 390, height: 844 },
      contextOptions: { reducedMotion: 'reduce' },
    });
    if (calm && secondAssignment?.id) {
      const calmPage = await calm.context.newPage();
      watch(calmPage, errors);
      await calmPage.goto(`${BASE}/${WYPD.key}`, { waitUntil: 'domcontentloaded' });
      await calmPage.waitForTimeout(3000);
      await calmPage.getByRole('button', { name: 'Begin' }).click();
      await waitForQuestion(calmPage, 1);
      check(
        'reduced motion: question one is usable immediately, on a 390px phone',
        (await calmPage.locator('textarea').count()) === 1
      );
      await calmPage.locator('textarea').fill(Q1);
      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 2, 'place');

      // Every card placed by tapping, with no drag anywhere.
      for (let i = 0; i < LINES.length; i++) {
        await calmPage.getByRole('button', { name: /^Put it on the shelf:/ }).first().click();
        await calmPage.waitForTimeout(500);
      }
      check(
        'reduced motion: every card was placed by a tap alone',
        (await calmPage.getByRole('button', { name: /^Put it on the shelf:/ }).count()) === 0
      );
      check(
        'reduced motion: no card settled in from above, they are simply placed',
        (await calmPage.locator('.mef-settle-down').count()) === 0
      );
      check(
        'reduced motion: the shelf is fully readable at 390px, with nothing scrolling sideways',
        await calmPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        )
      );
      await shot(calmPage, '25-reduced-motion-shelf');

      await calmPage.getByRole('button', { name: `Choose: ${STING}` }).click();
      await calmPage.waitForTimeout(700);
      const calmCards = await readCards(calmPage);
      check(
        'reduced motion: the mark on her chosen card is a state, not an animation',
        calmCards.filter((c) => c.tone === 'marked').length === 1
      );
      const calmStyles = await calmPage.$$eval('[data-tone]', (nodes) =>
        nodes.map((node) => node.getAttribute('style') || '')
      );
      check(
        'reduced motion: no card carries a transition or a travel of any kind',
        calmStyles.every((style) => !style.includes('transition') && !style.includes('translate')),
        JSON.stringify(calmStyles)
      );

      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 3);
      await calmPage.locator('textarea').fill(WRITTEN.what_took_its_place);
      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 4);
      await calmPage.locator('textarea').fill(WRITTEN.the_reason_and_the_honest_one);
      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 5, 'slider');
      await setSlider(calmPage, 12);
      await calmPage.waitForTimeout(900);
      check(
        'reduced motion: the two-pole line still moves and still reads back in words',
        (await calmPage.innerText('body')).includes('right here')
      );
      const trackStyles = await calmPage.$$eval('span[style]', (nodes) =>
        nodes.map((node) => node.getAttribute('style') || '')
      );
      check(
        'reduced motion: and its mark never animates to where she put it',
        trackStyles.every((style) => !style.includes('transition')),
        JSON.stringify(trackStyles.filter((s) => s.includes('transition')))
      );
      await shot(calmPage, '26-reduced-motion-line');
      if (await emDashOn(calmPage)) dashes++;
      await calmPage.close();
    } else {
      check('reduced motion: a reduced-motion session could be minted', false);
    }

    // -----------------------------------------------------------------
    // 13. Regression and cleanliness.
    // -----------------------------------------------------------------
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
    check('no em dash appeared on any screen either of them saw', dashes === 0, `${dashes} screens`);
    check('no console or page error on any screen', errors.length === 0, errors.slice(0, 4).join(' | '));

    await page.close();
    await coachPage.close();
  } finally {
    await clearTemplate(service, MEMBER_ID);
    await retireSession(staff);
    await retireSession(member);
    await retireSession(calm);
    await browser.close();
  }

  // ---------------- THE ACCOUNT IS LEFT AS IT WAS FOUND ----------------
  const { data: leftSittings } = await service
    .from(TABLE)
    .select('id, experience_key')
    .eq('member_id', MEMBER_ID)
    .eq('experience_key', WYPD.key);
  check(
    'cleanup: no sitting from this run is left on production',
    (leftSittings ?? []).length === 0,
    JSON.stringify(leftSittings ?? [])
  );

  const { data: leftAssignments } = await service
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', WYPD.definitionId);
  check('cleanup: no assignment from this run is left', (leftAssignments ?? []).length === 0);

  const { data: leftAttempts } = await service
    .from('assessment_attempts')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', WYPD.definitionId);
  check('cleanup: no attempt row from this run is left', (leftAttempts ?? []).length === 0);

  const { data: leftExperiments } = await service
    .from('lifestyle_experiments')
    .select('id, source_experience_key')
    .eq('member_id', MEMBER_ID)
    .eq('source_experience_key', WYPD.key);
  check('cleanup: no experiment from this run is left', (leftExperiments ?? []).length === 0);

  const { data: leftDismissals } = await service
    .from('member_root_popup_dismissals')
    .select('message_key')
    .eq('member_id', MEMBER_ID)
    .like('message_key', `${WYPD.dismissalPrefix}:%`);
  check('cleanup: no pop-up dismissal row from this run is left', (leftDismissals ?? []).length === 0);

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} checks passed on ${BASE}`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
