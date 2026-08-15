/**
 * The sign-out confirmation dialog, after it turned out to be unusable on
 * a real iPhone.
 *
 * THE DEFECT. Tapping Sign Out on an iPhone in Safari showed "Sign out of
 * Rooted Reset?" inline at the bottom of the page instead of floating over
 * it, with Cancel and Sign Out below the fold behind Safari's own bottom
 * bar. Sign out could be started and never confirmed.
 *
 * THE CAUSE, and why the markup looked correct. The dialog was already
 * `position: fixed; inset: 0`. `fixed` is only positioned against the
 * viewport when NO ancestor establishes a containing block for it, and
 * both places this button lives establish one:
 *
 *   - components/ProfileSheet.tsx animates with `translate-y-0` /
 *     `translate-y-4`, and any transform other than `none` becomes the
 *     containing block for fixed descendants, at rest included.
 *   - components/staffNavStyles.ts gives the staff bar `backdrop-blur`,
 *     and a backdrop filter does the same.
 *
 * So the dialog was being centered inside a bottom sheet, or inside a
 * navigation bar about 64px tall. components/dashboard/NoticingSheet.tsx
 * hit the identical class of bug and fixed it by rendering into
 * document.body; this now follows that same pattern.
 *
 * The second half is `.mef-modal-viewport`: even a correctly portalled
 * `inset-0` is the LARGE viewport on iOS Safari, measured with the browser
 * bars hidden, so a dialog centered in it still has its lower half under
 * the bar whenever the bar is showing.
 *
 * WHAT THIS FILE CAN AND CANNOT HOLD. There is no React rendering harness
 * in this repo (documented in tests/safe-area-clearance.test.ts and every
 * clearance test before it), so these are source assertions on the two
 * structural properties that actually decide the outcome, plus the copy.
 * The behavior itself, that both buttons land inside the visible viewport,
 * that Cancel keeps the session and Sign Out ends it, is proven by driving
 * a real browser: scripts/screenshots/verify-signout-dialog.mjs locally and
 * scripts/screenshots/verify-signout-dialog-live.mjs against production,
 * both reported in docs/BUILD_STATUS.md.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

const SIGN_OUT = source('components/SignOutButton.tsx');
const STAFF_NAV = source('components/StaffNav.tsx');
const PROFILE_SHEET = source('components/ProfileSheet.tsx');
const STAFF_NAV_STYLES = source('components/staffNavStyles.ts');
const GLOBALS = source('app/globals.css');

describe('the dialog is a real overlay, not part of the page flow', () => {
  it('renders into document.body, so no ancestor can capture its fixed positioning', () => {
    expect(SIGN_OUT).toContain("import { createPortal } from 'react-dom'");
    expect(SIGN_OUT).toContain('createPortal(');
    expect(SIGN_OUT).toContain('document.body');
  });

  it('the portal is what holds the dialog, not a sibling rendered next to the button', () => {
    // The button and the dialog are separate: the trigger stays where it
    // was placed, the dialog goes to the body. If someone inlines the
    // dialog back into the returned tree, this fails.
    const returned = SIGN_OUT.slice(SIGN_OUT.indexOf('  return (\n    <>'));
    expect(returned).toContain('{dialog}');
    expect(returned).not.toContain('role="dialog"');
  });

  it('has a dimmed backdrop covering the whole screen', () => {
    expect(SIGN_OUT).toContain('fixed inset-0 z-[70] bg-[#1B3A2D]/35 backdrop-blur-[2px]');
    expect(SIGN_OUT).toContain('aria-hidden="true"');
  });

  it('locks the page behind it, so the dialog cannot be scrolled away from', () => {
    expect(SIGN_OUT).toContain("import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'");
    expect(SIGN_OUT).toContain('useBodyScrollLock(confirming);');
  });

  it('the panel sits above the backdrop', () => {
    expect(SIGN_OUT).toContain('mef-modal-viewport z-[71]');
    expect(SIGN_OUT.indexOf('z-[70]')).toBeLessThan(SIGN_OUT.indexOf('z-[71]'));
  });

  it('the dismiss handler is on the frame, which is what actually receives a tap', () => {
    // The frame covers the whole screen and paints on top of the dimmed
    // layer, so the dim never gets the tap. A handler on the dim meant
    // tapping outside the panel did nothing, which the browser-driven
    // check caught on its first run.
    const frame = SIGN_OUT.slice(
      SIGN_OUT.indexOf('className="mef-modal-viewport'),
      SIGN_OUT.indexOf('role="dialog"')
    );
    expect(frame).toContain('onClick={() => !isPending && setConfirming(false)}');
    const dim = SIGN_OUT.slice(
      SIGN_OUT.indexOf('z-[70] bg-[#1B3A2D]/35'),
      SIGN_OUT.indexOf('className="mef-modal-viewport')
    );
    expect(dim).not.toContain('onClick');
  });

  it('a tap on the panel itself does not fall through and close it', () => {
    expect(SIGN_OUT).toContain('onClick={(e) => e.stopPropagation()}');
  });

  it('is announced as a modal dialog', () => {
    expect(SIGN_OUT).toContain('role="dialog"');
    expect(SIGN_OUT).toContain('aria-modal="true"');
    expect(SIGN_OUT).toContain('aria-label="Confirm sign out"');
  });
});

describe('the dialog is centered in the VISIBLE viewport, on iOS included', () => {
  it('uses the shared modal viewport frame rather than a bare inset-0', () => {
    expect(SIGN_OUT).toContain('mef-modal-viewport');
    expect(GLOBALS).toContain('.mef-modal-viewport {');
  });

  it('that frame is the dynamic viewport, with a vh fallback underneath it', () => {
    const rule = GLOBALS.slice(
      GLOBALS.indexOf('.mef-modal-viewport {'),
      GLOBALS.indexOf('.mef-modal-viewport {') + 900
    );
    expect(rule).toMatch(/height:\s*100vh;/);
    expect(rule).toMatch(/@supports \(height: 100dvh\)/);
    expect(rule).toMatch(/height:\s*100dvh;/);
    // The fallback has to come first or it would overwrite the dvh value.
    expect(rule.indexOf('100vh')).toBeLessThan(rule.indexOf('100dvh'));
  });

  it('reserves the real safe-area insets at BOTH edges, so nothing sits under a bar', () => {
    const rule = GLOBALS.slice(
      GLOBALS.indexOf('.mef-modal-viewport {'),
      GLOBALS.indexOf('@supports (height: 100dvh)', GLOBALS.indexOf('.mef-modal-viewport {'))
    );
    expect(rule).toMatch(/padding-top:\s*max\([^)]*env\(safe-area-inset-top\)/);
    expect(rule).toMatch(/padding-bottom:\s*max\([^)]*env\(safe-area-inset-bottom\)/);
  });

  it('the panel can never grow taller than that frame', () => {
    // A dialog taller than the visible viewport would push its own buttons
    // off screen again, which is the exact failure being fixed.
    expect(SIGN_OUT).toContain('max-h-full');
    expect(SIGN_OUT).toContain('overflow-y-auto');
  });
});

describe('the two ancestors that caused this still exist, so the portal must stay', () => {
  /**
   * These are not decoration. They record WHY the portal is required: if
   * either of these ever stops establishing a containing block the portal
   * could in principle be dropped, and if both remain, dropping it
   * reintroduces the bug exactly.
   */
  it('the profile sheet still animates with a transform', () => {
    expect(PROFILE_SHEET).toContain('translate-y-0');
    expect(PROFILE_SHEET).toContain('translate-y-4');
  });

  it('the staff navigation bar still uses a backdrop filter', () => {
    expect(STAFF_NAV_STYLES).toContain('backdrop-blur');
  });

  it('and the sign-out button is rendered inside both of them', () => {
    expect(PROFILE_SHEET).toContain('<SignOutButton variant="row" />');
    expect(STAFF_NAV).toContain('<SignOutButton variant="nav"');
  });
});

