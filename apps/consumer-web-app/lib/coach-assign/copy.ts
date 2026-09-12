/**
 * Every sentence the coach's assign form says, named once, with the
 * fallback each one takes when its row is missing.
 *
 * WHY A TYPED KEY LIST AND NOT A BAG OF STRINGS. Every word in that form
 * is a row in coach_assign_copy (migration 229), and a caller reaching
 * into a record by a typed string is one typo away from printing nothing
 * at all in the middle of a sentence a coach is deciding on. The keys are
 * a closed list, a test asserts the seeded rows and this list are the same
 * set, and a missing row falls back to the approved wording rather than to
 * an empty string.
 *
 * COACH ONLY. These lines talk about a member to somebody else. The table
 * has no member select policy and this module is imported by no member
 * surface.
 *
 * NO EM DASH. Commas, periods, colons and parentheses.
 */

/** Every key the app asks for. A row is seeded for each one. */
export const COACH_ASSIGN_COPY_KEYS = [
  'assign.history_heading',
  'assign.last_assigned',
  'assign.by_you',
  'assign.by_unknown',
  'assign.last_completed',
  'assign.not_completed',
  'assign.open_notice',
  'assign.completed_today',
  'assign.completed_one_day_ago',
  'assign.completed_days_ago',
  'assign.row_assign',
  'assign.row_assign_again',
  'assign.row_resend',
  'assign.row_close',
  'assign.confirm_assign',
  'assign.confirm_resend',
  'assign.confirm_sending',
  'assign.confirm_resending',
  'assign.resend_note',
] as const;

export type CoachAssignCopyKey = (typeof COACH_ASSIGN_COPY_KEYS)[number];

/**
 * THE FALLBACKS ARE THE APPROVED WORDING, byte for byte what migration 229
 * seeds. tests/coach-assign-copy.test.ts fails if the two ever disagree,
 * so a reworded row and this file cannot drift into two versions of one
 * sentence.
 */
export const DEFAULT_COACH_ASSIGN_COPY: Record<CoachAssignCopyKey, string> = {
  'assign.history_heading': 'What has happened with this one',
  'assign.last_assigned': 'Last assigned {date}, by {by}.',
  'assign.by_you': 'you',
  'assign.by_unknown': 'another coach',
  'assign.last_completed': 'Last completed {date}.',
  'assign.not_completed': 'Not completed.',
  'assign.open_notice': 'This is already waiting for {name}, sent {date}.',
  'assign.completed_today': 'Completed today.',
  'assign.completed_one_day_ago': 'Completed 1 day ago.',
  'assign.completed_days_ago': 'Completed {days} days ago.',
  'assign.row_assign': 'Assign',
  'assign.row_assign_again': 'Assign Again',
  'assign.row_resend': 'Resend',
  'assign.row_close': 'Close',
  'assign.confirm_assign': 'Assign',
  'assign.confirm_resend': 'Resend',
  'assign.confirm_sending': 'Sending',
  'assign.confirm_resending': 'Resending',
  'assign.resend_note':
    'Resending keeps the one assignment they already have and moves its due date. Leave the date blank for seven days from today.',
};

/** The stored line, or the approved fallback. Never an empty string in the middle of a form. */
export function coachAssignCopy(
  copy: Record<string, string>,
  key: CoachAssignCopyKey
): string {
  const stored = copy[key];
  return typeof stored === 'string' && stored.trim().length > 0
    ? stored
    : DEFAULT_COACH_ASSIGN_COPY[key];
}

/**
 * Fills {token} placeholders.
 *
 * A TOKEN WITH NO VALUE IS LEFT STANDING, deliberately. A coach who edits
 * a line and types a token this key does not carry sees "{whatever}" on
 * the screen and fixes it, which is a visible mistake rather than a
 * sentence that quietly lost its subject.
 */
export function fillCoachAssignTokens(
  text: string,
  tokens: Record<string, string | number>
): string {
  let out = text;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(`{${token}}`).join(String(value));
  }
  return out;
}
