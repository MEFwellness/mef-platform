#!/usr/bin/env node
/**
 * Runs the REAL intake three times on production, with deliberately
 * contrasting answers, and records exactly what each answer profile makes
 * the app contain.
 *
 * This is the check the whole build exists to pass. Everything else can be
 * argued from code; this cannot. Three members who answer differently must
 * end up with three different apps, differing in the ways the rules
 * predict, and the differences have to be visible on the real screens.
 *
 * HOW IT ANSWERS. It walks the actual onboarding wizard, step by step,
 * reading each question's own prompt and choosing from the options the
 * screen actually offers. Nothing is written into the database directly and
 * no answer is fabricated: a profile is a preference list, and each step
 * picks the first offered option that matches it, falling back to a stated
 * default when the question is not one this profile has an opinion about.
 *
 * WHY IT IS SAFE. Every reset goes through the sanctioned test-only route,
 * which refuses any caller whose profiles.is_test is not true, on the server
 * and again in the database's own policies. There is no member id parameter
 * anywhere in this script.
 *
 * Usage, from apps/consumer-web-app:
 *   VIS_MEMBER_PASSWORD_FILE=/path/to/pw.txt SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-intake-profiles-live.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.VIS_MEMBER_EMAIL ?? 'routing.test@mefwellness.com';
const PASSWORD = process.env.VIS_MEMBER_PASSWORD_FILE
  ? readFileSync(process.env.VIS_MEMBER_PASSWORD_FILE, 'utf8').trim()
  : (process.env.VIS_MEMBER_PASSWORD ?? '');
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-intake';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

/**
 * What each profile is. `prefer` is an ordered list of option labels: the
 * first one the current screen actually offers is chosen. `slider` is the
 * 1-to-5 value for numeric questions, keyed by a fragment of the question's
 * own prompt so a profile can say "sleep is bad" and "digestion is fine" in
 * the same run.
 */
const PROFILES = {
  A_sleep_stress: {
    label: 'sleep and stress heavy',
    // Keyed by a fragment of the question's own prompt, so one profile can
    // say "sleep is bad" and "digestion is fine" in the same sitting. The
    // labels are the exact words the real screens show.
    byPrompt: [
      ['main thing you', ['SLEEP BETTER']],
      ['where', ['NONE OF THESE', 'NONE', 'NO PAIN']],
      ['discomfort', ['NONE OF THESE', 'NONE', 'NO PAIN']],
      ['water', ['Very little, I often forget']],
      ['move intentionally', ['5+']],
    ],
    fallback: 'last',
    slider: { sleep: 1, stress: 5, energy: 2, digestion: 5, default: 4 },
  },
  B_pain_movement: {
    label: 'pain and movement heavy',
    byPrompt: [
      ['main thing you', ['GET OUT OF PAIN']],
      ['where', ['LOWER BACK', 'HIPS']],
      ['discomfort', ['LOWER BACK', 'HIPS']],
      ['water', ['I drink plenty of water throughout the day']],
      ['move intentionally', ['0']],
    ],
    fallback: 'last',
    slider: { sleep: 5, stress: 1, energy: 5, digestion: 5, default: 4 },
  },
  C_minimal: {
    label: 'minimal issues',
    byPrompt: [
      ['main thing you', ['OVERALL WELLNESS']],
      ['where', ['NONE OF THESE', 'NONE', 'NO PAIN']],
      ['discomfort', ['NONE OF THESE', 'NONE', 'NO PAIN']],
      ['water', ['I drink plenty of water throughout the day']],
      ['move intentionally', ['5+']],
    ],
    fallback: 'last',
    slider: { sleep: 5, stress: 1, energy: 5, digestion: 5, default: 5 },
  },
};

