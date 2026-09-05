/**
 * THE WAY OUT OF A CLOSING SCREEN IS A BUTTON, AND THERE IS ONE OF IT.
 *
 * Found on a real phone (2026-09-05): at the end of the Core Values
 * Snapshot's results screen, after the resource card and "What Root knows
 * so far", the only way back was a bare forest-on-cream text link. No
 * border, no fill, no shape. It read as a footer, not a control, which for
 * a member holding a phone at arm's length means hunting for the way out
 * of a screen she has finished with.
 *
 * There were three identical copies of it, one per experience, so there
 * was no single place to fix. This file holds the shape that replaced
 * them: one component, a full-width bordered control at the app's own tap
 * height, on every closing screen, saying the one thing the app calls
 * Home.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackToHomeButton, BACK_TO_HOME_LABEL } from '../components/closing-screen/BackToHomeButton';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf-8');

/** Every screen that ends an experience and must carry the shared exit. */
const CLOSING_SCREENS = [
  'app/assessments/core-values-snapshot/results/[sessionId]/page.tsx',
  'app/assessments/life-signal-check/results/[sessionId]/page.tsx',
  'app/assessments/readiness-pulse/results/[sessionId]/page.tsx',
  'components/core-values-snapshot/CoreValuesSnapshotTaker.tsx',
  'components/life-signal-check/LifeSignalCheckTaker.tsx',
  'components/readiness-pulse/ReadinessPulseTaker.tsx',
  'components/trial-arc/TrialArcCloseView.tsx',
  'components/trial-arc/TrialArcRecapView.tsx',
];

describe('the shared exit', () => {
  const html = renderToStaticMarkup(<BackToHomeButton />);

  it('says the one thing the app calls Home', () => {
    expect(BACK_TO_HOME_LABEL).toBe('Back to Home');
    expect(html).toContain('Back to Home');
  });

  it('goes Home', () => {
    expect(html).toContain('href="/dashboard"');
  });

  it('is a full-width control with a visible edge, not a text link', () => {
    // The three properties that make it findable: it spans the column, it
    // has a border a member can see, and it is at the app's own 56px tap
    // height (px-6 py-4, the same as every other full-width button in the
    // closing package).
    expect(html).toMatch(/class="[^"]*\bblock\b[^"]*"/);
    expect(html).toMatch(/class="[^"]*\bw-full\b[^"]*"/);
    expect(html).toMatch(/class="[^"]*border border-\[#1B3A2D\]\/20[^"]*"/);
    expect(html).toMatch(/class="[^"]*\bpy-4\b[^"]*"/);
    // The old one had none of these, and set its colour inline instead.
    expect(html).not.toContain('Return to Dashboard');
  });

  it('lets a screen pass its own address and words, for the one that needs to', () => {
    // The day 8 continuation renders the same recap from the same row, and
    // by then Home is behind the lock.
    const custom = renderToStaticMarkup(
      <BackToHomeButton href="/trial-ended" label="Back to your week" />
    );
    expect(custom).toContain('href="/trial-ended"');
    expect(custom).toContain('Back to your week');
  });
});

describe('every closing screen uses it, and nobody keeps a copy', () => {
  it.each(CLOSING_SCREENS)('%s renders the shared exit', (rel) => {
    expect(read(rel)).toMatch(/<BackToHomeButton[\s/]/);
  });

  it('no experience defines its own return control any more', () => {
    for (const rel of [
      'components/core-values-snapshot/CvsResultsView.tsx',
      'components/life-signal-check/LscResultsView.tsx',
      'components/readiness-pulse/RplResultsView.tsx',
    ]) {
      expect(read(rel)).not.toMatch(/ReturnToDashboardButton/);
    }
  });

  it('the two trial arc closings no longer end in a small underlined line', () => {
    for (const rel of [
      'components/trial-arc/TrialArcCloseView.tsx',
      'components/trial-arc/TrialArcRecapView.tsx',
    ]) {
      const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code).not.toMatch(/text-xs font-medium text-\[#6B7A72\] underline/);
    }
  });

  it("the trial arc close still records that no door was taken", () => {
    // Choosing Home is a real outcome of that screen, and restyling the
    // control must not have dropped its beacon.
    expect(read('components/trial-arc/TrialArcCloseView.tsx')).toMatch(
      /<BackToHomeButton label=\{close\.exitLabel\} onClick=\{\(\) => recordDoor\('home'\)\} \/>/
    );
  });

  it('no member-facing control anywhere still says "Return to Dashboard"', () => {
    for (const rel of [
      ...CLOSING_SCREENS,
      'app/assessments/wbsa/page.tsx',
      'app/assessments/wbsa/results/[sessionId]/page.tsx',
      'app/assessments/[questionnaireId]/page.tsx',
      'components/assessments/AssessmentTaker.tsx',
      'components/wbsa/WbsaTaker.tsx',
    ]) {
      expect(read(rel), rel).not.toContain('Return to Dashboard');
    }
  });
});

describe('the closings themselves are otherwise untouched', () => {
  it('the next-experience invitation still offers the next experience', () => {
    const cvs = read('lib/core-values-snapshot/copy.ts');
    const lsc = read('lib/life-signal-check/copy.ts');
    expect(cvs).toContain("primaryButton: 'Start the Life Signal Check'");
    expect(lsc).toContain("primaryButton: 'Start the Readiness Pulse'");
  });

  it('its own decline says Home too, so one screen names one place once', () => {
    for (const rel of [
      'lib/core-values-snapshot/copy.ts',
      'lib/life-signal-check/copy.ts',
      'lib/readiness-pulse/copy.ts',
    ]) {
      expect(read(rel), rel).not.toMatch(/back to dashboard/i);
    }
  });

  it('the staged reveal, the cards and the typewriter line are all still there', () => {
    const cvsClose = read('components/core-values-snapshot/CvsCloseScreen.tsx');
    expect(cvsClose).toMatch(/useCloseScreenReveal/);
    expect(cvsClose).toMatch(/RevealCard/);
    expect(cvsClose).toMatch(/IntroReveal/);
    expect(cvsClose).toMatch(/JourneyProgressLine/);
  });
});
