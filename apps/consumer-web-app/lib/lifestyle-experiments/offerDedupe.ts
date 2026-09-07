/**
 * "One open offer per member per experiment", applied to offers that are
 * not rows.
 *
 * An offer has no row anywhere. Home computes it fresh on every render from
 * "the member's latest completed session of this assessment, when no
 * experiment from that assessment is currently active" (see
 * getMyCvsOfferAction / getMyLscOfferAction / getMyRplOfferAction). So
 * there is nothing to insert, nothing to delete, and no database constraint
 * that could apply: the only place a duplicate offer can be refused is at
 * the moment Home decides what to render, and the refusal is silent by
 * construction, because a suppressed offer is simply a card that is never
 * drawn. Nothing errors and nothing is written.
 *
 * Two rules, in this order:
 *
 *   1. An offer whose subject is already RUNNING is dropped. She is
 *      already doing the thing; offering to start it is the same
 *      duplicate one screen later.
 *   2. Among offers that share a subject, the most recently completed
 *      source session wins. That is what the Readiness Pulse is FOR: it
 *      reads the Life Signal Check's own loudest signal and re-frames it
 *      through what she just said about her readiness, including a
 *      deliberate two-minute version for a member who told it she has
 *      almost no capacity. Keeping the older card would hand her the
 *      five-minute version she had already said she could not do.
 *
 * An offer with no subject is never suppressed: there is nothing to
 * compare it against, and silently dropping a card we cannot reason about
 * would be worse than showing it.
 */

export type DedupableOffer = {
  /** Null only if the offer's subject genuinely cannot be named. Never suppressed in that case. */
  subjectKey: string | null;
  /** ISO instant the source session was completed. Null sorts oldest. */
  sourceCompletedAt: string | null;
};

/**
 * Returns the offers that should actually be drawn, in the order given.
 * `runningSubjectKeys` are the subjects of every currently active
 * experiment, from any source experience.
 */
export function suppressDuplicateOffers<T extends DedupableOffer>(
  offers: T[],
  runningSubjectKeys: readonly (string | null)[]
): T[] {
  const running = new Set(runningSubjectKeys.filter((k): k is string => k !== null));

  const winnerFor = new Map<string, T>();
  for (const offer of offers) {
    const key = offer.subjectKey;
    if (key === null || running.has(key)) continue;

    const current = winnerFor.get(key);
    if (!current) {
      winnerFor.set(key, offer);
      continue;
    }
    // Strictly-later wins, so a tie keeps the earlier offer in input order
    // and the result never depends on how Promise.all happened to resolve.
    const a = offer.sourceCompletedAt ?? '';
    const b = current.sourceCompletedAt ?? '';
    if (a > b) winnerFor.set(key, offer);
  }

  return offers.filter((offer) => {
    if (offer.subjectKey === null) return true;
    if (running.has(offer.subjectKey)) return false;
    return winnerFor.get(offer.subjectKey) === offer;
  });
}
