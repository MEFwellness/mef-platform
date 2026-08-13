/**
 * The Weekly Root Review — the only two questions Root may ever ask, and
 * the only conditions that earn them.
 *
 * MOST WEEKS ASK NOTHING, and that is the design rather than a side
 * effect. A weekly message that always ends in a question trains a member
 * to skip the message. So a question exists here only where Root genuinely
 * cannot tell something from the data it already has, and where her answer
 * would change what it does next.
 *
 * Two conditions, both of them real ambiguity rather than curiosity:
 *
 *   1. The three-tier language module put a signal into its 'conflicting'
 *      state. That state means two already-computed classifications in the
 *      same coaching domain point opposite ways
 *      (lib/longitudinal-intelligence/signalState.ts's
 *      detectConflictingSignals). The module itself refuses to assign a
 *      tier for it, and its own fixed phrase says the picture is mixed. It
 *      is the one place in this product where the honest next move is to
 *      ask.
 *
 *   2. The Part 1 outcome ledger recorded the SAME thread both acted on
 *      and ignored inside one week. Root cannot tell from that whether the
 *      suggestion is wrong or the timing is, and those two lead to
 *      opposite adjustments.
 *
 * WHAT THE ANSWERS ARE. Fixed option slugs, stored on the review row as
 * behavioral context: how coaching is landing for her. No free text, no
 * health question, nothing that reads as an assessment item. A member's
 * answer here can change which candidate a tie resolves toward next week;
 * it can never become a finding about her body.
 */

export const QUESTION_KEYS = ['mixed_picture', 'mixed_response'] as const;

export type QuestionKey = (typeof QUESTION_KEYS)[number];

export function isQuestionKey(value: unknown): value is QuestionKey {
  return typeof value === 'string' && (QUESTION_KEYS as readonly string[]).includes(value);
}

/**
 * Each question's prompt and its options. Templated, fixed, observational,
 * and none of it asks her to rate, score, or describe anything about her
 * health. The em dash never appears here or anywhere else a member reads.
 */
export const QUESTIONS: Record<
  QuestionKey,
  { prompt: string; options: { value: string; label: string }[] }
> = {
  mixed_picture: {
    prompt:
      'Root is seeing two things pointing in different directions. Which is closer to how the week actually went for you?',
    options: [
      { value: 'both_true', label: 'Both were true, on different days' },
      { value: 'one_changed', label: 'Something changed partway through the week' },
      { value: 'not_sure', label: 'Not sure, and that is fine' },
    ],
  },
  mixed_response: {
    prompt:
      'Some of what Root offered this week landed and some did not. Which was it closer to?',
    options: [
      { value: 'right_thing_wrong_time', label: 'The right thing, at the wrong moment' },
      { value: 'not_the_right_thing', label: 'Not really the right thing for me' },
      { value: 'it_is_landing', label: 'It is landing, this week was just busy' },
    ],
  },
};

export function isAnswerOption(questionKey: string, value: string): boolean {
  if (!isQuestionKey(questionKey)) return false;
  return QUESTIONS[questionKey].options.some((option) => option.value === value);
}

/** Every option slug across every question, for the privacy test's own vocabulary check. */
export const ALL_ANSWER_OPTIONS: string[] = QUESTION_KEYS.flatMap((key) =>
  QUESTIONS[key].options.map((option) => option.value)
);
