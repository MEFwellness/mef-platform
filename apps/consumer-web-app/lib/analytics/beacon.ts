/**
 * How a tracker on a screen reports what it saw.
 *
 * One function, because there is one rule: an analytics write may never
 * cost the member a page render. See app/api/analytics/track/route.ts for
 * why this is a `fetch` to a route handler rather than a Server Action
 * call, and what that measured on production.
 *
 * `keepalive` so an event fired as she navigates away still lands, and a
 * swallowed rejection because a dropped analytics row is not a thing to
 * put in front of her.
 */
export type BeaconEvent =
  | { event: 'surface_viewed'; surface: string }
  | { event: 'paywall_viewed'; feature: string; lockReason: string }
  | { event: 'daily_reset_started' }
  | { event: 'onboarding_started' }
  | { event: 'priority_shown'; rule: string; presentation: string; isReEntry: boolean }
  /**
   * Not an analytics row. This one writes a delivery receipt
   * (member_weekly_reflection_deliveries, migration 191), which is a fact a
   * coach's screen reads back. It travels here because it has the same two
   * properties every event above has: it is fired from a mounted effect on
   * a surface that genuinely displayed something, and it must not cost the
   * member a re-render. The member, the week and the once-per-week rule are
   * all decided on the server, so the only thing the browser gets to say is
   * which surface it was.
   */
  | { event: 'weekly_reflection_delivered'; presentation: string }
  /**
   * Also not an analytics row, and the same fact for a coach ASSIGNMENT
   * that the one above is for the Weekly Reflection. It writes a delivery
   * receipt (member_assignment_deliveries, migration 210), which a coach's
   * screen reads back. It travels here for the same two reasons: it is
   * fired from a mounted effect on a surface that genuinely displayed the
   * assignment, and it must not cost the member a re-render.
   *
   * This one names the assignment, because a member can have several open
   * at once and the surface is what knows which one it drew. Everything
   * else is re-decided on the server: the member from her own session, and
   * whether that assignment is hers and still open before anything is
   * written.
   */
  | { event: 'assignment_delivered'; assignmentId: string; presentation: string }
  /**
   * Also not analytics rows. These two write the trial arc's delivery
   * receipt and its CTA stamp (member_trial_arc_deliveries, migration 204),
   * which the arc's own closer reads back. They travel here for the same
   * two reasons the receipt above does: both are fired from a real display
   * or a real press on a surface the member genuinely saw, and neither may
   * cost her a re-render. The member, her trial day, her pace state and the
   * step the message pointed at are all decided on the server, so the only
   * thing the browser gets to say is which message it was.
   */
  | { event: 'trial_arc_delivered'; messageKey: string }
  | { event: 'trial_arc_cta_tapped'; messageKey: string }
  /**
   * Day 6's recap screen, opened. Also not an analytics row: it composes her
   * stored recap if she does not have one yet and records that she opened
   * it (member_trial_arc_recaps, migration 205), which is a fact the
   * post-trial continuation screen reads back. The browser sends nothing but
   * the event name; her eligibility and her trial day are re-resolved on the
   * server.
   */
  | { event: 'trial_arc_recap_opened' }
  /**
   * Day 7's close screen, opened, and which door she took on it. Also not
   * analytics rows: they compose her stored close if she does not have one
   * yet, record that she opened it and record what she decided
   * (member_trial_arc_closes, migration 206), all of which Prompt 6's
   * continuation screen reads back. The browser sends the event name and,
   * for the door, one of exactly three names. Her eligibility, her trial day
   * and whether that door was ever drawn on her screen are all decided on
   * the server.
   */
  | { event: 'trial_arc_close_opened' }
  | { event: 'trial_arc_close_door'; door: 'conversation' | 'membership' | 'home' }
  /**
   * Also not an analytics row. It retires the "New from your coach" mark on
   * a program the member has now actually opened
   * (recordProgramOpened, lib/program-lifecycle), which her own list screen
   * and her coach's screen both read back.
   *
   * It travels here for the reason every event above does: it is fired from
   * a mounted effect on a screen that genuinely displayed the program, and
   * it must not cost her a re-render. Calling it as a Server Action cost a
   * full extra server render of /programs, measured on production, for the
   * sake of one stamp.
   *
   * The browser names the assignment because it is what knows which program
   * it drew. Everything else is re-decided on the server: the member from
   * her own session, and whether that assignment is actually hers, before
   * anything is written.
   */
  | { event: 'program_opened'; assignmentId: string }
  /**
   * Three more facts a screen records about itself, moved here for exactly
   * the reason the ones above are here: each was fired from a mounted
   * effect, each was a Server Action, and a Server Action re-renders the
   * whole route the member is standing on.
   *
   * `weekly_review_viewed` stamps that the Weekly Root Review reached her;
   * the once-a-week rule is an atomic claim on the server, never this call.
   * `reveals_acknowledged` marks the plain reveal sentences as said, and the
   * server decides which of the named features she is actually allowed to
   * acknowledge. `movement_session_viewed` records that a guided session was
   * opened; the member and her entitlement to that session are re-resolved
   * server side.
   */
  | { event: 'weekly_review_viewed' }
  | { event: 'reveals_acknowledged'; featureKeys: string[] }
  | { event: 'movement_session_viewed'; sessionKey: string; exerciseCount: number }
  /**
   * An exercise, opened. Also not an analytics row: it is what her own
   * "recently viewed" list reads back. Same reason as the rest — it is
   * fired from a mounted effect on a screen that genuinely displayed the
   * exercise, and it must not cost her a re-render. The member is
   * re-resolved on the server; the browser names only which exercise the
   * screen drew.
   */
  | { event: 'exercise_viewed'; externalId: string; exerciseName: string };

export function sendBeacon(payload: BeaconEvent): void {
  void sendBeaconAwaited(payload);
}

/**
 * The same request, awaited.
 *
 * For the one caller that genuinely has to know the write finished before
 * it does the next thing: the day 6 recap screen, which composes her stored
 * recap through this beacon and then refreshes to render it. Everything
 * else uses sendBeacon above and must keep doing so, because an awaited
 * analytics write on a screen she is reading is exactly the cost this file
 * exists to avoid.
 *
 * Still `keepalive`, and it still swallows its own failure: a caller
 * awaiting this is told the request finished, never that it succeeded, and
 * the server is what decides whether anything was written.
 */
export async function sendBeaconAwaited(payload: BeaconEvent): Promise<void> {
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // A dropped analytics row is not a thing to put in front of her.
  }
}
