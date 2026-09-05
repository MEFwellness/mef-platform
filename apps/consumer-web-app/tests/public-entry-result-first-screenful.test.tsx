/**
 * THE RESULT SCREEN A STRANGER LANDS ON AFTER HER NINTH ANSWER.
 *
 * A real person walked the live funnel on an iPhone on 2026-09-05 and the
 * result page buried its own offer: the pattern was at the top, then four
 * full sections of prose, then the email field, and only after all of that
 * the way into an account. This file holds the shape that fixes it, checked
 * against the real rendered HTML rather than against the source, so
 * "the button is in the first screenful" is an assertion about document
 * order rather than a claim about intent.
 *
 * Every content rule that was locked for this change is a test here:
 * nothing was deleted, the honesty line rides with the result, the evidence
 * is never folded away, the email step is below the account button, and the
 * create-account button still goes through the one handler that carries the
 * one-time quiz reference.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EnergyResultView } from '../components/public-entry/EnergyResultView';
import { buildEnergyResult } from '../lib/public-entry/result';
import {
  EMAIL_STEP_COPY,
  INVITATION_COPY,
  RESULT_HEADINGS,
  RESULT_HONESTY_LINE,
  RESULT_UNIVERSAL_LIMITS,
} from '../lib/public-entry/copy';

/** Nine real answers, run through the real scorer. Nothing here is a fixture string. */
const ANSWERS = {
  low_point: 'evening',
  morning_start: 'slow_but_fine',
  sleep_hours: 'six_to_seven',
  night_pattern: 'hard_to_fall_asleep',
  wind_down: 'screen_until_lights_out',
  first_food: 'mid_morning',
  afternoon_reach: 'caffeine',
  mental_load: 'a_lot',
  off_switch: 'cant_remember',
};

const result = buildEnergyResult(ANSWERS);
const html = renderToStaticMarkup(
  <EnergyResultView result={result} visitorToken="visitor-token" onGoToSignup={() => {}} />
);

/** Where a piece of text sits in the document, so order can be asserted. */
function at(needle: string): number {
  const index = html.indexOf(needle);
  expect(index, `not rendered: ${needle}`).toBeGreaterThan(-1);
  return index;
}

describe('the first screenful', () => {
  it('opens with the pattern name and the one line that says what it means', () => {
    expect(at(RESULT_HEADINGS.pattern)).toBeLessThan(at(result.title));
    expect(at(result.title)).toBeLessThan(at(result.summary));
  });

  it('carries the honesty line with the result, not two scrolls below it', () => {
    expect(at(result.summary)).toBeLessThan(at(RESULT_HONESTY_LINE));
    // Before the evidence, which is the first thing under the opening card.
    expect(at(RESULT_HONESTY_LINE)).toBeLessThan(at(RESULT_HEADINGS.evidence));
  });

  it('puts the create-account button above every other section on the page', () => {
    const cta = at(INVITATION_COPY.buttonLabel);
    expect(cta).toBeLessThan(at(RESULT_HEADINGS.evidence));
    expect(cta).toBeLessThan(at(RESULT_HEADINGS.action));
    expect(cta).toBeLessThan(at(RESULT_HEADINGS.looksLike));
    expect(cta).toBeLessThan(at(RESULT_HEADINGS.limits));
    expect(cta).toBeLessThan(at(INVITATION_COPY.title));
  });

  it('keeps the log-in door open, as a real button, right beside it', () => {
    expect(at(INVITATION_COPY.buttonLabel)).toBeLessThan(at(INVITATION_COPY.secondaryLabel));
    expect(at(INVITATION_COPY.secondaryLabel)).toBeLessThan(at(RESULT_HEADINGS.evidence));
    expect(html).toContain('mef-button-secondary');
  });

  it('is short enough to be a screenful: nothing but those four things before the fold', () => {
    // Everything before the evidence heading is the opening card. Measured
    // as rendered text, with the markup stripped, because that is what a
    // phone actually has to fit.
    const opening = html.slice(0, at(RESULT_HEADINGS.evidence));
    const words = opening.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(90);
  });
});

describe('nothing was deleted to make it shorter', () => {
  it('still renders every evidence line drawn from her own answers', () => {
    expect(result.evidence.length).toBeGreaterThan(0);
    for (const line of result.evidence) expect(html).toContain(line.text);
  });

  it('still renders what this often looks like, in full', () => {
    expect(html).toContain(result.whatItOftenLooksLike);
  });

  it('still renders what this does not tell us, in full, with the universal limits', () => {
    expect(html).toContain(result.whatThisDoesNotTellUs);
    expect(html).toContain(RESULT_UNIVERSAL_LIMITS);
  });

  it('still renders the one thing worth trying', () => {
    expect(html).toContain(result.tryToday.title);
    expect(html).toContain(result.tryToday.body);
  });

  it('still renders the invitation and its own copy', () => {
    expect(html).toContain(INVITATION_COPY.title);
    for (const line of INVITATION_COPY.lines) expect(html).toContain(line);
  });
});

