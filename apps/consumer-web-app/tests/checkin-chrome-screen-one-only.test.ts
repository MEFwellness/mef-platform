/**
 * UX audit fix (item 4 in the priority list): the intro paragraph ("A
 * few gentle questions...") and the Morning Readiness / Evening
 * Reflection tab switcher used to live in each flow's server page.tsx,
 * above <CheckinForm>/<EveningReflectionForm> — since those wizards
 * manage their own screenIndex client-side (no page navigation between
 * screens), that chrome never unmounted as she advanced, pushing every
 * subsequent screen's real questions down the page. Both pieces now live
 * inside each form's own renderScreen, gated to index === 0, so they
 * appear once on screen 1 and are gone (not just visually hidden) on
 * every screen after that. Nav (Home button, back chevron, progress
 * dots, Continue) is untouched — it lives in CheckinWizard.tsx, outside
 * renderScreen entirely, and stays on every screen by construction.
 *
 * Static source scans only (no component-rendering harness in this
 * repo's plain 'node' vitest environment) — proves the SHAPE of the
 * fix; actual per-screen appearance is verified live via Playwright,
 * reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const MORNING_PAGE = source('app/checkin/page.tsx');
const MORNING_FORM = source('app/checkin/CheckinForm.tsx');
const EVENING_PAGE = source('app/checkin/evening/page.tsx');
const EVENING_FORM = source('app/checkin/evening/EveningReflectionForm.tsx');

describe.each([
  ['Morning', MORNING_PAGE, MORNING_FORM, 'A few gentle questions'],
  ['Evening', EVENING_PAGE, EVENING_FORM, 'A short close to the day'],
] as const)('%s check-in: intro paragraph + tab switcher moved into the wizard, gated to screen 1', (_label, pageSrc, formSrc, introSnippet) => {
  it('the server page.tsx no longer renders the intro paragraph or CheckInModeSwitch directly', () => {
    expect(pageSrc).not.toContain(introSnippet);
    expect(pageSrc).not.toContain('<CheckInModeSwitch');
    expect(pageSrc).not.toContain("import { CheckInModeSwitch }");
  });

  it('the form imports CheckInModeSwitch and renders the intro text', () => {
    expect(formSrc).toContain("import { CheckInModeSwitch } from '@/components/checkin/CheckInModeSwitch'");
    expect(formSrc).toContain(introSnippet);
  });

  it('both the intro paragraph and <CheckInModeSwitch> are gated on index === 0, not rendered unconditionally', () => {
    const introBlockMatch = formSrc.match(/\{index === 0 && \(\s*<div className="mef-checkin-stagger">[\s\S]*?<\/div>\s*\)\}/);
    expect(introBlockMatch).not.toBeNull();
    const block = introBlockMatch![0]!;
    expect(block).toContain(introSnippet);
    expect(block).toContain('<CheckInModeSwitch');
  });
});

describe('Navigation (Home, back, progress dots, Continue) is untouched by the chrome removal', () => {
  it('CheckinWizard.tsx (shared nav shell) was not touched by this fix — still owns Home/back/progress/Continue outside renderScreen', () => {
    const wizard = source('components/checkin/CheckinWizard.tsx');
    expect(wizard).toContain('exitLabel');
    expect(wizard).toContain('onBack');
    expect(wizard).toContain('renderScreen(displayIndex)');
    expect(wizard).toContain('onContinue');
  });
});
