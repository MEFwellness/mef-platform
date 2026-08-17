/**
 * What the app says about things that do not exist yet.
 *
 * DECIDED 2026-08-17: they do not render.
 *
 * Three member surfaces advertise unbuilt features: the questionnaire
 * catalogue's placeholder cards, and the two results screens' next-step
 * cards. All three said "Coming soon", which is a promise with no date
 * behind it, made by an app whose entire recent direction has been to stop
 * telling members things that are not true. Two of the placeholders
 * (Readiness to Change, Finding 1 Love) have no questions and no route, so
 * "soon" is not a claim anybody can stand behind.
 *
 * The visibility layer's whole principle is that nothing renders unless she
 * needs it now, and she cannot need something that does not exist. So the
 * placeholder cards do not render at all: her library contains only what
 * she can open. The signal that the library is still growing is given up
 * deliberately, and it is the cheaper of the two losses.
 *
 * The wording below survives the decision on purpose. `showUnbuiltPlaceholder()`
 * is the one gate all three surfaces call, and the label is kept beside it
 * so that if an unbuilt feature is ever worth previewing again, there is one
 * place to turn it on and one wording to turn on, rather than three surfaces
 * each inventing a promise.
 */

/**
 * 'hide' (decided): the placeholder does not render at all. A member's
 * library contains only what she can open.
 * 'show_honestly': the retired option, kept named so the alternative is
 * legible rather than merely absent.
 */
export const UNBUILT_PLACEHOLDER_POLICY: 'show_honestly' | 'hide' = 'hide';

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