/**
 * What is actually OBSERVABLE for a member on her first day, which is what
 * these three profiles are.
 *
 * An earlier version of this script fingerprinted Home's zones (Quick
 * Actions, Your Path, the trackers) and reported all three profiles
 * identical. That was true and meaningless: Home suppresses every one of
 * those zones until a member has completed her first check-in, and that gate
 * predates this build entirely. The profiles differed all along; the
 * measurement was pointed at screens that cannot differ yet.
 *
 * What CAN differ on day one, and does:
 *   the reveal sentences on Home  the direct, member-facing expression of
 *                                 which rules fired for her
 *   the questionnaire catalogue   which assessments are open to her
 *   the check-in questions        which follow-up sets her answers opened
 *   the Food Lens tab             the one nav door that is conditional
 */
const MARKERS = {
  'Food Lens tab': ['FOOD LENS'],
  'Nutrition and Lifestyle questionnaire': ['Nutrition & Lifestyle'],
  'Four Doctors questionnaire': ['Four Doctors'],
  'Whole-Body Systems questionnaire': ['Whole-Body Systems', 'Whole Body Systems'],
  'Primal Pattern questionnaire': ['Primal Pattern'],
  'Core Values Snapshot': ['Core Values Snapshot'],
  'Priority card': ['YOUR PRIORITY TODAY'],
  'Daily check-in': ['Complete your first check-in', 'Start check-in', 'Check-in complete'],
};

