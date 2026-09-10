/**
 * Every copy key this feature asks for, named once.
 *
 * WHY A LIST AND NOT JUST STRINGS AT THE CALL SITES. The words live in
 * body_systems_copy, so a key the code asks for and a key the migration
 * seeded are two separate facts that can drift. This is the list, and
 * tests/body-systems-content.test.ts reads the migration and fails if any
 * key here has no row, or if any seeded row is asked for by nothing.
 *
 * THE PREFIX IS THE FENCE. 'member.' may render on a member screen.
 * 'coach.' may not, ever. `memberCopy()` refuses a coach key at runtime as
 * well, so a typo cannot quietly put a coach sentence on her screen.
 */

export const MEMBER_COPY_KEYS = [
  'member.popup_title',
  'member.popup_body',
  'member.popup_cta',
  'member.card_title',
  'member.card_body',
  'member.card_cta',
  'member.intro_title',
  'member.intro_line_1',
  'member.intro_line_2',
  'member.intro_line_3',
  'member.intro_button',
  'member.timeframe_reminder',
  'member.continue',
  'member.back',
  'member.exit_label',
  'member.home_label',
  'member.blocked_reason',
  'member.dna_default_label',
  'member.branch_question',
  'member.branch_option_a',
  'member.branch_option_b',
  'member.branch_remembered',
  'member.branch_profile_label',
  'member.branch_profile_hint',
  'member.red_flags_heading',
  'member.red_flags_intro',
  'member.red_flag_yes',
  'member.red_flag_no',
  'member.red_flag_finish',
  'member.results_eyebrow',
  'member.results_heading',
  'member.results_intro',
  'member.results_closing',
  'member.results_done',
  'member.compare_heading',
  'member.compare_quieter',
  'member.compare_unchanged',
  'member.compare_louder',
  'member.compare_this_time',
  'member.compare_last_time',
  'member.already_done_heading',
  'member.already_done_body',
  'member.resume_note',
  'member.save_error',
] as const;

export const COACH_COPY_KEYS = [
  'coach.red_flags_heading',
  'coach.red_flags_none',
  'coach.red_flags_note',
  'coach.sections_heading',
  'coach.questions_heading',
  'coach.patterns_heading',
  'coach.high_frequency_heading',
  'coach.cluster_heading',
  'coach.cross_section_heading',
  'coach.changes_heading',
  'coach.associations_heading',
  'coach.why_surfaced_label',
  'coach.next_step_label',
  'coach.opener_heading',
  'coach.opener_note',
  'coach.coverage_note',
  'coach.label_observed',
  'coach.label_pattern',
  'coach.label_possible',
  'coach.label_confirmed',
  'coach.confirmed_never_generated',
  'coach.association_compare_heading',
  'coach.pattern_quieter',
  'coach.pattern_unchanged',
  'coach.pattern_louder',
  'coach.pattern_resolved',
  'coach.pattern_joined',
  'coach.dna_label',
  'coach.dna_note',
] as const;

export type MemberCopyKey = (typeof MEMBER_COPY_KEYS)[number];
export type CoachCopyKey = (typeof COACH_COPY_KEYS)[number];

/** Only member keys are readable through this. A coach key returns nothing rather than its words. */
export function memberCopy(copy: Record<string, string>, key: MemberCopyKey): string {
  if (!key.startsWith('member.')) return '';
  return copy[key] ?? '';
}

export function coachCopy(copy: Record<string, string>, key: CoachCopyKey): string {
  return copy[key] ?? '';
}
