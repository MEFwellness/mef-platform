/**
 * The body scroll lock, after the whole app became unscrollable after login.
 *
 * THE DEFECT. On the live site, once the Root pop-up chain had shown and
 * been closed, nothing scrolled: not Home, not Today, not Progress, not the
 * check-in. `<body>` was left with `position: fixed; top: 0px; overflow:
 * hidden` while no dialog was on screen, and stayed that way through every
 * client-side navigation, so the only way out was a full page reload.
 *
 * THE CAUSE. hooks/useBodyScrollLock.ts used to save the body's inline
 * styles per caller and put them back on cleanup. Two components lock for
 * the same modal — components/dashboard/RootMessagePopupClient.tsx for the
 * whole chain, and components/priority/PriorityCardPopup.tsx (and
 * components/weekly-review/WeeklyReviewPopup.tsx) for themselves. React
 * runs child effects before parent effects, so the child saved the clean
 * styles and applied the lock, then the parent saved the LOCKED styles.
 * Cleanups run in the same child-first order, so the parent's cleanup ran
 * last and faithfully restored what it had seen — the lock. Page pinned,
 * dialog gone.
 *
 * WHAT THIS FILE PROVES. There is no React rendering harness in this repo
 * (see tests/sign-out-dialog.test.ts), so these tests drive
 * lib/scroll-lock/bodyScrollLock.ts directly against a minimal fake
 * document, in the exact acquire/release orders React produces — including
 * the nested child-then-parent order that caused the bug. The last test is
 * a source assertion that the hook still routes through the shared counted
 * lock rather than growing its own save/restore again.
 *
 * The real thing, in a real browser, on the real screens, is proven by
 * scripts/screenshots/verify-scroll-lock.mjs (local) and
 * scripts/screenshots/verify-scroll-lock-live.mjs (production).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

interface FakeBody {
  style: { position: string; top: string; width: string; overflow: string };
}

let fakeBody: FakeBody;
let scrollY: number;
const originalDocument = (globalThis as Record<string, unknown>).document;
const originalWindow = (globalThis as Record<string, unknown>).window;

/**
 * A fresh, unlocked page at a given scroll offset, plus a fresh copy of the
 * lock module — the lock's count is module state, so every test needs its
 * own import rather than a shared one carrying the previous test's count.
 */
async function freshPage(startScrollY = 0) {
  fakeBody = { style: { position: '', top: '', width: '', overflow: '' } };
  scrollY = startScrollY;
  (globalThis as Record<string, unknown>).document = { body: fakeBody };
  (globalThis as Record<string, unknown>).window = {
    get scrollY() {
      return scrollY;
    },
    scrollTo: (_x: number, y: number) => {
      scrollY = y;
    },
  };
  vi.resetModules();
  return import('@/lib/scroll-lock/bodyScrollLock');
}

/** What a member experiences: can this page be scrolled right now? */
function pageScrolls(): boolean {
  return fakeBody.style.position !== 'fixed' && fakeBody.style.overflow !== 'hidden';
}

beforeEach(() => {
  scrollY = 0;
});

afterEach(() => {
  if (originalDocument === undefined) delete (globalThis as Record<string, unknown>).document;
  else (globalThis as Record<string, unknown>).document = originalDocument;
  if (originalWindow === undefined) delete (globalThis as Record<string, unknown>).window;
  else (globalThis as Record<string, unknown>).window = originalWindow;
});

