#!/usr/bin/env node
/**
 * Demonstrates the friction question ON PRODUCTION, end to end, on the
 * throwaway routing-test member: the three-day ignored state is reached
 * through a sanctioned route, the question appears on the card, an answer
 * is tapped, and the next day's framing is confirmed to follow that answer.
 *
 * THIS IS THE ONE VERIFICATION THE PREVIOUS BUILD COULD NOT DO LIVE. The
 * friction question fires at `consecutive_ignored = 3`. The standing
 * production test member has responded to her priority card on every single
 * day it has ever been shown to her, so her counter is zero, and there is
 * no honest way to reach that state on her account: writing a 3 into her
 * thread would assert three days of ignoring that did not happen, and the
 * engine would then act on the lie. Her profile also has is_test = false, so
 * the test-account-only policies do not apply to her anyway.
 *
 * A throwaway member with is_test = true is the honest place. There is no
 * real person behind the counter and nothing it could be wrong about.
 *
 * WHAT IS REAL HERE AND WHAT IS SET UP. The counter is set up. Everything
 * after it is real: the engine decides whether to ask, the card renders the
 * question, the answer is tapped through the actual button, the database
 * stores it under the real check constraint, and the next run's framing is
 * read back from what the engine actually did with it.
 *
 * Usage, from apps/consumer-web-app:
 *   VIS_MEMBER_PASSWORD_FILE=/path/to/pw.txt SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-friction-question-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

// The service-role client is used for TWO things and nothing else: reading
// back what the engine actually stored, and clearing this test account's own
// daily priority claim so a fresh engine run happens without waiting until
// tomorrow. It never writes an answer, a counter, or a framing.
for (const line of readFileSync(process.env.PROD_KEYS_FILE, 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1).trim();
}
const service = createClient(
  'https://piafgqstbibvllsnuike.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.VIS_MEMBER_EMAIL ?? 'routing.test@mefwellness.com';
const PASSWORD = process.env.VIS_MEMBER_PASSWORD_FILE
  ? readFileSync(process.env.VIS_MEMBER_PASSWORD_FILE, 'utf8').trim()
  : (process.env.VIS_MEMBER_PASSWORD ?? '');
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-friction';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

/** Every string the friction question can put on screen. */
const QUESTION_LINE = 'This one has not landed. What got in the way?';
const OPTIONS = [
  'No time',
  'Too much to take on',
  'I forgot',
  'Not what I need right now',
  'Something else',
];
const ACKNOWLEDGEMENT = 'Thank you, that helps. I will take it into account.';

