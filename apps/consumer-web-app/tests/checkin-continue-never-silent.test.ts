/**
 * The general guard the 2026-08-14 bug report asked for: no check-in
 * screen may have a Continue that is blocked with no visible reason.
 *
 * The reported symptom was not "the validation is wrong" — it was
 * "tapping Continue does nothing at all with no feedback". A member
 * cannot debug a disabled button. So the rule is enforced in three
 * places, each tested here:
 *
 *   1. continueHelperText — the wizard's own decision. Disabled and not
 *      saving ALWAYS yields a non-empty line, even if the calling screen
 *      forgot to supply one.
 *   2. The type. CheckinUnit has no `required: boolean` any more: a unit
 *      that blocks Continue carries the member-facing sentence in the
 *      same field, so "blocking with nothing to say" is not expressible.
 *      Asserted here by reading the type, since a compile error is not
 *      something a test suite can observe after the fact.
 *   3. Both real flows pass the reason through to the wizard, and every
 *      blocking unit in them declares one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { continueHelperText, FALLBACK_CONTINUE_REASON } from '../components/checkin/CheckinWizard';

const read = (relativePath: string) => readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');

const MORNING_FORM = read('app/checkin/CheckinForm.tsx');
const EVENING_FORM = read('app/checkin/evening/EveningReflectionForm.tsx');
const WIZARD = read('components/checkin/CheckinWizard.tsx');
const WIZARD_UNITS = read('lib/daily-checkin-adaptive/wizardUnits.ts');
const FORMS = [
  { name: 'CheckinForm.tsx (Daily Reset)', source: MORNING_FORM },
  { name: 'EveningReflectionForm.tsx', source: EVENING_FORM },
];

describe('continueHelperText — a disabled Continue always explains itself', () => {
  it('says nothing when Continue works', () => {
    expect(continueHelperText({ disabled: false, busy: false, reason: 'Select 2 meals.' })).toBeNull();
    expect(continueHelperText({ disabled: false, busy: false, reason: null })).toBeNull();
  });

  it("shows the screen's own reason when it has one", () => {
    expect(continueHelperText({ disabled: true, busy: false, reason: 'Select 2 meals.' })).toBe('Select 2 meals.');
  });

  it('falls back to a real line rather than silence when a screen supplies none', () => {
    expect(continueHelperText({ disabled: true, busy: false, reason: null })).toBe(FALLBACK_CONTINUE_REASON);
    expect(continueHelperText({ disabled: true, busy: false, reason: '   ' })).toBe(FALLBACK_CONTINUE_REASON);
  });

  it('stays quiet only while a save is genuinely in flight, where the button label already says "Saving…"', () => {
    expect(continueHelperText({ disabled: true, busy: true, reason: null })).toBeNull();
  });

  it('THE INVARIANT: disabled and not saving can never produce an empty explanation, for any reason value', () => {
    for (const reason of [null, '', '  ', 'Select 2 meals.', FALLBACK_CONTINUE_REASON]) {
      const text = continueHelperText({ disabled: true, busy: false, reason });
      expect(typeof text).toBe('string');
      expect((text ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('the fallback line is member-facing copy: no em dash, no jargon', () => {
    expect(FALLBACK_CONTINUE_REASON).not.toContain('—');
    expect(FALLBACK_CONTINUE_REASON.toLowerCase()).not.toContain('valid');
    expect(FALLBACK_CONTINUE_REASON.toLowerCase()).not.toContain('required field');
  });
});

describe('the unit model makes a silent block unwritable', () => {
  it('CheckinUnit has no boolean `required` flag any more, only a reason-or-null', () => {
    expect(WIZARD_UNITS).toContain('blockedReason: string | null;');
    expect(WIZARD_UNITS).not.toMatch(/^\s*required: boolean;/m);
  });

  it('isScreenComplete and screenBlockedReason read the same single field, so they can never disagree', () => {
    expect(WIZARD_UNITS).toContain('unit.blockedReason === null || unit.answered');
    expect(WIZARD_UNITS).toContain('unit.blockedReason !== null && !unit.answered');
  });
});

describe('both check-in flows are actually wired to it', () => {
  for (const form of FORMS) {
    it(`${form.name} computes the screen's blocking reason and passes it to the wizard`, () => {
      expect(form.source).toContain('screenBlockedReason(currentScreen)');
      expect(form.source).toContain('continueBlockedReason={blockedReason}');
      expect(form.source).toContain('continueBusy=');
    });

    it(`${form.name} disables Continue on an incomplete screen, on every screen and not only the last`, () => {
      expect(form.source).toContain('!screenComplete');
      // The old shape was `isLastScreen ? saving : !screenComplete`, which
      // stopped checking completeness on the final screen.
      expect(form.source).not.toMatch(/continueDisabled=\{isLastScreen \?/);
    });

    it(`${form.name} has no blocking unit without a stated reason`, () => {
      // Every `blockedReason:` in either form is either an explicit null,
      // a quoted sentence, or the computed count-match reason.
      const declarations = form.source.match(/blockedReason: [^\n]+/g) ?? [];
      expect(declarations.length).toBeGreaterThan(0);
      for (const declaration of declarations) {
        expect(declaration).toMatch(/blockedReason: (null,|'[^']+',|countReason,)/);
      }
    });

    it(`${form.name} uses no em dash in any blocking reason it declares`, () => {
      for (const declaration of form.source.match(/blockedReason: '[^']+'/g) ?? []) {
        expect(declaration).not.toContain('—');
      }
    });
  }

  it('the wizard renders the reason as visible text, not only as an accessibility attribute', () => {
    const start = WIZARD.indexOf('{helperText && (');
    expect(start).toBeGreaterThan(-1);
    const block = WIZARD.slice(start, start + 700);
    expect(block).toContain('{helperText}');
    expect(block).toContain('aria-live="polite"');
    expect(WIZARD).toContain("aria-describedby={helperText ? 'checkin-continue-reason' : undefined}");
  });

  it('the reason sits inside the sticky footer, so it is on screen at the moment Continue is tapped', () => {
    const stickyStart = WIZARD.indexOf('sticky bottom-4');
    const buttonStart = WIZARD.indexOf('onClick={onContinue}');
    const helperStart = WIZARD.indexOf('{helperText && (');
    expect(stickyStart).toBeGreaterThan(-1);
    expect(helperStart).toBeGreaterThan(stickyStart);
    expect(helperStart).toBeLessThan(buttonStart);
  });
});
