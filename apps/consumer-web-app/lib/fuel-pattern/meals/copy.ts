/**
 * Rooted Reset Fuel Pattern Assessment, Build 3 — every word the meal
 * layer puts in front of a member.
 *
 * THE VOICE IS BUILD 2'S. Observational, warm, non prescriptive. A meal
 * card offers a starting point and says what the combination is built to
 * support. It never tells her what she has to eat, never names a
 * condition, and never claims a result.
 *
 * NO NUMBER LIVES IN THIS FILE. The one number on a meal card is the
 * preparation time, and that arrives as minutes from the library and is
 * formatted by fpaPrepTimeLabel rather than written into a sentence.
 *
 * BUILD 4 IS NOT HERE. Nothing below mentions, promises or gestures at
 * the experiment, because it does not exist yet.
 */

import type { FpaMealType } from './types';
import type { FpaRejectionReason } from './preferences';

export const FPA_MEALS_SECTION_HEADER = 'MEALS BUILT FOR YOUR PATTERN';

export const FPA_MEALS_SECTION_LEAD =
  'Four starting points drawn from your pattern, one for each part of the day. Swap any of them for another whenever you like.';

/** The eyebrow on a card, and the group heading in My Meals. */
export const FPA_MEAL_TYPE_LABEL: Record<FpaMealType, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  dinner: 'DINNER',
  snack: 'SNACK',
};

export const FPA_MEAL_CARD_COPY = {
  whyHeader: 'WHY THIS FITS YOUR PATTERN',
  save: 'Save',
  saved: 'Saved',
  another: 'Show me another',
  reject: 'I do not eat this',
  ingredientsHeader: 'WHAT IS IN IT',
} as const;

/**
 * THE ONE FLEXIBLE FUEL SENTENCE, WRITTEN ONCE.
 *
 * A Flexible Fuel member reads the Balanced Fuel set, and without this
 * she would read why-it-fits copy that never once acknowledged the
 * reading she was actually given. It is appended to the meal's own line
 * rather than replacing it, so what the meal combines is still said.
 */
export const FPA_FLEXIBLE_WHY_SUFFIX =
  'With your flexible pattern, this balanced construction is a reliable home base you can adjust freely.';

/** Said on a card whose meal came from a neighbouring set because her own held nothing she eats. */
export const FPA_WIDENED_NOTE =
  'Drawn from a neighbouring set, because everything in yours is something you have asked us not to show.';

/** Said in a slot where nothing at all is left. Honest rather than padded. */
export const FPA_EMPTY_SLOT_LINE =
  'Nothing here matches everything you have told us so far. Your coach can build something for this part of the day with you.';

export const FPA_PREP_LABEL_SUFFIX = 'min';

/** "20 min". The only number on the card, and the only place it is made. */
export function fpaPrepTimeLabel(minutes: number): string {
  return `${minutes} ${FPA_PREP_LABEL_SUFFIX}`;
}

/** The reason sheet. Optional, dismissible, and skipping it is a real answer. */
export const FPA_REASON_SHEET = {
  title: 'Anything we should know?',
  subtitle: 'Optional. Skipping this simply means we will not show that meal again.',
  skip: 'Skip',
  close: 'Close',
  otherPlaceholder: 'Anything else we should know',
  otherHelp: 'One line, and only if you want to.',
  save: 'Save',
  allergyTitle: 'Which of these?',
  allergySubtitle:
    'Everything in this meal is listed. Leave them all on and we will keep all of them off your cards, or turn off the ones that are fine.',
  allergyConfirm: 'Save',
} as const;

export const FPA_REASON_LABEL: Record<FpaRejectionReason, string> = {
  dislike: 'I do not like this food',
  vegetarian: 'Vegetarian',
  no_dairy: 'No dairy',
  no_fish: 'No fish',
  no_eggs: 'No eggs',
  no_pork: 'No pork',
  allergy: 'Allergy',
  other: 'Other dietary preference',
};

/** The quiet confirmation under a card after she has recorded something. */
export const FPA_REASON_CONFIRMATION: Record<FpaRejectionReason, string> = {
  dislike: 'Noted. That one will not come back.',
  vegetarian: 'Noted. Your cards will stay vegetarian from here.',
  no_dairy: 'Noted. Dairy is off your cards from here.',
  no_fish: 'Noted. Fish is off your cards from here.',
  no_eggs: 'Noted. Eggs are off your cards from here.',
  no_pork: 'Noted. Pork is off your cards from here.',
  allergy: 'Noted, and kept off every card from here.',
  other: 'Noted. That one will not come back.',
};

export const FPA_REJECTION_RECORDED_LINE = 'Noted. That one will not come back.';

/** My Meals. */
export const FPA_MY_MEALS = {
  title: 'My Meals',
  link: 'View my saved meals',
  lead: 'Everything you have saved, grouped by the part of the day it belongs to.',
  empty: 'Meals you save will live here, so you can return to them anytime.',
  back: 'Back',
  /** The quiet label on a meal saved under a reading she no longer has. */
  patternLabelPrefix: 'From your',
  patternLabelSuffix: 'pattern',
} as const;

/** The tile that reaches My Meals from Food Lens, where her other food collections already live. */
export const FPA_MY_MEALS_TILE_LABEL = 'My Meals';
