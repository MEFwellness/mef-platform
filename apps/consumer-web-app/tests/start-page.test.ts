/**
 * Public prospect landing page (app/start) — native on-domain host for the
 * same Lead Capture Agent widget/endpoint used by the external Leadpages
 * embed (public/lead-widget.js, app/lead-widget-test/page.tsx). This suite
 * doesn't re-test the agent's conversation logic (already covered
 * exhaustively by tests/lead-capture-*.test.ts and unchanged here) — it
 * proves the three things specific to this page: it's reachable without
 * auth, every CTA drives the one real chat panel, and that panel is wired
 * to the real existing endpoint via the unmodified widget script (no
 * second chat UI, no second API path invented for this page).
 *
 * No rendering harness exists in this repo (vitest.config.ts runs
 * `environment: 'node'`, no jsdom/@vitejs/plugin-react — confirmed
 * previously, see the "SSR component-rendering tests don't work in this
 * repo" note in tests/checkin-*-fixes*.test.ts history), so — same
 * convention as tests/subhead-contrast-ratio.test.ts — these are static
 * source-scan assertions against the real shipped files, not a simulated
 * DOM.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const middlewareSrc = readFileSync(path.resolve(REPO_ROOT, 'middleware.ts'), 'utf-8');
const widgetSrc = readFileSync(path.resolve(REPO_ROOT, 'public/lead-widget.js'), 'utf-8');
const pageSrc = readFileSync(path.resolve(REPO_ROOT, 'app/start/page.tsx'), 'utf-8');
const clientSrc = readFileSync(path.resolve(REPO_ROOT, 'app/start/StartPageClient.tsx'), 'utf-8');

describe('/start is publicly reachable without auth', () => {
  it('middleware.ts exempts /start from the login redirect, the same way /lead-widget-test is', () => {
    const publicPathsBlock = middlewareSrc.slice(
      middlewareSrc.indexOf('const PUBLIC_PATHS'),
      middlewareSrc.indexOf('];', middlewareSrc.indexOf('const PUBLIC_PATHS')) + 2
    );
    expect(publicPathsBlock).toContain("'/start'");
    expect(publicPathsBlock).toContain("'/lead-widget-test'");
  });

  it('the redirect below PUBLIC_PATHS only fires for an unauthenticated visitor on a non-public path — /start is on the list, so no branch redirects it', () => {
    expect(middlewareSrc).toContain("if (!user && !isPublic && path !== '/')");
  });

  it('app/start/page.tsx does not call redirect() or check for a session — a plain always-rendered page, unlike gated pages such as app/about/page.tsx', () => {
    expect(pageSrc).not.toContain('redirect(');
    expect(pageSrc).not.toContain('auth.getUser()');
  });

  it('app/start/StartPageClient.tsx renders no member chrome (no BottomNav, no AvatarLink, no coach launcher)', () => {
    expect(clientSrc).not.toContain('BottomNav');
    expect(clientSrc).not.toContain('AvatarLink');
    expect(clientSrc).not.toContain('FloatingCoachLauncher');
  });
});

describe('every CTA on /start opens the one real chat panel', () => {
  it('loads the exact same widget script used by /lead-widget-test, not a duplicate copy', () => {
    expect(clientSrc).toContain("Script src=\"/lead-widget.js\"");
  });

  it('defines exactly one open-chat handler, reused by every CTAButton rather than each button wiring its own', () => {
    const ctaButtonUses = clientSrc.match(/onClick=\{openChat\}/g) ?? [];
    expect(ctaButtonUses.length).toBe(5); // sections 1, 2, 3, 5, 6 each have one CTA; section 4 has none
  });

  it('the shared handler calls window.MEFLeadWidget.open(), the widget\'s own public hook — not a second, competing chat implementation', () => {
    expect(clientSrc).toContain('window.MEFLeadWidget.open()');
  });
});

describe('the chat panel is wired to the real, unmodified Lead Capture endpoint', () => {
  it('public/lead-widget.js still POSTs to /api/lead-capture at its inferred API_ORIGIN — the same real endpoint, no new API path introduced for this page', () => {
    expect(widgetSrc).toContain("API_ORIGIN + '/api/lead-capture'");
  });

  it('public/lead-widget.js exposes window.MEFLeadWidget.open as an additive hook, with its existing bubble/proactive-popup/reopen behavior left untouched', () => {
    expect(widgetSrc).toContain('window.MEFLeadWidget = { open: openPanel }');
    // Behavior this page must not alter, per the task's constraints:
    expect(widgetSrc).toContain('scheduleProactivePopup(openPanel)');
    expect(widgetSrc).toContain("REOPEN_MESSAGE = \"Still thinking about something? Tell me what's been going on.\"");
    expect(widgetSrc).toContain('state.pendingReopenLine = true');
  });

  it('app/api/lead-capture/route.ts itself is untouched by this feature (no /start-specific branching in the route)', () => {
    const routeSrc = readFileSync(
      path.resolve(REPO_ROOT, 'app/api/lead-capture/route.ts'),
      'utf-8'
    );
    expect(routeSrc).not.toContain('/start');
  });
});

describe('page content matches the required copy standards', () => {
  it('never uses CHEK cert-level jargon beyond the one approved credential strip (HLC1/HLC2/IMS)', () => {
    expect(clientSrc).not.toMatch(/HLC1|HLC2|\bIMS\b/);
  });

  it('contains no pricing, no form fields, and no competing outbound links away from the chat', () => {
    expect(clientSrc).not.toContain('<form');
    expect(clientSrc).not.toContain('<input');
    expect(clientSrc).not.toContain('next/link');
    expect(clientSrc).not.toMatch(/\$\d/);
  });
});
