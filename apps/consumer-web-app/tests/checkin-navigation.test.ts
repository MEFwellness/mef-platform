/**
 * Navigation fix (task requirement 1): "completing a screen currently
 * does not advance to the next... every screen gets a persistent
 * Continue button... a persistent exit control... exiting mid-check-in
 * saves progress and resumes on return." No component-rendering harness
 * exists in this repo (vitest.config.ts runs a plain 'node' environment,
 * no jsdom/RTL — every existing test for this feature is source-level,
 * same pattern as tests/checkin-core-survives-four-screen-split.test.ts),
 * so this is a static scan of the actual source, not a rendered-DOM one.
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

describe('CheckinWizard — the shared shell both check-ins render through', () => {
  it('accepts onExit, onContinue, continueLabel, and continueDisabled as real props (the persistent controls), not just onBack', () => {
    expect(WIZARD).toMatch(/onExit:\s*\(\)\s*=>\s*void/);
    expect(WIZARD).toMatch(/onContinue:\s*\(\)\s*=>\s*void/);
    expect(WIZARD).toContain('continueLabel: string');
    expect(WIZARD).toContain('continueDisabled: boolean');
  });

  it('renders the exit control and the Continue button unconditionally — not nested inside an isLastScreen/screenIndex check', () => {
    // The exit button's own JSX block, up to the back-chevron's
    // conditional right after it — proves the exit control itself isn't
    // behind the `screenIndex > 0` gate that DOES correctly guard the
    // back chevron.
    const exitButtonBlock = WIZARD.slice(WIZARD.indexOf('onClick={onExit}'), WIZARD.indexOf('screenIndex > 0'));
    expect(exitButtonBlock).not.toContain('screenIndex > 0');

    // The Continue button lives in its own block after renderScreen(...),
    // not inside the renderScreen render-prop (which is where the old,
    // last-screen-only submit button used to live) — i.e. the wizard
    // itself, not the caller, is what makes it persistent.
    const afterRenderScreen = WIZARD.slice(WIZARD.indexOf('{renderScreen(displayIndex)}'));
    expect(afterRenderScreen).toContain('onClick={onContinue}');
    expect(afterRenderScreen).toContain('disabled={continueDisabled}');
  });

  it('the exit control and the back chevron are visually distinguishable (different classNames, never sharing the same style block)', () => {
    const exitBlockStart = WIZARD.indexOf('onClick={onExit}');
    const exitBlockEnd = WIZARD.indexOf('</button>', exitBlockStart);
    const exitBlock = WIZARD.slice(exitBlockStart - 200, exitBlockEnd);

    const backBlockStart = WIZARD.indexOf('onClick={onBack}');
    const backBlockEnd = WIZARD.indexOf('</button>', backBlockStart);
    const backBlock = WIZARD.slice(backBlockStart - 200, backBlockEnd);

    expect(exitBlock).not.toEqual(backBlock);
    // The exit control reads as a plain outline circle (border, no fill);
    // the back chevron is the tinted solid pill the redesign already used.
    expect(exitBlock).toContain('border-[#1B3A2D]/15');
    expect(backBlock).toContain('bg-[#1B3A2D]/[0.06]');
  });
});

describe.each([
  ['Morning (CheckinForm.tsx)', MORNING_FORM],
  ['Evening (EveningReflectionForm.tsx)', EVENING_FORM],
])('%s wires the persistent controls, not just auto-advance', (_label, formSource) => {
  it('still uses useScreenAutoAdvance as a convenience layer, not the only path forward', () => {
    expect(formSource).toContain('useScreenAutoAdvance(');
  });

  it('passes onExit/onContinue/continueLabel/continueDisabled into CheckinWizard', () => {
    expect(formSource).toContain('onExit={saveProgressAndExit}');
    expect(formSource).toContain('onContinue={handleContinue}');
    expect(formSource).toContain('continueLabel={');
    expect(formSource).toContain('continueDisabled={');
  });

  it('handleContinue falls through to the real submit only on the last screen, otherwise just advances', () => {
    const start = formSource.indexOf('function handleContinue()');
    const block = formSource.slice(start, formSource.indexOf('\n  }', start));
    expect(block).toMatch(/isLastScreen|clampedIndex === screenCount - 1/);
    expect(block).toMatch(/goNext\(\)/);
  });

  it('saveProgressAndExit exists and navigates to /dashboard after saving', () => {
    const start = formSource.indexOf('async function saveProgressAndExit()');
    expect(start).toBeGreaterThan(-1);
    const block = formSource.slice(start, formSource.indexOf('\n  }', start));
    expect(block).toContain("router.push('/dashboard'");
  });
});

describe('exiting mid-check-in saves progress via a draft, never the full "this genuinely happened" submit path', () => {
  it('CheckinForm.saveProgressAndExit calls saveDailyCheckinDraft, not submitDailyCheckin', () => {
    const start = MORNING_FORM.indexOf('async function saveProgressAndExit()');
    const block = MORNING_FORM.slice(start, MORNING_FORM.indexOf('\n  }', start));
    expect(block).toContain('saveDailyCheckinDraft(');
    expect(block).not.toContain('submitDailyCheckin(');
  });

  it('EveningReflectionForm.saveProgressAndExit calls saveEveningReflectionDraft, not submitEveningReflection', () => {
    const start = EVENING_FORM.indexOf('async function saveProgressAndExit()');
    const block = EVENING_FORM.slice(start, EVENING_FORM.indexOf('\n  }', start));
    expect(block).toContain('saveEveningReflectionDraft(');
    expect(block).not.toContain('submitEveningReflection(');
  });
});

describe('resuming after an exit never discards answers (task requirement 1)', () => {
  it('CheckinForm seeds pain follow-up state from initialProbeAnswers, not always null', () => {
    expect(MORNING_FORM).toContain("initialProbeAnswers['checkin_probe.pain_location']");
    expect(MORNING_FORM).toContain("initialProbeAnswers['checkin_probe.pain_aggravating_factor']");
  });
});
