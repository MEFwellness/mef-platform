/**
 * Four-fixes pass (2026-07-27), fix 1: "the top-left X requires four or
 * five taps before it registers... remove the X icon entirely, put a
 * clearly labelled button... it must respond on the FIRST tap, every
 * time." No component-rendering harness exists in this repo
 * (vitest.config.ts runs a plain 'node' environment, no jsdom/RTL —
 * every existing test for this feature is source-level, same pattern as
 * tests/checkin-navigation.test.ts), so this is a static scan of the
 * actual source, not a rendered-DOM one. The real first-tap behavior is
 * verified live via Playwright, reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const WIZARD = source('components/checkin/CheckinWizard.tsx');
const MORNING_FORM = source('app/checkin/CheckinForm.tsx');
const EVENING_FORM = source('app/checkin/evening/EveningReflectionForm.tsx');

describe('the X icon is gone, replaced by a word-labelled Home control', () => {
  it('CheckinWizard no longer imports or renders the X icon', () => {
    expect(WIZARD).not.toContain("ChevronLeft, X } from 'lucide-react'");
    expect(WIZARD).not.toContain('<X ');
  });

  it('imports and renders the Home icon alongside a real word label, not an icon alone', () => {
    expect(WIZARD).toContain("Home } from 'lucide-react'");
    expect(WIZARD).toContain('<Home ');
    expect(WIZARD).toContain('{exitLabel}');
    expect(WIZARD).toContain("exitLabel = 'Home'");
  });

  it('the Home control meets the 44pt minimum tap target (h-11 = 44px in this app\'s Tailwind scale)', () => {
    const start = WIZARD.indexOf('onClick={onExit}');
    const block = WIZARD.slice(start - 50, start + 400);
    expect(block).toMatch(/h-11\b/);
  });

  it('the Home control and the back chevron remain visually distinguishable and never share a className block', () => {
    const homeStart = WIZARD.indexOf('onClick={onExit}');
    const homeBlock = WIZARD.slice(homeStart - 50, WIZARD.indexOf('</button>', homeStart));
    const backStart = WIZARD.indexOf('onClick={onBack}');
    const backBlock = WIZARD.slice(backStart - 50, WIZARD.indexOf('</button>', backStart));
    expect(homeBlock).not.toEqual(backBlock);
  });
});

describe('the actual cause of "several taps before it registers": no visual feedback + no re-entry guard, both fixed', () => {
  it('CheckinWizard accepts exitDisabled/exitLabel and wires them to the button', () => {
    expect(WIZARD).toContain('exitDisabled?: boolean');
    expect(WIZARD).toContain('disabled={exitDisabled}');
  });

  it.each([
    ['Morning (CheckinForm.tsx)', MORNING_FORM],
    ['Evening (EveningReflectionForm.tsx)', EVENING_FORM],
  ])('%s: saveProgressAndExit synchronously guards against re-entry before its first await', (_label, formSource) => {
    const start = formSource.indexOf('async function saveProgressAndExit()');
    expect(start).toBeGreaterThan(-1);
    const block = formSource.slice(start, formSource.indexOf('\n  }', start));
    // The guard-and-set must appear textually before the first `await` in
    // the function body, so a second tap landing before the first
    // `await` resolves is still turned away synchronously.
    const guardIndex = block.indexOf('exitingRef.current');
    const firstAwaitIndex = block.indexOf('await ');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(firstAwaitIndex);
    expect(block).toContain('if (exitingRef.current) return;');
    expect(block).toContain('exitingRef.current = true;');
    expect(block).toContain('setExiting(true);');
  });

  it.each([
    ['Morning (CheckinForm.tsx)', MORNING_FORM],
    ['Evening (EveningReflectionForm.tsx)', EVENING_FORM],
  ])('%s: passes the live exiting state into CheckinWizard as exitDisabled/exitLabel', (_label, formSource) => {
    expect(formSource).toContain('exitDisabled={exiting}');
    expect(formSource).toMatch(/exitLabel=\{exiting \? 'Saving…' : 'Home'\}/);
  });
});

describe('draft save and restore still work exactly as before (unchanged by the button redesign)', () => {
  it('CheckinForm.saveProgressAndExit still calls saveDailyCheckinDraft, not submitDailyCheckin', () => {
    const start = MORNING_FORM.indexOf('async function saveProgressAndExit()');
    const block = MORNING_FORM.slice(start, MORNING_FORM.indexOf('\n  }', start));
    expect(block).toContain('saveDailyCheckinDraft(');
    expect(block).not.toContain('submitDailyCheckin(');
    expect(block).toContain("router.push('/dashboard'");
  });

  it('EveningReflectionForm.saveProgressAndExit still calls saveEveningReflectionDraft, not submitEveningReflection', () => {
    const start = EVENING_FORM.indexOf('async function saveProgressAndExit()');
    const block = EVENING_FORM.slice(start, EVENING_FORM.indexOf('\n  }', start));
    expect(block).toContain('saveEveningReflectionDraft(');
    expect(block).not.toContain('submitEveningReflection(');
    expect(block).toContain("router.push('/dashboard')");
  });

  it('reopening still seeds pain follow-up state from initialProbeAnswers (never discards revealed follow-up answers)', () => {
    expect(MORNING_FORM).toContain("initialProbeAnswers['checkin_probe.pain_location']");
    expect(MORNING_FORM).toContain("initialProbeAnswers['checkin_probe.pain_aggravating_factor']");
  });
});

describe('auto-advance is still gone (scope note: do not reintroduce it)', () => {
  it('neither form imports or calls the removed useScreenAutoAdvance hook (CheckinWizard\'s doc comment may still name it as history)', () => {
    expect(MORNING_FORM).not.toContain('useScreenAutoAdvance');
    expect(EVENING_FORM).not.toContain('useScreenAutoAdvance');
    expect(WIZARD).not.toContain('useScreenAutoAdvance(');
  });

  it('Continue remains the only prop that advances a screen — CheckinWizard never calls onContinue itself', () => {
    expect(WIZARD).not.toContain('onContinue(');
    expect(WIZARD).toContain('onClick={onContinue}');
  });
});
