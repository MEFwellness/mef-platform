/**
 * The one number the resend path decides with.
 *
 * SEVEN DAYS, WHICH IS EVERY COACH ASSIGNED EXPERIENCE'S OWN DEFAULT
 * ALREADY (WBS_DEFAULT_DUE_IN_DAYS and the identical constant in every
 * deep-dive beside it). A resend that named a different window would mean
 * "overdue" quietly meant two things on one ledger depending on whether a
 * coach had pressed Assign or Resend.
 *
 * It is a constant rather than a copy row because it is not a word: the
 * sentence a coach reads about it IS a row (assign.resend_note), and a
 * test asserts the two agree.
 */
export const RESEND_DEFAULT_DUE_IN_DAYS = 7;
