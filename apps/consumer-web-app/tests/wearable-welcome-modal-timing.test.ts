/**
 * UX fix batch 3, item 2: the wearable-connect welcome modal used to
 * become visible immediately on mount, covering a returning member's
 * hero/Daily Brief before she'd seen any of it. Fixed with a
 * scroll-position trigger (reveal once she's scrolled past ~55% of one
 * viewport height — past the hero, into real content) plus a 4-second
 * fallback timer for a member who reads without scrolling at all, so the
 * pitch still surfaces in the same session rather than silently never
 * showing.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source. The
 * real reveal-on-scroll, dismiss-sticks, fallback-timer, and
 * first-time-member-unaffected behavior is verified live via Playwright,
 * reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const MODAL = source('components/wearables/WearableWelcomeModal.tsx');
const DASHBOARD_PAGE = source('app/dashboard/page.tsx');

describe('WearableWelcomeModal: no longer visible immediately on mount', () => {
  it('useState(false) — starts hidden, not revealed synchronously', () => {
    expect(MODAL).toContain('const [visible, setVisible] = useState(false);');
  });

  it('reveal is gated on a scroll-position threshold', () => {
    expect(MODAL).toContain('SCROLL_REVEAL_FRACTION');
    expect(MODAL).toMatch(/window\.scrollY > window\.innerHeight \* SCROLL_REVEAL_FRACTION/);
  });

  it('has a bounded fallback timer so a non-scrolling reader still sees it eventually, not never', () => {
    expect(MODAL).toContain('FALLBACK_DELAY_MS');
    expect(MODAL).toMatch(/window\.setTimeout\(reveal, FALLBACK_DELAY_MS\)/);
  });

  it('the fallback delay is a real number of milliseconds, not accidentally instant or absurdly long', () => {
    const match = MODAL.match(/const FALLBACK_DELAY_MS = (\d+);/);
    expect(match).not.toBeNull();
    const ms = Number(match![1]);
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThanOrEqual(8000);
  });

  it('both the scroll listener and the fallback timer are cleaned up on unmount', () => {
    expect(MODAL).toContain("window.removeEventListener('scroll', onScroll)");
    expect(MODAL).toContain('window.clearTimeout(fallback)');
  });

  it('the reveal only ever fires once (readyRef guard) even if scroll fires many times before the fallback', () => {
    expect(MODAL).toContain('const readyRef = useRef(false);');
    expect(MODAL).toMatch(/if \(readyRef\.current\) return;/);
  });
});

describe('WearableWelcomeModal: dismissal behavior is completely unchanged', () => {
  it('still checks localStorage before doing anything else', () => {
    expect(MODAL).toContain("if (window.localStorage.getItem(DISMISSED_KEY)) return;");
  });

  it('dismiss() still writes the same key and unmounts immediately — untouched', () => {
    expect(MODAL).toMatch(/function dismiss\(\) {\s*\n\s*window\.localStorage\.setItem\(DISMISSED_KEY, '1'\);\s*\n\s*setVisible\(false\);/);
  });

  it('the DISMISSED_KEY constant is byte-identical to before (so an already-dismissed browser stays dismissed)', () => {
    expect(MODAL).toContain("const DISMISSED_KEY = 'mef_wearable_welcome_dismissed';");
  });
});

describe('WearableWelcomeModal: copy and structure are untouched — motion/timing only', () => {
  it('the title, body copy, and both button labels are byte-identical', () => {
    expect(MODAL).toContain('Get the Most From Root');
    expect(MODAL).toContain(
      'Connect your wearable to unlock personalized recovery insights, adaptive coaching, sleep'
    );
    expect(MODAL).toContain('Connect Device');
    expect(MODAL).toContain('Maybe Later');
  });

  it('does not import or reference ProviderLogos/three-provider content — none existed before this task and none was added', () => {
    expect(MODAL).not.toContain('ProviderLogos');
  });
});

describe('app/dashboard/page.tsx: the wearable pitch is delivered once, not twice', () => {
  /**
   * VISIBILITY LAYER (2026-08-17). The audit caught the same wearable pitch
   * on Home twice on one load, for a member thirteen days in with no
   * device: a full-bleed "Unlock Smarter Coaching" panel, and this modal
   * over the top of it. Two deliveries of one pitch is one too many, and
   * the panel is the one that survives because it is the one that can be
   * gated on her own sleep and recovery actually having come up.
   *
   * So the modal is switched off at the call site rather than deleted: the
   * component, its copy and the pop-up chain's arbitration are all
   * untouched, which is what the rest of this file still pins. What changed
   * is that Home never asks for it.
   */
  it('never asks the pop-up chain to deliver the wearable modal', () => {
    expect(DASHBOARD_PAGE).toContain('showWearablePrompt={false}');
    expect(DASHBOARD_PAGE).not.toMatch(/showWearablePrompt={!hasConnectedWearable/);
  });

  it('still delivers everything else through HomeScreenPopups, never an inline modal', () => {
    expect(DASHBOARD_PAGE).toContain('<HomeScreenPopups');
    expect(DASHBOARD_PAGE).not.toContain('<WearableWelcomeModal />');
  });

  it('the surviving panel is gated by the visibility layer rather than shown to everyone', () => {
    expect(DASHBOARD_PAGE).toContain('{shows(F.homeWearableConnect) && (');
  });
});
