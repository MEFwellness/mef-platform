/**
 * Every copy key this feature asks for, named once.
 *
 * WHY A LIST AND NOT JUST STRINGS AT THE CALL SITES. The words live in
 * whole_body_signal_copy, so a key the code asks for and a key the
 * migration seeded are two separate facts that can drift. This is the
 * list, and tests/whole-body-signal-content.test.ts reads the migration
 * and fails if any key here has no row, or if any seeded row is asked for
 * by nothing.
 *
 * THE PREFIX IS THE FENCE. 'member.' may render on a member screen.
 * 'coach.' may not, ever. `memberCopy()` refuses a coach key at runtime as
 * well, so a typo cannot quietly put a practitioner sentence on her screen.
 */

export const MEMBER_COPY_KEYS = [
  'member.popup_title',
  'member.popup_body',
  'member.popup_cta',
  'member.card_title',
  'member.card_body',
  'member.card_duration',
  'member.card_cta',
  'member.card_footnote',
  'member.intro_title',
  'member.intro_line_1',
  'member.intro_line_2',
  'member.intro_line_3',
  'member.intro_button',
  'member.transition_micro_line',
  'member.continue',
  'member.back',
  'member.home_label',
  'member.exit_label',
  'member.blocked_reason',
  'member.save_error',
  'member.section_complete_suffix',
  'member.section_complete_line',
  'member.next_section_label',
  'member.branch_intro',
  'member.branch_question',
  'member.pnta_label',
  'member.resume_title',
  'member.resume_body',
  'member.resume_cta',
  'member.completion_title',
  'member.completion_body',
  'member.completion_cta',
  'member.results_heading',
  'member.results_intro',
  'member.results_landscape_label',
  'member.priority_card_line',
  'member.section_card_lead',
  'member.section_card_themes_label',
  'member.section_card_next_heading',
  'member.section_card_next_body',
  'member.closing_line_1',
  'member.closing_line_2',
  'member.closing_line_3',
  'member.results_done',
  'member.already_done_heading',
  'member.already_done_body',
] as const;

export const COACH_COPY_KEYS = [
  'coach.priorities_heading',
  'coach.priorities_line_one',
  'coach.priorities_line_two',
  'coach.priorities_none',
  'coach.use_as_focus',
  'coach.choose_different',
  'coach.signal_map_heading',
  'coach.load_heading',
  'coach.load_component_a',
  'coach.load_component_b',
  'coach.load_component_c',
  'coach.load_change_label',
  'coach.load_no_previous',
  'coach.why_heading',
  'coach.why_strong_label',
  'coach.why_moderate_label',
  'coach.why_low_label',
  'coach.why_strongest_label',
  'coach.view_all_answers',
  'coach.pnta_note',
  'coach.zone_heading',
  'coach.zone_primary_label',
  'coach.zone_secondary_label',
  'coach.zone_why_label',
  'coach.zone_interpretation_note',
  'coach.zone_sentence_lead',
  'coach.zone_sentence_join',
  'coach.zone_sentence_tail',
  'coach.zone_none',
  'coach.associated_map_heading',
  'coach.associated_spinal_label',
  'coach.associated_organs_label',
  'coach.associated_chakra_label',
  'coach.patterns_heading',
  'coach.patterns_none',
  'coach.questions_heading',
  'coach.questions_none',
  'coach.question_ask',
  'coach.question_asked',
  'coach.question_copy',
  'coach.question_copied',
  'coach.question_hide',
  'coach.question_unhide',
  'coach.question_save',
  'coach.question_saved',
  'coach.focus_heading',
  'coach.focus_recommended_label',
  'coach.focus_selected_label',
  'coach.focus_change',
  'coach.focus_none',
  'coach.reassessment_heading',
  'coach.reassessment_none',
  'coach.reassessment_zone_previous',
  'coach.reassessment_zone_current',
  'coach.reassessment_zone_unchanged',
  'coach.reassessment_contributors_heading',
  'coach.reassessment_contributors_none',
  'coach.reassessment_previous_focus_label',
  'coach.load_trend_label',
  'coach.answers_heading',
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

/**
 * One token replaced in a stored line.
 *
 * Deliberately not a templating engine: two lines in this whole instrument
 * carry a token, and a missing value leaves the line intact rather than
 * printing the word "undefined" at a member.
 */
export function fillToken(line: string, token: string, value: string): string {
  if (!line.includes(`{${token}}`)) return line;
  return line.split(`{${token}}`).join(value);
}
