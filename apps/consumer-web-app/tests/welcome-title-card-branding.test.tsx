// @vitest-environment jsdom
/**
 * THE FIRST WORDS A NEW MEMBER READS NAME THE THING SHE SIGNED UP FOR.
 *
 * The welcome flow's title card said "Welcome to MEF Wellness", which is
 * the company that makes the app rather than the product she just created
 * an account for. It says "Welcome to Rooted Reset" now, with
 * "by MEF Wellness" small underneath, the same order and the same pairing
 * as the lockup on the login screen (components/brand/RootedResetLockup.tsx).
 *
 * RENDERED, NOT GREPPED. The card is drawn for real and its text read off
 * the DOM, because a source grep would pass on a string that never reaches
 * a screen, and both halves of a two-line lockup have to actually be there.
 *
 * Reduced motion is forced on, which is what the flow uses to render every
 * page without its animation timers: the words are the same either way,
 * and a test that waited on a five second cinematic sequence would be
 * measuring the clock rather than the copy.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WelcomeFlow } from '../app/welcome/WelcomeFlow';
import { RootedResetLockup } from '../components/brand/RootedResetLockup';
import { renderToStaticMarkup } from 'react-dom/server';

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  // The flow renders every page without animation under reduced motion,
  // which is the state this test wants: the title card, immediately.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function renderFlow(): string {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<WelcomeFlow initialStep={1} />);
  });
  return container.textContent ?? '';
}

describe('the welcome flow title card', () => {
  it('welcomes her to Rooted Reset, not to the company that makes it', () => {
    const text = renderFlow();
    expect(text).toContain('Welcome to Rooted Reset');
    expect(text).not.toContain('Welcome to MEF Wellness');
  });

  it('says "by MEF Wellness" underneath, so the company is still named', () => {
    const text = renderFlow();
    const headline = text.indexOf('Welcome to Rooted Reset');
    const byline = text.indexOf('by MEF Wellness');
    expect(headline).toBeGreaterThanOrEqual(0);
    expect(byline).toBeGreaterThan(headline);
  });

  it('pairs the two names the same way the login screen already does', () => {
    // Not a coincidence to be maintained by hand: the auth screens render
    // this lockup, and it is the reference this card was matched to.
    const lockup = renderToStaticMarkup(<RootedResetLockup />);
    expect(lockup).toContain('Rooted Reset');
    expect(lockup).toContain('by MEF Wellness');
  });
});
