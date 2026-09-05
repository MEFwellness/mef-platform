/**
 * EVERY ACTION IN THE PUBLIC EXPERIENCE LOOKS LIKE A BUTTON.
 *
 * The bug this exists to stop shipped and was found on a phone. IntroReveal
 * rendered `className={button.className}` with no fallback, and the two
 * call sites in this experience passed none, so "Begin" and every
 * "Continue" came out as a bare `<button>`: unstyled text sitting in the
 * paragraph above it, no fill, no padding, no tap target. A visitor could
 * not tell there was anything to press.
 *
 * Two halves are checked here, because either one alone would have missed
 * it: the component cannot render an unstyled button even when a caller
 * forgets, AND no call site in this experience relies on that safety net by
 * accident.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IntroReveal } from '../components/IntroReveal';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

/** The classes that make a thing read and behave as a button. */
const LOOKS_TAPPABLE = /mef-button-primary|mef-button-secondary/;

/**
 * The opening tag of every `<button>` in a file.
 *
 * Deliberately not a lazy `/<button[\s\S]*?>/`: an arrow function in an
 * onClick (`onClick={() =>`) contains a `>` and stops that pattern dead
 * before the className is ever reached, which is exactly the false pass a
 * guard like this must not have. This walks forward from each `<button`
 * and closes on the first `>` that is not part of `=>`.
 */
/**
 * The class-name string constants a file defines at module scope, so a
 * `className={GOLD_CTA}` can be checked against what GOLD_CTA actually is.
 *
 * Added when the result screen started using one named recipe in the two
 * places its create-account button appears, rather than repeating the
 * string. The guard's point is that no button ships unstyled, not that
 * every button spells its classes out inline, so it follows the reference
 * instead of forbidding it. A constant it cannot resolve is left alone and
 * still fails, which is the safe direction.
 */
function classConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const match of source.matchAll(/const ([A-Z][A-Z0-9_]*) =\s*'([^']*)';/g)) {
    constants.set(match[1]!, match[2]!);
  }
  return constants;
}

/** One opening tag with every module-scope class constant it names substituted in. */
function withClassesResolved(tag: string, constants: Map<string, string>): string {
  return tag.replace(/\$?\{([A-Z][A-Z0-9_]*)\}/g, (whole, name: string) =>
    constants.has(name) ? ` ${constants.get(name)} ` : whole
  );
}

function openingTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<button\b/g)) {
    const start = match.index ?? 0;
    let i = start;
    while (i < source.length) {
      const gt = source.indexOf('>', i);
      if (gt === -1) break;
      if (source[gt - 1] === '=') {
        i = gt + 1;
        continue;
      }
      tags.push(source.slice(start, gt + 1));
      break;
    }
  }
  return tags;
}

describe('IntroReveal cannot render an unstyled button', () => {
  it('falls back to a real button when a caller forgets a className', () => {
    const html = renderToStaticMarkup(
      <IntroReveal
        title="A title"
        lines={['A line.']}
        storageKey="test-key"
        button={{ label: 'Begin', onClick: () => {} }}
      />
    );
    expect(html).toContain('<button');
    expect(html).toMatch(LOOKS_TAPPABLE);
  });

  it('still honours a className a caller does pass', () => {
    const html = renderToStaticMarkup(
      <IntroReveal
        title="A title"
        lines={['A line.']}
        storageKey="test-key-2"
        button={{ label: 'Begin', onClick: () => {}, className: 'my-own-class' }}
      />
    );
    expect(html).toContain('my-own-class');
    expect(html).not.toContain('mef-button-primary');
  });
});