describe('body scroll lock', () => {
  it('a fresh page load with no dialog has scroll enabled', async () => {
    const lock = await freshPage();
    expect(lock.bodyScrollLockCount()).toBe(0);
    expect(pageScrolls()).toBe(true);
    expect(fakeBody.style.position).toBe('');
    expect(fakeBody.style.overflow).toBe('');
  });

  it('one dialog opens and locks scroll, closes and scroll is restored', async () => {
    const lock = await freshPage(250);

    lock.acquireBodyScrollLock();
    expect(pageScrolls()).toBe(false);
    expect(fakeBody.style.position).toBe('fixed');
    expect(fakeBody.style.top).toBe('-250px');
    expect(fakeBody.style.overflow).toBe('hidden');

    lock.releaseBodyScrollLock();
    expect(pageScrolls()).toBe(true);
    expect(fakeBody.style.position).toBe('');
    expect(fakeBody.style.top).toBe('');
    expect(fakeBody.style.overflow).toBe('');
    expect(lock.bodyScrollLockCount()).toBe(0);
  });

  it('restores the scroll position the member was at when the dialog opened', async () => {
    const lock = await freshPage(640);
    lock.acquireBodyScrollLock();
    lock.releaseBodyScrollLock();
    expect(scrollY).toBe(640);
  });

  /**
   * The regression. Two components locking for ONE modal, in React's real
   * order: child effect first, parent effect second, then cleanups
   * child-first on close. This is the Priority Card pop-up and the Weekly
   * Root Review pop-up, each nested inside RootMessagePopupClient.
   */
  it('two components locking for the same modal still release the page (the live bug)', async () => {
    const lock = await freshPage(120);

    lock.acquireBodyScrollLock(); // child: PriorityCardPopup
    lock.acquireBodyScrollLock(); // parent: RootMessagePopupClient
    expect(pageScrolls()).toBe(false);
    expect(lock.bodyScrollLockCount()).toBe(2);

    lock.releaseBodyScrollLock(); // child cleanup
    expect(pageScrolls()).toBe(false); // still one holder — correctly still pinned
    lock.releaseBodyScrollLock(); // parent cleanup, runs last

    expect(pageScrolls()).toBe(true);
    expect(fakeBody.style.position).toBe('');
    expect(fakeBody.style.top).toBe('');
    expect(fakeBody.style.overflow).toBe('');
    expect(scrollY).toBe(120);
  });

  /**
   * The sign-out confirmation is portalled to document.body and can be
   * opened from the profile sheet, which is itself a locking overlay — so
   * it is the case most likely to overlap with another lock. Cancel and the
   * backdrop tap both take the same path (setConfirming(false)).
   */
  it('sign-out dialog: open then cancel restores scroll, even over an already-open sheet', async () => {
    const lock = await freshPage(80);

    lock.acquireBodyScrollLock(); // the profile sheet is open
    lock.acquireBodyScrollLock(); // Sign Out tapped — confirmation on top
    expect(pageScrolls()).toBe(false);

    lock.releaseBodyScrollLock(); // Cancel
    expect(pageScrolls()).toBe(false); // sheet still open, still correctly pinned

    lock.releaseBodyScrollLock(); // sheet closed
    expect(pageScrolls()).toBe(true);
    expect(scrollY).toBe(80);
  });

  it('sign-out dialog on a plain screen: open then cancel restores scroll on its own', async () => {
    const lock = await freshPage(300);
    lock.acquireBodyScrollLock();
    expect(pageScrolls()).toBe(false);
    lock.releaseBodyScrollLock();
    expect(pageScrolls()).toBe(true);
    expect(scrollY).toBe(300);
  });

  it('an unbalanced release can never drive the count negative and strand a later lock', async () => {
    const lock = await freshPage();

    lock.releaseBodyScrollLock(); // stray release, no lock held
    expect(lock.bodyScrollLockCount()).toBe(0);

    lock.acquireBodyScrollLock();
    expect(pageScrolls()).toBe(false);
    lock.releaseBodyScrollLock();
    expect(pageScrolls()).toBe(true);
  });

  it('a modal opened while another is already open does not re-save the locked styles', async () => {
    const lock = await freshPage(500);

    lock.acquireBodyScrollLock();
    expect(fakeBody.style.top).toBe('-500px');
    lock.acquireBodyScrollLock(); // second lock must not capture top:-500px as "previous"
    lock.releaseBodyScrollLock();
    lock.releaseBodyScrollLock();

    expect(fakeBody.style.top).toBe('');
    expect(fakeBody.style.position).toBe('');
  });

  it('the hook routes through the shared counted lock rather than saving styles itself', () => {
    const hook = readFileSync(path.join(ROOT, 'hooks/useBodyScrollLock.ts'), 'utf8');
    expect(hook).toContain("from '@/lib/scroll-lock/bodyScrollLock'");
    expect(hook).toContain('acquireBodyScrollLock');
    expect(hook).toContain('releaseBodyScrollLock');
    // The per-caller save/restore that caused the bug must not come back.
    expect(hook).not.toMatch(/body\.style\.position\s*=/);
    expect(hook).not.toMatch(/previous/);
  });

  it('every scroll-locking component uses the shared hook, never its own body styles', () => {
    const callers = [
      'components/SignOutButton.tsx',
      'components/dashboard/RootMessagePopupClient.tsx',
      'components/priority/PriorityCardPopup.tsx',
      'components/weekly-review/WeeklyReviewPopup.tsx',
      'components/dashboard/NoticingSheet.tsx',
      'components/FloatingCoachLauncher.tsx',
      'components/AvatarLink.tsx',
      'components/FirstCheckinTransition.tsx',
      'components/wearables/WearableWelcomeModal.tsx',
      'components/body-assessment/StartOverControl.tsx',
    ];
    for (const file of callers) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      expect(source, `${file} should use the shared hook`).toContain('useBodyScrollLock');
      expect(source, `${file} must not set body styles directly`).not.toMatch(
        /document\.body\.style|body\.style\.overflow/
      );
    }
  });
});
