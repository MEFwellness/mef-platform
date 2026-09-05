/**
 * ONE MECHANISM, NOT THREE PATCHES (2026-09-05).
 *
 * The closing screens were being skipped in all three free-arc
 * experiences, for one reason, and the fix is one rule in one file
 * (lib/assessment-runtime/closing.ts) that all three declare into. The
 * fault this file exists for is the one the 2026-08-27 sweep kept finding:
 * a real fix applied to two of three flows, and the third quietly left
 * broken because nobody remembered it.
 *
 * So this reads the source. If a fourth experience grows an in-flow
 * closing, add it to EXPERIENCES and it has to carry the same five pieces.
 *
 * It also holds the two boundaries the fix must not cross:
 *   - an experience that ends ON its results screen (the Wellbeing and
 *     Symptom Assessment) does not declare a closing handoff and is
 *     untouched;
 *   - the trial arc's day 6 recap and day 7 close render from a stored
 *     plan, not a live session, so the take route's rule cannot reach
 *     them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf-8');

/** Every experience whose taker ends on its own premium closing beat. */
const EXPERIENCES = [
  {
    name: 'Core Values Snapshot',
    actions: 'app/actions/coreValuesSnapshot.ts',
    page: 'app/assessments/core-values-snapshot/take/page.tsx',
    taker: 'components/core-values-snapshot/CoreValuesSnapshotTaker.tsx',
  },
  {
    name: 'Life Signal Check',
    actions: 'app/actions/lifeSignalCheck.ts',
    page: 'app/assessments/life-signal-check/take/page.tsx',
    taker: 'components/life-signal-check/LifeSignalCheckTaker.tsx',
  },
  {
    name: 'Readiness Pulse',
    actions: 'app/actions/readinessPulse.ts',
    page: 'app/assessments/readiness-pulse/take/page.tsx',
    taker: 'components/readiness-pulse/ReadinessPulseTaker.tsx',
  },
] as const;

describe('the rule lives in one file, and the take route is its only caller', () => {
  it('the decision is made once, in lib/assessment-runtime/closing.ts', () => {
    const rule = read('lib/assessment-runtime/closing.ts');
    expect(rule).toContain('export function decideFinishedSessionDestination');
    expect(rule).toContain('CLOSING_WINDOW_MINUTES');
  });

  it('the take route asks that rule instead of deciding for itself', () => {
    const entry = read('lib/assessment-runtime/entry.ts');
    expect(entry).toContain('decideFinishedSessionDestination');
    // The finished-session branch still has a results redirect in it: a
    // member coming back to something finished must never lose that.
    expect(entry).toContain('routes.results(result.latestCompletedSessionId)');
  });

  it('no screen re-implements the window for itself', () => {
    for (const experience of EXPERIENCES) {
      for (const file of [experience.page, experience.taker, experience.actions]) {
        expect(read(file), `${file} does its own elapsed-time arithmetic`).not.toMatch(
          /\d+\s*\*\s*60_?000/
        );
      }
    }
  });
});

describe.each(EXPERIENCES)('$name carries the shared mechanism', (experience) => {
  it('declares that it closes inside its taker', () => {
    expect(read(experience.actions)).toContain('hasInFlowClosing: true');
  });

  it('its take page renders the taker in the phase the rule chose, rather than redirecting', () => {
    const source = read(experience.page);
    expect(source).toContain('const { session, phase } = result;');
    expect(source).toContain('phase={phase}');
    expect(source).toContain("phase === 'closing'");
  });

  it('its take page recomputes the scoring the closing needs from her stored answers', () => {
    const source = read(experience.page);
    expect(source).toContain('initialScoring={scoring}');
    expect(source).toMatch(/compute\w+Scoring\(session\.answers/);
  });

  it('its take page reads the beat marker out of the URL, through the shared parser', () => {
    const source = read(experience.page);
    expect(source).toContain("from '@/lib/assessment-runtime/closing'");
    expect(source).toContain('parseClosingBeat(searchParams?.[CLOSING_PARAM])');
    expect(source).toContain('initialClosingBeat={closingBeat}');
  });

  it('its taker never re-runs the finishing beat for a session already finished', () => {
    const source = read(experience.taker);
    expect(source).toContain(
      "const initialBeat: Beat = phase === 'closing' ? (initialClosingBeat ?? FIRST_CLOSING_BEAT) : initial.beat;"
    );
    expect(source).toContain('useState<Beat>(initialBeat)');
  });

  it('its taker starts the closing with the scoring already in hand', () => {
    expect(read(experience.taker)).toMatch(/useState<\w+Scoring \| null>\(initialScoring\)/);
  });

  it('its taker writes the beat into the URL, so a reload comes back to it', () => {
    const source = read(experience.taker);
    expect(source).toContain('markClosingBeat(beat as ClosingBeat)');
  });

  it('nothing but her own tap moves her through the closing', () => {
    const source = read(experience.taker);
    // The standing decision after the check-in wizard: auto-advance was
    // removed app wide because two systems controlling one transition was
    // the source of repeated breakage.
    expect(source).not.toContain('setTimeout');
    expect(source).not.toContain('setInterval');
    // replaceState rewrites the address bar; it does not navigate.
    expect(source).not.toContain('router.replace');
  });

  it('the closing still ends with the one shared way out', () => {
    expect(read(experience.taker)).toContain('<BackToHomeButton />');
  });
});

describe('the boundaries the mechanism must not cross', () => {
  it('an experience that ends on its results screen declares no closing handoff', () => {
    const source = read('app/actions/wbsa.ts');
    expect(source).toContain('loadRuntimeTakeSession');
    expect(source).not.toContain('hasInFlowClosing');
  });

  it('the trial arc day 6 recap and day 7 close render a stored plan, not a live session', () => {
    for (const page of ['app/trial/week/page.tsx', 'app/trial/close/page.tsx', 'app/trial-ended/week/page.tsx']) {
      const source = read(page);
      expect(source, `${page} reads a live take session`).not.toContain('loadRuntimeTakeSession');
      expect(source, `${page} reads the take route's closing rule`).not.toContain('assessment-runtime/closing');
    }
  });

  it('the shared closing components are untouched by any of this', () => {
    for (const component of [
      'components/closing-screen/ClosingScreenPrimitives.tsx',
      'components/closing-screen/BackToHomeButton.tsx',
      'components/core-values-snapshot/CvsCloseScreen.tsx',
      'components/life-signal-check/LscCloseScreen.tsx',
      'components/readiness-pulse/RplCloseScreen.tsx',
      'components/trial-arc/TrialArcCloseView.tsx',
      'components/trial-arc/TrialArcRecapView.tsx',
    ]) {
      expect(read(component), `${component} knows about the take route's routing`).not.toContain(
        'assessment-runtime/closing'
      );
    }
  });
});
