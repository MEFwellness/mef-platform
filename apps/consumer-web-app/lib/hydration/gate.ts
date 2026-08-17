/**
 * Conditional water tracking — the row-level gate.
 *
 * daily_checkins_current carries `hydration_tracked` on every row
 * (migration 163), so any reader holding a check-in row already knows
 * whether water counts for that member and needs no extra query. This is
 * the one function that reads it, so no caller has to remember which way
 * the missing case falls.
 *
 * Undefined means the row came from somewhere that does not carry the flag
 * (a test fixture, a hand-built object, the guest preview). That resolves
 * to "tracked", the same fallback the database function uses for an
 * unanswered member: water surfaces keep working exactly as they always
 * have unless somebody has actually said otherwise.
 */

export type HydrationGatedRow = { hydration_tracked?: boolean | null } | null | undefined;

/** True unless this member has explicitly turned water tracking off. */
export function checkinHydrationTracked(row: HydrationGatedRow): boolean {
  return row?.hydration_tracked !== false;
}

/**
 * The water value a scoring or display surface should use for this row:
 * the real number when water is tracked, and null (never 0) when it is
 * not. Null is what every metric in this codebase already means by "not
 * logged", and every consumer already drops a null metric out of the
 * average rather than scoring it as a failure — which is precisely the
 * behavior a member who does not track water needs.
 */
export function gatedWaterCups(
  row: (HydrationGatedRow & { water_cups?: number | null }) | null | undefined
): number | null {
  if (!checkinHydrationTracked(row)) return null;
  return row?.water_cups ?? null;
}
