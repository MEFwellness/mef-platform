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
  | { event: 'trial_arc_cta_tapped'; messageKey: string };

export function sendBeacon(payload: BeaconEvent): void {
  void fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}
