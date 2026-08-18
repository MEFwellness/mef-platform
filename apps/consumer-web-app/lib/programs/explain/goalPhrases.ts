/**
 * Her goal, said the way a person says it.
 *
 * WHAT THIS FIXES. The goals screen stores a fixed option, and the option
 * is written to be scannable in a list: "Lose weight or improve body
 * composition", "Create healthier daily habits", "Better understand my
 * body". Dropped into the middle of a sentence, an option reads like a
 * form field being read back at her:
 *
 *   "You told us what matters most to you right now is Lose weight or
 *    improve body composition, and this plan supports that."
 *
 * Every option therefore has a phrase written for the middle of a
 * sentence, and NO raw option text ever appears there. The coach's own
 * review of the first draft asked for exactly this, and named that example.
 *
 * COVERAGE IS THE POINT, so it is enforced rather than intended: the map
 * is keyed by lib/welcome/goals.ts's own label, every option in
 * WELCOME_GOALS has an entry, and a test walks WELCOME_GOALS and fails if
 * one is ever added without a phrase. An unrecognized string, which is
 * what a legacy row or a hand-edited value looks like, is DROPPED rather
 * than guessed at or passed through: a sentence with no goal in it is
 * better than a sentence with a form field in it.
 *
 * "Something else" is the one option that maps to nothing on purpose. It
 * names no goal, so no phrase can be true. She simply gets the paragraph
 * without that sentence.
 *
 * NO EM DASHES, per the house rule.
 */
import { WELCOME_GOALS } from '../../welcome/goals';

/**
 * The label a member picked, lowercased and squeezed, so a stored value
 * that differs only in spacing or case still resolves. Nothing else is
 * normalized: a value this does not recognize is not a goal this product
 * asked for.
 */
function normalizeGoalLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * One natural phrase per option, each written to complete "...what matters
 * most to you right now is ___" and "...you want to work on ___". They are
 * deliberately verb phrases rather than noun labels, because that is what
 * makes them read as her words rather than as a selection.
 */
const GOAL_PHRASE_BY_LABEL: Record<string, string | null> = {
  'reduce pain or discomfort': 'easing the pain and discomfort you have been living with',
  'improve posture and movement': 'standing and moving more comfortably',
  'increase energy': 'having more energy through your day',
  'sleep better': 'sleeping better',
  'reduce stress': 'feeling less stressed',
  'improve digestion': 'settling your digestion',
  'lose weight or improve body composition':
    'losing weight and improving how your body feels and moves',
  'build strength and fitness': 'getting stronger and fitter',
  'improve sports or golf performance': 'moving better in your sport',
  'create healthier daily habits': 'building habits you can keep',
  'better understand my body': 'understanding your body better',
  'work directly with a coach': 'working closely with your coach',
  // Names no goal, so no phrase about it can be true. She gets the
  // paragraph without the sentence.
  'something else': null,
};

/** Every option the goals screen offers, so a test can assert coverage rather than trust it. */
export const ALL_GOAL_LABELS: readonly string[] = WELCOME_GOALS.map((goal) => goal.label);

/**
 * The phrase for one stored goal, or null when there is nothing true to
 * say about it. Null covers three cases and all three produce silence
 * rather than a guess: the option that names no goal, a value this product
 * never offered, and an empty string.
 */
export function goalPhrase(label: string | null | undefined): string | null {
  const key = normalizeGoalLabel(label ?? '');
  if (key === '') return null;
  if (!(key in GOAL_PHRASE_BY_LABEL)) return null;
  return GOAL_PHRASE_BY_LABEL[key] ?? null;
}

/** The phrases for a list of stored goals, in order, with the unsayable ones dropped and no duplicates. */
export function goalPhrases(labels: readonly string[] | null | undefined): string[] {
  const phrases: string[] = [];
  for (const label of labels ?? []) {
    const phrase = goalPhrase(label);
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  }
  return phrases;
}
