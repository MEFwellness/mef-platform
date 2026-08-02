/**
 * Core Values Snapshot — shared design tokens. Brief: forest green
 * #1B3A2D, warm gold #C4A050, cream #F5F0E4, Cormorant Garamond for
 * display type, DM Sans for body — "a premium coaching conversation
 * across a coffee table," not a form. Kept in one file so every CVS
 * component pulls the same literal values rather than hand-typing hex
 * codes independently.
 */

export const CVS_FOREST = '#1B3A2D';
export const CVS_GOLD = '#C4A050';
export const CVS_CREAM = '#F5F0E4';

/** Screen Layout System (Prompt 2): this was already, byte-for-byte, the same recipe app/globals.css's `.mef-card` now formalizes app-wide — pointed at that shared class instead of re-declaring the same radius/shadow literal here, so this family (CVS, Life Signal Check, Readiness Pulse, Reset Plan) automatically stays in sync with the one standard card everywhere else uses. */
export const CVS_CARD = 'mef-card';
/** A step above CVS_CARD — larger radius, deeper shadow — for the one card on a screen that should read as the main event (e.g. the closing screen's celebration/reinforcement card), with every other card on the same screen staying at CVS_CARD so the difference actually reads as elevation, not just "every card got fancier." Now backed by `.mef-card-elevated` (app/globals.css), the Screen Layout System's formalization of this same precedent. */
export const CVS_CARD_ELEVATED = 'mef-card-elevated';
/** A quiet gold hairline for separating sections within a card without a hard border — used sparingly (the closing screen redesign), not a default card treatment. */
export const CVS_GOLD_DIVIDER = 'h-px w-full bg-gradient-to-r from-transparent via-[#C4A050]/40 to-transparent';
export const CVS_DISPLAY_FONT = 'font-[family-name:var(--font-cormorant-garamond)]';
export const CVS_BODY_FONT = 'font-[family-name:var(--font-dm-sans)]';
export const CVS_PAGE_BG = 'min-h-screen bg-gradient-to-b from-[#F5F0E4] to-[#FAF7F0]';
