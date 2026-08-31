/**
 * Where Your Energy Goes: shared tokens.
 *
 * Deliberately the SAME palette and type pairing as the free arc
 * (components/core-values-snapshot/theme.ts): forest green, warm gold,
 * cream, Cormorant Garamond for display, DM Sans for body. This is the
 * first screen a stranger sees, and it has to be recognisably the same
 * product they land in afterwards, not a marketing page wearing different
 * clothes. Re-exported here rather than imported case by case so a future
 * second entry topic has one place to look.
 */

export {
  CVS_FOREST as ENERGY_FOREST,
  CVS_GOLD as ENERGY_GOLD,
  CVS_CREAM as ENERGY_CREAM,
  CVS_CARD as ENERGY_CARD,
  CVS_CARD_ELEVATED as ENERGY_CARD_ELEVATED,
  CVS_GOLD_DIVIDER as ENERGY_GOLD_DIVIDER,
  CVS_DISPLAY_FONT as ENERGY_DISPLAY_FONT,
  CVS_BODY_FONT as ENERGY_BODY_FONT,
  CVS_PAGE_BG as ENERGY_PAGE_BG,
} from '@/components/core-values-snapshot/theme';

/** The one page shell used by every beat of this experience, so the background never changes underneath a transition. */
export const ENERGY_SHELL =
  'min-h-screen bg-gradient-to-b from-[#F5F0E4] to-[#FAF7F0] font-[family-name:var(--font-dm-sans)]';

export const ENERGY_CONTAINER =
  'mx-auto w-full max-w-md px-5 py-10 sm:px-6 md:max-w-2xl md:px-10';