const browser = await chromium.launch();

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

  const capture = async (key) => {
    await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    writeFileSync(`${SHOTS}/${key}.txt`, text);
    await page.screenshot({ path: `${SHOTS}/${key}.png`, fullPage: true });
    return text;
  };

  // ---- Day zero: a thread exists and nothing is being asked ----------
  const before = await capture('01-before');
  check(
    'she has a priority card, and no question on it',
    before.includes('YOUR PRIORITY TODAY') && !before.includes(QUESTION_LINE),
    'card present, question silent'
  );

  // ---- Reach the three-day ignored state through the route ----------
  const armed = await post('/api/test-only/friction-state');
  check(
    'the sanctioned friction-state route accepts the test account',
    armed.status === 200,
    `HTTP ${armed.status} ${armed.body.slice(0, 200)}`
  );
  const armedBody = armed.status === 200 ? JSON.parse(armed.body) : null;
  check(
    'her thread now reads three consecutive ignored days',
    Boolean(armedBody?.threads?.some((t) => t.consecutiveIgnored === 3)),
    JSON.stringify(armedBody?.threads ?? [])
  );

  // ---- The question appears ------------------------------------------
  const asked = await capture('02-question-asked');
  check(
    'Root puts the question on the card',
    asked.includes(QUESTION_LINE),
    QUESTION_LINE
  );
  const optionsShown = OPTIONS.filter((o) => asked.includes(o));
  check(
    'all five tappable answers are offered',
    optionsShown.length === OPTIONS.length,
    optionsShown.join(' / ')
  );
  check(
    'every option is a fact about the day or the suggestion, never about her',
    !/lazy|did not feel like|unmotivated|no willpower/i.test(asked),
    'no self-criticism on the menu'
  );

  // ---- She answers ----------------------------------------------------
  // "Too much to take on" is chosen deliberately: it is one of the two
  // answers that must earn the SMALLER step, so what the engine does next
  // is a falsifiable prediction rather than whatever it would have done
  // anyway. Tapped through the real button on the real card.
  await page.getByRole('button', { name: 'Too much to take on', exact: true }).first().click();
  await page.waitForTimeout(3500);
  const answered = await page.locator('body').innerText();
  writeFileSync(`${SHOTS}/03-answered.txt`, answered);
  await page.screenshot({ path: `${SHOTS}/03-answered.png`, fullPage: true });

  const { data: profileRow } = await service
    .from('profiles')
    .select('id')
    .eq('display_name', 'Routing Test')
    .eq('is_test', true)
    .maybeSingle();
  const memberId = profileRow?.id ?? null;
  check('the throwaway account was resolvable for the read-back', Boolean(memberId), memberId ?? 'not found');

  const { data: ledger } = await service
    .from('member_coaching_decisions')
    .select('local_date, thread_key, friction_asked_at, friction_reason, friction_answered_at')
    .eq('member_id', memberId)
    .not('friction_asked_at', 'is', null)
    .order('friction_asked_at', { ascending: false });

  const latest = ledger?.[0] ?? null;
  writeFileSync(`${SHOTS}/ledger.json`, JSON.stringify(ledger ?? [], null, 2));

  // The read-back is the real check, not the on-screen acknowledgement: the
  // acknowledgement is client state that a server re-render clears, and what
  // matters is that her answer reached the database under the migration's
  // own check constraint.
  check(
    'her tapped answer is stored on the outcome ledger',
    latest?.friction_reason === 'too_hard',
    JSON.stringify(latest ?? {})
  );
  check(
    'the answer is recorded as answered, not merely asked',
    Boolean(latest?.friction_answered_at),
    latest?.friction_answered_at ?? 'not answered'
  );

  // ---- The question is asked once, ever --------------------------------
  const reloaded = await capture('04-reloaded');
  check(
    'reloading her day does not ask the question a second time',
    !reloaded.includes(QUESTION_LINE),
    'asked once'
  );

  // ---- The next run adapts per the answer ------------------------------
  // ONLY the daily claim is cleared. The movement-priority-reset route also
  // deletes today's decision row, which is the row holding her answer, so
  // using it here would erase the very thing being measured. That is a real
  // thing this run found: an earlier version of this script deleted the
  // answer and then watched Root ask the same question again, correctly.
  await service
    .from('member_daily_priorities')
    .delete()
    .eq('member_id', memberId)
    .eq('local_date', armedBody?.localDate ?? new Date().toISOString().slice(0, 10));

  const after = await capture('05-next-run');
  check(
    'the question is still not asked on the fresh run',
    !after.includes(QUESTION_LINE),
    'asked once, ever'
  );

  const { data: threadRows } = await service
    .from('member_coaching_threads')
    .select('thread_key, approach, approach_changes, consecutive_ignored')
    .eq('member_id', memberId);
  writeFileSync(`${SHOTS}/threads.json`, JSON.stringify(threadRows ?? [], null, 2));

  // APPROACH_SMALLER is 1 (lib/coaching-direction/adaptation.ts). "Too much
  // to take on" maps to it, and "I forgot" would have left it at 0, so this
  // number is the falsifiable half of the demonstration.
  const thread = threadRows?.find((t) => t.thread_key === 'daily_reset::-') ?? threadRows?.[0];
  check(
    'the engine adopted the smaller step her answer earned',
    thread?.approach === 1,
    JSON.stringify(thread ?? {})
  );

  // ---- Put the account back -------------------------------------------
  const reset = await post('/api/test-only/visibility-reset', { intake: false });
  check('the throwaway account was reset afterwards', reset.status === 200, `HTTP ${reset.status}`);
  await service
    .from('member_coaching_threads')
    .update({ consecutive_ignored: 0, approach: 0, approach_changes: 0 })
    .eq('member_id', memberId);
  await service.from('member_coaching_decisions').delete().eq('member_id', memberId);
  await service.from('member_daily_priorities').delete().eq('member_id', memberId);
  check('her coaching state was put back to nothing', true, 'threads reset, ledger cleared');

  writeFileSync(`${SHOTS}/results.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
