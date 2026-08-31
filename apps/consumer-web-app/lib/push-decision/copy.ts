/**
 * What a daily reminder actually says.
 *
 * ROOT DOES NOT WRITE A SECOND VERSION OF THE CARD. The body of every
 * notification is the Priority Card's OWN title, verbatim: the sentence
 * she will read at the top of the app the moment she opens it. That is
 * not laziness, it is the point. A notification that paraphrased the card
 * would be a second author for the same decision, and the two would drift
 * apart the first time either was edited. It also means every rule the
 * card's copy already obeys (her Reset Plan's agreed sentence word for
 * word, no reason line on re-entry, no restating a safety disclosure)
 * holds here for free rather than having to be restated.
 *
 * SO THE ONLY WORDS AUTHORED HERE ARE THE TITLE, and the title's whole
 * job is to say WHAT KIND of thing is waiting, in three or four words, so
 * a glance at a lock screen is enough to decide whether to open the app
 * now or later. It never carries a count, never carries a streak, never
 * says how long it has been, and never asks twice.
 *
 * NO EM DASHES, per the app copy rule. Commas and periods.
 */

import type { PriorityRule } from '../priority/types';

/**
 * The longest body a notification carries. Both platforms truncate on
 * their own and neither says where, so this trims at a word boundary and
 * says it trimmed, rather than letting a phone cut her Reset Plan's
 * agreed sentence off mid-word.
 *
 * 120 is comfortably above every fixed string the card can produce and
 * only ever bites on free text a member or coach authored.
 */
export const NOTIFICATION_BODY_MAX = 120;

/**
 * One title per rung of the ladder. Written as a complete map rather than
 * a switch with a default, so adding a rule to lib/priority/types.ts
 * fails the typecheck here until somebody decides what it should say on a
 * lock screen.
 *
 * 'safety' and 'gentle_focus' are present and are deliberately never
 * used: lib/push-decision/decide.ts refuses to notify on either, for
 * reasons written there. Their entries exist so this map stays total.
 */
export const NOTIFICATION_TITLE_FOR: Record<PriorityRule, string> = {
  // Never sent. See isWorthInterrupting in ./decide.ts.
  safety: 'From Root',
  re_entry: 'Whenever you are ready',
  reset_plan_commitment: 'Your plan for today',
  implicated_driver: 'Something worth a look',
  qualified_pattern: 'Something worth a look',
  incomplete_action: 'Where you left off',
  behavioral_friction: 'One question from Root',
  todays_focus: "Today's focus",
  movement_session: 'Your movement for today',
  daily_reset: 'Your Daily Reset',
  // Never sent. Nothing is waiting, which is exactly when Root stays quiet.
  gentle_focus: 'From Root',
};

/** Where a tap lands when the priority itself names no screen. */
export const NOTIFICATION_FALLBACK_URL = '/dashboard';

/** The tag every daily reminder carries, so an unread one is replaced rather than stacked. */
export const NOTIFICATION_TAG = 'rooted-reset-daily';

/**
 * Her sentence, shortened only if it genuinely will not fit.
 *
 * Trims at the last space inside the budget so a word is never cut in
 * half, and appends the three dots the card's own bridge line already
 * uses rather than a character a phone might render as a box.
 */
export function trimNotificationBody(text: string, max: number = NOTIFICATION_BODY_MAX): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;

  const budget = max - 3;
  const cut = clean.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = (lastSpace > budget * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[,.:;]+$/, '');
  return `${kept}...`;
}
