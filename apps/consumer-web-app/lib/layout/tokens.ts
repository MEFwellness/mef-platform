/**
 * Screen Layout System — spacing/sizing tokens (Prompt 2), mirroring the
 * CSS custom properties declared in app/globals.css's "SCREEN LAYOUT
 * SYSTEM" block. Same discipline as lib/motion/tokens.ts: a plain,
 * non-'use client' module so a Server Component can import numeric
 * values without pulling in a client boundary. Kept in sync with
 * globals.css by hand — there is no build-time bridge from CSS custom
 * properties into JS in this project.
 *
 * Per docs/motion-experience-bible.md's Screen Layout System section.
 */

export const SPACING_PX = {
  '3xs': 4,
  '2xs': 8,
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 64,
} as const;

export type SpacingTier = keyof typeof SPACING_PX;

export const READING_MAX_WIDTH_PX = 672; // 42rem
export const NARROW_MAX_WIDTH_PX = 448; // 28rem
export const WIDE_MAX_WIDTH_PX = 1024; // 64rem

export const CARD_RADIUS_PX = 28;
export const CONTROL_RADIUS_PX = 16;