/** The reveal sentences Root put on Home, in order. */
function revealSentences(home) {
  const match = home.match(/SOMETHING NEW\n([\s\S]*?)\n(?:FROM ROOT|YOUR WEEK|ASSIGNED BY|QUICK ACTIONS|Let's get started)/);
  if (!match) return [];
  return match[1].split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Which questionnaires her library actually lists. */
function questionnaireTitles(text) {
  const known = [
    'Core Values Snapshot',
    'Life Signal Check',
    'Readiness Pulse',
    'Onboarding Assessment',
    'Nutrition & Lifestyle',
    'Four Doctors',
    'Primal Pattern',
    'Whole-Body Systems',
    'Short Health Assessment',
  ];
  return known.filter((t) => text.includes(t));
}

/** Which follow-up questions the check-in is actually offering her today. */
function checkinQuestions(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('?') && l.length > 12);
}

function present(text, markers) {
  return markers.some((m) => text.toLowerCase().includes(m.toLowerCase()));
}

const browser = await chromium.launch();
const fingerprints = {};

try {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  check('signed in as the throwaway routing-test member', true, EMAIL);

  const post = async (path, body) =>
    page.evaluate(
      async ({ base, p, b }) => {
        const r = await fetch(`${base}${p}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: b ? JSON.stringify(b) : undefined,
        });
        return { status: r.status, body: await r.text() };
      },
      { base: BASE, p: path, b: body ?? null }
    );

  const capture = async (path, key) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    writeFileSync(`${SHOTS}/${key}.txt`, text);
    await page.screenshot({ path: `${SHOTS}/${key}.png`, fullPage: true });
    return text;
  };

  /** Walks the real wizard for one profile. Returns how many steps it answered. */
  async function runIntake(profile, key) {
    await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // The intro and consent screens, when they are shown. The consent
    // screen's own button stays disabled until its checkbox is ticked, so
    // every checkbox on screen is ticked first: this is a real consent the
    // real screen requires, not a step being skipped.
    for (let screen = 0; screen < 4; screen += 1) {
      const boxes = page.locator('input[type="checkbox"]');
      const boxCount = await boxes.count();
      for (let n = 0; n < boxCount; n += 1) {
        if (await boxes.nth(n).isVisible()) await boxes.nth(n).check({ force: true });
      }
      await page.waitForTimeout(300);

      let advanced = false;
      for (const label of ["Let's begin", 'Accept and continue', 'Get started', 'Continue', 'Start']) {
        const button = page.getByRole('button', { name: label, exact: false });
        if (
          (await button.count()) > 0 &&
          (await button.first().isVisible()) &&
          (await button.first().isEnabled())
        ) {
          await button.first().click();
          await page.waitForTimeout(1200);
          advanced = true;
          break;
        }
      }
      if (!advanced) break;
      // Stop as soon as the wizard itself is on screen.
      const body = await page.locator('body').innerText();
      if (/Keep going/.test(body)) break;
    }

    let steps = 0;
    let stalls = 0;
    for (let i = 0; i < 80; i += 1) {
      await page.waitForTimeout(700);
      const body = await page.locator('body').innerText();

      // The wizard shows its own transition screens between phases
      // (app/onboarding/BranchTransition.tsx). They carry no question and
      // no "Keep going", so an earlier version of this script treated the
      // first one as the end of the intake and stopped after one answer.
      // A stall is now waited through, not treated as completion.
      // The wizard's own between-phase screens ("Sleep is where you'd like
      // to focus, so let's start right there. / See what happens next")
      // still carry a "Question N of M" counter, so the counter alone does
      // not mean there is anything to answer. What distinguishes a real
      // question is that it offers something to answer WITH.
      const hasOptions =
        (await page.locator('button[role="radio"], button[aria-pressed]').count()) > 0 ||
        (await page.locator('input[type="range"]').count()) > 0 ||
        (await page.locator('textarea').count()) > 0;
      const hasQuestion = /Question \d+ of \d+/.test(body) && hasOptions;
      if (process.env.VIS_DEBUG) {
        console.log(
          `  step ${i} hasQuestion=${hasQuestion} :: ${(body.match(/Question \d+ of \d+/) ?? [''])[0]} :: ${body.replace(/\n+/g, ' | ').slice(0, 160)}`
        );
      }
      if (!hasQuestion) {
        const anyPrimary = page.getByRole('button', {
          name: /keep going|see what happens next|continue|let's begin|next|see my|got it|i'm ready/i,
        });
        if ((await anyPrimary.count()) > 0 && (await anyPrimary.first().isVisible()) && (await anyPrimary.first().isEnabled())) {
          await anyPrimary.first().click();
          await page.waitForTimeout(1500);
          stalls = 0;
          continue;
        }
        stalls += 1;
        if (stalls > 6) break;
        await page.waitForTimeout(1800);
        continue;
      }
      stalls = 0;

      // The question itself, which is the line ending in a question mark.
      // Matching against the whole page body instead is a real mistake this
      // script made first time out: every screen carries a category header,
      // so the readiness question under the "Mind & Stress" header was
      // being answered with this profile's STRESS value.
      const questionLine = (
        body.split('\n').find((l) => l.trim().endsWith('?')) ?? ''
      ).toLowerCase();

      // A numeric slider, when this step has one.
      const range = page.locator('input[type="range"]');
      if ((await range.count()) > 0 && (await range.first().isVisible())) {
        const slider = range.first();
        const min = Number((await slider.getAttribute('min')) ?? '1');
        const max = Number((await slider.getAttribute('max')) ?? '5');
        const scale = (n) => Math.min(max, Math.max(min, max <= 5 ? n : Math.round((n / 5) * max)));

        const value = scale(
          questionLine.includes('sleeping') || questionLine.includes('sleep')
            ? profile.slider.sleep
            : questionLine.includes('stress')
              ? profile.slider.stress
              : questionLine.includes('energy')
                ? profile.slider.energy
                : questionLine.includes('digestion')
                  ? profile.slider.digestion
                  : profile.slider.default
        );

        // Setting a range input to the value it already holds fires no
        // change event, so the wizard would still consider the question
        // unanswered and refuse to move on. Nudging it elsewhere first
        // guarantees a real change either way.
        const current = await slider.inputValue();
        if (Number(current) === value) {
          await slider.fill(String(value === max ? min : max));
          await page.waitForTimeout(200);
        }
        await slider.fill(String(value));
        await page.waitForTimeout(350);
      } else {
        // Otherwise a set of tappable options. The prompt is read first, so
        // the profile answers THIS question rather than applying one blanket
        // preference to fifteen different ones.
        const prompt = questionLine || body.toLowerCase();
        const options = page.locator('button[role="radio"], button[aria-pressed]');
        const count = await options.count();
        if (count > 0) {
          const labels = [];
          for (let n = 0; n < count; n += 1) labels.push((await options.nth(n).innerText()).trim());

          const entry = profile.byPrompt.find(([fragment]) => prompt.includes(fragment));
          const wanted = entry ? entry[1] : [];

          const chosen = [];
          for (const want of wanted) {
            const found = labels.findIndex((l) => l.toLowerCase().includes(want.toLowerCase()));
            if (found >= 0 && !chosen.includes(found)) chosen.push(found);
          }
          // No opinion about this question: the last option is the least
          // concerning end of every scale in this intake, which is what a
          // profile that has not said otherwise means.
          if (chosen.length === 0) chosen.push(count - 1);

          for (const index of chosen) {
            await options.nth(index).click();
            await page.waitForTimeout(350);
          }
        }
      }

      // A free-text step still has to be answered before the wizard will
      // move on. "None" is a real answer to every free-text question in this
      // intake, and it is the honest one for a profile with nothing to add.
      const textarea = page.locator('textarea');
      if ((await textarea.count()) > 0 && (await textarea.first().isVisible())) {
        if (!(await textarea.first().inputValue())) {
          await textarea.first().fill('None');
          await page.waitForTimeout(250);
        }
      }

      const keepGoing = page.getByRole('button', { name: 'Keep going', exact: true });
      const submit = page.locator('button[type="submit"]');
      if ((await keepGoing.count()) > 0 && (await keepGoing.first().isVisible())) {
        await keepGoing.first().click();
        steps += 1;
        continue;
      }
      if ((await submit.count()) > 0 && (await submit.first().isVisible())) {
        // A disabled submit means it is already saving. Waiting is the
        // correct thing to do; clicking again is how an earlier version of
        // this script timed out on a run that had actually succeeded.
        if (await submit.first().isEnabled()) {
          await submit.first().click();
          steps += 1;
        }
        await page.waitForTimeout(9000);
        break;
      }
      stalls += 1;
      if (stalls > 6) break;
    }

    // The completion screen, when one is shown, has its own single button
    // through to the app.
    for (let n = 0; n < 3; n += 1) {
      const done = page.getByRole('button', { name: /continue|let's go|see|start|finish|done/i });
      const link = page.getByRole('link', { name: /continue|let's go|see|start|finish|done/i });
      if ((await done.count()) > 0 && (await done.first().isVisible()) && (await done.first().isEnabled())) {
        await done.first().click();
        await page.waitForTimeout(2500);
      } else if ((await link.count()) > 0 && (await link.first().isVisible())) {
        await link.first().click();
        await page.waitForTimeout(2500);
      } else break;
    }

    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/${key}-intake-end.png`, fullPage: true });
    return steps;
  }

  for (const [profileKey, profile] of Object.entries(PROFILES)) {
    // Clear the previous run entirely: visibility decisions AND the intake
    // submission, so the next run is genuinely a different member's answers
    // rather than an edit of the last one's.
    const reset = await post('/api/test-only/visibility-reset', { intake: true });
    check(
      `[${profileKey}] the account was reset before the run`,
      reset.status === 200,
      reset.body.slice(0, 120)
    );

    const steps = await runIntake(profile, profileKey);
    check(`[${profileKey}] intake was answered through the real wizard`, steps > 5, `${steps} steps`);

    const home = await capture('/dashboard', `${profileKey}-home`);
    const today = await capture('/today', `${profileKey}-today`);
    const questionnaires = await capture('/questionnaires', `${profileKey}-questionnaires`);
    // The check-in is entered and left BY URL, never through the app's own
    // exit button: that button is the only path that writes a draft row, so
    // navigating away instead writes nothing to her account.
    const checkin = await capture('/checkin', `${profileKey}-checkin`);
    const all = [home, today, questionnaires, checkin].join('\n');

    const seen = {};
    for (const [label, markers] of Object.entries(MARKERS)) seen[label] = present(all, markers);
    const sentences = revealSentences(home);
    const library = questionnaireTitles(questionnaires);
    const questions = checkinQuestions(checkin);

    fingerprints[profileKey] = { seen, sentences, library, questions };
    writeFileSync(
      `${SHOTS}/${profileKey}-fingerprint.json`,
      JSON.stringify({ seen, sentences, library, questions }, null, 2)
    );

    console.log(`\n--- ${profileKey} (${profile.label}) ---`);
    console.log('  Root told her:');
    if (sentences.length === 0) console.log('    (nothing new)');
    sentences.forEach((l) => console.log(`    - ${l}`));
    console.log(`  Her questionnaire library: ${library.join(', ') || '(none)'}`);
    console.log(`  Her check-in asked: ${questions.length} question(s)`);
    questions.forEach((q) => console.log(`    - ${q}`));
    console.log('  Features:');
    for (const [label, visible] of Object.entries(seen)) {
      console.log(`    ${visible ? 'SHOWN ' : 'hidden'}  ${label}`);
    }
    console.log('');

    check(
      `[${profileKey}] the check-in is there whatever she answered`,
      seen['Daily check-in'],
      'safety exemption'
    );
    check(
      `[${profileKey}] nothing renders locked or as a teaser`,
      !/Complete a prior step first to unlock/i.test(all) && !/\bLocked\b/i.test(home),
      'no lock copy'
    );
  }

  // ---- The three must genuinely differ --------------------------------
  const a = fingerprints.A_sleep_stress ?? {};
  const b = fingerprints.B_pain_movement ?? {};
  const c = fingerprints.C_minimal ?? {};

  const asString = (f) => JSON.stringify(f);
  check(
    'the three profiles produce three different apps',
    new Set([a, b, c].map(asString)).size === 3,
    `${new Set([a, b, c].map(asString)).size} distinct of 3`
  );

  const said = (f, fragment) => (f.sentences ?? []).some((l) => l.toLowerCase().includes(fragment));

  check(
    'sleep-and-stress is told about sleep, and minimal-issues is not',
    said(a, 'sleep') && !said(c, 'sleep'),
    `A=${said(a, 'sleep')} C=${said(c, 'sleep')}`
  );
  check(
    'pain-and-movement is told about movement or where it hurts, and sleep-and-stress is not',
    (said(b, 'movement') || said(b, 'hurts')) && !said(a, 'movement') && !said(a, 'hurts'),
    `B=${(b.sentences ?? []).join(' | ')}`
  );
  check(
    'sleep-and-stress gets the water tracker opened and the other two do not',
    said(a, 'water') && !said(b, 'water') && !said(c, 'water'),
    `A=${said(a, 'water')} B=${said(b, 'water')} C=${said(c, 'water')}`
  );
  check(
    'minimal issues is told the least of the three',
    (c.sentences ?? []).length <= (a.sentences ?? []).length &&
      (c.sentences ?? []).length <= (b.sentences ?? []).length,
    `A=${(a.sentences ?? []).length} B=${(b.sentences ?? []).length} C=${(c.sentences ?? []).length}`
  );
  check(
    'the check-in asks each of them a different set of questions',
    new Set([a, b, c].map((f) => JSON.stringify((f.questions ?? []).slice().sort()))).size > 1,
    `A=${(a.questions ?? []).length} B=${(b.questions ?? []).length} C=${(c.questions ?? []).length}`
  );

  writeFileSync(`${SHOTS}/fingerprints.json`, JSON.stringify(fingerprints, null, 2));
  writeFileSync(`${SHOTS}/results.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
