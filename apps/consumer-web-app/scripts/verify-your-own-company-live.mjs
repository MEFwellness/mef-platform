#!/usr/bin/env node
/**
 * Your Own Company, driven end to end on production.
 *
 * TWO THINGS ARE BEING PROVED HERE AND THEY ARE DIFFERENT KINDS OF THING.
 *
 *   THE TEMPLATE. The seventh Happiness deep-dive, on the same machinery as
 *     the six beside it: a coach assigns it from its own real button, the
 *     member is knocked once, one delivery receipt is written though two
 *     surfaces fire the tracker, the sitting is answered through the real
 *     screens, save and resume survives a genuinely new page, the closing
 *     holds and prints two of her own sentences under one fixed line, the
 *     experiment starts and its dashboard card carries the approved daily
 *     question, and the coach reads the whole thing back.
 *
 *   THE ROTATION. Template six's signature was the shelf, the drag and the
 *     two-pole line. This one uses NONE of those, and that half cannot be
 *     proved by reading source. So this run makes REAL instinct picks on
 *     three this-or-that questions, answers a five phrase round one pair at
 *     a time, reads the tally back and checks the ARITHMETIC against the
 *     answers it actually gave, taps one of her own three lines and checks
 *     that question eight quotes that line CHARACTER FOR CHARACTER.
 *
 * AND IT PROVES THE PICKS SURVIVE A CLOSED TAB, which is the part a member
 * would actually lose. The tab is closed mid-sitting and a brand new page is
 * opened, and the run then checks the picks, the whole rapid round, the
 * tally and every written answer all came back.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in a
 * `finally` whether the run passes or not. Every delete is scoped by
 * experience_key, because seven templates now share one table and this run
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
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-your-own-company';
const TABLE = 'member_happiness_deep_dive_sessions';

const YOC = {
  key: 'your-own-company',
  label: 'Your Own Company',
  definitionId: 'b7d2ef85-3c61-4a09-8d47-5f2b6e1c94a0',
  dismissalPrefix: 'your_own_company',
};

/** The six templates that must still be standing before and after the run. */
const SIBLINGS = [
  'Owning Your Value',
  'Where Your Joy Lives',
  'The Giving Ledger',
  'The Weight of Yes',
  'Being Seen',
  'What You Put Down',
];
const SIBLING_KEYS = [
  'owning-your-value',
  'where-your-joy-lives',
  'the-giving-ledger',
  'the-weight-of-yes',
  'being-seen',
  'what-you-put-down',
];

const SECTION_TITLES = ['The Voice', 'The Double Standard', 'Better Company'];
const CLOSING_LINE = 'You wrote both. Only one of them is true.';
const CLOSING_FIRST_LABEL = 'The voice you had.';
const CLOSING_SECOND_LABEL = 'The voice you are building.';
const DAILY_QUESTION =
  'Did you catch the voice today? Catching it counts even if the rewrite did not come.';
const EXPERIMENT_ACTION =
  'Catch the voice once a day and answer it with your rewrite, out loud or in your head.';
const RESOURCE_TITLE = 'You Live With Your Voice';
const RAPID_QUESTION = 'Would you say this to a friend?';

/** The five phrases of the round, in the order the template asks them. */
const PHRASES = [
  'You should have known better',
  'You always do this',
  'Everyone else manages',
  'You can rest when it is done',
  'Who else would put up with you',
];

/**
 * How she answers the round: Yes on exactly one of the five, Never on the
 * other four. Chosen so the tally has a right answer that is not the
 * trivial one, and so a component that counted the wrong side or the wrong
 * total would be caught rather than accidentally agreed with.
 */
const RAPID_ANSWERS = ['Never', 'Never', 'Yes', 'Never', 'Never'];
const EXPECTED_TALLY = 'You said Never 4 times out of 5.';

/** The three cards she picks, by the words actually printed on them. */
const PICKS = {
  first_inner_sentence: 'What is wrong with you',
  whose_standards: 'Someone I know',
  same_mistake_two_sentences: 'Let us figure it out',
};

/** What Root asks first on each of the three this-or-that questions. */
const LEAD_PROMPTS = {
  first_inner_sentence: 'When I make a mistake, my first inner sentence starts with...',
  whose_standards: 'The voice sounds most like...',
  same_mistake_two_sentences: 'If my closest friend made my most recent mistake, I would say...',
};

/** Her question three list. Three distinctive lines, so finding one proves it is hers. */
const LINES = [
  'you should have handled that better and you know it',
  'nobody is going to say it but they can all see it',
  'you are going to run out of time and that will be on you',
];
const Q3 = LINES.join('\n');
/** The line she says cuts deepest. Deliberately not the first, so a positional bug shows. */
const DEEPEST_INDEX = 1;
const DEEPEST = LINES[DEEPEST_INDEX];