describe('both actions are present, and only one of them signs anybody out', () => {
  it('offers Cancel and Sign Out', () => {
    expect(SIGN_OUT).toContain('>\n                    Cancel\n                  </button>');
    expect(SIGN_OUT).toContain("{isPending ? 'Signing out…' : 'Sign Out'}");
  });

  it('Cancel only closes the dialog: it never reaches the sign out action', () => {
    const cancel = SIGN_OUT.slice(
      SIGN_OUT.indexOf('onClick={() => setConfirming(false)}\n                    disabled'),
      SIGN_OUT.indexOf('Cancel')
    );
    expect(cancel).not.toContain('handleConfirm');
    expect(cancel).not.toContain('signOut');
  });

  it('tapping outside the panel cancels too, and no cancel path fires mid sign out', () => {
    expect(SIGN_OUT).toContain('onClick={() => !isPending && setConfirming(false)}');
    expect(SIGN_OUT).toContain("if (e.key === 'Escape' && !isPending) setConfirming(false);");
  });

  it('Sign Out is the one path to the session-ending action, unchanged', () => {
    expect(SIGN_OUT).toContain('onClick={handleConfirm}');
    expect(SIGN_OUT).toContain('await signOut();');
    expect(SIGN_OUT).toContain("import { signOut } from '@/app/actions/auth'");
  });

  it('both buttons refuse a second tap while the sign out is in flight', () => {
    const buttonBlock = SIGN_OUT.slice(SIGN_OUT.indexOf('<div className="mt-6 flex gap-3">'));
    expect(buttonBlock.match(/disabled=\{isPending\}/g)?.length).toBe(2);
  });
});

describe('the copy says something true for whoever is signing out', () => {
  it('a member is told about the member experience', () => {
    expect(SIGN_OUT).toContain(
      "member: \"You'll need to sign back in to see your check-ins, Root Score, and coaching.\""
    );
  });

  it('a coach is told about their clients, not about check-ins they do not have', () => {
    expect(SIGN_OUT).toContain("coach: \"You'll need to sign back in to manage your clients.\"");
  });

  it('an administrator with no coach grant is told about the platform, not about clients', () => {
    expect(SIGN_OUT).toContain("admin: \"You'll need to sign back in to manage the platform.\"");
  });

  it('the three variants are genuinely different sentences', () => {
    const block = SIGN_OUT.slice(
      SIGN_OUT.indexOf('const AUDIENCE_COPY'),
      SIGN_OUT.indexOf('const VARIANT_CLASS')
    );
    const sentences = [...block.matchAll(/"(You'll need to sign back in[^"]*)"/g)].map((m) => m[1]);
    expect(sentences).toHaveLength(3);
    expect(new Set(sentences).size).toBe(3);
  });

  it('the staff bar picks the variant from the roles it already resolved', () => {
    expect(STAFF_NAV).toContain(
      "<SignOutButton variant=\"nav\" audience={isCoach ? 'coach' : 'admin'} />"
    );
  });

  it('every member call site keeps the member wording by simply not asking', () => {
    expect(SIGN_OUT).toContain("audience = 'member',");
    for (const file of [
      'components/ProfileSheet.tsx',
      'app/profile/page.tsx',
      'app/trial-ended/page.tsx',
    ]) {
      expect(source(file)).not.toContain('audience=');
    }
  });

  it('no em dash anywhere in the dialog, its copy, or the bar that opens it', () => {
    expect(SIGN_OUT).not.toContain('—');
    expect(STAFF_NAV).not.toContain('—');
  });
});
