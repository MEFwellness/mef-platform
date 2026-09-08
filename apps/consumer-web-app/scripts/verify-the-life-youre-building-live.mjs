#!/usr/bin/env node
/**
 * The Life You're Building, driven end to end on production, TWICE.
 *
 * TWO RUNS, BECAUSE THIS TEMPLATE HAS TWO MODES AND THE DIFFERENCE BETWEEN
 * THEM IS THE WHOLE POINT OF THE FOLLOW-UP MECHANISM.
 *
 *   RUN A, STANDALONE. The account carries no completed Owning Your Value
 *     sitting. The intro must have no held-sentence line, question nine
 *     must be the standalone question, no screen anywhere may mention that
 *     another template exists, the closing prints her three marks and one
 *     sentence under the standalone fixed line, and the coach's card must
 *     show no follow-up band.
 *
 *   RUN B, FOLLOW-UP. Owning Your Value is completed first, through its own
 *     real screens with real typed answers including its held sentence.
 *     Then this one is assigned. The intro must carry the extra line,
 *     question nine must quote the held sentence CHARACTER FOR CHARACTER,
 *     the closing must print Then and Now in that order under the follow-up
 *     fixed line, and the coach's card must show the band with both.
 *
 * AND THE ROTATION, which cannot be proved by reading source. Both runs
 * place all three marks with a real pointer on the real line, check that
 * the written half of each of those questions is genuinely absent until the
 * mark is placed, and check that the closing composition reads every
 * position back in the words this run computed independently rather than in
 * a number.
 *
 * AND THAT THE MARKS SURVIVE A CLOSED TAB, which is the part a member would
 * actually lose. In both runs the tab is genuinely closed mid-sitting and a
 * brand new page is opened, and the run then checks the positions and every
 * written answer all came back exactly.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in a
 * `finally` whether the run passes or not. Every delete is scoped by
 * experience_key, because eight templates now share one table and this run
 * must never remove a sitting it did not create. Run B's own Owning Your
 * Value sitting is created by this run and removed by it; a sitting of any
 * other template that was already there is counted before and after and
 * never touched. The pop-up dismissal rows that "Maybe later" writes are
 * removed too: they are keyed to the assignment by a string rather than by
 * a foreign key, so deleting the assignment does not take them with it.
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
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-the-life-youre-building';
const TABLE = 'member_happiness_deep_dive_sessions';

const TLYB = {
  key: 'the-life-youre-building',
  label: "The Life You're Building",
  definitionId: 'c9f4a1d7-8e52-4b36-a7c1-4d9b2e650f83',
  dismissalPrefix: 'the_life_youre_building',
};

const OYV = {
  key: 'owning-your-value',
  label: 'Owning Your Value',
  definitionId: 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15',
  dismissalPrefix: 'owning_your_value',
};

/** The seven templates that must still be standing before and after the run. */
const SIBLINGS = [
  'Owning Your Value',
  'Where Your Joy Lives',
  'The Giving Ledger',
  'The Weight of Yes',
  'Being Seen',
  'What You Put Down',
  'Your Own Company',
];
/** The six whose ROWS this run must never touch. Owning Your Value is run B's own. */
const UNTOUCHED_KEYS = [
  'where-your-joy-lives',
  'the-giving-ledger',
  'the-weight-of-yes',
  'being-seen',
  'what-you-put-down',
  'your-own-company',
];

const SECTION_TITLES = ['Where You Stand', 'The Materials', 'The First Stone'];
const STANDALONE_CLOSING_LINE = 'This one Root will hold onto too.';
const FOLLOW_UP_CLOSING_LINE = 'You wrote the first one too. Look how far the writer has come.';
const INTRO_FOLLOW_UP_LINE =
  'A while back, you wrote a sentence and asked Root to hold onto it. Root kept it. You will see it again at the end.';
const MAP_HEADING = 'Where you put yourself';
const DAILY_QUESTION =
  'Did today have anything in it that belongs to the life you are building?';
const EXPERIMENT_ACTION = 'Lay the first stone you named, once this week.';
const RESOURCE_TITLE = 'You Are Already Building It';
const FOLLOW_UP_BAND = 'Follow-up from Owning Your Value';
const STANDALONE_NOTE = 'This sitting ran on its own, with the standalone last question.';

/** The three lines she is asked to stand on, in order, with their two words. */
const LINES = [
  {
    key: 'built_or_handed',
    lead: 'The life I am living is...',
    near: 'Built by me',
    far: 'Handed to me',
    /** Where on the line this run puts her mark, as a fraction of its width. */
    at: 0.22,
  },
  {
    key: 'beginning_or_almost',
    lead: 'Right now I feel...',
    near: 'At the beginning',
    far: 'Almost there',
    at: 0.5,
  },
  {
    key: 'what_is_between',
    lead: 'The main thing between me and that life is...',
    near: 'Outside me',
    far: 'Inside me',
    at: 0.93,
  },
];

/** The written prompt of each of the three slider questions, which must not exist before the mark. */
const SLIDER_WRITTEN_PROMPTS = {
  built_or_handed: 'What parts did you actually choose? What came with the territory?',
  beginning_or_almost:
    'At the beginning of what, or almost where? Name what you are building toward, as specifically as you can.',
  what_is_between: 'Name it. What is the thing?',
};

const STANDALONE_Q9 =
  'Write the sentence you would want Root to hold onto from today. The one that tells the truth about who you are becoming.';

/** The nine written answers, by question key. Distinctive, so finding one proves it is hers. */
const WRITTEN = {
  built_or_handed:
    'I chose the work and I chose the city. The hours came with the territory, and so did being the one everybody calls when something goes wrong at home.',
  beginning_or_almost:
    'At the beginning of running my own practice rather than being the person who props up somebody else’s. Specifically: my own room, my own three mornings a week, my own name on the door.',
  ordinary_day:
    'I wake at six without an alarm because I went to bed at ten. Coffee on the step while it is still cold out. Three clients before one, in my own room, with the window open. A real lunch I actually sit down for. The afternoon is mine and I use it badly on purpose, reading in the chair. My sister calls and I am not too tired to answer properly. Dinner is something I cooked. I am asleep before eleven and nothing is unfinished.',
  already_in_hand:
    'Eleven years of knowing what I am doing. Two people who would say yes on a phone call. A body that has come back further this year than I expected it to. And the fact that I have already done the hardest version of this once, for somebody else.',
  what_is_between:
    'The thing is that I keep making myself indispensable where I already am, because being needed is easier to sit with than being chosen. That is not the market. That is me.',
  what_she_did_not_know:
    'That I am much slower to panic than I used to be. Three years ago I would have called that going soft. What would surprise her most is that the days I get the most done are the ones where I stopped at six.',
  the_piece_that_matters:
    'The three mornings in my own room. If those existed, the lunch and the afternoon and the phone call all follow from them, and none of them follow from anything else.',
  the_first_stone:
    'On Tuesday I am going to ask Adaeze what she pays for her room, and write the number down instead of guessing at it.',
};