/** The nine written answers, by question key. */
const WRITTEN = {
  first_inner_sentence:
    'It said "seriously, again?" and then it said my full name, the way it gets said when somebody is about to be disappointed out loud.',
  whose_standards:
    'My aunt, I think. Not her words exactly, her timing. She learned it from a job that measured her in minutes and she never got to put it down.',
  greatest_hits: Q3,
  same_mistake_two_sentences:
    'To myself I said: this is what you always do, you leave things until they are emergencies. Side by side they are not two levels of kind. They are two different questions.',
  what_the_harshness_protects:
    'From being surprised. If I say it first then nobody else gets to, and I am afraid that going easy means the standard drops and nobody tells me until it is far too late.',
  the_roommate:
    'I would have moved out in a month. I would have told my friends about her. I would have described her as somebody who narrates your worst day back to you in the present tense and calls it honesty.',
  the_kindest_voice:
    'A teacher called Mr Adeyemi, when I was fourteen. Low, unhurried, and he never once sounded surprised that I could do something. I believed him because he said the same thing when nobody else was in the room.',
  the_rewrite:
    'That mattered and you left it late, and I know why: the week was already full. Next time we start it smaller.',
  the_company_you_are_building:
    'Someone who says the true part out loud and then stops talking. Warm, and not soft about it. I want to be the person in the room who is actually on my side.',
};
const REWRITE = WRITTEN.the_rewrite;

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

/** Removes only this template's rows. Seven templates share this table. */
async function clearTemplate(service, memberId) {
  await service.from(TABLE).delete().eq('member_id', memberId).eq('experience_key', YOC.key);
  const { data: experiments } = await service
    .from('lifestyle_experiments')
    .select('id')
    .eq('member_id', memberId)
    .eq('source_experience_key', YOC.key);
  for (const row of experiments ?? []) {
    await service.from('cvs_experiment_daily_logs').delete().eq('experiment_id', row.id);
  }
  await service
    .from('lifestyle_experiments')
    .delete()
    .eq('member_id', memberId)
    .eq('source_experience_key', YOC.key);
  const { data: rows } = await service
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', YOC.definitionId);
  for (const row of rows ?? []) {
    await service.from('member_assignment_deliveries').delete().eq('assignment_id', row.id);
  }
  await service
    .from('assessment_assignments')
    .delete()
    .eq('member_id', memberId)
    .eq('assessment_definition_id', YOC.definitionId);
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', memberId)
    .eq('assessment_definition_id', YOC.definitionId);
  await service
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', memberId)
    .like('message_key', `${YOC.dismissalPrefix}:%`);
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
 * is not always a textarea: five of the nine open with something she taps.
 */
async function waitForQuestion(page, number, control = 'textarea', timeout = 60000) {
  await page
    .getByText(new RegExp(`Question ${number} of 9`, 'i'))
    .first()
    .waitFor({ state: 'visible', timeout });
  if (control === 'textarea') {
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout });
  } else if (control === 'pair') {
    await page.locator('[role="radio"]').first().waitFor({ state: 'visible', timeout });
  } else if (control === 'choose') {
    await page
      .getByRole('button', { name: /^Choose:/ })
      .first()
      .waitFor({ state: 'visible', timeout });
  }
}

/** Reads the two cards of the pair currently on screen. */
async function readPair(page) {
  return page.$$eval('[role="radio"]', (nodes) =>
    nodes.map((node) => ({
      side: node.getAttribute('data-instinct-side'),
      chosen: node.getAttribute('aria-checked') === 'true',
      text: (node.textContent || '').trim(),
    }))
  );
}

/** Reads every card carrying her own words, with the state it is drawn in. */
async function readCards(page) {
  return page.$$eval('[data-tone]', (nodes) =>
    nodes.map((node) => ({
      tone: node.getAttribute('data-tone'),
      text: (node.textContent || '').trim(),
    }))
  );
}

/** The tally sentence the round is currently printing, or null. */
async function readTally(page) {
  const node = page.locator('[data-rapid-tally="true"]');
  return (await node.count()) ? (await node.first().innerText()).trim() : null;
}