describe('what became secondary, and what did not', () => {
  it('folds the two prose sections into collapsibles that are closed by default', () => {
    for (const heading of [RESULT_HEADINGS.looksLike, RESULT_HEADINGS.limits]) {
      const before = html.slice(0, at(heading));
      const openDetails = (before.match(/<details/g) ?? []).length;
      const closeDetails = (before.match(/<\/details>/g) ?? []).length;
      expect(openDetails, `${heading} is not inside a details element`).toBeGreaterThan(
        closeDetails
      );
    }
    // Closed means no `open` attribute on either of them.
    expect(html).not.toContain('<details open');
  });

  it('never folds away the evidence, because it is the proof the pattern is hers', () => {
    const before = html.slice(0, at(RESULT_HEADINGS.evidence));
    const openDetails = (before.match(/<details/g) ?? []).length;
    const closeDetails = (before.match(/<\/details>/g) ?? []).length;
    expect(openDetails).toBe(closeDetails);
  });

  it('never folds away the one thing worth trying either', () => {
    const before = html.slice(0, at(RESULT_HEADINGS.action));
    const openDetails = (before.match(/<details/g) ?? []).length;
    const closeDetails = (before.match(/<\/details>/g) ?? []).length;
    expect(openDetails).toBe(closeDetails);
  });
});

describe('the email step is not a gate', () => {
  it('sits below the create-account button, in both places that button appears', () => {
    const lastCta = html.lastIndexOf(INVITATION_COPY.buttonLabel);
    expect(lastCta).toBeGreaterThan(-1);
    expect(lastCta).toBeLessThan(at(EMAIL_STEP_COPY.title));
  });

  it('sits below the whole free result', () => {
    const email = at(EMAIL_STEP_COPY.title);
    expect(at(RESULT_HEADINGS.evidence)).toBeLessThan(email);
    expect(at(RESULT_HEADINGS.action)).toBeLessThan(email);
    expect(at(RESULT_HEADINGS.limits)).toBeLessThan(email);
    expect(at(INVITATION_COPY.title)).toBeLessThan(email);
  });

  it('still says out loud that the result above is already complete', () => {
    expect(html).toContain(EMAIL_STEP_COPY.eyebrow);
    expect(EMAIL_STEP_COPY.eyebrow.toLowerCase()).toContain('already complete');
    expect(html).toContain(EMAIL_STEP_COPY.honesty);
  });

  it('is the quieter of the two actions on the page', () => {
    // The account button is the gold primary; the email button is not.
    const label = at(EMAIL_STEP_COPY.buttonLabel);
    const tagStart = html.lastIndexOf('<button', label);
    const emailButtonTag = html.slice(tagStart, html.indexOf('>', tagStart));
    expect(emailButtonTag).toContain('mef-button-secondary');
    // Not the gold primary. There is one loudest action on this page and it
    // is the account, not the email field.
    expect(emailButtonTag).not.toContain('bg-[#C4A050]');
  });
});

describe('the one-time quiz pass still rides the button', () => {
  it('routes both create-account presses through the single handler that carries it', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/public-entry/EnergyResultView.tsx'),
      'utf8'
    );
    // Exactly two create-account presses and one log-in press, and every
    // one of them goes through onGoToSignup. EnergyEntryClient's
    // handleGoToSignup is what appends the reference, and only for
    // 'signup'.
    expect(source.match(/onGoToSignup\('signup'\)/g)).toHaveLength(2);
    expect(source.match(/onGoToSignup\('login'\)/g)).toHaveLength(1);
    expect(source).not.toContain("window.location.href");
    expect(source).not.toContain("href=\"/signup\"");
  });
});

describe('the voice is unchanged', () => {
  it('renders no em dash anywhere on the screen', () => {
    expect(html).not.toContain('—');
  });

  it('makes no promise with no date on it and uses no urgency language', () => {
    const text = html.replace(/<[^>]*>/g, ' ').toLowerCase();
    for (const word of ['coming soon', 'hurry', 'limited time', 'act now', 'only today', 'expires']) {
      expect(text, `urgency language on the result screen: ${word}`).not.toContain(word);
    }
  });
});
