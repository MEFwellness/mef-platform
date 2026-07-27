/**
 * UX audit fixes (batch 1, items 4+5, 2026-07-27):
 *
 * Item 4 — "Today's Focus" and "A Note From Root" sat back-to-back
 * making the same point about movement in different words. Verified
 * before merging that they're not independent data sources that could
 * disagree: both `focus_text` (lib/feed/copy.ts's buildFocusText) and
 * `coach_note`/coachNote (buildCoachNote) are templated from the exact
 * same `reason`/`category` for the same feed item — buildCoachNote's own
 * doc comment says "never a second copy of focus_text/why_text — this is
 * a warmer, complementary lead-in, not a restatement." Merged into one
 * card: focus leads, Root's note carries beneath it as the reasoning.
 * "Why You're Seeing This" / "Ask your coach why" (a separate card,
 * further down the page) is untouched.
 *
 * Item 5 — the "Update today's check-in" control is a single Link that
 * is both the card and the tappable button; a flat solid dark-green
 * card with plain text inside didn't read as the page's one primary
 * action. Fixed by adding a visually distinct cream (locked-palette)
 * pill button surface inside the card, rather than changing the card's
 * own color or introducing any new color.
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
    expect(TODAY_PAGE).toContain('Why You&apos;re Seeing This');
    expect(TODAY_PAGE).toContain('Ask your coach why');
  });
});

describe('Today page: "Update today\'s check-in" is unmistakably primary', () => {
  it('the check-in link contains a distinct cream pill button surface, not just plain text on the green card', () => {
    const linkStart = TODAY_PAGE.indexOf("href={'/checkin' as Route}");
    const linkBlock = TODAY_PAGE.slice(linkStart, TODAY_PAGE.indexOf('</Link>', linkStart));
    expect(linkBlock).toContain('bg-[#F5F0E4]');
    expect(linkBlock).toContain('text-[#1B3A2D]');
  });

  it('the card itself stays the locked-palette forest green — no new color introduced', () => {
    const linkStart = TODAY_PAGE.indexOf("href={'/checkin' as Route}");
    const cardTagEnd = TODAY_PAGE.indexOf('>', linkStart);
    const cardOpenTag = TODAY_PAGE.slice(linkStart, cardTagEnd);
    expect(cardOpenTag).toContain('bg-[#1B3A2D]');
  });

  it('the pill button text matches whether today is already checked in', () => {
    expect(TODAY_PAGE).toContain("{todaysCheckin ? 'Update check-in' : 'Start check-in'}");
  });
});