describe('the shared button recipe exists and is the one definition', () => {
  const css = read('app/globals.css');

  it('is declared in globals.css, inside the components layer', () => {
    expect(css).toContain('.mef-button-primary {');
    expect(css).toContain('.mef-button-secondary {');
    const layerStart = css.indexOf('@layer components {');
    expect(layerStart).toBeGreaterThan(-1);
    expect(css.indexOf('.mef-button-primary {')).toBeGreaterThan(layerStart);
  });

  it('gives a real fill, a real tap target and a pressed state', () => {
    const block = css.slice(
      css.indexOf('.mef-button-primary {'),
      css.indexOf('.mef-button-primary:hover')
    );
    expect(block).toContain('background: #1b3a2d');
    expect(block).toContain('min-height: 52px');
    // The press feedback itself is .mef-press, applied alongside.
    expect(css).toContain('.mef-press:active');
  });

  it('replaced the four hand-rolled copies of the same string', () => {
    const OLD_RECIPE = 'block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]';
    for (const file of [
      'components/core-values-snapshot/CoreValuesSnapshotTaker.tsx',
      'components/life-signal-check/LifeSignalCheckTaker.tsx',
      'components/readiness-pulse/ReadinessPulseTaker.tsx',
      'components/reset-plan/ResetPlanTaker.tsx',
    ]) {
      const source = read(file);
      const introRevealButton = source.slice(source.indexOf('button={{'), source.indexOf('button={{') + 240);
      expect(introRevealButton).toContain('mef-button-primary');
      expect(introRevealButton).not.toContain(OLD_RECIPE);
    }
  });
});

describe('every action in the public experience', () => {
  const files = [
    'components/public-entry/EnergyEntryClient.tsx',
    'components/public-entry/EnergyResultView.tsx',
  ];

  it('carries a button recipe on every <button> it renders', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = read(file);
      const constants = classConstants(source);
      // Each <button ...> up to the end of its opening tag.
      for (const tag of openingTags(source)) {
        if (!LOOKS_TAPPABLE.test(withClassesResolved(tag, constants))) {
          offenders.push(`${file}: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('passes an explicit button className at every IntroReveal call site', () => {
    // The default in IntroReveal is a safety net, not the intended way to
    // write a call site: a screen should say what its own action looks
    // like. This is what would have failed on the original bug.
    for (const file of files) {
      const source = read(file);
      for (const match of source.matchAll(/button=\{\{[\s\S]{0,400}?\}\}/g)) {
        expect(match[0]).toContain('mef-button-primary');
      }
    }
  });

  it('never leaves an action as an underlined text link', () => {
    // "I already have an account" was one. On a screen whose whole job is
    // to offer two ways forward, the quieter one still has to be a button.
    for (const file of files) {
      const source = read(file);
      for (const tag of openingTags(source)) {
        expect(tag).not.toContain('underline');
      }
    }
  });

  it('gives every action a keyboard focus ring', () => {
    for (const file of files) {
      const source = read(file);
      const constants = classConstants(source);
      for (const tag of openingTags(source)) {
        expect(withClassesResolved(tag, constants)).toContain('mef-focus-ring');
      }
      for (const match of source.matchAll(/button=\{\{[\s\S]{0,400}?\}\}/g)) {
        expect(match[0]).toContain('mef-focus-ring');
      }
    }
  });
});

describe('the entry screen carries the brand', () => {
  it('renders the shared Rooted Reset lockup, not a third copy of it', () => {
    const client = read('components/public-entry/EnergyEntryClient.tsx');
    expect(client).toContain('RootedResetLockup');
    expect(client).not.toContain('rooted-reset-logo.png');
  });

  it('and the auth layout renders the same one', () => {
    const authLayout = read('app/(auth)/layout.tsx');
    expect(authLayout).toContain('RootedResetLockup');
    expect(authLayout).not.toContain('rooted-reset-logo.png');
  });

  it('uses the real logo asset that exists in the repo', () => {
    const lockup = read('components/brand/RootedResetLockup.tsx');
    expect(lockup).toContain('/images/rooted-reset-logo.png');
    expect(fs.existsSync(path.join(ROOT, 'public/images/rooted-reset-logo.png'))).toBe(true);
  });
});
