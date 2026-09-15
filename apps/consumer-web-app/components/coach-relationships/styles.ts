/**
 * The Relationship Library's shared class strings.
 *
 * Lifted from the Add Signal tool (app/coach/clients/[id]/AddSignalForm.tsx)
 * rather than invented, because the two are halves of one feature and a
 * coach moving between them should not be able to tell she has crossed a
 * boundary. Kept in one file so three components cannot drift apart.
 */

export const CHIP =
  'mef-focus-ring rounded-full border px-3 py-2 text-sm font-medium transition-colors min-h-[40px]';
export const CHIP_OFF = 'border-[#1B3A2D]/12 bg-white text-[#3E5C46] hover:bg-[#1B3A2D]/[0.04]';
export const CHIP_ON = 'border-transparent bg-[#1B3A2D] text-white';

export const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
export const PANEL = 'rounded-[24px] border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4';

export const FIELD =
  'mef-focus-ring min-h-[44px] w-full rounded-2xl border border-[#1B3A2D]/12 bg-white px-4 text-sm text-[#1B3A2D] placeholder:text-[#9AA79F]';
export const TEXTAREA =
  'mef-focus-ring w-full rounded-2xl border border-[#1B3A2D]/12 bg-white px-4 py-3 text-sm leading-relaxed text-[#1B3A2D] placeholder:text-[#9AA79F]';

export const LABEL = 'block text-xs font-medium text-[#3E5C46]';
export const SECTION_TITLE = 'text-sm font-semibold uppercase tracking-wider text-[#854D0E]';
export const BLURB = 'mt-1 text-[13px] leading-relaxed text-[#4F645A]';

export const PRIMARY_BUTTON =
  'mef-focus-ring inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#1B3A2D] px-5 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';
export const QUIET_BUTTON =
  'mef-focus-ring inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-medium text-[#3E5C46] transition hover:bg-[#1B3A2D]/[0.05]';
export const OUTLINE_BUTTON =
  'mef-focus-ring inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#1B3A2D]/12 bg-white px-4 text-sm font-medium text-[#3E5C46] transition hover:bg-[#1B3A2D]/[0.04]';
