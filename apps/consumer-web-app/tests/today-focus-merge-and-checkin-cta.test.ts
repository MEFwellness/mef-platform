/**
 * UX audit fixes (batch 1, items 4+5, 2026-07-27) — original content.
 *
 * Item 4 — "Today's Focus" and "A Note From Root" merged into one card.
 * Still true, unchanged, in app/today/page.tsx — the Today page full
 * redesign was explicitly told not to touch this card's copy or the
 * "Why You're Seeing This" / "Ask your coach why" pattern, only to add
 * the new Forward/Accomplished zones around it.
 *
 * Item 5 — "Update today's check-in" needed a distinct cream pill button
 * surface. That control moved from app/today/page.tsx into
 * app/today/TodayZones.tsx as part of the redesign (it's now the Forward
 * Zone's check-in quick action, and disappears from the page entirely
 * once today's check-in is done, replaced by a compact "Check-in
 * complete" row in the Accomplished Zone's Done Today group — see
 * today-zones-redesign.test.ts) — this file's CTA-styling checks now
 * point at TodayZones.tsx instead.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so both are static source scans; verified live
 * via Playwright, reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const TODAY_PAGE = source('app/today/page.tsx');
const TODAY_ZONES = source('app/today/TodayZones.tsx');

describe('Today page: "Today\'s Focus" and "A Note from Root" are one merged card', () => {
  it('there is exactly one section heading for "Today\'s Focus" and none for "A Note from Root" as its own section', () => {
    const focusHeadingMatches = TODAY_PAGE.match(/Today&apos;s Focus/g) ?? [];
    expect(focusHeadingMatches.length).toBe(1);
  });

  it('focus_text renders before coachNote within the same section (focus leads, the note carries beneath it)', () => {
    const focusIdx = TODAY_PAGE.indexOf('{today.feedItem.focus_text}');
    const noteIdx = TODAY_PAGE.indexOf('{coachNote}');
    expect(focusIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(-1);
    expect(focusIdx).toBeLessThan(noteIdx);
  });

  it('both live inside one <section>...</section> block (no unclosed section between them)', () => {
    const focusIdx = TODAY_PAGE.indexOf('{today.feedItem.focus_text}');
    const noteIdx = TODAY_PAGE.indexOf('{coachNote}');
    const between = TODAY_PAGE.slice(focusIdx, noteIdx);
    expect(between).not.toContain('</section>');
  });

  it('"Why You\'re Seeing This" / "Ask your coach why" pattern is untouched — still present, still its own section', () => {
    expect(TODAY_PAGE).toContain("Why You&apos;re Seeing This");
    expect(TODAY_PAGE).toContain('Ask your coach why');
  });

  it('the merged Focus card renders before TodayZones — it leads the Forward Zone, per the redesign brief', () => {
    const focusIdx = TODAY_PAGE.indexOf('{today.feedItem.focus_text}');
    const zonesIdx = TODAY_PAGE.indexOf('<TodayZones', focusIdx);
    expect(zonesIdx).toBeGreaterThan(focusIdx);
  });
});

describe('TodayZones: the check-in quick action is unmistakably primary while still open', () => {
  it('the check-in link contains a distinct cream pill button surface, not just plain text on the green card', () => {
    const linkStart = TODAY_ZONES.indexOf("href={'/checkin' as Route}");
    const linkBlock = TODAY_ZONES.slice(linkStart, TODAY_ZONES.indexOf('</Link>', linkStart));
    expect(linkBlock).toContain('bg-[#F5F0E4]');
    expect(linkBlock).toContain('text-[#1B3A2D]');
  });

  it('the card itself stays the locked-palette forest green — no new color introduced', () => {
    const linkStart = TODAY_ZONES.indexOf("href={'/checkin' as Route}");
    const cardTagEnd = TODAY_ZONES.indexOf('>', linkStart);
    const cardOpenTag = TODAY_ZONES.slice(linkStart, cardTagEnd);
    expect(cardOpenTag).toContain('bg-[#1B3A2D]');
  });

  it('the check-in quick action only renders while not yet done today (gated on !todaysCheckinDone)', () => {
    const idx = TODAY_ZONES.indexOf('!todaysCheckinDone &&');
    expect(idx).toBeGreaterThan(-1);
    expect(TODAY_ZONES.indexOf("href={'/checkin' as Route}")).toBeGreaterThan(idx);
  });
});
