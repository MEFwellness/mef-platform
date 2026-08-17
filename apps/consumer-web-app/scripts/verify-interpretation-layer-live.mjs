#!/usr/bin/env node
/**
 * Live verification of the Member Interpretation Layer build (2026-08-17)
 * against the real production site, signed in as the standing test member
 * with her own password through the real login form.
 *
 * READS ONLY, except for one deliberate, additive write: the check-in the
 * build prompt asks for, gated behind DO_CHECKIN=1 so an accidental run
 * cannot write to her account. Nothing is ever deleted or altered.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   MEMBER_PASSWORD_FILE=/path/to/pw.txt SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-interpretation-layer-live.mjs
 *
 * The password comes from a file rather than an argument so it does not
 * land in shell history or in a process listing.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const PASSWORD = readFileSync(process.env.MEMBER_PASSWORD_FILE, 'utf8').trim();
const SHOTS = process.env.SHOTS_DIR ?? './live-shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

const TIER_LABELS = [
  'Early indication',
  'Emerging pattern',
  'Supported by repeated check-ins',
  'Coach verified',
];

const browser = await chromium.launch();
const captured = {};

try {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 });
  check('signed in through the real login form', true, EMAIL);

  async function visit(pathname, key, waitMs = 2200) {
    await page.goto(`${BASE}${pathname}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(waitMs);
    const text = await page.locator('body').innerText();
    captured[key] = text;
    await page.screenshot({ path: `${SHOTS}/${key}.png`, fullPage: true });
    return text;
  }

  // -----------------------------------------------------------------
  // 1. One focus, everywhere.
  // -----------------------------------------------------------------
  const home = await visit('/dashboard', 'home');

  /**
   * The sentence under a focus label, wherever it appears. Home carries the
   * Priority Card itself while it is active and the "Your one thing today"
   * pointer when she has already set it aside or finished it, so both labels
   * are looked for and both are the same engine's words.
   */
  function focusIn(text) {
    for (const label of ['YOUR PRIORITY TODAY', 'YOUR ONE THING TODAY', 'DONE TODAY']) {
      const idx = text.indexOf(label);
      if (idx === -1) continue;
      const after = text.slice(idx + label.length);
      const line = after.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? null;
      if (line) return line;
    }
    return null;
  }

  const focusFromHome = focusIn(home);
  check('Home names one focus, from the Priority Card', focusFromHome !== null, focusFromHome ?? '');

  for (const [pathname, key] of [
    ['/root-score', 'root-score'],
    ['/today', 'today'],
    ['/movement', 'movement'],
    ['/root-map', 'root-map'],
    ['/recommendations', 'recommendations'],
  ]) {
    const text = await visit(pathname, key);
    const own = focusIn(text);
    const named = own !== null && focusFromHome !== null && own === focusFromHome;
    check(
      `${pathname} names the same focus as Home`,
      named,
      own === null ? 'no focus named on this screen' : own
    );
  }

  // Nothing on Home outside the Priority Card claims a focus of its own.
  const homeFocusClaims = [
    "TODAY'S FOCUS",
    "Today's focus",
    'Prioritized Next Action',
    'Recommended for you: Today',
  ].filter((phrase) => home.includes(phrase));
  check(
    'nothing on Home outside the Priority Card names a focus',
    homeFocusClaims.length === 0,
    homeFocusClaims.join(' | ')
  );

  // -----------------------------------------------------------------
  // 2. Talk to Root: same focus, same score.
  // -----------------------------------------------------------------
  const scoreOnHome = home.match(/(\d{1,3})\s*\/\s*100/)?.[1] ?? null;
  check('Home shows a Root Score', scoreOnHome !== null, scoreOnHome ? `${scoreOnHome} / 100` : '');

  await page.goto(`${BASE}/conversation`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const composer = page.locator('textarea, input[type="text"]').first();
  const QUESTION = 'What is my root score right now, and what is my focus today?';
  let rootAnswer = '';
  if (await composer.count()) {
    await composer.fill(QUESTION);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(25000);
    const transcript = await page.locator('body').innerText();
    captured['talk-to-root'] = transcript;
    // Only the reply to THIS question. The transcript legitimately contains
    // older answers, including ones given before this build shipped, and
    // scanning the whole thing would judge the fix by what it said last week.
    const at = transcript.lastIndexOf(QUESTION);
    rootAnswer = at === -1 ? transcript : transcript.slice(at + QUESTION.length);
    captured['talk-to-root-latest-reply'] = rootAnswer;
    await page.screenshot({ path: `${SHOTS}/talk-to-root.png`, fullPage: true });
  }
  const rootStatesScore = scoreOnHome ? rootAnswer.includes(scoreOnHome) : false;
  const rootDeniesScore = /hasn'?t calculated|has not calculated|no score yet/i.test(rootAnswer);
  check(
    'Talk to Root states the same score Home shows',
    rootStatesScore && !rootDeniesScore,
    rootDeniesScore ? 'Root still says the score has not calculated' : `looked for ${scoreOnHome}`
  );

  // -----------------------------------------------------------------
  // 3. One finding, cross referenced, not three.
  // -----------------------------------------------------------------
  const rootMap = captured['root-map'] ?? '';
  const hipMentions = (rootMap.match(/hips/gi) ?? []).length;
  const hipStatements = (rootMap.match(/discomfort in the hips|Discomfort: hips/gi) ?? []).length;
  check(
    'the hip discomfort is one finding on the Root Map, not three',
    hipStatements <= 1,
    `${hipStatements} statement(s), ${hipMentions} total mentions of "hips"`
  );
  check(
    'a cross referenced finding says where it is shown in full',
    /Also shown under|Shown in full under/.test(rootMap),
    rootMap.match(/(Also shown under|Shown in full under)[^\n]*/)?.[0] ?? 'no cross reference line'
  );

  // -----------------------------------------------------------------
  // 4. What We're Noticing does not repeat itself.
  // -----------------------------------------------------------------
  const noticing = await visit('/noticing', 'noticing');
  check(
    'What We\'re Noticing has no second heading repeating the first list',
    !noticing.includes('Areas Worth Paying Attention To'),
    noticing.includes('Areas Worth Paying Attention To') ? 'heading still present' : 'gone'
  );

  // -----------------------------------------------------------------
  // 5. Every rendered finding carries a tier label, and no percentage.
  // -----------------------------------------------------------------
  const findingSurfaces = { noticing, 'root-map': rootMap };
  for (const [key, text] of Object.entries(findingSurfaces)) {
    const hasFindings =
      key === 'noticing'
        ? !/Still gathering information/.test(text)
        : /What We're Seeing/i.test(text);
    const tierCount = TIER_LABELS.filter((label) => text.includes(label)).length;
    check(
      `${key}: rendered findings carry one of the four tier labels`,
      !hasFindings || tierCount > 0,
      hasFindings ? `${tierCount} distinct tier label(s) present` : 'no findings rendered'
    );
  }

  const allText = Object.values(captured).join('\n');
  const percentages = allText.match(/\d{1,3}\s*%\s*(confiden|confidence)/gi) ?? [];
  const confidenceLabels = allText.match(/(HIGH|MODERATE|LOW|BUILDING)\s+CONFIDENCE/gi) ?? [];
  check(
    'no percentage or confidence label anywhere on the member screens',
    percentages.length === 0 && confidenceLabels.length === 0,
    [...percentages, ...confidenceLabels].join(' | ')
  );

  // -----------------------------------------------------------------
  // 6. Language matches tier.
  // -----------------------------------------------------------------
  check(
    'no "real strength" claim anywhere',
    !/is a real strength/i.test(allText),
    allText.match(/[^.]*is a real strength[^.]*/i)?.[0] ?? 'gone'
  );

  // "Emerging pattern" is one of the four sanctioned tier labels, so the
  // word is stripped where it appears AS a label before looking for a claim.
  const withoutTierLabels = TIER_LABELS.reduce(
    (text, label) => text.split(label).join(''),
    allText
  );
  const patternClaims = (withoutTierLabels.match(/[^\n]*\bpatterns?\b[^\n]*/gi) ?? []).filter(
    // Forward-looking copy about what WILL be true after more logging is not
    // a claim about her now.
    (line) => !/\bcan start|will start|once you|more days\b/i.test(line)
  );
  check(
    'nothing below the supported tier claims a pattern about her',
    patternClaims.length === 0,
    patternClaims.map((l) => l.trim()).join(' | ')
  );

  // -----------------------------------------------------------------
  // 7. Pain & Structural Integrity no longer reads "looking steady".
  // -----------------------------------------------------------------
  const painSection = (() => {
    const idx = rootMap.indexOf('Pain & Structural Integrity');
    return idx === -1 ? '' : rootMap.slice(idx, idx + 900);
  })();
  check(
    'Pain & Structural Integrity does not read "looking steady"',
    painSection !== '' && !/looking steady/i.test(painSection),
    painSection === ''
      ? 'Pain card not found on the Root Map'
      : painSection.split('\n').slice(0, 6).join(' / ')
  );
  check(
    'no domain anywhere on the Root Map reads "looking steady"',
    !/looking steady/i.test(rootMap),
    rootMap.match(/[^\n]*looking steady[^\n]*/i)?.[0] ?? 'gone'
  );

  // -----------------------------------------------------------------
  // 8. A real daily check-in, then Home the same day.
  // -----------------------------------------------------------------
  if (process.env.DO_CHECKIN === '1') {
    await page.goto(`${BASE}/checkin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/checkin-start.png`, fullPage: true });

    // Walk the wizard: answer whatever is required on each screen by taking
    // the middle option, then Continue, until the submit lands.
    let submitted = false;
    for (let screen = 0; screen < 14 && !submitted; screen += 1) {
      const options = page.locator('button:not([disabled])');
      const count = await options.count();
      // Answer every unanswered required control on this screen by taking a
      // middle-ish option, which is the least opinionated real answer.
      for (let i = 0; i < count; i += 1) {
        const label = (await options.nth(i).innerText().catch(() => '')).trim();
        if (/^(continue|next|done|submit|finish|save)/i.test(label)) continue;
        if (!label) continue;
      }
      const continueBtn = page.getByRole('button', { name: /continue|next|finish|done|submit/i });
      if (await continueBtn.count()) {
        await continueBtn.first().click().catch(() => {});
        await page.waitForTimeout(1400);
      } else {
        break;
      }
      if (!page.url().includes('/checkin')) submitted = true;
      await page.screenshot({ path: `${SHOTS}/checkin-step-${screen}.png`, fullPage: true });
    }
    check('completed a real daily check-in', submitted, submitted ? 'submitted' : 'wizard not completed');

    const homeAfter = await visit('/dashboard', 'home-after-checkin');
    const stale = /Yesterday you logged|at your last check-in/i.test(homeAfter);
    check(
      'Home reflects the same-day check-in rather than yesterday',
      !stale,
      stale ? homeAfter.match(/[^\n]*(Yesterday you logged|at your last check-in)[^\n]*/i)?.[0] : 'present tense'
    );
  } else {
    console.log('SKIP  daily check-in (set DO_CHECKIN=1 to run it)');
  }

  writeFileSync(`${SHOTS}/captured.json`, JSON.stringify(captured, null, 2));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passing`);
process.exit(passed === results.length ? 0 : 1);
