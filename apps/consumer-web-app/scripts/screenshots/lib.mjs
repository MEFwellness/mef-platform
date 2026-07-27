// Shared interaction helpers. The app's check-in/onboarding/welcome
// screens are all built from a small, consistent set of ARIA patterns
// (confirmed by reading the components directly, not guessed):
//   - every check-in scale/question renders `role="group"` (or
//     `role="radiogroup"`) wrapping option buttons that carry
//     `aria-pressed` (single-select scales, multi-select tiles) or
//     `role="radio"`/`aria-checked` (onboarding enum questions, welcome
//     primary-goal picker).
//   - the persistent wizard Continue/Save/Update button is the only
//     enabled button whose text matches one of a small fixed set of
//     labels.
// That lets one generic "answer whatever's visible and required" pass
// work across every question type without per-question special-casing,
// except the two real exceptions: the sleep bedtime/wake dial (a pair of
// native `<input type="time">`s) and onboarding's numeric slider (a
// native `<input type="range">`).
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { OUTPUT_DIR, VIEWPORT_NAME } from './config.mjs';

mkdirSync(OUTPUT_DIR, { recursive: true });

export const index = [];
export const failures = [];

/**
 * Every call site names its file without a viewport suffix — that
 * suffixing happens centrally here, not per call site, because a mobile
 * run and a tablet run share almost every filename otherwise (e.g.
 * `dashboard-populated.png`) and a tablet run would silently overwrite the
 * mobile PNG for every shared screen (confirmed: it did, on the first real
 * run of this tool). Mobile is the default/canonical name; only
 * non-mobile viewports get a suffix.
 */
export async function shot(page, file, { screen, state, note } = {}) {
  const suffixedFile =
    VIEWPORT_NAME === 'mobile' ? file : file.replace(/\.png$/, `-${VIEWPORT_NAME}.png`);
  const filePath = path.join(OUTPUT_DIR, suffixedFile);
  await page.waitForTimeout(250); // let the entrance transition/settle finish

  // Confirmed directly (see docs/BUILD_STATUS.md): Playwright's
  // fullPage:true screenshot bakes in position:sticky/fixed elements at
  // whatever position they'd render at the CURRENT scroll offset, not
  // scroll-independently. Capturing from the top (the only scroll
  // position this tool ever visits before this fix) made the check-in
  // wizard's sticky Continue button look like it was still overlapping
  // real content on every screen taller than one viewport — even after
  // the real overlap bug was fixed and verified via actual scroll +
  // bounding-box measurement. Scrolling to the true bottom immediately
  // before capturing makes every sticky/fixed element bake in at its real
  // final position instead, with no effect on pages that don't have one
  // (fullPage still captures the complete scrollable area regardless of
  // scroll position for ordinary content).
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(100);

  await page.screenshot({ path: filePath, fullPage: true });
  index.push({ file: suffixedFile, screen: screen || file, state: state || '', note: note || '' });
  console.log(`captured ${suffixedFile}`);
}

export function recordFailure(area, error) {
  const message = error instanceof Error ? error.message : String(error);
  failures.push({ area, message });
  console.error(`FAILED ${area}: ${message}`);
}

export async function login(page, baseUrl, { email, password }) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 });
}

/**
 * One pass over the current screen: fills the sleep-dial time inputs if
 * present and empty, sets any numeric range slider, and for every visible
 * `role="group"`/`role="radiogroup"` with no option currently
 * selected, clicks its first option. Idempotent enough to call more than
 * once — an already-answered group is left untouched.
 */
