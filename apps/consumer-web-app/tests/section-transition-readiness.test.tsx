// @vitest-environment jsdom
/**
 * THE BEAT BETWEEN TWO SECTIONS ARRIVES WHOLE. (2026-09-11)
 *
 * Reported from a phone: the "Section complete" screen read as slow and
 * half drawn. It was. The heading carried `animation-delay: 160ms` and the
 * line under it `380ms`, both starting from opacity 0, so inside a beat
 * that is only 1250ms long a member watched a lone check mark on an empty
 * panel, then a heading, then a sentence. A screen assembling itself in
 * front of somebody is indistinguishable from a screen that has not
 * finished loading.
 *
 * THE RULE THIS HOLDS. Every element of that screen is in the document and
 * occupying its final box in the FIRST render. Nothing is gated behind a
 * timer, a state flip or a per element delay; the only thing that may
 * animate is how an element already present is painted inside the box it
 * already has. That is what "instantly and fully drawn, no partial paint,
 * no layout shift" means in assertions rather than in prose.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import {
  SectionTransition,
  SECTION_COMPLETE_LABEL,
  NEUTRAL_NEXT_LINE,
  SECTION_TRANSITION_MS,
} from '../components/questionnaire/SectionTransition';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (host) host.remove();
  root = null;
  host = null;
});

/**
 * Renders ONE frame and stops. No timers are run, nothing is flushed
 * beyond the first commit, so whatever this finds is literally what a
 * member sees in the instant the screen appears.
 */
function firstFrame(tone: 'light' | 'forest' = 'forest') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<SectionTransition tone={tone} nextLine={NEUTRAL_NEXT_LINE} />);
  });
  return host.querySelector('[data-testid="section-transition"]') as HTMLElement;
}

describe('the first frame is the whole screen', () => {
  it('has the check mark, the text and the gold line all at once', () => {
    const beat = firstFrame();
    // The check.
    expect(beat.querySelector('svg')).not.toBeNull();
    expect(beat.querySelector('.mef-close-check-draw')).not.toBeNull();
    // The two lines of copy.
    expect(beat.textContent).toContain(SECTION_COMPLETE_LABEL);
    expect(beat.textContent).toContain(NEUTRAL_NEXT_LINE);
    // The gold line's track, drawn at its full width from the start.
    const track = Array.from(beat.querySelectorAll('div')).find((d) =>
      d.className.includes('w-40')
    );
    expect(track).toBeDefined();
    expect(track!.className).toContain('overflow-hidden');
  });

  it('holds nothing back behind a per element delay', () => {
    const beat = firstFrame();
    for (const node of Array.from(beat.querySelectorAll<HTMLElement>('*'))) {
      expect(node.style.animationDelay).toBe('');
    }
  });

  it('reserves its height so nothing arriving can push anything down', () => {
    const beat = firstFrame();
    expect(beat.className).toContain('min-h-[220px]');
  });

  it('animates as one group rather than as three arrivals', () => {
    const beat = firstFrame();
    expect(beat.className).toContain('mef-section-beat');
  });

  it('draws the same whole screen in either tone', () => {
    const light = firstFrame('light');
    expect(light.textContent).toContain(SECTION_COMPLETE_LABEL);
    expect(light.textContent).toContain(NEUTRAL_NEXT_LINE);
    expect(light.querySelector('svg')).not.toBeNull();
  });

  it('announces itself once, as a status, not as an alert', () => {
    const beat = firstFrame();
    expect(beat.getAttribute('role')).toBe('status');
    expect(beat.getAttribute('aria-live')).toBe('polite');
  });
});

describe('the source keeps that rule', () => {
  const source = read('components/questionnaire/SectionTransition.tsx');

  it('carries no staged reveal and no animation delay', () => {
    expect(source).not.toContain('mef-reveal-step');
    expect(source).not.toContain('animationDelay');
  });

  it('is a static import of both takers, so no chunk is fetched at the beat', () => {
    for (const taker of [
      'components/body-systems/BodySystemsExperience.tsx',
      'components/assessments/AssessmentTaker.tsx',
    ]) {
      const file = read(taker);
      expect(file).toContain("from '@/components/questionnaire/SectionTransition'");
      expect(file).not.toMatch(/dynamic\(\s*\(\)\s*=>\s*import\([^)]*SectionTransition/);
    }
  });

  it('compresses the shared check draw for this screen only, and only its timing', () => {
    const css = read('app/globals.css');
    expect(css).toContain('.mef-section-beat .mef-close-check-draw');
    expect(css).toContain('.mef-section-beat .mef-close-check-circle');
    // The finished state, the keyframes and the easing stay shared: this
    // may change WHEN the check is drawn, never WHAT it looks like.
    const scoped = css.slice(css.indexOf('.mef-section-beat .mef-close-check-circle'));
    const block = scoped.slice(0, scoped.indexOf('@media'));
    expect(block).not.toContain('@keyframes');
    expect(block).not.toContain('stroke-dasharray');
    // And the whole beat still ends inside its own budget.
    const durations = Array.from(block.matchAll(/animation-duration:\s*(\d+)ms/g)).map((m) =>
      Number(m[1])
    );
    const delays = Array.from(block.matchAll(/animation-delay:\s*(\d+)ms/g)).map((m) =>
      Number(m[1])
    );
    const latest = Math.max(...durations) + Math.max(0, ...delays);
    expect(latest).toBeLessThan(SECTION_TRANSITION_MS / 2);
  });

  it('still turns everything off for a member who asked for reduced motion', () => {
    const css = read('app/globals.css');
    const guard = css.slice(css.indexOf('.mef-section-beat {'));
    const reduced = guard.slice(guard.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('.mef-section-beat');
    expect(reduced).toContain('animation: none !important');
  });
});
