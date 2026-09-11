// @vitest-environment jsdom
/**
 * THE POP-UP THAT CAME UP HALF WAY DOWN THE SCREEN. (2026-09-11)
 *
 * Reported from a phone: after finishing the Body Systems Survey and
 * heading back to Home, the Weekly Reflection pop-up rendered half way
 * down the screen, clipped, sitting on top of the page rather than over
 * it, with its buttons out of reach. The app had to be force closed.
 *
 * Two causes, both of them the same copied pair of lines in six files:
 *
 *   `fixed inset-0` IS NOT THE VIEWPORT when an ancestor carries a
 *   transform, a filter, a backdrop-filter, a will-change or a contain,
 *   because any of those makes that ancestor the containing block for
 *   every fixed descendant. This app's own `.mef-animate-in` and
 *   `.mef-fade-up` both END on a transform and both use
 *   `animation-fill-mode: both`, so the transform is still applied long
 *   after the animation is over. A pop-up inside one is positioned
 *   against that card rather than against the phone.
 *
 *   A CARD TALLER THAN THE PHONE HAD NOWHERE TO GO. The frame did not
 *   scroll, so a tall message centred itself with its top above the top of
 *   the screen and its buttons below the bottom.
 *
 * components/ui/ModalOverlay.tsx is the one frame that closes both, and
 * this file is the standing guarantee that every pop-up goes through it.
 * The DOM assertions below are what a browser would see; the source
 * assertions are what stops a seventh copy of those two lines appearing.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ModalOverlay } from '../components/ui/ModalOverlay';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

/** Every component that puts a full-screen message in front of a member. */
const POPUPS = [
  'components/dashboard/RootMessagePopupClient.tsx',
  'components/reset-plan/ResetPlanPopup.tsx',
  'components/weekly-review/WeeklyReviewPopup.tsx',
  'components/priority/PriorityCardPopup.tsx',
  'components/wearables/WearableWelcomeModal.tsx',
];

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (host) host.remove();
  root = null;
  host = null;
});

/**
 * Renders the overlay inside a container that is itself transformed, which
 * is the exact condition that broke the real one. If the overlay is still
 * inside that container afterwards, the bug is back.
 */
function renderInsideATransformedCard() {
  host = document.createElement('div');
  // What `.mef-fade-up` leaves behind once it has finished, because its
  // fill mode is `both`.
  host.style.transform = 'translateY(0)';
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ModalOverlay testId="test-popup">
        <div role="dialog">a message</div>
      </ModalOverlay>
    );
  });
  return document.querySelector('[data-testid="test-popup"]') as HTMLElement;
}

describe('a pop-up is positioned against the phone, not against whatever it interrupted', () => {
  it('is portalled out of a transformed ancestor entirely', () => {
    const overlay = renderInsideATransformedCard();
    expect(overlay).not.toBeNull();
    expect(host!.contains(overlay)).toBe(false);
    expect(overlay.parentElement).toBe(document.body);
  });

  it('covers the viewport she can actually see, not the one Safari pretends to have', () => {
    const overlay = renderInsideATransformedCard();
    // `.mef-modal-viewport` is 100dvh with a 100vh fallback plus safe-area
    // padding (app/globals.css). A bare `inset-0` resolves against iOS
    // Safari's LARGE viewport, so a centred card sits partly behind its
    // own bottom bar. Same class the sign-out confirmation, the push ask
    // and the Start Over control are already drawn in.
    expect(overlay.className).toContain('mef-modal-viewport');
    const css = read('app/globals.css');
    const rule = css.slice(css.indexOf('.mef-modal-viewport {'));
    expect(rule).toContain('position: fixed');
    expect(rule).toContain('100dvh');
    expect(rule).toContain('safe-area-inset-bottom');
  });

  it('backs the whole viewport, not just the first screenful of a tall card', () => {
    const overlay = renderInsideATransformedCard();
    const backdrop = overlay.querySelector('[aria-hidden="true"]') as HTMLElement;
    // `fixed`, not `absolute`: an absolute backdrop inside a scrolling
    // frame leaves a bright strip once a tall card is scrolled.
    expect(backdrop.className).toContain('fixed');
    expect(backdrop.className).toContain('inset-0');
  });

  it('lets a card taller than the screen scroll instead of clipping it', () => {
    const overlay = renderInsideATransformedCard();
    const frame = overlay.querySelector('[data-testid="modal-overlay-frame"]') as HTMLElement;
    expect(frame.className).toContain('overflow-y-auto');
    // The scroll must not chain to the page underneath.
    expect(frame.className).toContain('overscroll-contain');
    // `min-h-full` is what keeps a SHORT card centred while letting a tall
    // one start at the top: `items-center` on a box that cannot grow is
    // what put the top of the card off the top of the screen.
    const centring = frame.firstElementChild as HTMLElement;
    expect(centring.className).toContain('min-h-full');
    expect(centring.className).toContain('items-center');
  });

  it('keeps clear of the notch and the home indicator', () => {
    const overlay = renderInsideATransformedCard();
    // Carried by `.mef-modal-viewport` itself rather than re-declared
    // here, so there is one answer to "where are the phone's edges".
    expect(overlay.className).toContain('mef-modal-viewport');
    const css = read('app/globals.css');
    const start = css.indexOf('.mef-modal-viewport {');
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('safe-area-inset-top');
    expect(rule).toContain('safe-area-inset-bottom');
  });

  it('renders the message it was given', () => {
    const overlay = renderInsideATransformedCard();
    expect(overlay.textContent).toContain('a message');
  });
});

describe('every pop-up in the app uses that one frame', () => {
  for (const file of POPUPS) {
    it(`${file} draws no frame of its own`, () => {
      const source = read(file);
      expect(source).toContain("from '@/components/ui/ModalOverlay'");
      expect(source).toContain('<ModalOverlay');
      // The two lines that caused this. A file carrying its own
      // viewport-sized frame is a file that will drift from the fix.
      expect(source).not.toMatch(/className="[^"]*fixed inset-0[^"]*flex items-center justify-center/);
      expect(source).not.toMatch(/className="[^"]*absolute inset-0 bg-\[#0E1F17\]/);
    });
  }

  it('holds the scroll lock where the open state lives, not in the frame', () => {
    // The frame is the frame. Locking from inside it would mean two
    // components locking for one modal, which is the reference-counting
    // bug lib/scroll-lock/bodyScrollLock.ts already exists for.
    const frame = read('components/ui/ModalOverlay.tsx');
    expect(frame).not.toMatch(/import .*useBodyScrollLock/);
    expect(frame).not.toMatch(/useBodyScrollLock\(/);
    expect(read('components/dashboard/RootMessagePopupClient.tsx')).toContain('useBodyScrollLock');
  });
});
