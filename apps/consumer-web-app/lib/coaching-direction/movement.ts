/**
 * The movement flip — the one table that decides when Root may offer a Root
 * Movement session, and which one.
 *
 * Pure. No I/O, no database, no clock. Everything here is a lookup or a
 * sort, so "would Root offer her a session today, and which" is directly
 * unit-testable with nothing running.
 *
 * WHAT THIS IS NOT. Not an intelligence layer, not a prescription engine and
 * not a second lineup. It invents no signal: every key on the left of the
 * table below is a driver id seeded by migration 106, and every key on the
 * right is a session key seeded by migration 153. It computes no judgement
 * about whether a session will help, because it cannot know that and neither
 * can Root.
 *
 * WHY DRIVER IDS RATHER THAN DOMAINS. The domain is too coarse to name a
 * session: 'MOV' covers sitting hours, training load and recovery days, and
 * those are three different sessions. The driver id is the finest key the
 * decision engine genuinely receives (lib/priority/types.ts's
 * ImplicatedDriverInput carries `driverId`), it is stable across deploys,
 * and it is already what the outcome ledger records for this rung. So the
 * table is keyed on it.
 *
 * WHAT IS DELIBERATELY ABSENT.
 *
 *   The qualified-pattern rung. A tier 3 finding carries a correlation pair
 *   key and nothing else. It has no domain at all, so there is no honest way
 *   to map one onto a session, and inventing one would be exactly the
 *   fabricated precision this product's rules exist to prevent.
 *
 *   The behavioral-friction rung. Its three kinds are daily_reset_incomplete,
 *   food_logging_lapsed and chronic_save_for_later. All three are about how
 *   she uses the product, none is about how she moves, and none maps here.
 *
 *   MEC-4 (Footwear). It is a real movement-domain driver, and none of the
 *   six sessions addresses it. It is left unmapped on purpose rather than
 *   pointed at the nearest session, which is what makes the "an unmapped
 *   driver yields nothing" test non-vacuous.
 */

/**
 * The six session keys, in the order migration 153 seeded them
 * (`sort_order` 1 through 6). This array IS the fixed tie-break order for
 * the fallback below, so it is declared once and never re-stated.
 */
export const MOVEMENT_SESSION_ORDER = [
  'morning_mobility',
  'desk_reset',
  'hip_back_reset',
  'shoulder_neck_reset',
  'core_foundation',
  'recovery_day',
] as const;

export type MovementSessionKey = (typeof MOVEMENT_SESSION_ORDER)[number];

export function isMovementSessionKey(value: unknown): value is MovementSessionKey {
  return (
    typeof value === 'string' && (MOVEMENT_SESSION_ORDER as readonly string[]).includes(value)
  );
}

/**
 * The session player route a movement priority links to. The existing
 * route (app/movement/sessions/[sessionKey]/page.tsx), not a new one, and
 * it 404s by itself on an unknown or retired key.
 */
export function movementSessionHref(sessionKey: MovementSessionKey): string {
  return `/movement/sessions/${sessionKey}`;
}

/**
 * THE MAPPING TABLE. Every movement-relevant driver the library actually
 * seeds, and the one session it points at. Many drivers may share a session;
 * no driver ever has two.
 *
 * Read it as "what she is being watched for" on the left and "the lineup
 * built for that" on the right. The reason for each is on its own line
 * because a coach should be able to read this table and agree or disagree
 * with it without reading any code around it.
 */
export const DRIVER_MOVEMENT_SESSION: Readonly<Record<string, MovementSessionKey>> = {
  // MOV — movement and load.
  /** Sitting hours: total sedentary time. The session built for a body that has been sitting. */
  'MOV-1': 'desk_reset',
  /** Training volume: total load in a window. When load is what is implicated, the answer is the low effort day. */
  'MOV-2': 'recovery_day',
  /** Training absence: extended gaps, deconditioning. The gentlest full body way back in. */
  'MOV-3': 'morning_mobility',
  /** Movement variety: the same pattern repeated. The most varied of the six, head to toe. */
  'MOV-4': 'morning_mobility',
  /** Recovery days: whether rest is actually taken. The session that IS a rest day. */
  'MOV-5': 'recovery_day',
  /** Daily step volume: baseline non-exercise movement. Low baseline movement is the desk pattern. */
  'MOV-6': 'desk_reset',

  // MEC — mechanics and posture.
  /** Workstation load: desk setup, hours in it. */
  'MEC-1': 'desk_reset',
  /** Upper-cross pattern: forward head, rounded shoulders. */
  'MEC-2': 'shoulder_neck_reset',
  /** Lower-cross pattern: pelvic position. */
  'MEC-3': 'hip_back_reset',
  // MEC-4 Footwear: deliberately unmapped. See the header.
  /** One-sided loading: carrying, sleeping, working asymmetrically. A trunk and stability answer. */
  'MEC-5': 'core_foundation',
};

/**
 * The session for one driver, or null when that driver has no session
 * behind it. Null is the ordinary answer for every driver outside the two
 * movement domains, and for MEC-4.
 *
 * `liveSessionKeys` is the set of session keys the database currently
 * publishes as active. A mapping whose session has been retired resolves to
 * null rather than to a dead link: the table in this file is the editorial
 * decision, and the database is still the authority on what exists.
 */
export function movementSessionForDriver(
  driverId: string,
  liveSessionKeys: ReadonlySet<string>
): MovementSessionKey | null {
  const mapped = DRIVER_MOVEMENT_SESSION[driverId];
  if (!mapped) return null;
  return liveSessionKeys.has(mapped) ? mapped : null;
}

/**
 * One live session template, reduced to what the decision engine is allowed
 * to see: its key and the name a member already reads on the Root Movement
 * screens. No description, no lineup, no duration, no exercise.
 */
export type MovementSessionOption = {
  sessionKey: MovementSessionKey;
  /** The template's own name, e.g. "Hip and Back Reset". Never re-worded. */
  name: string;
  /** Her own local date she last COMPLETED this session, or null if never. */
  lastCompletedLocalDate: string | null;
};

/**
 * The enriched fallback's choice: the least-recently-completed session.
 *
 * Deterministic, and deliberately the dullest possible rule. A session she
 * has never completed sorts before every session she has, and among equals
 * the fixed order above breaks the tie. There is no scoring, no
 * personalization and no notion of what she "should" do, because the state
 * this runs in is precisely the state where Root has nothing to say about
 * her: her Daily Reset is done and no rule above had anything.
 *
 * Returns null when there are no live sessions at all, which is what
 * happens before migration 153 reaches an environment.
 */
export function selectFallbackMovementSession(
  options: readonly MovementSessionOption[]
): MovementSessionOption | null {
  if (options.length === 0) return null;

  const rank = new Map<string, number>(
    MOVEMENT_SESSION_ORDER.map((key, index) => [key, index])
  );

  return [...options].sort((a, b) => {
    const aDate = a.lastCompletedLocalDate;
    const bDate = b.lastCompletedLocalDate;
    // Never completed comes first. Two nevers fall through to the fixed
    // order below, which is what makes a brand-new member's first offer
    // always the same session rather than whichever row arrived first.
    if (aDate === null && bDate !== null) return -1;
    if (bDate === null && aDate !== null) return 1;
    if (aDate !== null && bDate !== null && aDate !== bDate) {
      return aDate < bDate ? -1 : 1;
    }
    return (rank.get(a.sessionKey) ?? 0) - (rank.get(b.sessionKey) ?? 0);
  })[0]!;
}
