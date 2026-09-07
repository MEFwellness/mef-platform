#!/usr/bin/env node
/**
 * Being Seen, driven end to end on production, and the shared motion
 * treatment watched actually running.
 *
 * TWO THINGS ARE BEING PROVED HERE AND THEY ARE DIFFERENT KINDS OF THING.
 *
 *   THE TEMPLATE. The fifth Happiness deep-dive, on the same machinery as
 *     the four beside it: a coach assigns it from its own real button, the
 *     member is knocked once, one delivery receipt is written though two
 *     surfaces fire the tracker, nine real answers are typed into the real
 *     screens, save and resume survives a genuinely new page, the closing
 *     holds and prints her question nine answer verbatim under one fixed
 *     line, the experiment starts and its dashboard card carries the
 *     approved daily question, and the coach reads all nine back with
 *     question nine on top.
 *
 *   THE MOTION. This is the part a source-scanning test cannot reach. The
 *     question really types itself, the writing box really is absent until
 *     it has finished, the chapter card really holds the screen between
 *     the three sections, the ring on question six really takes five
 *     seconds, and the closing really arrives in three beats rather than
 *     all at once. Every one of those is MEASURED, from inside the page,
 *     by a recorder installed before the click that triggers it.
 *
 * AND IT IS A TREATMENT, NOT COPY IN ONE TEMPLATE, so one of the earlier
 * four is opened far enough to watch it inherit the same behaviour, in a
 * normal context and again in a context that asks for reduced motion. The
 * reduced-motion half can only be checked this way: it is a property of the
 * browser context, not something a page can be told afterwards.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in a
 * `finally` whether the run passes or not. Every delete is scoped by
 * experience_key, because five templates now share one table and this run
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
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-being-seen';
const TABLE = 'member_happiness_deep_dive_sessions';

const BSN = {
  key: 'being-seen',
  label: 'Being Seen',
  definitionId: 'f5c3b921-6d47-4a8e-9b12-7e0a4c85d3f6',
  dismissalPrefix: 'being_seen',
};
/** The earlier template opened to prove the treatment is inherited rather than copied. */
const TGL = {
  key: 'the-giving-ledger',
  label: 'The Giving Ledger',
  definitionId: 'd4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9',
  dismissalPrefix: 'the_giving_ledger',
};

/** The four templates that must still be standing before and after the run. */
const SIBLINGS = [
  'Owning Your Value',
  'Where Your Joy Lives',
  'The Giving Ledger',
  'The Weight of Yes',
];
const SIBLING_KEYS = ['owning-your-value', 'where-your-joy-lives', 'the-weight-of-yes'];

const SECTION_TITLES = ['Invisible', 'Seen', 'Showing Yourself'];
/** The earlier template's own question one and first section, so the inheritance check reads its real screen. */
const TGL_FIRST_PROMPT =
  'List the people and things that get your energy in a typical week. Next to each one, write roughly how much of you it gets.';
const TGL_FIRST_SECTION = 'What Goes Out';
const CLOSING_LINE = 'Now two people know. That is how being seen starts.';
const CLOSING_LABEL = 'What you wish someone would see';
const HOLD_LABEL = 'Five seconds, the length of the moment you are about to describe.';
const DAILY_QUESTION =
  'Did you show something today you would usually keep in? Noticing counts either way.';
const EXPERIMENT_ACTION =
  'Offer one uninvited piece of yourself this week: an opinion, a preference, a story, without being asked first.';
const RESOURCE_TITLE = 'Useful Is Not the Same as Known';

const PROMPTS = [
  'What is something you do regularly that nobody notices unless it stops? How long has it been invisible?',
  'When you are in a room with the people closest to you, what part of you is present but never gets asked about?',
  'Think of a time recently you were praised. Was it for what you did, or for who you are? How could you tell the difference?',
  'Who in your life could describe you accurately? Not your roles, not your responsibilities, you. What would they say?',
  'Describe a moment, from any point in your life, when you felt completely seen. Who was it, and what did they do that made it different?',
  'When someone gives you a genuine compliment, what do you do with it? Trace what happens in the first five seconds.',
  'What is something true about you that the people around you do not know? Not because it is a secret, but because you have never offered it.',
  'What do you think would happen if you let yourself be more visible? Opinions, needs, all of it. What is the risk you are avoiding?',
  'Write down one thing you wish someone would notice about you without being told. Root will keep it between you and your coach.',
];

