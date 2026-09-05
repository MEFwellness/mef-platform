/**
 * THE PRESSURE BAN, IN ONE LIST, SO TWO SCREENS CANNOT KEEP TWO VERSIONS
 * OF IT.
 *
 * Written for day 7's close (2026-09-05, Prompt 5), where the rule was that
 * nothing may say or imply access is ENDING. Day 8's continuation screen
 * inherits it unchanged, with one difference in what it is allowed to say
 * rather than in what it is banned from saying: that screen may state
 * plainly that the free week is COMPLETE, because by then it is a fact
 * about the past. It may never turn that into a reason to hurry, which is
 * exactly what every term below does.
 *
 * "7-Day Reset" is day 7's own name and names the week she has just had,
 * which is why every entry here is about a FUTURE end rather than about the
 * digit seven.
 */
export const PRESSURE_VOCABULARY: readonly string[] = [
  'days left',
  'days remaining',
  'day left',
  'last day',
  'final day',
  'last chance',
  'expires',
  'expiring',
  'expired',
  'expiry',
  'ends today',
  'ends tomorrow',
  'trial ends',
  'trial is ending',
  'week ends',
  'access ends',
  'lose access',
  'losing access',
  'runs out',
  'running out',
  'before it is gone',
  "before it's gone",
  'act now',
  'hurry',
  'deadline',
  'countdown',
  'limited time',
  'while you still can',
  'one more day',
  'time is up',
];

/**
 * The shapes day 8 adds, because day 8 is the moment a screen would be
 * tempted into them. Every one of these is a way of saying "you are about
 * to lose something", which is the exact pressure this build refuses.
 */
export const LOSS_VOCABULARY: readonly string[] = [
  'before you lose',
  'you will lose',
  "you'll lose",
  'no longer have access',
  'locked out',
  'reactivate',
  'restore your access',
  'don t miss',
  "don't miss",
  'miss out',
  'while it lasts',
  'upgrade now',
  'subscribe now',
  'act fast',
  'final reminder',
];

/** Both lists, for a screen that must pass every one of them. */
export const ALL_PRESSURE_VOCABULARY: readonly string[] = [
  ...PRESSURE_VOCABULARY,
  ...LOSS_VOCABULARY,
];