/** Question nine, standalone version: her own sentence. */
const STANDALONE_SENTENCE =
  'I am not waiting to be chosen for this, I am already the person doing it.';
/** Question nine, follow-up version: what she says back to the sentence she left. */
const FOLLOW_UP_ANSWER =
  'I would tell her she was right, and that the room is nearly real now. She wrote it before she believed it, and that turned out to be the order it goes in.';

/** Owning Your Value's own nine, for run B. Its ninth is the sentence this template quotes. */
const HELD_SENTENCE =
  'I am allowed to build something that has me in it, not just room for everybody else.';
const OYV_WRITTEN = [
  'I hold the rota, the reminders, the birthdays, and the part where somebody has to notice that a thing has gone wrong before it is a crisis.',
  'If I stopped, the appointments would be missed and my mother would find out about it a week late from somebody else.',
  'Badly. I say it was nothing, or I list who else helped, and then I change the subject before they can say it twice.',
  'I think I am valued because I am reliable. Which is a real thing, and it is also the thing that is easiest to keep taking.',
  'Funny in a dry way. Stubborn about the right things. Someone who reads properly rather than skimming.',
  'The three mornings a week I keep trying to protect, and mostly do not.',
  'The week I ran the whole handover on my own and did not once ask to be told I had done it well.',
  'My brother’s guilt about how little he does. That is his to carry and I have been carrying it for him.',
  HELD_SENTENCE,
];

const results = [];
let phase = 'setup';
const check = (name, passed, detail = '') => {
  results.push({ phase, name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  [${phase}] ${name}${detail ? ` :: ${detail}` : ''}`);
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

/**
 * A position, in words, computed HERE rather than imported.
 *
 * Deliberately a second implementation of the shipped band table: a
 * verification run that imported the function it is checking would agree
 * with it whatever it said.
 */
function positionInWords(value, near, far) {
  const v = Math.min(100, Math.max(0, value));
  if (v <= 12) return near.toLowerCase();
  if (v < 40) return `closer to ${near}`;
  if (v <= 60) return `halfway between ${near} and ${far}`;
  if (v < 88) return `closer to ${far}`;
  return far.toLowerCase();
}

/**
 * Whether a stored slider_positions column holds exactly these marks.
 *
 * KEY BY KEY, NOT BY JSON.stringify. jsonb does not preserve the order the
 * keys were written in (it sorts them by length and then bytewise), so a
 * string comparison here fails on the storage engine's ordering rather than
 * on anything about her marks.
 */
function samePositions(stored, expected) {
  const got = stored?.positions;
  if (!got || typeof got !== 'object') return false;
  const keys = Object.keys(expected);
  if (Object.keys(got).length !== keys.length) return false;
  return keys.every((key) => got[key] === expected[key]);
}

/** Console and page errors, per page, so a failure names the screen it happened on. */
const errors = [];
let dashes = 0;
function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${page.url()} :: ${e.message}`));
}

/**
 * True when `text` is on the page, ignoring case.
 *
 * THE POLE WORDS ARE CSS-UPPERCASED, and innerText reports the transformed
 * text, so a case-sensitive match for "Built by me" fails against a screen
 * that is displaying exactly that. This is the documented trap; every
 * assertion about a pole word goes through here.
 */
function saysLoosely(body, text) {
  return body.toLowerCase().includes(text.toLowerCase());
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

/** Removes only one template's rows. Eight templates share this table. */
async function clearTemplate(service, memberId, template) {
  await service.from(TABLE).delete().eq('member_id', memberId).eq('experience_key', template.key);
  const { data: experiments } = await service
    .from('lifestyle_experiments')
    .select('id')
    .eq('member_id', memberId)
    .eq('source_experience_key', template.key);
  for (const row of experiments ?? []) {
    await service.from('cvs_experiment_daily_logs').delete().eq('experiment_id', row.id);
  }
  await service
    .from('lifestyle_experiments')
    .delete()
    .eq('member_id', memberId)
    .eq('source_experience_key', template.key);
  const { data: rows } = await service
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', template.definitionId);
  for (const row of rows ?? []) {
    await service.from('member_assignment_deliveries').delete().eq('assignment_id', row.id);
  }
  await service
    .from('assessment_assignments')
    .delete()
    .eq('member_id', memberId)
    .eq('assessment_definition_id', template.definitionId);
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', memberId)
    .eq('assessment_definition_id', template.definitionId);
  await service
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', memberId)
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

/**
 * Waits for a NAMED question to be on screen.
 *
 * WHY NOT SIMPLY WAIT FOR A CONTROL. Continue calls a Server Action inside a
 * React transition, and a transition deliberately keeps the PREVIOUS screen
 * on screen until it resolves. So for a second or so after the tap, the old
 * question and its writing box are both still there. The counter is the
 * honest signal: it names the question, it renders the moment the new
 * question mounts, and it is absent entirely during the chapter beat.
 */
async function waitForQuestion(page, number, control = 'textarea', timeout = 60000) {
  await page
    .getByText(new RegExp(`Question ${number} of 9`, 'i'))
    .first()
    .waitFor({ state: 'visible', timeout });
  if (control === 'textarea') {
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout });
  } else if (control === 'slider') {
    await page.locator('input[type="range"]').first().waitFor({ state: 'attached', timeout });
  }
}

/**
 * Puts her mark on the line with a real pointer, at a fraction of its width.
 *
 * A CLICK ON THE LINE, not a keyboard press and not a value written into the
 * DOM, because "usable by tap" is the thing being checked. The value that
 * actually lands is read back and returned, so every later assertion is
 * against where she really put it rather than where this run meant to.
 */
async function placeMark(page, fraction) {
  const input = page.locator('input[type="range"]').first();
  const box = await input.boundingBox();
  if (!box) return null;
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  await page.waitForTimeout(600);
  return Number(await input.inputValue());
}