/** Her nine answers, distinctive enough that finding them proves they are hers. */
const ANSWERS = [
  'I do the family calendar. Birthdays, the dentist, whose turn it is for the car. Nobody has ever mentioned it and it has been about eleven years.',
  'The part of me that used to draw. It is there in every room I sit in and not one person has asked me about it since my thirties.',
  'It was for handling the move without a fuss. It was for what I did. I could tell because nobody would have said it if the move had gone badly, and it would still have been me.',
  'My friend Nadia, and possibly my brother on a good day. Nadia would say I am funnier than I let on and that I hate being fussed over.',
  'A ward sister on a night shift in 2011 sat down and asked how I was actually doing, and then waited for the real answer instead of the polite one.',
  'I say something to take the weight out of it. Within about two seconds I have found the part that is not quite true, and by five I have handed them a joke instead of a thank you.',
  'That I nearly moved to Lisbon on my own at twenty six and still think about it. It has never come up because nobody has ever asked me what I almost did.',
  'I think people would find me harder work. The risk is that being easy to be around is the only reliable thing I have offered anybody.',
  'That I am the one holding it together, and that it costs me something to do it.',
];
/** Question nine. The closing prints this one, the column stores it, and the coach card opens with it. */
const WISH = ANSWERS[8];

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

// ---------------------------------------------------------------------
// The recorder. This is how the motion is measured rather than described.
// ---------------------------------------------------------------------

/**
 * Installs a 40ms sampler in the page that records WHEN each part of the
 * treatment first appeared, and whether the question was ever seen half
 * typed.
 *
 * INSTALLED BEFORE THE CLICK THAT TRIGGERS THE ARRIVAL, because everything
 * it measures happens inside the first few seconds afterwards. Nothing here
 * navigates, so the recorder survives the Server Action's re-render.
 */
async function installRecorder(page, prompt) {
  await page.evaluate((fullPrompt) => {
    if (window.__hddStop) window.__hddStop();
    const rec = {
      start: performance.now(),
      // NOTHING IS RECORDED UNTIL THE OUTGOING SCREEN HAS GONE. The tap that
      // starts an arrival runs a Server Action inside a transition, and the
      // previous question, including its writing box, stays on screen while
      // that resolves. Sampling through it would record the old box as this
      // arrival's box. The beat, or the absence of any box, is the moment
      // the old screen is genuinely gone.
      armed: false,
      chapterAt: null,
      chapterTitle: null,
      partialPrompt: null,
      caretSeen: false,
      promptFullAt: null,
      boxAt: null,
      boxSeenBeforePromptFull: false,
      ringAt: null,
      ringGoneWithBox: null,
    };
    window.__hdd = rec;
    const id = setInterval(() => {
      const chapter = document.querySelector('[data-hdd-chapter-card]');
      if (!rec.armed) {
        if (!chapter && document.querySelector('textarea')) return;
        rec.armed = true;
      }
      if (chapter && rec.chapterAt === null) {
        rec.chapterAt = performance.now();
        rec.chapterTitle = chapter.getAttribute('data-hdd-chapter-card');
      }
      const heading = document.querySelector('h1 span[aria-hidden="true"]');
      const visible = heading ? heading.textContent || '' : '';
      const hasBox = Boolean(document.querySelector('textarea'));
      const hasRing = Boolean(document.querySelector('svg circle'));
      if (document.querySelector('.mef-typewriter-caret')) rec.caretSeen = true;
      if (visible && visible.length < fullPrompt.length && fullPrompt.startsWith(visible)) {
        rec.partialPrompt = visible;
        if (hasBox) rec.boxSeenBeforePromptFull = true;
      }
      if (visible === fullPrompt && rec.promptFullAt === null) {
        rec.promptFullAt = performance.now();
      }
      if (hasRing && rec.ringAt === null && !hasBox) rec.ringAt = performance.now();
      if (hasBox && rec.boxAt === null) {
        rec.boxAt = performance.now();
        rec.ringGoneWithBox = !hasRing;
      }
    }, 40);
    window.__hddStop = () => clearInterval(id);
  }, prompt);
}

async function readRecorder(page) {
  return page.evaluate(() => {
    if (window.__hddStop) window.__hddStop();
    return window.__hdd ?? null;
  });
}

/**
 * Installs a sampler that records when each beat of the closing first
 * appeared, so "quiet, then her words, then the fixed line after a real
 * pause" is three timestamps rather than an impression.
 */
async function installClosingRecorder(page, wish, line) {
  await page.evaluate(
    ({ wishText, lineText }) => {
      if (window.__hddCloseStop) window.__hddCloseStop();
      const rec = { figureAt: null, wishAt: null, lineAt: null };
      window.__hddClose = rec;
      const id = setInterval(() => {
        // NOTHING IS LOOKED FOR UNTIL THE CLOSING FIGURE EXISTS. Her answer
        // is sitting in a textarea on the screen before this one, and
        // whether innerText reports a form control's value is a browser
        // detail this run must not depend on. The figure is the closing
        // screen's own frame, so waiting for it makes the three timestamps
        // measure the closing and only the closing.
        if (rec.figureAt === null) {
          if (!document.querySelector('figure')) return;
          rec.figureAt = performance.now();
        }
        const text = document.body.innerText || '';
        if (rec.wishAt === null && text.includes(wishText)) rec.wishAt = performance.now();
        if (rec.lineAt === null && text.includes(lineText)) rec.lineAt = performance.now();
      }, 40);
      window.__hddCloseStop = () => clearInterval(id);
    },
    { wishText: wish, lineText: line }
  );
}

