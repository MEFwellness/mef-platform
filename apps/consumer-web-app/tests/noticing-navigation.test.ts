import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const noticingCard = readFileSync(
  path.resolve(__dirname, '../components/dashboard/WhatWereNoticingCard.tsx'),
  'utf-8'
);
const noticingSheet = readFileSync(
  path.resolve(__dirname, '../components/dashboard/NoticingSheet.tsx'),
  'utf-8'
);
const coachingMessageCard = readFileSync(
  path.resolve(__dirname, '../components/dashboard/CoachingMessageCard.tsx'),
  'utf-8'
);
const noticingPagePath = path.resolve(__dirname, '../app/noticing/page.tsx');

/** Strips the file's own leading doc-comment block before scanning, so the
 * prose explaining a fix (which necessarily names the old behavior) can't
 * make a "does this JSX render X" assertion pass or fail by accident. */
function stripLeadingDocComment(source: string): string {
  return source.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '');
}

describe('"What We\'re Noticing" — full page instead of a sheet over Home', () => {
  // Reported bug: tapping the card opened a bottom sheet layered over the
  // Dashboard, which is a full read (findings, "Areas Worth Paying
  // Attention To," "Recommended For You"), not a quick peek — the same
  // reasoning the case view already gets its own /case route.
  it('navigates to a dedicated /noticing route instead of opening a sheet', () => {
    expect(noticingCard).toMatch(/href="\/noticing"/);
    expect(noticingCard).not.toMatch(/sheetTitle/);
  });

  it('the /noticing page exists and keeps the original section copy/order', () => {
    expect(existsSync(noticingPagePath)).toBe(true);
    const page = stripLeadingDocComment(readFileSync(noticingPagePath, 'utf-8'));
    const noticingIdx = page.indexOf("What&apos;s Improving");
    const attentionIdx = page.indexOf('Areas Worth Paying Attention To');
    const recommendedIdx = page.indexOf('Recommended For You');
    expect(noticingIdx).toBeGreaterThan(-1);
    expect(attentionIdx).toBeGreaterThan(noticingIdx);
    expect(recommendedIdx).toBeGreaterThan(attentionIdx);
  });

  // Confirmed live: the suggestion "reason" sentence was the only thing
  // ever rendered under this heading, with no real step behind it — see
  // tests/intelligence-engine-member-facing-noticing.test.ts. The heading
  // must not render at all now that the field is gone.
  it('does not render a "Suggested Next Steps" heading anywhere', () => {
    const page = stripLeadingDocComment(readFileSync(noticingPagePath, 'utf-8'));
    expect(page).not.toMatch(/Suggested Next Steps/);
    expect(stripLeadingDocComment(noticingCard)).not.toMatch(/Suggested Next Steps/);
  });
});

describe('NoticingSheet — the stacking-context bug this task found and fixed', () => {
  // Confirmed live (Playwright, local dev server): tapping where the
  // sheet visually showed "Recommended For You" instead opened the
  // FloatingCoachLauncher's "Ask Root" chat panel — the button (z-40, in
  // the page's real root stacking context) was painting on top of the
  // sheet (nominally z-50, but trapped inside RevealOnScroll's
  // `transform`-bearing wrapper, which scopes z-50 locally and doesn't let
  // it win against a genuinely-root-level z-40 element). A portal escapes
  // that trap regardless of which ancestor might apply a transform.
  it('renders its dialog via a portal into document.body', () => {
    expect(noticingSheet).toMatch(/createPortal/);
    expect(noticingSheet).toMatch(/document\.body/);
  });

  // This sheet is still used by CoachingMessageCard ("From Root") — the
  // portal/clearance fix has to live in the shared component, not per
  // caller, since NoticingTile still supports both `href` and `sheetTitle`.
  it('"From Root" still uses the shared sheet (so the shared fix still matters)', () => {
    expect(coachingMessageCard).toMatch(/sheetTitle="From Root"/);
  });

  // The italic educational note ran under the floating chat button and
  // was cut off at the right edge. Fixed the same way the bottom-nav
  // overlap was fixed originally (globals.css's .pb-safe-nav) — one
  // shared clearance token, sized to the chat launcher's own footprint.
  it('reserves clearance for the floating chat button on its scrollable content', () => {
    expect(noticingSheet).toMatch(/pb-safe-chat/);
  });
});

describe('.pb-safe-chat — the shared clearance token', () => {
  it('is defined once in globals.css, sized past the chat button\'s own footprint', () => {
    const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf-8');
    expect(css).toMatch(/\.pb-safe-chat\s*\{\s*padding-bottom:\s*calc\(9rem/);
  });

  it('the new /noticing page also reserves it (same content, same risk)', () => {
    const page = readFileSync(noticingPagePath, 'utf-8');
    expect(page).toMatch(/pb-safe-chat/);
  });
});
