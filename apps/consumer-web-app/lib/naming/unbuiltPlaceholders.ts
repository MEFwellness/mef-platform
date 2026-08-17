/**
 * What the app says about things that do not exist yet.
 *
 * JUDGMENT ITEM 3, AWAITING A DECISION. See docs/BUILD_STATUS.md for the
 * two options written out in full.
 *
 * Three member surfaces advertise unbuilt features: the questionnaire
 * catalogue's placeholder cards, and the two results screens' next-step
 * cards. All three said "Coming soon", which is a promise with no date
 * behind it, made by an app whose entire recent direction has been to stop
 * telling members things that are not true. Two of the placeholders
 * (Readiness to Change, Finding 1 Love) have no questions and no route, so
 * "soon" is not a claim anybody can stand behind.
 *
 * It is a judgment rather than a rename because the two answers serve
 * different people. Removing them entirely gives a member a catalogue where
 * everything she sees she can actually do, and gives up the one honest
 * signal that this library is still growing. Keeping them, worded
 * accurately, keeps that signal at the cost of shelf space occupied by
 * things she cannot open.
 *
 * What IS done, so either answer is a one-line change:
 *
 *   - `UNBUILT_PLACEHOLDER_POLICY` is the switch, and `showUnbuiltPlaceholder()`
 *     is what all three surfaces call.
 *   - The literal "Coming soon" is gone from every member surface. The
 *     wording lives here, once, so the three surfaces cannot say three
 *     different things about the same situation.
 */

/**
 * 'show_honestly' (current): the placeholder renders, worded as not built
 * rather than as imminent.
 * 'hide': the placeholder does not render at all. A member's library
 * contains only what she can open.
 */
export const UNBUILT_PLACEHOLDER_POLICY: 'show_honestly' | 'hide' = 'show_honestly';

/**
 * The one wording. "Coming soon" is deliberately not among the candidates:
 * it is a promise, and there is no date behind it.
 */
export const UNBUILT_PLACEHOLDER_LABEL = 'Not built yet';

/** The longer form, where a card has room for a sentence. */
export const UNBUILT_PLACEHOLDER_SENTENCE =
  'This one is not built yet. Nothing is waiting on you.';

/** Whether a surface should render its unbuilt placeholder at all. */
export function showUnbuiltPlaceholder(): boolean {
  return UNBUILT_PLACEHOLDER_POLICY === 'show_honestly';
}