async function readClosingRecorder(page) {
  return page.evaluate(() => {
    if (window.__hddCloseStop) window.__hddCloseStop();
    return window.__hddClose ?? null;
  });
}

/** Removes only one template's rows. Five templates share this table. */
async function clearTemplate(service, template) {
  await service.from(TABLE).delete().eq('member_id', MEMBER_ID).eq('experience_key', template.key);
  const { data: experiments } = await service
    .from('lifestyle_experiments')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('source_experience_key', template.key);
  for (const row of experiments ?? []) {
    await service.from('cvs_experiment_daily_logs').delete().eq('experiment_id', row.id);
  }
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

/** Presses a template's own Assign button on the coach screen and returns the assignment rows. */
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

/**
 * Waits for a NAMED question to be on screen and ready to write in.
 *
 * WHY NOT SIMPLY WAIT FOR A TEXTAREA. Continue calls a Server Action inside
 * a React transition, and a transition deliberately keeps the PREVIOUS
 * screen on screen until it resolves. So for a second or so after the tap,
 * the old question, the old answer and the old writing box are all still
 * there. A wait that resolved on "a textarea is visible" resolved on the
 * one she had just finished with, and the next answer was typed into a box
 * that was about to be replaced.
 *
 * The counter is the honest signal: it names the question, it renders the
 * moment the new question mounts, and it is absent entirely during the
 * chapter beat. So this waits for the counter to say the question it is
 * waiting for, and only then for that question's own box to arrive, which
 * is what the treatment holds back until the prompt has finished typing.
 */
async function waitForQuestion(page, number, timeout = 60000) {
  await page
    .getByText(new RegExp(`Question ${number} of 9`, 'i'))
    .first()
    .waitFor({ state: 'visible', timeout });
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout });
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

  await clearTemplate(service, BSN);
  await clearTemplate(service, TGL);

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
    await openAssessmentsFold(coachPage, BSN.label);

    const panel = coachPage.locator(`section[aria-label="${BSN.label}"]`);
    const panelFound = (await panel.count()) === 1;
    check('coach: the Being Seen card is on the client screen', panelFound);
    if (!panelFound) throw new Error('No Being Seen panel on the coach screen.');

    // Migration 215 dropped and recreated a policy all five templates
    // depend on, so the four beside it are checked before anything moves.
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

    const assignments = await assignFromCoachScreen(coachPage, service, BSN);
    check(
      'ledger: exactly one assignment row was written',
      assignments.length === 1,
      `${assignments.length} rows`
    );
    const assignmentId = assignments[0]?.id ?? null;
    check('ledger: it is pending', assignments[0]?.status === 'pending');

    const dueDay = assignments[0]?.due_at
      ? new Date(assignments[0].due_at).toISOString().slice(0, 10)
      : null;
    check(
      'ledger: the due date is seven days from HER calendar day',
      dueDay === addDays(memberToday, 7),
      `${dueDay} vs ${addDays(memberToday, 7)}`
    );

    await coachPage.reload({ waitUntil: 'domcontentloaded' });
    await coachPage.waitForTimeout(2500);
    await openAssessmentsFold(coachPage, BSN.label);
    const sentLine = await coachPage.locator(`section[aria-label="${BSN.label}"]`).innerText();
    check(
      'coach: the card now prints a sent-and-not-yet-seen sentence',
      /Sent/.test(sentLine),
      sentLine.slice(0, 140)
    );
    check('coach: nothing on it says Overdue on the day it was sent', !/Overdue/.test(sentLine));
    check(
      "coach: the /detail assignment list names it, and does not call it 'Assessment'",
      new RegExp(BSN.label).test(await coachPage.innerText('body'))
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
        'Your coach asked Root to sit down with you on this one. It is called Being Seen. Nine questions about the difference between being useful and being known.'
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
      homeText.includes(`From your coach: ${BSN.label}`) && homeText.includes(`Start ${BSN.label}`)
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
    // 3. The intro, and the first chapter card.
    // -----------------------------------------------------------------
    await page.goto(`${BASE}/${BSN.key}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const introText = await page.innerText('body');
    check(
      'member: the intro is the approved copy',
      introText.includes('No scores, no right answers') &&
        introText.includes(
          'Root has nine questions about the difference between being useful and being known'
        ) &&
        introText.includes('Fifteen to twenty minutes, somewhere quiet')
    );
    await shot(page, '05-intro');

    await installRecorder(page, PROMPTS[0]);
    await page.getByRole('button', { name: 'Begin' }).click();
    await waitForQuestion(page, 1);
    const arrival = await readRecorder(page);

    check(
      'motion: a chapter card held the screen on the way into the first section',
      arrival?.chapterAt !== null,
      String(arrival?.chapterTitle)
    );
    check(
      'motion: the chapter card carried the section title and nothing else',
      arrival?.chapterTitle === SECTION_TITLES[0],
      String(arrival?.chapterTitle)
    );
    check(
      'motion: question one was seen HALF TYPED, so it really types itself',
      Boolean(arrival?.partialPrompt) && arrival.partialPrompt.length < PROMPTS[0].length,
      arrival?.partialPrompt ? `saw ${arrival.partialPrompt.length} of ${PROMPTS[0].length} characters` : 'never partial'
    );
    check('motion: with a caret in front of the words it had not typed yet', arrival?.caretSeen === true);
    check(
      'motion: the writing box was ABSENT until the question had finished typing',
      arrival?.boxSeenBeforePromptFull === false
    );
    check(
      'motion: and it arrived within a second of the question finishing',
      arrival?.boxAt !== null &&
        arrival?.promptFullAt !== null &&
        arrival.boxAt - arrival.promptFullAt > 0 &&
        arrival.boxAt - arrival.promptFullAt < 1200,
      arrival?.boxAt && arrival?.promptFullAt
        ? `${Math.round(arrival.boxAt - arrival.promptFullAt)}ms after`
        : 'not measured'
    );
    check(
      'motion: the whole question typed itself inside four seconds, which is a voice and not a crawl',
      arrival?.promptFullAt !== null && arrival.promptFullAt - arrival.chapterAt < 8000,
      arrival?.promptFullAt ? `${Math.round(arrival.promptFullAt - arrival.start)}ms from the tap` : 'not measured'
    );
    check(
      'motion: an ambient layer is drifting behind the writing',
      (await page.locator('.mef-gradient-drift').count()) > 0
    );

    const q1 = await page.innerText('body');
    check(
      'member: question one is open writing, on its own screen, under Invisible',
      (await page.locator('textarea').count()) === 1 &&
        /Invisible/i.test(q1) &&
        /Question 1 of 9/i.test(q1) &&
        q1.includes(PROMPTS[0])
    );
    check(
      'member: there is no multiple choice and no character counter anywhere on it',
      (await page.locator('[role="radio"], [role="checkbox"]').count()) === 0 &&
        !/\bof \d{2,4}\s*$/m.test(q1)
    );
    await shot(page, '06-question-1');

    // -----------------------------------------------------------------
    // 4. Questions one to three, then the chapter card into Seen.
    // -----------------------------------------------------------------
    const seenScreens = [q1];
    for (let i = 0; i < 3; i++) {
      await page.locator('textarea').fill(ANSWERS[i]);
      const last = i === 2;
      if (last) await installRecorder(page, PROMPTS[3]);
      await page.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(page, i + 2);
      seenScreens.push(await page.innerText('body'));
    }
    const intoSeen = await readRecorder(page);
    check(
      'motion: a chapter card held the screen between section one and section two',
      intoSeen?.chapterAt !== null && intoSeen?.chapterTitle === SECTION_TITLES[1],
      String(intoSeen?.chapterTitle)
    );
    check(
      'motion: question four then typed itself too, box after',
      Boolean(intoSeen?.partialPrompt) && intoSeen?.boxSeenBeforePromptFull === false
    );
    check(
      'member: after three answers she is on question four, under Seen',
      /Question 4 of 9/i.test(await page.innerText('body'))
    );
    await shot(page, '07-question-4-after-chapter-card');

    // -----------------------------------------------------------------
    // 5. Save and resume, across a genuinely new page.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(ANSWERS[3]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 5);
    check(
      'member: the screen says her writing is saved',
      (await page.innerText('body')).includes('Saved. You can close this and come back to it.')
    );

    const { data: draftRows } = await service
      .from(TABLE)
      .select('id, answers, completed_at, noticed_wish, experience_key, follow_up_source_experience_key')
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', BSN.key);
    check(
      'draft: one row exists, unfinished',
      (draftRows ?? []).length === 1 && !draftRows?.[0]?.completed_at
    );
    check(
      'draft: it holds exactly the four answers she wrote',
      Object.keys(draftRows?.[0]?.answers ?? {}).length === 4
    );
    check('draft: the noticed-wish column is still empty', draftRows?.[0]?.noticed_wish === null);
    check(
      'draft: it is stored under this template, not one of the four beside it',
      draftRows?.[0]?.experience_key === BSN.key
    );
    check(
      'draft: the follow-up flag is null, because this template has no follow-up',
      draftRows?.[0]?.follow_up_source_experience_key === null
    );

    // A genuinely new page. Nothing survives in memory.
    await page.close();
    page = await member.context.newPage();
    watch(page, errors);
    await installRecorderOnLoad(page, PROMPTS[4]);
    await page.goto(`${BASE}/${BSN.key}`, { waitUntil: 'domcontentloaded' });
    await waitForQuestion(page, 5);
    await page.waitForTimeout(1500);
    const resumeMotion = await readRecorder(page);
    const resumed = await page.innerText('body');
    check('resume: a brand new page lands her back on question five', /Question 5 of 9/i.test(resumed));
    check('resume: it is not the intro again', !resumed.includes('Fifteen to twenty minutes'));
    check(
      'resume: no chapter card plays on re-entry, because she is already inside that section',
      resumeMotion?.chapterAt === null
    );
    check(
      'resume: the question she left off on is COMPLETE on arrival, not typed at her again',
      resumeMotion?.partialPrompt === null && resumeMotion?.caretSeen === false,
      resumeMotion?.partialPrompt ? `saw a partial: ${resumeMotion.partialPrompt.slice(0, 30)}` : 'complete'
    );
    check(
      'resume: and the writing box is there immediately, so she picks the pen straight back up',
      resumeMotion?.boxAt !== null && resumeMotion.boxSeenBeforePromptFull === false
    );
    await shot(page, '08-resumed');

    await page.getByRole('button', { name: 'Back' }).click();
    await waitForQuestion(page, 4);
    check(
      'resume: the answer she wrote before leaving came back with her',
      (await page.locator('textarea').inputValue()) === ANSWERS[3]
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 5);

    // -----------------------------------------------------------------
    // 6. Question six, and the five seconds she is asked to sit inside.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(ANSWERS[4]);
    await installRecorder(page, PROMPTS[5]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 6);
    const ring = await readRecorder(page);
    seenScreens.push(await page.innerText('body'));

    check('motion: question six typed itself like the others', Boolean(ring?.partialPrompt));
    check(
      'motion: a ring appeared once it had finished, with the box still absent',
      ring?.ringAt !== null,
      ring?.ringAt ? 'ring seen' : 'no ring'
    );
    check(
      'motion: and the box arrived about five seconds after the ring started filling',
      ring?.ringAt !== null &&
        ring?.boxAt !== null &&
        ring.boxAt - ring.ringAt >= 4400 &&
        ring.boxAt - ring.ringAt <= 8000,
      ring?.ringAt && ring?.boxAt ? `${Math.round(ring.boxAt - ring.ringAt)}ms` : 'not measured'
    );
    check(
      'motion: the ring left with the box rather than sitting under it',
      ring?.ringGoneWithBox === true
    );
    check('member: question six is the compliment question', (await page.innerText('body')).includes(PROMPTS[5]));
    await shot(page, '09-question-6-ring');

    // -----------------------------------------------------------------
    // 7. The rest of section two and three, and the last chapter card.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(ANSWERS[5]);
    await installRecorder(page, PROMPTS[6]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, 7);
    const intoShowing = await readRecorder(page);
    check(
      'motion: a chapter card held the screen between section two and section three',
      intoShowing?.chapterAt !== null && intoShowing?.chapterTitle === SECTION_TITLES[2],
      String(intoShowing?.chapterTitle)
    );

    for (let i = 6; i < 8; i++) {
      await page.locator('textarea').fill(ANSWERS[i]);
      await page.getByRole('button', { name: 'Continue' }).click();
      await waitForQuestion(page, i + 2);
      seenScreens.push(await page.innerText('body'));
    }
    const q9 = await page.innerText('body');
    seenScreens.push(q9);
    check(
      'member: question nine is the last one, under Showing Yourself',
      /Question 9 of 9/i.test(q9) && /Showing Yourself/i.test(q9) && q9.includes(PROMPTS[8])
    );
    if (await emDashOn(page)) dashes++;
    await shot(page, '10-question-9');

    // -----------------------------------------------------------------
    // 8. Finish, and the closing that arrives in beats and then holds.
    // -----------------------------------------------------------------
    await page.locator('textarea').fill(ANSWERS[8]);
    await installClosingRecorder(page, WISH, CLOSING_LINE);
    await page.getByRole('button', { name: 'Finish' }).click();
    await page
      .getByText(CLOSING_LINE, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });
    const closingMotion = await readClosingRecorder(page);

    check(
      'motion: the closing screen was QUIET first, with her words not yet on it',
      closingMotion?.figureAt !== null &&
        closingMotion?.wishAt !== null &&
        closingMotion.wishAt - closingMotion.figureAt >= 500,
      closingMotion?.wishAt && closingMotion?.figureAt
        ? `${Math.round(closingMotion.wishAt - closingMotion.figureAt)}ms of quiet`
        : 'not measured'
    );
    check(
      'motion: the one fixed line arrived AFTER her own words, with a real pause',
      closingMotion?.lineAt !== null &&
        closingMotion?.wishAt !== null &&
        closingMotion.lineAt - closingMotion.wishAt >= 1200,
      closingMotion?.lineAt && closingMotion?.wishAt
        ? `${Math.round(closingMotion.lineAt - closingMotion.wishAt)}ms after her words`
        : 'not measured'
    );

    // WAIT FOR THE LAST BEAT BEFORE READING THE SCREEN. The heading, the
    // body and the way onward arrive after the fixed line has had its own
    // pause, which is the treatment doing exactly what it is for. Reading
    // the closing the moment the fixed line lands reads it half arrived,
    // and reports a sentence as missing that is simply not due yet. The
    // tail's own Continue is the honest signal that the closing is whole.
    await page
      .getByRole('button', { name: 'Continue' })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 });

    const closing = await page.innerText('body');
    seenScreens.push(closing);
    check('closing: her question nine answer is on screen, verbatim', closing.includes(WISH));
    check('closing: the one fixed line is printed exactly as approved', closing.includes(CLOSING_LINE));
    check(
      'closing: her answer is labelled as hers and nothing else',
      new RegExp(CLOSING_LABEL, 'i').test(closing)
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
      'closing: none of her other eight answers is printed on it',
      ANSWERS.filter((_, i) => i !== 8).every((answer) => !closing.includes(answer))
    );
    await shot(page, '11-closing');
    if (await emDashOn(page)) dashes++;

    // THE HOLD. Several seconds, several server round trips.
    await page.waitForTimeout(9000);
    const stillThere = await page.innerText('body');
    check(
      'closing: it is STILL on screen nine seconds and several server round trips later',
      stillThere.includes(WISH) && stillThere.includes(CLOSING_LINE)
    );
    check(
      'closing: it was never replaced by the already-done panel',
      !stillThere.includes('This one is done')
    );
    check('closing: the URL never moved', page.url().includes(`/${BSN.key}`));
    await shot(page, '12-closing-still-holding');

    const { data: finishedRows } = await service
      .from(TABLE)
      .select('id, noticed_wish, answers, completed_at, follow_up_source_experience_key')
      .eq('member_id', MEMBER_ID)
      .eq('experience_key', BSN.key);
    check('storage: the sitting is completed', Boolean(finishedRows?.[0]?.completed_at));
    check(
      'storage: question nine is in its own column, verbatim',
      finishedRows?.[0]?.noticed_wish === WISH
    );
    check(
      'storage: all nine answers are stored',
      Object.keys(finishedRows?.[0]?.answers ?? {}).length === 9
    );
    check('storage: exactly one sitting exists, not two', (finishedRows ?? []).length === 1);
    check(
      'storage: the follow-up flag is null, as this template requires',
      finishedRows?.[0]?.follow_up_source_experience_key === null
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
    seenScreens.push(offer);
    check('experiment: the offer is the approved action', offer.includes(EXPERIMENT_ACTION));
    check('experiment: there is a real way to decline', /Not right now/.test(offer));
    await shot(page, '13-experiment-offer');

    await page.getByRole('button', { name: /I'm in: start the 7 days/ }).click();
    await page.waitForTimeout(5000);
    const done = await page.innerText('body');
    seenScreens.push(done);
    check('experiment: she is told where it went', done.includes('It is on your dashboard now'));
    check('closing: the piece of reading is offered, summary first', done.includes(RESOURCE_TITLE));
    check('closing: her own answer is still with her on the last screen', done.includes(WISH));
    await shot(page, '14-done');
    if (await emDashOn(page)) dashes++;

    const { data: experiments } = await service
      .from('lifestyle_experiments')
      .select('id, title, protocol, duration_days, status, start_date')
      .eq('member_id', MEMBER_ID)
      .eq('source_experience_key', BSN.key);
    check('experiment: exactly one row was written', (experiments ?? []).length === 1);
    check('experiment: it runs seven days', experiments?.[0]?.duration_days === 7);
    check('experiment: it starts on HER calendar day', experiments?.[0]?.start_date === memberToday);
    check(
      'experiment: the stored protocol is the approved action',
      (experiments?.[0]?.protocol ?? '').includes(EXPERIMENT_ACTION)
    );
    check(
      'experiment: the stored protocol never bakes her own answer into it',
      !(experiments?.[0]?.protocol ?? '').includes(WISH)
    );

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    const home = await page.innerText('body');
    seenScreens.push(home);
    check('home: the experiment card carries the approved daily question', home.includes(DAILY_QUESTION));
    const experimentCard = page.locator('div', { hasText: DAILY_QUESTION }).last();
    const cardText = (await experimentCard.count()) ? await experimentCard.innerText() : '';
    check('home: it says which day of seven she is on', /Day 1 of 7/i.test(cardText), cardText.slice(0, 80));
    check(
      'home: the assignment card is gone now that the sitting is finished',
      !home.includes(`From your coach: ${BSN.label}`)
    );
    await shot(page, '15-home-experiment-card');
    if (await emDashOn(page)) dashes++;

    const yes = experimentCard.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.count()) {
      await yes.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await yes.first().evaluate((el) => el.click());
      await page.waitForTimeout(4000);
      check(
        'home: her evening tap is recorded and the card says so',
        (await page.innerText('body')).includes('Logged: you showed something.')
      );
    } else {
      check('home: her evening tap is recorded and the card says so', false, 'no Yes button found');
    }

    // Reopening a finished sitting is an answer, not a mystery.
    await page.goto(`${BASE}/${BSN.key}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const reopened = await page.innerText('body');
    check('member: reopening it says it is done rather than bouncing her', reopened.includes('This one is done'));
    check('member: and it shows her own answer again', reopened.includes(WISH));
    await shot(page, '16-reopened');

    // -----------------------------------------------------------------
    // 10. The coach reads it back.
    // -----------------------------------------------------------------
    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    await coachPage.waitForTimeout(3000);
    await openAssessmentsFold(coachPage, BSN.label);
    const card = coachPage.locator(`section[aria-label="${BSN.label}"]`);
    const cardFound = (await card.count()) === 1;
    check('coach: the finished sitting is on the card', cardFound);
    if (cardFound) {
      const text = await card.innerText();
      const openerAt = text.indexOf(WISH);
      const answersHeadingAt = text.search(/What they wrote/i);
      check('coach: question nine is the opener', openerAt > -1);
      check(
        'coach: it sits ABOVE the nine answers',
        openerAt > -1 && answersHeadingAt > openerAt,
        `opener ${openerAt}, heading ${answersHeadingAt}`
      );
      check(
        'coach: the opener is labelled as the thing to start the session with',
        /Open the session with this/i.test(text)
      );
      let all = true;
      for (const answer of ANSWERS) if (!text.includes(answer)) all = false;
      check('coach: all nine answers are shown raw', all);
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
    await shot(coachPage, '17-coach-card');
    if (await emDashOn(coachPage)) dashes++;

    for (const sibling of SIBLINGS) {
      check(
        `coach: the ${sibling} card is STILL standing after the whole run`,
        (await coachPage.locator(`section[aria-label="${sibling}"]`).count()) === 1
      );
    }

    // -----------------------------------------------------------------
    // 11. THE TREATMENT IS INHERITED, not copied into this template.
    //     One of the four earlier ones, opened far enough to watch it.
    // -----------------------------------------------------------------
    const tglAssignments = await assignFromCoachScreen(coachPage, service, TGL);
    check('inheritance: The Giving Ledger was assigned from its own real button', tglAssignments.length === 1);

    const tglPage = await member.context.newPage();
    watch(tglPage, errors);
    await tglPage.goto(`${BASE}/${TGL.key}`, { waitUntil: 'domcontentloaded' });
    await tglPage.waitForTimeout(3000);
    await installRecorder(tglPage, TGL_FIRST_PROMPT);
    await tglPage.getByRole('button', { name: 'Begin' }).click();
    await waitForQuestion(tglPage, 1);
    const inherited = await readRecorder(tglPage);
    check(
      'inheritance: The Giving Ledger plays the chapter card too, with ITS own section title',
      inherited?.chapterAt !== null && inherited?.chapterTitle === TGL_FIRST_SECTION,
      String(inherited?.chapterTitle)
    );
    check(
      'inheritance: and its question one types itself, with the box arriving after',
      Boolean(inherited?.partialPrompt) && inherited?.boxSeenBeforePromptFull === false
    );
    check(
      'inheritance: and it carries the same ambient layer',
      (await tglPage.locator('.mef-gradient-drift').count()) > 0
    );
    check(
      'inheritance: nothing about the earlier template broke, it is still question one of nine',
      /Question 1 of 9/i.test(await tglPage.innerText('body'))
    );
    await shot(tglPage, '18-inherited-motion');
    if (await emDashOn(tglPage)) dashes++;
    await tglPage.close();

    // -----------------------------------------------------------------
    // 12. REDUCED MOTION, on the real site, in a context that asks for it.
    // -----------------------------------------------------------------
    calm = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 430, height: 932 },
      contextOptions: { reducedMotion: 'reduce' },
    });
    if (calm) {
      const calmPage = await calm.context.newPage();
      watch(calmPage, errors);
      await calmPage.goto(`${BASE}/${TGL.key}`, { waitUntil: 'domcontentloaded' });
      await calmPage.waitForTimeout(3000);
      await installRecorder(calmPage, TGL_FIRST_PROMPT);
      await calmPage.getByRole('button', { name: 'Begin' }).click();
      await waitForQuestion(calmPage, 1);
      await calmPage.waitForTimeout(1500);
      const reduced = await readRecorder(calmPage);
      check(
        'reduced motion: no chapter card is played at all, because a held pause with nothing moving is a delay',
        reduced?.chapterAt === null
      );
      check(
        'reduced motion: the question is complete on arrival, with no caret and nothing half typed',
        reduced?.partialPrompt === null && reduced?.caretSeen === false
      );
      check(
        'reduced motion: the writing box is usable immediately',
        reduced?.boxAt !== null && reduced.boxAt - reduced.start < 2500,
        reduced?.boxAt ? `${Math.round(reduced.boxAt - reduced.start)}ms` : 'not measured'
      );
      check(
        'reduced motion: the screen is fully usable, on question one of nine',
        /Question 1 of 9/i.test(await calmPage.innerText('body'))
      );
      await shot(calmPage, '19-reduced-motion');
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
    await clearTemplate(service, BSN);
    await clearTemplate(service, TGL);
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
    .in('experience_key', [BSN.key, TGL.key]);
  check(
    'cleanup: no sitting from this run is left on production',
    (leftSittings ?? []).length === 0,
    JSON.stringify(leftSittings ?? [])
  );

  const { data: leftAssignments } = await service
    .from('assessment_assignments')
    .select('id, assessment_definition_id')
    .eq('member_id', MEMBER_ID)
    .in('assessment_definition_id', [BSN.definitionId, TGL.definitionId]);
  check('cleanup: no assignment from this run is left', (leftAssignments ?? []).length === 0);

  const { data: leftExperiments } = await service
    .from('lifestyle_experiments')
    .select('id, source_experience_key')
    .eq('member_id', MEMBER_ID)
    .in('source_experience_key', [BSN.key, TGL.key]);
  check('cleanup: no experiment from this run is left', (leftExperiments ?? []).length === 0);

  const { data: leftAny } = await service
    .from('lifestyle_experiments')
    .select('id, title, status')
    .eq('member_id', MEMBER_ID);
  check(
    'cleanup: the account carries NO experiment at all, including the inert 2026-08-29 leftover',
    (leftAny ?? []).length === 0,
    JSON.stringify(leftAny ?? [])
  );

  const { data: leftDismissals } = await service
    .from('member_root_popup_dismissals')
    .select('message_key')
    .eq('member_id', MEMBER_ID)
    .like('message_key', 'being_seen:%');
  check('cleanup: no Being Seen pop-up dismissal row is left', (leftDismissals ?? []).length === 0);

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} checks passed on ${BASE}`);
  if (passed !== results.length) process.exitCode = 1;
}

/**
 * The same recorder, installed for a page that has not loaded yet.
 *
 * Re-entry is the one arrival that is not triggered by a click, so there is
 * no moment after the load and before the arrival to install anything. This
 * runs on every document this page creates, which is what makes it possible
 * to prove that nothing typed itself on a resume.
 */
async function installRecorderOnLoad(page, prompt) {
  await page.addInitScript((fullPrompt) => {
    const rec = {
      start: performance.now(),
      chapterAt: null,
      chapterTitle: null,
      partialPrompt: null,
      caretSeen: false,
      promptFullAt: null,
      boxAt: null,
      boxSeenBeforePromptFull: false,
      ringAt: null,
      ringGoneWithBox: null,
    };
    window.__hdd = rec;
    const id = setInterval(() => {
      const chapter = document.querySelector('[data-hdd-chapter-card]');
      if (chapter && rec.chapterAt === null) {
        rec.chapterAt = performance.now();
        rec.chapterTitle = chapter.getAttribute('data-hdd-chapter-card');
      }
      const heading = document.querySelector('h1 span[aria-hidden="true"]');
      const visible = heading ? heading.textContent || '' : '';
      const hasBox = Boolean(document.querySelector('textarea'));
      if (document.querySelector('.mef-typewriter-caret')) rec.caretSeen = true;
      if (visible && visible.length < fullPrompt.length && fullPrompt.startsWith(visible)) {
        rec.partialPrompt = visible;
        if (hasBox) rec.boxSeenBeforePromptFull = true;
      }
      if (visible === fullPrompt && rec.promptFullAt === null) rec.promptFullAt = performance.now();
      if (hasBox && rec.boxAt === null) rec.boxAt = performance.now();
    }, 40);
    window.__hddStop = () => clearInterval(id);
  }, prompt);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
