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

export const CVS_CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
/** A step above CVS_CARD — larger radius, deeper shadow — for the one card on a screen that should read as the main event (e.g. the closing screen's celebration/reinforcement card), with every other card on the same screen staying at CVS_CARD so the difference actually reads as elevation, not just "every card got fancier." */
export const CVS_CARD_ELEVATED = 'rounded-[32px] bg-white shadow-[0_10px_36px_-8px_rgba(27,58,45,0.20)]';
/** A quiet gold hairline for separating sections within a card without a hard border — used sparingly (the closing screen redesign), not a default card treatment. */
export const CVS_GOLD_DIVIDER = 'h-px w-full bg-gradient-to-r from-transparent via-[#C4A050]/40 to-transparent';
export const CVS_DISPLAY_FONT = 'font-[family-name:var(--font-cormorant-garamond)]';
export const CVS_BODY_FONT = 'font-[family-name:var(--font-dm-sans)]';
export const CVS_PAGE_BG = 'min-h-screen bg-gradient-to-b from-[#F5F0E4] to-[#FAF7F0]';
