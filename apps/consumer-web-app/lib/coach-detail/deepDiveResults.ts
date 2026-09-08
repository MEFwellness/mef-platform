/**
 * Whether a coach-assigned deep-dive has anything to SHOW, decided once.
 *
 * WHY THIS IS A FUNCTION AND NOT NINE `length === 0` CHECKS. Since
 * 2026-09-08 the nine deep-dive panels are result blocks and nothing else:
 * the decision to send one is made on its row in the Assessment Status
 * block at the top of the section, so a panel with no sitting behind it
 * has nothing to say and renders nothing at all. That used to be nine
 * cards each repeating "Not assigned. Nothing about this is offered to
 * them until you send it.", which was most of the height of the section.
 *
 * TWO PLACES HAVE TO AGREE ABOUT IT. The panel decides whether to render,
 * and the page decides whether to print the "Deep-Dive Results" heading
 * above them, because a heading over nine panels that all returned null is
 * a heading over nothing. Both read this.
 */

/** The only thing this needs to know about a panel's state. */
export type DeepDiveResultState = { sessions: unknown[] };

export function hasDeepDiveResults(state: DeepDiveResultState): boolean {
  return state.sessions.length > 0;
}

/** True when at least one deep-dive will render, which is when the heading earns its line. */
export function anyDeepDiveResults(states: DeepDiveResultState[]): boolean {
  return states.some(hasDeepDiveResults);
}