/** Answers the whole five phrase round, one pair at a time, by tapping. */
async function answerRound(page, answers) {
  const seen = [];
  for (let index = 0; index < answers.length; index += 1) {
    const body = await page.innerText('body');
    const phrase = PHRASES.find((text) => body.includes(text));
    seen.push(phrase ?? '(none on screen)');
    await page.getByRole('radio', { name: answers[index], exact: true }).first().click();
    await page.waitForTimeout(900);
  }
  return seen;
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

  // The account should be carrying no running experiment at all before this
  // run, because the two active cap would otherwise refuse the one this
  // sitting offers. Asserted rather than assumed.
  const { data: experimentsBefore } = await service
    .from('lifestyle_experiments')
    .select('id, title, source_experience_key, status')
    .eq('member_id', MEMBER_ID);
  check(
    'fixture: the account carries no leftover experiment before the run',
    (experimentsBefore ?? []).length === 0,
    JSON.stringify(experimentsBefore ?? [])
  );

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
    await openAssessmentsFold(coachPage, YOC.label);

    const panel = coachPage.locator(`section[aria-label="${YOC.label}"]`);
    const panelFound = (await panel.count()) === 1;
    check('coach: the Your Own Company card is on the client screen', panelFound);
    if (!panelFound) throw new Error('No Your Own Company panel on the coach screen.');

    // Migration 218 dropped and recreated a policy all seven templates
    // depend on, so the six beside it are checked before anything moves.
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

    await panel.getByRole('button', { name: new RegExp(`Assign ${YOC.label}`) }).click();
    await coachPage.waitForTimeout(3500);

    const { data: assignments } = await service
      .from('assessment_assignments')
      .select('id, status, due_at')
      .eq('member_id', MEMBER_ID)
      .eq('assessment_definition_id', YOC.definitionId)
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
    await openAssessmentsFold(coachPage, YOC.label);
    const sentLine = await coachPage.locator(`section[aria-label="${YOC.label}"]`).innerText();
    check(
      'coach: the card now prints a sent-and-not-yet-seen sentence',
      /Sent/.test(sentLine),
      sentLine.slice(0, 140)
    );
    check('coach: nothing on it says Overdue on the day it was sent', !/Overdue/.test(sentLine));
    check(
      "coach: the /detail assignment list names it, and does not call it 'Assessment'",
      new RegExp(YOC.label).test(await coachPage.innerText('body'))
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
        'Your coach asked Root to sit down with you on this one. It is called Your Own Company. Nine questions about the voice you live with.'
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
      homeText.includes(`From your coach: ${YOC.label}`) && homeText.includes(`Start ${YOC.label}`)
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
    // 3. The intro, and question one: her first instinct pick.
    // -----------------------------------------------------------------
    await page.goto(`${BASE}/${YOC.key}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const introText = await page.innerText('body');
    check(
      'member: the intro is the approved copy',
      introText.includes('No scores, no right answers') &&
        introText.includes(
          'Root has nine questions about the voice you live with: how you speak to yourself when no one else is around'
        ) &&
        introText.includes('Some questions ask for your first instinct. Give it honestly.') &&
        introText.includes('Fifteen to twenty minutes, somewhere quiet')
    );
    await shot(page, '05-intro');

    await page.getByRole('button', { name: 'Begin' }).click();
    await waitForQuestion(page, 1, 'pair');
    const q1Text = await page.innerText('body');
    check(
      'member: question one is the first instinct pair, under The Voice',
      /Question 1 of 9/i.test(q1Text) &&
        new RegExp(SECTION_TITLES[0], 'i').test(q1Text) &&
        q1Text.includes(LEAD_PROMPTS.first_inner_sentence)
    );
    const q1Pair = await readPair(page);
    check(
      'pair: exactly two cards, carrying the approved words, neither one chosen yet',
      q1Pair.length === 2 &&
        q1Pair[0]?.text === 'What is wrong with you' &&
        q1Pair[1]?.text === 'Okay, what happened?' &&
        q1Pair.every((card) => !card.chosen),
      JSON.stringify(q1Pair)
    );
    check(
      'pair: nothing is written yet, because the writing box does not exist until she picks',
      (await page.locator('textarea').count()) === 0
    );
    check(
      'pair: she is told a first instinct has no right answer',
      q1Text.includes('First instinct. There is no right one.')
    );
    await shot(page, '06-question-1-pair');

    await page
      .getByRole('radio', { name: PICKS.first_inner_sentence, exact: true })
      .first()
      .click();
    await page.waitForTimeout(1200);
    const q1Picked = await readPair(page);
    check(
      'pair: her tap chose exactly one card, and it is announced rather than only coloured',
      q1Picked.filter((card) => card.chosen).length === 1 &&
        q1Picked.find((card) => card.chosen)?.text === PICKS.first_inner_sentence,
      JSON.stringify(q1Picked)
    );

    // The written half arrives only once she has committed.
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
    const q1After = await page.innerText('body');
    check(
      'pair: only once she has picked does the written half of the question arrive',
      q1After.includes(
        'Write the actual sentence your inner voice said the last time you dropped something you were carrying.'
      )
    );
    await shot(page, '07-question-1-written-half');

    await page.locator('textarea').fill(WRITTEN.first_inner_sentence);
    await page.getByRole('button', { name: 'Continue' }).click();

    // -----------------------------------------------------------------
    // 4. Question two, and question three's list.
    // -----------------------------------------------------------------
    await waitForQuestion(page, 2, 'pair');
    check(
      'member: question two asks what the voice sounds most like',
      (await page.innerText('body')).includes(LEAD_PROMPTS.whose_standards)
    );
    await page.getByRole('radio', { name: PICKS.whose_standards, exact: true }).first().click();
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('textarea').fill(WRITTEN.whose_standards);
    await page.getByRole('button', { name: 'Continue' }).click();

    await waitForQuestion(page, 3);
    const q3Text = await page.innerText('body');
    check(
      'member: question three asks for the greatest hits, one per line',
      q3Text.includes('Write down three things the voice says on repeat')
    );
    check('member: the screen says her writing is saved', q3Text.includes('Saved. You can close this and come back to it.'));
    await page.locator('textarea').fill(Q3);
    await shot(page, '08-question-3-list');
    await page.getByRole('button', { name: 'Continue' }).click();

    // -----------------------------------------------------------------
    // 5. Screen two: the double standard, and the rapid round.
    // -----------------------------------------------------------------
    await waitForQuestion(page, 4, 'pair');
    check(
      'member: she crossed into The Double Standard',
      new RegExp(SECTION_TITLES[1], 'i').test(await page.innerText('body'))
    );
    check(
      'member: question four asks what she would say to her closest friend',
      (await page.innerText('body')).includes(LEAD_PROMPTS.same_mistake_two_sentences)
    );
    await page
      .getByRole('radio', { name: PICKS.same_mistake_two_sentences, exact: true })
      .first()
      .click();
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('textarea').fill(WRITTEN.same_mistake_two_sentences);
    await page.getByRole('button', { name: 'Continue' }).click();

    await waitForQuestion(page, 5);
    await page.locator('textarea').fill(WRITTEN.what_the_harshness_protects);
    await page.getByRole('button', { name: 'Continue' }).click();

    await waitForQuestion(page, 6, 'pair');
    const roundStart = await page.innerText('body');
    check(
      'round: it asks the standing question, and says what she is about to do',
      roundStart.includes(RAPID_QUESTION) &&
        roundStart.includes('Five in a row. Answer each one without thinking about it.')
    );
    check(
      'round: only the FIRST phrase is on screen, one pair at a time',
      roundStart.includes(PHRASES[0]) &&
        PHRASES.slice(1).every((phrase) => !roundStart.includes(phrase)),
      roundStart.slice(0, 160)
    );
    check('round: it says where she is', /\b1 of 5\b/i.test(roundStart));
    check(
      'round: nothing is written yet, and no tally is shown before she has answered',
      (await page.locator('textarea').count()) === 0 && (await readTally(page)) === null
    );
    await shot(page, '09-round-first-pair');

    const phrasesSeen = await answerRound(page, RAPID_ANSWERS);
    check(
      'round: all five phrases were asked, in the approved order, one at a time',
      JSON.stringify(phrasesSeen) === JSON.stringify(PHRASES),
      JSON.stringify(phrasesSeen)
    );

    await page.locator('[data-rapid-tally="true"]').first().waitFor({ state: 'visible', timeout: 30000 });
    const tally = await readTally(page);
    check(
      'round: the tally is her own count, and the arithmetic matches the answers she gave',
      tally === EXPECTED_TALLY,
      `${tally} vs ${EXPECTED_TALLY}`
    );
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
    check(
      'round: only after the tally does the written question arrive',
      (await page.innerText('body')).includes(
        'Write about living with a roommate who talks to you like that.'
      )
    );
    await shot(page, '10-round-tally');
    if (await emDashOn(page)) dashes++;

    await page.locator('textarea').fill(WRITTEN.the_roommate);
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 7);

    // -----------------------------------------------------------------
    // 6. Save and resume, across a genuinely closed tab.
    // -----------------------------------------------------------------
    const { data: draftRows } = await service
      .from(TABLE)
      .select(
        'id, answers, instinct_state, completed_at, rewritten_line, experience_key, follow_up_source_experience_key'
      )
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', YOC.key);
    check(
      'draft: one row exists, unfinished',
      (draftRows ?? []).length === 1 && !draftRows?.[0]?.completed_at
    );
    const storedState = draftRows?.[0]?.instinct_state ?? null;
    check(
      'draft: her three picks are stored structured, under this template’s own question keys',
      storedState?.picks?.first_inner_sentence === 'a' &&
        storedState?.picks?.whose_standards === 'a' &&
        storedState?.picks?.same_mistake_two_sentences === 'b',
      JSON.stringify(storedState?.picks ?? null)
    );
    check(
      'draft: all five of the round’s answers are stored, four of them Never',
      Object.keys(storedState?.rapid ?? {}).length === 5 &&
        Object.values(storedState?.rapid ?? {}).filter((side) => side === 'b').length === 4,
      JSON.stringify(storedState?.rapid ?? null)
    );
    check(
      'draft: her three lines are stored as lines, in her own words',
      Array.isArray(storedState?.lines) &&
        JSON.stringify(storedState.lines.map((line) => line.text)) === JSON.stringify(LINES),
      JSON.stringify(storedState?.lines ?? null)
    );
    check('draft: nothing has been named as cutting deepest yet', storedState?.deepestCutLineId === null);
    check('draft: the rewrite column is still empty', draftRows?.[0]?.rewritten_line === null);
    check(
      'draft: it is stored under this template, not one of the six beside it',
      draftRows?.[0]?.experience_key === YOC.key
    );
    check(
      'draft: the follow-up flag is null, because this template has no follow-up',
      draftRows?.[0]?.follow_up_source_experience_key === null
    );
    check(
      'draft: no tally number is stored beside the answers it counts',
      !JSON.stringify(storedState ?? {}).includes('tally')
    );

    // The tab is genuinely closed. Nothing survives in memory.
    await page.close();
    page = await member.context.newPage();
    watch(page, errors);
    await page.goto(`${BASE}/${YOC.key}`, { waitUntil: 'domcontentloaded' });
    await waitForQuestion(page, 7);
    const resumed = await page.innerText('body');
    check('resume: a brand new tab lands her back on question seven', /Question 7 of 9/i.test(resumed));
    check('resume: it is not the intro again', !resumed.includes('Fifteen to twenty minutes'));
    await shot(page, '11-resumed');

    // Back to the round, to read it as it came back.
    await page.getByRole('button', { name: 'Back' }).click();
    await waitForQuestion(page, 6);
    await page.waitForTimeout(1200);
    check(
      'resume: the whole round came back finished, with her own count already on it',
      (await readTally(page)) === EXPECTED_TALLY,
      String(await readTally(page))
    );
    check(
      'resume: and its written half came back with it',
      (await page.locator('textarea').inputValue()) === WRITTEN.the_roommate
    );
    check(
      'resume: no phrase is asked again, because she answered all five',
      (await page.locator('[role="radio"]').count()) === 0
    );
    await shot(page, '12-resumed-round');

    // Back to question four, to read the pick as it came back.
    await page.getByRole('button', { name: 'Back' }).click();
    await waitForQuestion(page, 5);
    await page.getByRole('button', { name: 'Back' }).click();
    await waitForQuestion(page, 4, 'pair');
    await page.waitForTimeout(1000);
    const resumedPair = await readPair(page);
    check(
      'resume: her instinct pick came back on the card she actually tapped',
      resumedPair.filter((card) => card.chosen).length === 1 &&
        resumedPair.find((card) => card.chosen)?.text === PICKS.same_mistake_two_sentences,
      JSON.stringify(resumedPair)
    );
    check(
      'resume: and its written half came back with it',
      (await page.locator('textarea').inputValue()) === WRITTEN.same_mistake_two_sentences
    );
    if (await emDashOn(page)) dashes++;

    // Forward again to where she was.
    for (const n of [5, 6, 7]) {
      await page.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(page, n);
    }

    // -----------------------------------------------------------------
    // 7. Screen three: her own three lines, and the rewrite.
    // -----------------------------------------------------------------
    check(
      'member: she crossed into Better Company',
      new RegExp(SECTION_TITLES[2], 'i').test(await page.innerText('body'))
    );
    await page.locator('textarea').fill(WRITTEN.the_kindest_voice);
    await page.getByRole('button', { name: 'Continue' }).click();

    await waitForQuestion(page, 8, 'choose');
    const q8 = await page.innerText('body');
    check(
      'member: question eight asks her to tap the one that cuts deepest',
      q8.includes('Which one cuts deepest? Tap it.')
    );
    const offered = await readCards(page);
    check(
      'question eight: her three question three lines became the three cards, in her order',
      JSON.stringify(offered.map((card) => card.text)) === JSON.stringify(LINES),
      JSON.stringify(offered.map((card) => card.text))
    );
    check(
      'question eight: nothing is written yet, because she has not named one',
      (await page.locator('textarea').count()) === 0
    );
    await shot(page, '13-question-8-lines');

    await page.getByRole('button', { name: `Choose: ${DEEPEST}` }).click();
    await page.waitForTimeout(1200);
    const marked = await readCards(page);
    check(
      'question eight: the line she named is the marked one, and it is the only marked one',
      marked.filter((card) => card.tone === 'marked').length === 1 &&
        marked.find((card) => card.tone === 'marked')?.text.includes(DEEPEST) === true,
      JSON.stringify(marked.map((card) => card.tone))
    );

    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
    const q8After = await page.innerText('body');
    check(
      'question eight quotes the line she named, character for character',
      q8After.includes(`You wrote: "${DEEPEST}"`),
      q8After.slice(Math.max(0, q8After.indexOf('You wrote')), q8After.indexOf('You wrote') + 160)
    );
    check(
      'question eight quotes ONLY the one she named, not one of the other two, inside its prompt',
      LINES.filter((_, index) => index !== DEEPEST_INDEX).every(
        (line) => !q8After.includes(`You wrote: "${line}"`)
      )
    );
    check(
      'question eight then asks the approved question',
      q8After.includes('Rewrite it the way that kind voice would say it. Keep the true part. Drop the cruelty.')
    );
    await shot(page, '14-question-8-quote');

    await page.locator('textarea').fill(REWRITE);
    await page.getByRole('button', { name: 'Continue' }).click();

    await waitForQuestion(page, 9);
    const q9 = await page.innerText('body');
    check(
      'member: question nine is the last one, under Better Company',
      /Question 9 of 9/i.test(q9) && new RegExp(SECTION_TITLES[2], 'i').test(q9)
    );
    if (await emDashOn(page)) dashes++;
    await shot(page, '15-question-9');

    // -----------------------------------------------------------------
    // 8. Finish, and the closing that holds.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(WRITTEN.the_company_you_are_building);
    await page.getByRole('button', { name: 'Finish' }).click();

    // The first sentence lands before the second, which is the fade
    // behaviour this closing is FOR. Checked here rather than described.
    await page
      .locator('[data-superseded="first"]')
      .first()
      .waitFor({ state: 'visible', timeout: 40000 });
    const secondYet = await page.locator('[data-superseded="second"]').count();
    check(
      'closing: the line she named arrives first, alone, before the rewrite',
      secondYet === 0,
      `${secondYet} rewrite blocks on screen`
    );

    await page
      .getByText(CLOSING_LINE, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 40000 });

    // WAIT FOR THE LAST BEAT BEFORE READING THE SCREEN. The heading, the
    // body and the way onward arrive after the fixed line has had its own
    // pause, which is the treatment doing exactly what it is for.
    await page
      .getByRole('button', { name: 'Continue' })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 });

    const closing = await page.innerText('body');
    check('closing: the line she named is on screen, verbatim', closing.includes(DEEPEST));
    check('closing: her rewrite is on screen, verbatim', closing.includes(REWRITE));
    check('closing: the one fixed line is printed exactly as approved', closing.includes(CLOSING_LINE));
    check(
      'closing: the two sentences are labelled as approved',
      new RegExp(CLOSING_FIRST_LABEL, 'i').test(closing) &&
        new RegExp(CLOSING_SECOND_LABEL, 'i').test(closing)
    );
    const opacities = await page.evaluate(() => {
      const first = document.querySelector('[data-superseded="first"]');
      const second = document.querySelector('[data-superseded="second"]');
      const read = (node) =>
        node ? Number(getComputedStyle(node.parentElement).opacity) : null;
      return { first: read(first), second: read(second) };
    });
    check(
      'closing: the old sentence faded BACK rather than being removed, and stays legible',
      opacities.first !== null && opacities.first > 0.2 && opacities.first < 0.8,
      JSON.stringify(opacities)
    );
    check(
      'closing: the rewrite settled brighter than the sentence it replaced',
      opacities.second !== null && opacities.second > (opacities.first ?? 1),
      JSON.stringify(opacities)
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
        .filter(([key]) => key !== 'the_rewrite' && key !== 'greatest_hits')
        .every(([, answer]) => !closing.includes(answer))
    );
    await shot(page, '16-closing');
    if (await emDashOn(page)) dashes++;

    // THE HOLD. Several seconds, several server round trips.
    await page.waitForTimeout(9000);
    const stillThere = await page.innerText('body');
    check(
      'closing: it is STILL on screen nine seconds and several server round trips later',
      stillThere.includes(REWRITE) && stillThere.includes(CLOSING_LINE)
    );
    check(
      'closing: it was never replaced by the already-done panel',
      !stillThere.includes('This one is done')
    );
    check('closing: the URL never moved', page.url().includes(`/${YOC.key}`));
    await shot(page, '17-closing-still-holding');

    const { data: finishedRows } = await service
      .from(TABLE)
      .select('id, rewritten_line, instinct_state, answers, completed_at, follow_up_source_experience_key')
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', YOC.key);
    const finished = finishedRows?.[0];
    check('storage: the sitting is completed', Boolean(finished?.completed_at));
    check('storage: exactly one sitting exists, not two', (finishedRows ?? []).length === 1);
    check(
      'storage: the rewrite is in its own column, verbatim',
      finished?.rewritten_line === REWRITE,
      String(finished?.rewritten_line ?? null)
    );
    check(
      'storage: all nine written answers are stored',
      Object.keys(finished?.answers ?? {}).length === 9
    );
    check(
      'storage: the deepest-cut pick points at the line she actually tapped',
      finished?.instinct_state?.deepestCutLineId ===
        finished?.instinct_state?.lines?.[DEEPEST_INDEX]?.id,
      JSON.stringify(finished?.instinct_state?.deepestCutLineId ?? null)
    );
    check(
      'storage: every line stored is a line she typed, and nothing else is',
      JSON.stringify((finished?.instinct_state?.lines ?? []).map((line) => line.text)) ===
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
    // 9. The experiment.
    // -----------------------------------------------------------------
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(2500);
    const offer = await page.innerText('body');
    check('experiment: the offer is the approved action', offer.includes(EXPERIMENT_ACTION));
    check('experiment: there is a real way to decline', /Not right now/.test(offer));
    await shot(page, '18-experiment-offer');

    // WAIT ON THE NEXT SCREEN'S OWN CONTROL, NEVER ON A CLOCK. Accepting the
    // experiment runs a Server Action that also revalidates Home, and Home
    // is a heavy page, so the response can take well over five seconds.
    await page.getByRole('button', { name: /I'm in: start the 7 days/ }).click();
    await page
      .getByRole('button', { name: 'Back to home' })
      .first()
      .waitFor({ state: 'visible', timeout: 60000 });
    const done = await page.innerText('body');
    check('experiment: she is told where it went', done.includes('It is on your dashboard now'));
    check('closing: the piece of reading is offered, summary first', done.includes(RESOURCE_TITLE));
    check('closing: her rewrite is still with her on the last screen', done.includes(REWRITE));
    await shot(page, '19-done');
    if (await emDashOn(page)) dashes++;

    const { data: experiments } = await service
      .from('lifestyle_experiments')
      .select('id, title, protocol, duration_days, status, start_date')
      .eq('member_id', MEMBER_ID)
      .eq('source_experience_key', YOC.key);
    check('experiment: exactly one row was written', (experiments ?? []).length === 1);
    check('experiment: it runs seven days', experiments?.[0]?.duration_days === 7);
    check('experiment: it starts on HER calendar day', experiments?.[0]?.start_date === memberToday);
    check(
      'experiment: the stored protocol is the approved action',
      (experiments?.[0]?.protocol ?? '').includes(EXPERIMENT_ACTION)
    );
    check(
      'experiment: the stored protocol never bakes her own rewrite into it',
      !(experiments?.[0]?.protocol ?? '').includes(REWRITE)
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
      !home.includes(`From your coach: ${YOC.label}`)
    );
    await shot(page, '20-home-experiment-card');
    if (await emDashOn(page)) dashes++;

    const yes = experimentCard.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.count()) {
      await yes.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await yes.first().evaluate((el) => el.click());
      await page.waitForTimeout(4000);
      check(
        'home: her evening tap is recorded and the card says so',
        (await page.innerText('body')).includes('Logged: you caught it.')
      );
    } else {
      check('home: her evening tap is recorded and the card says so', false, 'no Yes button found');
    }

    // Reopening a finished sitting is an answer, not a mystery.
    await page.goto(`${BASE}/${YOC.key}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const reopened = await page.innerText('body');
    check('member: reopening it says it is done rather than bouncing her', reopened.includes('This one is done'));
    check(
      'member: and it shows her two sentences again',
      reopened.includes(REWRITE) && reopened.includes(DEEPEST)
    );
    await shot(page, '21-reopened');

    // -----------------------------------------------------------------
    // 10. The coach reads it back.
    // -----------------------------------------------------------------
    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    await coachPage.waitForTimeout(3000);
    await openAssessmentsFold(coachPage, YOC.label);
    const card = coachPage.locator(`section[aria-label="${YOC.label}"]`);
    const cardFound = (await card.count()) === 1;
    check('coach: the finished sitting is on the card', cardFound);
    if (cardFound) {
      const text = await card.innerText();
      const linesAt = text.search(/What the voice says on repeat/i);
      const rewriteAt = text.search(/The line, and the rewrite/i);
      const picksAt = text.search(/First instincts/i);
      const answersAt = text.search(/What they wrote/i);
      check('coach: her three lines are at the top', linesAt > -1);
      check(
        'coach: every line she wrote is on it, in her own words',
        LINES.every((line) => text.includes(line))
      );
      check('coach: the one that cuts deepest is marked', /Cuts deepest/i.test(text));
      check(
        'coach: the rewrite is beside the original, both labelled',
        rewriteAt > linesAt &&
          /Original/i.test(text) &&
          /Rewritten/i.test(text) &&
          text.includes(REWRITE),
        `lines ${linesAt}, rewrite ${rewriteAt}`
      );
      check(
        'coach: her picks are shown with the questions they answer, so a pick reads as an answer',
        picksAt > rewriteAt &&
          Object.values(LEAD_PROMPTS).every((prompt) => text.includes(prompt)) &&
          Object.values(PICKS).every((pick) => text.includes(pick)),
        `picks ${picksAt}`
      );
      check(
        'coach: the round is shown with its own question and HER count, the same sentence she read',
        text.includes(RAPID_QUESTION) && text.includes(EXPECTED_TALLY),
        text.slice(Math.max(0, text.indexOf('You said')), text.indexOf('You said') + 60)
      );
      check(
        'coach: all nine written answers are shown raw, under the writing heading',
        answersAt > picksAt && Object.values(WRITTEN).every((answer) => text.includes(answer)),
        `answers ${answersAt}`
      );
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
    await shot(coachPage, '22-coach-card');
    if (await emDashOn(coachPage)) dashes++;

    for (const sibling of SIBLINGS) {
      check(
        `coach: the ${sibling} card is STILL standing after the whole run`,
        (await coachPage.locator(`section[aria-label="${sibling}"]`).count()) === 1
      );
    }

    // -----------------------------------------------------------------
    // 11. REDUCED MOTION, on the real site, in a context that asks for it.
    //     The two new interactive pieces, in the state a member who has
    //     asked her device for less motion actually gets.
    // -----------------------------------------------------------------
    const { data: secondAssignment } = await service
      .from('assessment_assignments')
      .insert({
        member_id: MEMBER_ID,
        assessment_definition_id: YOC.definitionId,
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
      await calmPage.goto(`${BASE}/${YOC.key}`, { waitUntil: 'domcontentloaded' });
      await calmPage.waitForTimeout(3000);
      await calmPage.getByRole('button', { name: 'Begin' }).click();
      await waitForQuestion(calmPage, 1, 'pair');
      check(
        'reduced motion: question one is usable immediately, on a 390px phone',
        (await calmPage.locator('[role="radio"]').count()) === 2
      );
      check(
        'reduced motion: the pair is fully readable at 390px, with nothing scrolling sideways',
        await calmPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        )
      );
      await calmPage
        .getByRole('radio', { name: PICKS.first_inner_sentence, exact: true })
        .first()
        .click();
      await calmPage.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
      const calmPair = await calmPage.$$eval('[role="radio"]', (nodes) =>
        nodes.map((node) => node.getAttribute('style') || '')
      );
      check(
        'reduced motion: a chosen card is a state, with no transition on it at all',
        calmPair.every((style) => !style.includes('transition')),
        JSON.stringify(calmPair)
      );
      check(
        'reduced motion: the written half is there the moment she picks, with nothing typed',
        (await calmPage.locator('textarea').count()) === 1
      );
      await shot(calmPage, '23-reduced-motion-pair');

      await calmPage.locator('textarea').fill(WRITTEN.first_inner_sentence);
      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 2, 'pair');
      await calmPage
        .getByRole('radio', { name: PICKS.whose_standards, exact: true })
        .first()
        .click();
      await calmPage.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
      await calmPage.locator('textarea').fill(WRITTEN.whose_standards);
      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 3);
      await calmPage.locator('textarea').fill(Q3);
      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 4, 'pair');
      await calmPage
        .getByRole('radio', { name: PICKS.same_mistake_two_sentences, exact: true })
        .first()
        .click();
      await calmPage.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
      await calmPage.locator('textarea').fill(WRITTEN.same_mistake_two_sentences);
      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 5);
      await calmPage.locator('textarea').fill(WRITTEN.what_the_harshness_protects);
      await calmPage.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(calmPage, 6, 'pair');

      await answerRound(calmPage, RAPID_ANSWERS);
      await calmPage
        .locator('[data-rapid-tally="true"]')
        .first()
        .waitFor({ state: 'visible', timeout: 30000 });
      check(
        'reduced motion: the round still counts correctly and shows her the same sentence',
        (await readTally(calmPage)) === EXPECTED_TALLY,
        String(await readTally(calmPage))
      );
      check(
        'reduced motion: nothing on the round fades in, it is simply there',
        (await calmPage.locator('.mef-fade-in').count()) === 0
      );
      await shot(calmPage, '24-reduced-motion-round');
      if (await emDashOn(calmPage)) dashes++;
      await calmPage.close();
    } else {
      check('reduced motion: a reduced-motion session could be minted', false);
    }

    // -----------------------------------------------------------------
    // 12. Regression and cleanliness.
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
    .eq('experience_key', YOC.key);
  check(
    'cleanup: no sitting from this run is left on production',
    (leftSittings ?? []).length === 0,
    JSON.stringify(leftSittings ?? [])
  );

  const { data: leftAssignments } = await service
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', YOC.definitionId);
  check('cleanup: no assignment from this run is left', (leftAssignments ?? []).length === 0);

  const { data: leftAttempts } = await service
    .from('assessment_attempts')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', YOC.definitionId);
  check('cleanup: no attempt row from this run is left', (leftAttempts ?? []).length === 0);

  const { data: leftExperiments } = await service
    .from('lifestyle_experiments')
    .select('id, source_experience_key')
    .eq('member_id', MEMBER_ID);
  check(
    'cleanup: the account holds no experiment at all, this run’s or the leftover one',
    (leftExperiments ?? []).length === 0,
    JSON.stringify(leftExperiments ?? [])
  );

  const { data: leftDismissals } = await service
    .from('member_root_popup_dismissals')
    .select('message_key')
    .eq('member_id', MEMBER_ID)
    .like('message_key', `${YOC.dismissalPrefix}:%`);
  check('cleanup: no pop-up dismissal row from this run is left', (leftDismissals ?? []).length === 0);

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} checks passed on ${BASE}`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