/** The caption under the line: her position in words, or the unset sentence. */
async function readCaption(page) {
  return page.evaluate(() => {
    const input = document.querySelector('input[type="range"]');
    const block = input?.closest('div')?.parentElement;
    const captions = block ? Array.from(block.querySelectorAll('p')) : [];
    return captions.length ? (captions[captions.length - 1].textContent || '').trim() : null;
  });
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

/**
 * One whole sitting of this template, driven through the real screens.
 *
 * Shared by both runs, because the ONLY differences between the two are the
 * intro's extra line, the wording of question nine, and the shape of the
 * closing. Everything else is the same nine questions, and running two
 * separate copies of this walk is how the two modes quietly drift apart.
 */
async function driveSitting(ctx, { followUp }) {
  const { service, memberId, memberContext, assignmentId, memberToday } = ctx;
  const answers = { ...WRITTEN };
  answers.the_sentence_forward = followUp ? FOLLOW_UP_ANSWER : STANDALONE_SENTENCE;

  // -------------------------------------------------------------------
  // The member's next open: the pop-up, the card, one receipt.
  // -------------------------------------------------------------------
  let page = await memberContext.newPage();
  watch(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  const homeFirst = await page.innerText('body');
  check(
    'member: Root knocks with the approved sentence',
    homeFirst.includes(
      "Your coach asked Root to sit down with you on this one. It is called The Life You're Building. Nine questions, all facing forward."
    )
  );
  check('member: the knock offers a real way to say not now', /Maybe later/i.test(homeFirst));
  check(
    'member: the knock names no other experience',
    !/Owning Your Value/i.test(homeFirst)
  );
  await shot(page, `${ctx.tag}-01-popup`);
  if (await emDashOn(page)) dashes++;

  const maybeLater = page.getByRole('button', { name: /Maybe later/i });
  if (await maybeLater.count()) await maybeLater.first().click();
  await page.waitForTimeout(3000);
  const homeText = await page.innerText('body');
  check(
    'member: the persistent card on Home names it and offers a way in',
    homeText.includes(`From your coach: ${TLYB.label}`) && homeText.includes(`Start ${TLYB.label}`)
  );
  await shot(page, `${ctx.tag}-02-home-card`);

  await page.waitForTimeout(3000);
  const { data: receipts } = await service
    .from('member_assignment_deliveries')
    .select('id, presentation')
    .eq('member_id', memberId)
    .eq('assignment_id', assignmentId);
  check(
    'receipt: exactly one was written, though two surfaces fired the tracker',
    (receipts ?? []).length === 1,
    `${(receipts ?? []).length} rows`
  );

  // -------------------------------------------------------------------
  // The intro, and the one line that is the difference between the modes.
  // -------------------------------------------------------------------
  await page.goto(`${BASE}/${TLYB.key}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  // The typewriter flows one line at a time, so the last line needs a beat.
  await page.getByRole('button', { name: 'Begin' }).waitFor({ state: 'visible', timeout: 30000 });
  const introText = await page.innerText('body');
  check(
    'intro: the approved body is on screen, word for word',
    introText.includes('No scores, no right answers') &&
      introText.includes('Root has nine questions, and this time they all face forward') &&
      introText.includes('Fifteen to twenty minutes, somewhere quiet')
  );
  if (followUp) {
    check(
      'intro: it carries the held-sentence line, as its own beat',
      introText.includes(INTRO_FOLLOW_UP_LINE)
    );
  } else {
    check(
      'intro: there is NO held-sentence line anywhere on it',
      !introText.includes(INTRO_FOLLOW_UP_LINE) &&
        !/a while back/i.test(introText) &&
        !/you once asked Root/i.test(introText)
    );
    check('intro: it names no other experience', !/Owning Your Value/i.test(introText));
  }
  await shot(page, `${ctx.tag}-03-intro`);
  if (await emDashOn(page)) dashes++;

  await page.getByRole('button', { name: 'Begin' }).click();

  // -------------------------------------------------------------------
  // Screen one. Two lines she stands on, then the day three years out.
  // -------------------------------------------------------------------
  const placed = {};

  for (const [index, line] of [LINES[0], LINES[1]].entries()) {
    const number = index + 1;
    await waitForQuestion(page, number, 'slider');
    const before = await page.innerText('body');
    check(
      `question ${number}: Root says the statement her mark completes, under ${SECTION_TITLES[0]}`,
      before.includes(line.lead) && new RegExp(SECTION_TITLES[0], 'i').test(before)
    );
    check(
      `question ${number}: the line carries the two approved words`,
      saysLoosely(before, line.near) && saysLoosely(before, line.far)
    );
    check(
      `question ${number}: nothing is written yet, because the written half does not exist until she places her mark`,
      (await page.locator('textarea').count()) === 0 &&
        !before.includes(SLIDER_WRITTEN_PROMPTS[line.key])
    );
    check(
      `question ${number}: the caption says she has not placed it yet, rather than showing a default`,
      (await readCaption(page)) === 'Put your mark somewhere on the line.'
    );
    if (number === 1) await shot(page, `${ctx.tag}-04-slider-unplaced`);

    const value = await placeMark(page, line.at);
    placed[line.key] = value;
    check(
      `question ${number}: a tap on the line put her mark on it`,
      typeof value === 'number' && Number.isFinite(value),
      String(value)
    );
    if (line.at === 0.5) {
      // Deliberately the exact middle, which is where the unplaced mark is
      // already drawn. A range input fires no change event when its value
      // does not move, so this is the tap that used to do nothing at all.
      check(
        'question 2: a tap landing exactly where the mark already sits STILL places it',
        (await readCaption(page)) !== 'Put your mark somewhere on the line.',
        String(await readCaption(page))
      );
    }
    const caption = await readCaption(page);
    check(
      `question ${number}: her position is read back in words, never as a number`,
      caption === positionInWords(value, line.near, line.far),
      `${caption} vs ${positionInWords(value ?? 50, line.near, line.far)}`
    );

    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
    check(
      `question ${number}: only once she has placed it does the written half arrive`,
      (await page.innerText('body')).includes(SLIDER_WRITTEN_PROMPTS[line.key])
    );
    if (number === 1) await shot(page, `${ctx.tag}-05-slider-placed`);

    await page.locator('textarea').fill(answers[line.key]);
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await waitForQuestion(page, 3);
  const q3 = await page.innerText('body');
  check(
    'question 3: it asks for one ordinary day three years from now',
    q3.includes('Describe one ordinary day in your life three years from now')
  );
  check(
    'member: the screen says her writing is saved',
    q3.includes('Saved. You can close this and come back to it.')
  );
  await page.locator('textarea').fill(answers.ordinary_day);
  await page.getByRole('button', { name: 'Continue' }).click();

  // -------------------------------------------------------------------
  // Screen two. The materials, and the third line.
  // -------------------------------------------------------------------
  await waitForQuestion(page, 4);
  check(
    'member: she crossed into The Materials',
    new RegExp(SECTION_TITLES[1], 'i').test(await page.innerText('body'))
  );
  await page.locator('textarea').fill(answers.already_in_hand);
  await page.getByRole('button', { name: 'Continue' }).click();

  const third = LINES[2];
  await waitForQuestion(page, 5, 'slider');
  const q5 = await page.innerText('body');
  check(
    'question 5: the third line asks what is between her and that life',
    q5.includes(third.lead) && saysLoosely(q5, third.near) && saysLoosely(q5, third.far)
  );
  check(
    'question 5: nothing is written yet, because the written half does not exist until she places her mark',
    (await page.locator('textarea').count()) === 0 &&
      !q5.includes(SLIDER_WRITTEN_PROMPTS[third.key])
  );
  placed[third.key] = await placeMark(page, third.at);
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
  check(
    'question 5: only once she has placed it does the written half arrive',
    (await page.innerText('body')).includes(SLIDER_WRITTEN_PROMPTS[third.key])
  );
  await page.locator('textarea').fill(answers.what_is_between);
  await page.getByRole('button', { name: 'Continue' }).click();

  await waitForQuestion(page, 6);
  await page.locator('textarea').fill(answers.what_she_did_not_know);
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForQuestion(page, 7);

  // -------------------------------------------------------------------
  // Save and resume, across a genuinely closed tab.
  // -------------------------------------------------------------------
  const { data: draftRows } = await service
    .from(TABLE)
    .select(
      'id, answers, slider_positions, completed_at, first_stone, forward_sentence, experience_key, follow_up_source_experience_key'
    )
    .eq('member_id', memberId)
    .eq('experience_key', TLYB.key);
  const draft = draftRows?.[0];
  check(
    'draft: one row exists, unfinished',
    (draftRows ?? []).length === 1 && !draft?.completed_at
  );
  check(
    'draft: all three marks are stored structured, under this template’s own question keys',
    samePositions(draft?.slider_positions, placed),
    JSON.stringify(draft?.slider_positions ?? null)
  );
  check(
    'draft: it is stored under this template, not one of the seven beside it',
    draft?.experience_key === TLYB.key
  );
  check(
    followUp
      ? 'draft: the follow-up flag records that this sitting is running as one'
      : 'draft: the follow-up flag is null, because this sitting is standalone',
    draft?.follow_up_source_experience_key === (followUp ? OYV.key : null),
    String(draft?.follow_up_source_experience_key ?? null)
  );
  check(
    'draft: neither stored column is filled in before she finishes',
    draft?.first_stone === null && draft?.forward_sentence === null
  );

  // The tab is genuinely closed. Nothing survives in memory.
  await page.close();
  page = await memberContext.newPage();
  watch(page);
  await page.goto(`${BASE}/${TLYB.key}`, { waitUntil: 'domcontentloaded' });
  await waitForQuestion(page, 7);
  const resumed = await page.innerText('body');
  check('resume: a brand new tab lands her back on question seven', /Question 7 of 9/i.test(resumed));
  check('resume: it is not the intro again', !resumed.includes('Fifteen to twenty minutes'));
  await shot(page, `${ctx.tag}-06-resumed`);

  // Back to the third line, to read the mark and the writing as they came back.
  await page.getByRole('button', { name: 'Back' }).click();
  await waitForQuestion(page, 6);
  await page.getByRole('button', { name: 'Back' }).click();
  await waitForQuestion(page, 5, 'slider');
  await page.waitForTimeout(1200);
  check(
    'resume: her mark came back exactly where she put it',
    Number(await page.locator('input[type="range"]').first().inputValue()) === placed[third.key],
    `${await page.locator('input[type="range"]').first().inputValue()} vs ${placed[third.key]}`
  );
  check(
    'resume: and it is still read back in the same words',
    (await readCaption(page)) === positionInWords(placed[third.key], third.near, third.far)
  );
  check(
    'resume: its written half came back with it, character for character',
    (await page.locator('textarea').inputValue()) === answers.what_is_between
  );
  await shot(page, `${ctx.tag}-07-resumed-line`);
  if (await emDashOn(page)) dashes++;

  // Forward again to where she was.
  for (const n of [6, 7]) {
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForQuestion(page, n);
  }

  // -------------------------------------------------------------------
  // Screen three, and question nine in whichever mode is running.
  // -------------------------------------------------------------------
  check(
    'member: she crossed into The First Stone',
    new RegExp(SECTION_TITLES[2], 'i').test(await page.innerText('body'))
  );
  await page.locator('textarea').fill(answers.the_piece_that_matters);
  await page.getByRole('button', { name: 'Continue' }).click();

  await waitForQuestion(page, 8);
  check(
    'question 8: it asks for the first stone, inside the next seven days',
    (await page.innerText('body')).includes(
      'What is the first stone? One act in the next seven days that belongs to that life, not this one.'
    )
  );
  await page.locator('textarea').fill(answers.the_first_stone);
  await page.getByRole('button', { name: 'Continue' }).click();

  await waitForQuestion(page, 9);
  const q9 = await page.innerText('body');
  check('member: question nine is the last one', /Question 9 of 9/i.test(q9));
  if (followUp) {
    check(
      'question 9: it quotes the sentence she left, character for character',
      q9.includes(`You once asked Root to hold onto this: ${HELD_SENTENCE}`),
      q9.slice(Math.max(0, q9.indexOf('You once asked')), q9.indexOf('You once asked') + 200)
    );
    check(
      'question 9: and then asks the approved question',
      q9.includes('Read it now, from where you are standing today. What do you want to say back to it?')
    );
    check('question 9: it is not the standalone question', !q9.includes(STANDALONE_Q9));
  } else {
    check('question 9: it is the standalone question, word for word', q9.includes(STANDALONE_Q9));
    check(
      'question 9: it quotes no earlier sentence and names no other experience',
      !/you once asked Root/i.test(q9) && !/Owning Your Value/i.test(q9)
    );
  }
  await shot(page, `${ctx.tag}-08-question-9`);
  if (await emDashOn(page)) dashes++;

  await page.locator('textarea').fill(answers.the_sentence_forward);
  await page.getByRole('button', { name: 'Finish' }).click();

  // -------------------------------------------------------------------
  // The closing.
  // -------------------------------------------------------------------
  const fixedLine = followUp ? FOLLOW_UP_CLOSING_LINE : STANDALONE_CLOSING_LINE;

  // The picture of her lines takes the first beat, before any of her
  // sentences, which is the staged reveal doing what it is for.
  await page.getByText(MAP_HEADING, { exact: false }).first().waitFor({ state: 'visible', timeout: 40000 });
  if (followUp) {
    const nowYet = (await page.innerText('body')).includes(FOLLOW_UP_ANSWER);
    check(
      'closing: Then arrives before Now, rather than the pair landing together',
      !nowYet,
      nowYet ? 'both were on screen at once' : ''
    );
  }

  await page.getByText(fixedLine, { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 });
  // WAIT FOR THE LAST BEAT BEFORE READING THE SCREEN. The heading, the body
  // and the way onward arrive after the fixed line has had its own pause.
  await page
    .getByRole('button', { name: 'Continue' })
    .first()
    .waitFor({ state: 'visible', timeout: 30000 });

  const closing = await page.innerText('body');
  check(
    'closing: the composition of her three lines is on screen',
    saysLoosely(closing, MAP_HEADING)
  );
  for (const line of LINES) {
    check(
      `closing: the line "${line.lead}" is labelled with the question it answers`,
      closing.includes(line.lead)
    );
    check(
      `closing: her position on it is printed in words, and they are the right words`,
      saysLoosely(closing, positionInWords(placed[line.key], line.near, line.far)),
      positionInWords(placed[line.key], line.near, line.far)
    );
  }
  check(
    'closing: no raw position number appears anywhere on it',
    !new RegExp(`\\b${placed.built_or_handed}\\b`).test(closing) &&
      !new RegExp(`\\b${placed.what_is_between}\\b`).test(closing)
  );
  check('closing: her sentence is on screen, verbatim', closing.includes(answers.the_sentence_forward));
  check('closing: the one fixed line is printed exactly as approved', closing.includes(fixedLine));
  if (followUp) {
    check(
      'closing: her earlier sentence is printed above it, verbatim',
      closing.includes(HELD_SENTENCE)
    );
    const lower = closing.toLowerCase();
    check(
      'closing: they are labelled Then and Now, in that order',
      lower.indexOf('then') > -1 &&
        lower.indexOf('now') > lower.indexOf('then') &&
        closing.indexOf(HELD_SENTENCE) < closing.indexOf(FOLLOW_UP_ANSWER)
    );
    check(
      'closing: the standalone fixed line is nowhere on it',
      !closing.includes(STANDALONE_CLOSING_LINE)
    );
  } else {
    check(
      'closing: nothing on it mentions another experience, or a sentence from one',
      !/Owning Your Value/i.test(closing) &&
        !closing.includes(HELD_SENTENCE) &&
        // The Then label is a line of its own above her sentence, so this
        // matches the LABEL rather than the ordinary English word, which
        // she is free to have written.
        !/(^|\n)\s*then\s*(\n|$)/i.test(closing)
    );
    check(
      'closing: the follow-up fixed line is nowhere on it',
      !closing.includes(FOLLOW_UP_CLOSING_LINE)
    );
  }
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
    Object.entries(answers)
      .filter(([key]) => key !== 'the_sentence_forward')
      .every(([, answer]) => !closing.includes(answer))
  );
  await shot(page, `${ctx.tag}-09-closing`);
  if (await emDashOn(page)) dashes++;

  // THE HOLD. Several seconds, several server round trips.
  await page.waitForTimeout(9000);
  const stillThere = await page.innerText('body');
  check(
    'closing: it is STILL on screen nine seconds and several server round trips later',
    stillThere.includes(answers.the_sentence_forward) && stillThere.includes(fixedLine)
  );
  check(
    'closing: it was never replaced by the already-done panel',
    !stillThere.includes('This one is done')
  );
  check('closing: the URL never moved', page.url().includes(`/${TLYB.key}`));
  await shot(page, `${ctx.tag}-10-closing-holding`);

  // -------------------------------------------------------------------
  // What was stored.
  // -------------------------------------------------------------------
  const { data: finishedRows } = await service
    .from(TABLE)
    .select(
      'id, first_stone, forward_sentence, slider_positions, answers, completed_at, follow_up_source_experience_key'
    )
    .eq('member_id', memberId)
    .eq('experience_key', TLYB.key);
  const finished = finishedRows?.[0];
  check('storage: the sitting is completed', Boolean(finished?.completed_at));
  check('storage: exactly one sitting exists, not two', (finishedRows ?? []).length === 1);
  check(
    'storage: the first stone is in its own column, verbatim',
    finished?.first_stone === answers.the_first_stone,
    String(finished?.first_stone ?? null)
  );
  check(
    'storage: her sentence is in its own column, verbatim, in this mode too',
    finished?.forward_sentence === answers.the_sentence_forward,
    String(finished?.forward_sentence ?? null)
  );
  check(
    'storage: all three marks are stored where she put them',
    samePositions(finished?.slider_positions, placed),
    JSON.stringify(finished?.slider_positions ?? null)
  );
  check(
    'storage: all nine written answers are stored',
    Object.keys(finished?.answers ?? {}).length === 9
  );
  check(
    followUp
      ? 'storage: the flag records that this sitting followed the earlier one'
      : 'storage: the flag is null, as a standalone sitting requires',
    finished?.follow_up_source_experience_key === (followUp ? OYV.key : null)
  );

  const { data: closedOut } = await service
    .from('assessment_assignments')
    .select('status')
    .eq('id', assignmentId)
    .maybeSingle();
  check('ledger: finishing closed the assignment out', closedOut?.status === 'completed');

  // -------------------------------------------------------------------
  // The experiment.
  // -------------------------------------------------------------------
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(3000);
  const offer = await page.innerText('body');
  check('experiment: the offer is the approved action', offer.includes(EXPERIMENT_ACTION));
  check('experiment: there is a real way to decline', /Not right now/.test(offer));
  await shot(page, `${ctx.tag}-11-experiment-offer`);

  // WAIT ON THE NEXT SCREEN'S OWN CONTROL, NEVER ON A CLOCK. Accepting the
  // experiment runs a Server Action that also revalidates Home, and Home is
  // a heavy page, so the response can take well over five seconds.
  await page.getByRole('button', { name: /I'm in: start the 7 days/ }).click();
  await page
    .getByRole('button', { name: 'Back to home' })
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
  const done = await page.innerText('body');
  check('experiment: she is told where it went', done.includes('It is on your dashboard now'));
  check('closing: the piece of reading is offered, summary first', done.includes(RESOURCE_TITLE));
  check(
    'closing: her sentence is still with her on the last screen',
    done.includes(answers.the_sentence_forward)
  );
  await shot(page, `${ctx.tag}-12-done`);
  if (await emDashOn(page)) dashes++;

  const { data: experiments } = await service
    .from('lifestyle_experiments')
    .select('id, title, protocol, duration_days, status, start_date')
    .eq('member_id', memberId)
    .eq('source_experience_key', TLYB.key);
  check('experiment: exactly one row was written', (experiments ?? []).length === 1);
  check('experiment: it runs seven days', experiments?.[0]?.duration_days === 7);
  check('experiment: it starts on HER calendar day', experiments?.[0]?.start_date === memberToday);
  check(
    'experiment: the stored protocol is the approved action',
    (experiments?.[0]?.protocol ?? '').includes(EXPERIMENT_ACTION)
  );
  check(
    'experiment: the stored protocol never bakes her own first stone into it',
    !(experiments?.[0]?.protocol ?? '').includes(answers.the_first_stone)
  );

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);
  const home = await page.innerText('body');
  check('home: the experiment card carries the approved daily question', home.includes(DAILY_QUESTION));
  const experimentCard = page.locator('div', { hasText: DAILY_QUESTION }).last();
  const cardText = (await experimentCard.count()) ? await experimentCard.innerText() : '';
  check('home: it says which day of seven she is on', /Day 1 of 7/i.test(cardText), cardText.slice(0, 80));
  check(
    'home: the assignment card is gone now that the sitting is finished',
    !home.includes(`From your coach: ${TLYB.label}`)
  );
  await shot(page, `${ctx.tag}-13-home-experiment-card`);
  if (await emDashOn(page)) dashes++;

  const yes = experimentCard.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.count()) {
    await yes.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await yes.first().evaluate((el) => el.click());
    await page.waitForTimeout(4500);
    check(
      'home: her evening tap is recorded and the card says so',
      (await page.innerText('body')).includes('Logged: yes, something did.')
    );
  } else {
    check('home: her evening tap is recorded and the card says so', false, 'no Yes button found');
  }

  // Reopening a finished sitting is an answer, not a mystery.
  await page.goto(`${BASE}/${TLYB.key}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const reopened = await page.innerText('body');
  check('member: reopening it says it is done rather than bouncing her', reopened.includes('This one is done'));
  check('member: and it shows her sentence again', reopened.includes(answers.the_sentence_forward));
  if (followUp) {
    check('member: a follow-up sitting still shows both sentences', reopened.includes(HELD_SENTENCE));
  } else {
    check(
      'member: a standalone sitting still mentions no other experience',
      !/Owning Your Value/i.test(reopened) && !reopened.includes(HELD_SENTENCE)
    );
  }
  await shot(page, `${ctx.tag}-14-reopened`);

  await page.close();
  return { answers, placed };
}

/** The coach assigns it, from the real button on the real card. */
async function coachAssigns(ctx, { first }) {
  const { coachPage, service, memberId, memberToday } = ctx;
  await coachPage.goto(`${BASE}/coach/clients/${memberId}/detail`, {
    waitUntil: 'domcontentloaded',
  });
  await coachPage.waitForTimeout(3000);
  await openAssessmentsFold(coachPage, TLYB.label);

  const panel = coachPage.locator(`section[aria-label="${TLYB.label}"]`);
  const panelFound = (await panel.count()) === 1;
  check('coach: the card is on the client screen', panelFound);
  if (!panelFound) throw new Error('No panel on the coach screen.');

  if (first) {
    // Migration 219 dropped and recreated a policy all eight templates
    // depend on, so the seven beside it are checked before anything moves.
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
    await shot(coachPage, `${ctx.tag}-00-coach-before-assign`);
  }

  await panel.getByRole('button', { name: new RegExp(`Assign ${TLYB.label}`) }).click();
  await coachPage.waitForTimeout(4000);

  const { data: assignments } = await service
    .from('assessment_assignments')
    .select('id, status, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', TLYB.definitionId)
    .eq('status', 'pending');
  check(
    'ledger: exactly one assignment row was written',
    (assignments ?? []).length === 1,
    `${(assignments ?? []).length} rows`
  );
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
  await coachPage.waitForTimeout(3000);
  await openAssessmentsFold(coachPage, TLYB.label);
  const sentLine = await coachPage.locator(`section[aria-label="${TLYB.label}"]`).innerText();
  check(
    'coach: the card now prints a sent-and-not-yet-seen sentence',
    /Sent/.test(sentLine),
    sentLine.slice(0, 140)
  );
  check('coach: nothing on it says Overdue on the day it was sent', !/Overdue/.test(sentLine));
  check(
    "coach: the assignment list names it, and does not call it 'Assessment'",
    new RegExp(TLYB.label.replace(/'/g, "['’]")).test(await coachPage.innerText('body'))
  );
  if (await emDashOn(coachPage)) dashes++;

  return assignments?.[0]?.id ?? null;
}

/** The coach reads the finished sitting back. */
async function coachReadsBack(ctx, { followUp, answers, placed }) {
  const { coachPage, memberId } = ctx;
  await coachPage.goto(`${BASE}/coach/clients/${memberId}/detail`, {
    waitUntil: 'domcontentloaded',
  });
  await coachPage.waitForTimeout(3500);
  await openAssessmentsFold(coachPage, TLYB.label);
  const card = coachPage.locator(`section[aria-label="${TLYB.label}"]`);
  const cardFound = (await card.count()) === 1;
  check('coach: the finished sitting is on the card', cardFound);
  if (!cardFound) return;

  const text = await card.innerText();
  const positionsAt = text.search(/Where they placed themselves/i);
  const stoneAt = text.search(/The first stone/i);
  const answersAt = text.search(/What they wrote/i);

  check('coach: her three positions are at the top', positionsAt > -1);
  for (const line of LINES) {
    check(
      `coach: "${line.lead}" is shown with her position in words`,
      text.includes(line.lead) &&
        saysLoosely(text, positionInWords(placed[line.key], line.near, line.far)),
      positionInWords(placed[line.key], line.near, line.far)
    );
  }
  check(
    'coach: the first stone is the session opener, under the positions',
    stoneAt > positionsAt && text.includes(answers.the_first_stone),
    `positions ${positionsAt}, stone ${stoneAt}`
  );

  if (followUp) {
    const bandAt = text.search(/Follow-up from Owning Your Value/i);
    check('coach: the follow-up band names the earlier template', bandAt > -1);
    check('coach: the band is under the first stone and above the writing', bandAt > stoneAt && answersAt > bandAt, `stone ${stoneAt}, band ${bandAt}, answers ${answersAt}`);
    check('coach: it shows the sentence they left then, verbatim', text.includes(HELD_SENTENCE));
    check('coach: and what they say back to it now, verbatim', text.includes(FOLLOW_UP_ANSWER));
    check(
      'coach: both sides are labelled',
      /The sentence they left then/i.test(text) && /What they say now/i.test(text)
    );
    check('coach: it does not also claim the sitting ran standalone', !text.includes(STANDALONE_NOTE));
  } else {
    check(
      'coach: there is NO follow-up band on a standalone sitting',
      !new RegExp(FOLLOW_UP_BAND, 'i').test(text)
    );
    check(
      'coach: the card says plainly that this sitting ran on its own',
      text.includes(STANDALONE_NOTE)
    );
    check('coach: nothing on the card names another experience', !/Owning Your Value/i.test(text));
  }

  check(
    'coach: all nine written answers are shown raw, under the writing heading',
    answersAt > stoneAt && Object.values(answers).every((answer) => text.includes(answer)),
    `answers ${answersAt}`
  );
  check(
    'coach: the three screens are named',
    SECTION_TITLES.every((title) => text.includes(title))
  );
  check(
    'coach: nothing on the card scores her',
    !/\bseverity\b/i.test(text) && !/\bpattern\b/i.test(text)
  );
  await shot(coachPage, `${ctx.tag}-15-coach-card`);
  if (await emDashOn(coachPage)) dashes++;

  for (const sibling of SIBLINGS) {
    check(
      `coach: the ${sibling} card is STILL standing after the run`,
      (await coachPage.locator(`section[aria-label="${sibling}"]`).count()) === 1
    );
  }
}

/**
 * Owning Your Value, driven to completion through its own real screens.
 *
 * RUN B'S SET-UP, AND IT IS A REAL SITTING RATHER THAN AN INSERTED ROW. The
 * sentence the follow-up quotes has to be one a member actually typed into
 * that template's own question nine, or this run would be checking that a
 * hand-written row can be read back rather than that two experiences join
 * up.
 *
 * Its own experiment is DECLINED, because the two active experiment cap is
 * shared and the one this run cares about is the one The Life You're
 * Building offers.
 */
async function completeOwningYourValue(ctx) {
  const { service, memberId, memberContext, coachPage } = ctx;

  await coachPage.goto(`${BASE}/coach/clients/${memberId}/detail`, {
    waitUntil: 'domcontentloaded',
  });
  await coachPage.waitForTimeout(3000);
  await openAssessmentsFold(coachPage, OYV.label);
  const panel = coachPage.locator(`section[aria-label="${OYV.label}"]`);
  const found = (await panel.count()) === 1;
  check('set-up: the Owning Your Value card is on the client screen', found);
  if (!found) throw new Error('No Owning Your Value panel on the coach screen.');
  await panel.getByRole('button', { name: new RegExp(`Assign ${OYV.label}`) }).click();
  await coachPage.waitForTimeout(4000);

  const page = await memberContext.newPage();
  watch(page);
  await page.goto(`${BASE}/${OYV.key}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: 'Begin' }).click();

  for (let index = 0; index < OYV_WRITTEN.length; index += 1) {
    await waitForQuestion(page, index + 1);
    await page.locator('textarea').fill(OYV_WRITTEN[index]);
    await page
      .getByRole('button', { name: index === OYV_WRITTEN.length - 1 ? 'Finish' : 'Continue' })
      .click();
  }

  // Its closing, then its offer, which is declined.
  await page
    .getByRole('button', { name: 'Continue' })
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(3000);
  const decline = page.getByRole('button', { name: 'Not right now' });
  if (await decline.count()) await decline.first().click();
  await page.waitForTimeout(3000);

  const { data: rows } = await service
    .from(TABLE)
    .select('id, held_sentence, completed_at')
    .eq('member_id', memberId)
    .eq('experience_key', OYV.key);
  check(
    'set-up: one Owning Your Value sitting is completed, with her sentence in its own column',
    (rows ?? []).length === 1 &&
      Boolean(rows?.[0]?.completed_at) &&
      rows?.[0]?.held_sentence === HELD_SENTENCE,
    String(rows?.[0]?.held_sentence ?? null)
  );
  const { data: oyvExperiments } = await service
    .from('lifestyle_experiments')
    .select('id')
    .eq('member_id', memberId)
    .eq('source_experience_key', OYV.key);
  check(
    'set-up: its experiment was declined, so the cap is free for this template’s',
    (oyvExperiments ?? []).length === 0
  );
  await shot(page, `${ctx.tag}-00-owning-your-value-done`);
  await page.close();
}

/** Reduced motion, on the real site, in a context that asks for it. */
async function reducedMotionWalk(ctx, browser) {
  const { service, memberId, memberToday } = ctx;
  const { data: extra } = await service
    .from('assessment_assignments')
    .insert({
      member_id: memberId,
      assessment_definition_id: TLYB.definitionId,
      assigned_by: memberId,
      is_required: true,
      reason: null,
      stage: 'standard',
      due_at: new Date(`${addDays(memberToday, 7)}T00:00:00Z`).toISOString(),
    })
    .select('id')
    .maybeSingle();
  check('reduced motion: a second sitting could be opened to walk it in', Boolean(extra?.id));
  if (!extra?.id) return null;

  const calm = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
    contextOptions: { reducedMotion: 'reduce' },
  });
  if (!calm) {
    check('reduced motion: a reduced-motion session could be minted', false);
    return null;
  }

  const page = await calm.context.newPage();
  watch(page);
  await page.goto(`${BASE}/${TLYB.key}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: 'Begin' }).click();
  await waitForQuestion(page, 1, 'slider');

  check(
    'reduced motion: the line is usable immediately, on a 390px phone',
    (await page.locator('input[type="range"]').count()) === 1
  );
  check(
    'reduced motion: the line is fully readable at 390px, with nothing scrolling sideways',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  );
  const value = await placeMark(page, 0.3);
  check(
    'reduced motion: a tap alone places her mark, with no drag anywhere',
    typeof value === 'number' && Number.isFinite(value),
    String(value)
  );
  check(
    'reduced motion: the mark and the fill have no transition on them at all',
    await page.evaluate(() => {
      const painted = document.querySelectorAll('input[type="range"] ~ div span[style]');
      return Array.from(painted).every((node) => !(node.getAttribute('style') || '').includes('transition'));
    })
  );
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
  check(
    'reduced motion: the written half is there the moment she places it, with nothing typed',
    (await page.locator('textarea').count()) === 1
  );
  check(
    'reduced motion: nothing on the question is waiting to fade in',
    (await page.locator('.mef-fade-in').count()) === 0
  );
  await shot(page, `${ctx.tag}-16-reduced-motion`);
  if (await emDashOn(page)) dashes++;
  await page.close();
  return calm;
}

async function main() {
  if (!canMintSessions()) throw new Error('Session minting is not configured.');
  if (!STAFF_EMAIL || !MEMBER_EMAIL) {
    throw new Error('STAFF_EMAIL and TEST_MEMBER_EMAIL are both required.');
  }

  const service = serviceClient();

  // The fixture is resolved by EMAIL rather than taken from an id in the
  // environment, so a typo in an id cannot address a stranger's account.
  const memberId = await findUserIdByEmail(service, MEMBER_EMAIL);
  if (!memberId) throw new Error('That test member email resolves to no account.');
  const { data: profile } = await service
    .from('profiles')
    .select('id, timezone, is_test')
    .eq('id', memberId)
    .maybeSingle();
  if (!profile?.is_test) {
    throw new Error('Refusing to run: that member is not a seeded test account.');
  }
  const timezone = profile.timezone ?? 'America/New_York';
  const memberToday = todayIn(timezone);
  note(`member ${memberId} today ${memberToday} in ${timezone}`);

  // How many rows the templates this run must not touch hold before it, so
  // the regression check at the end can prove it touched none.
  const untouchedBefore = {};
  for (const key of UNTOUCHED_KEYS) {
    const { count } = await service
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('experience_key', key);
    untouchedBefore[key] = count ?? 0;
  }

  const { data: experimentsBefore } = await service
    .from('lifestyle_experiments')
    .select('id, title, source_experience_key, status')
    .eq('member_id', memberId);
  check(
    'fixture: the account carries no leftover experiment before the run',
    (experimentsBefore ?? []).length === 0,
    JSON.stringify(experimentsBefore ?? [])
  );

  const { data: oyvBefore } = await service
    .from(TABLE)
    .select('id')
    .eq('member_id', memberId)
    .eq('experience_key', OYV.key);
  check(
    'fixture: the account carries no Owning Your Value sitting, so run A is genuinely standalone',
    (oyvBefore ?? []).length === 0,
    `${(oyvBefore ?? []).length} rows`
  );

  await clearTemplate(service, memberId, TLYB);

  const browser = await chromium.launch();
  let staff = null;
  let member = null;
  let calmA = null;
  let calmB = null;

  try {
    staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
    if (!staff) throw new Error('Could not mint a staff session.');
    member = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 430, height: 932 },
    });
    if (!member) throw new Error('Could not mint a member session.');

    const coachPage = await staff.context.newPage();
    watch(coachPage);

    // =================================================================
    // RUN A: STANDALONE.
    // =================================================================
    phase = 'RUN A standalone';
    const ctxA = {
      service,
      memberId,
      memberToday,
      memberContext: member.context,
      coachPage,
      tag: 'A',
    };
    ctxA.assignmentId = await coachAssigns(ctxA, { first: true });
    const runA = await driveSitting(ctxA, { followUp: false });
    await coachReadsBack(ctxA, { followUp: false, ...runA });
    calmA = await reducedMotionWalk(ctxA, browser);

    // =================================================================
    // RUN B: FOLLOW-UP.
    // =================================================================
    phase = 'RUN B follow-up';
    // Run A's rows come off first, so run B is a fresh sitting rather than
    // a second one stacked on top of a finished one.
    await clearTemplate(service, memberId, TLYB);
    const ctxB = {
      service,
      memberId,
      memberToday,
      memberContext: member.context,
      coachPage,
      tag: 'B',
    };
    await completeOwningYourValue(ctxB);
    ctxB.assignmentId = await coachAssigns(ctxB, { first: false });
    const runB = await driveSitting(ctxB, { followUp: true });
    await coachReadsBack(ctxB, { followUp: true, ...runB });
    calmB = await reducedMotionWalk(ctxB, browser);

    // =================================================================
    // Regression and cleanliness.
    // =================================================================
    phase = 'both runs';
    for (const key of UNTOUCHED_KEYS) {
      const { count } = await service
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .eq('experience_key', key);
      check(
        `regression: neither run touched a ${key} sitting`,
        (count ?? 0) === untouchedBefore[key],
        `${untouchedBefore[key]} before, ${count ?? 0} after`
      );
    }
    check('no em dash appeared on any screen either of them saw', dashes === 0, `${dashes} screens`);
    check('no console or page error on any screen', errors.length === 0, errors.slice(0, 4).join(' | '));

    await coachPage.close();
  } finally {
    await clearTemplate(service, memberId, TLYB);
    await clearTemplate(service, memberId, OYV);
    await retireSession(staff);
    await retireSession(member);
    await retireSession(calmA);
    await retireSession(calmB);
    await browser.close();
  }

  // ---------------- THE ACCOUNT IS LEFT AS IT WAS FOUND ----------------
  phase = 'cleanup';
  for (const template of [TLYB, OYV]) {
    const { data: leftSittings } = await service
      .from(TABLE)
      .select('id')
      .eq('member_id', memberId)
      .eq('experience_key', template.key);
    check(
      `cleanup: no ${template.label} sitting from this run is left on production`,
      (leftSittings ?? []).length === 0,
      JSON.stringify(leftSittings ?? [])
    );

    const { data: leftAssignments } = await service
      .from('assessment_assignments')
      .select('id')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', template.definitionId);
    check(
      `cleanup: no ${template.label} assignment from this run is left`,
      (leftAssignments ?? []).length === 0
    );

    const { data: leftAttempts } = await service
      .from('assessment_attempts')
      .select('id')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', template.definitionId);
    check(
      `cleanup: no ${template.label} attempt row from this run is left`,
      (leftAttempts ?? []).length === 0
    );

    const { data: leftDismissals } = await service
      .from('member_root_popup_dismissals')
      .select('message_key')
      .eq('member_id', memberId)
      .like('message_key', `${template.dismissalPrefix}:%`);
    check(
      `cleanup: no ${template.label} pop-up dismissal row from this run is left`,
      (leftDismissals ?? []).length === 0
    );
  }

  const { data: leftExperiments } = await service
    .from('lifestyle_experiments')
    .select('id, source_experience_key')
    .eq('member_id', memberId);
  check(
    'cleanup: the account holds no experiment at all',
    (leftExperiments ?? []).length === 0,
    JSON.stringify(leftExperiments ?? [])
  );

  const byPhase = new Map();
  for (const row of results) {
    const bucket = byPhase.get(row.phase) ?? { passed: 0, total: 0 };
    bucket.total += 1;
    if (row.passed) bucket.passed += 1;
    byPhase.set(row.phase, bucket);
  }
  console.log('');
  for (const [name, bucket] of byPhase) {
    console.log(`  ${name}: ${bucket.passed}/${bucket.total}`);
  }
  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} checks passed on ${BASE}`);
  if (passed !== results.length) {
    console.log('\nFailures:');
    for (const row of results.filter((r) => !r.passed)) {
      console.log(`  [${row.phase}] ${row.name}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