export async function answerVisibleQuestions(page) {
  // Sleep dial time inputs: the UI shows a plausible default (e.g. 10:30
  // PM / 6:30 AM) before any interaction, so a non-empty `inputValue()` does
  // NOT mean the underlying React state is "touched" — always fill, using
  // a value distinct from the shown default so the onChange is guaranteed
  // to actually fire (fill() only dispatches events on a real value change).
  const timeInputs = page.locator('input[type="time"]');
  const timeCount = await timeInputs.count();
  for (let i = 0; i < timeCount; i++) {
    const input = timeInputs.nth(i);
    if (!(await input.isVisible())) continue;
    const label = (await input.getAttribute('aria-label')) || '';
    const value = /wake/i.test(label) ? '07:15' : '22:45';
    await input.fill(value);
  }

  // React tracks <input> via a wrapped `value` setter, so a plain
  // `.fill()`/`element.value = x` + dispatchEvent('input') is silently
  // swallowed (verified: it left the app's own `touched` state false).
  // Calling the real HTMLInputElement.prototype.value setter first, THEN
  // dispatching the event, is the standard workaround react itself
  // documents for programmatic changes on a controlled input.
  const rangeInputs = page.locator('input[type="range"]');
  const rangeCount = await rangeInputs.count();
  for (let i = 0; i < rangeCount; i++) {
    const input = rangeInputs.nth(i);
    if (!(await input.isVisible())) continue;
    const min = Number((await input.getAttribute('min')) ?? 0);
    const max = Number((await input.getAttribute('max')) ?? 10);
    // React's controlled-input value tracker skips firing onChange if the
    // native setter is used to set the SAME value it already has (even
    // with a real dispatched 'input' event) — confirmed by testing this
    // directly: the slider's unstyled default already sits at the visual
    // midpoint, so a naive "set it to the midpoint" pass is a no-op.
    // Picking a value that provably differs from the current one avoids
    // that dedup entirely.
    const current = Number(await input.inputValue());
    const mid = current === max ? min : max;
    await input.evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(el, String(val));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, mid);
  }

  const selects = page.locator('select');
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    const select = selects.nth(i);
    if (!(await select.isVisible())) continue;
    const current = await select.inputValue();
    if (current) continue;
    const optionValues = await select
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => o.value).filter((v) => v !== ''));
    if (optionValues.length > 0) await select.selectOption(optionValues[0]);
  }

  // Re-query on every pass, not once: answering one question (e.g. a pain
  // location) can reveal a brand-new required follow-up group on the same
  // screen (severity, then aggravating factor) that doesn't exist in the
  // DOM until the prior one is answered. A single snapshot of groups taken
  // before any clicking would miss those cascading reveals entirely.
  for (let pass = 0; pass < 5; pass++) {
    const groups = page.locator('[role="group"], [role="radiogroup"]');
    const groupCount = await groups.count();
    let clickedSomething = false;
    for (let i = 0; i < groupCount; i++) {
      const group = groups.nth(i);
      if (!(await group.isVisible())) continue;
      const pressedOptions = group.locator(
        '[aria-pressed="true"], [role="radio"][aria-checked="true"]'
      );
      if ((await pressedOptions.count()) > 0) continue;
      const options = group.locator('[aria-pressed], [role="radio"], [role="button"]');
      const optionCount = await options.count();
      for (let j = 0; j < optionCount; j++) {
        const option = options.nth(j);
        if (await option.isVisible()) {
          await option.click();
          clickedSomething = true;
          break;
        }
      }
    }
    if (!clickedSomething) break;
  }
}

/** Last-resort filler for a still-disabled advance button: fills any empty visible textarea. */
export async function lastResortFill(page) {
  const textareas = page.locator('textarea');
  const count = await textareas.count();
  for (let i = 0; i < count; i++) {
    const textarea = textareas.nth(i);
    if (!(await textarea.isVisible())) continue;
    const current = await textarea.inputValue();
    if (!current) await textarea.fill('Screenshot QA note.');
  }
}

const WIZARD_ADVANCE_LABELS = [
  'Continue',
  'Save check-in',
  'Update check-in',
  'Save Evening Reflection',
  'Update Evening Reflection',
];

/** Locates the persistent CheckinWizard advance button, whatever its current label. */
export function wizardAdvanceButton(page) {
  return page
    .locator('button', { hasText: new RegExp(`^(${WIZARD_ADVANCE_LABELS.join('|')})$`) })
    .last();
}

/**
 * Walks a CheckinWizard-shaped flow (morning or evening check-in): screenshot
 * each screen, answer it if needed, click the advance button, repeat until
 * the advance button's label indicates a real submit, then screenshot and
 * dismiss the post-submit EndingMoment overlay. Returns true if it reached
 * the ending screen.
 */
export async function walkCheckinWizard(page, { prefix, state, maxScreens = 12 }) {
  for (let screenNum = 1; screenNum <= maxScreens; screenNum++) {
    const button = wizardAdvanceButton(page);
    await button.waitFor({ state: 'visible', timeout: 10000 });
    const label = (await button.textContent())?.trim();
    const isFinal = label !== 'Continue';

    await shot(page, `${prefix}-${String(screenNum).padStart(2, '0')}-${state}.png`, {
      screen: `${prefix} screen ${screenNum}`,
      state,
    });

    for (let attempt = 0; attempt < 2 && (await button.isDisabled()); attempt++) {
      await answerVisibleQuestions(page);
    }
    if (await button.isDisabled()) await lastResortFill(page);

    if (await button.isDisabled()) {
      throw new Error(
        `Advance button still disabled on screen ${screenNum} after answering visible questions`
      );
    }

    await button.click();

    if (isFinal) {
      const endingContinue = page.getByRole('button', { name: 'Continue' });
      await endingContinue.waitFor({ state: 'visible', timeout: 15000 });
      await shot(page, `${prefix}-ending-${state}.png`, { screen: `${prefix} ending`, state });
      await endingContinue.click();
      return true;
    }

    await page.waitForTimeout(400); // screen-to-screen fade transition
  }
  throw new Error(`Did not reach a final screen within ${maxScreens} screens`);
}
