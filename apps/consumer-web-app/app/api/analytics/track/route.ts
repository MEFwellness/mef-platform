/**
 * The analytics beacon.
 *
 * WHY THIS IS A ROUTE HANDLER AND NOT A SERVER ACTION (Home speed build,
 * 2026-08-28). The trackers on this app's screens render nothing and are
 * fired from a mounted effect precisely so they never delay the render the
 * member is waiting on. Calling a Server Action does not have that
 * property: Next re-renders the whole current route on the server and
 * streams the RSC payload back with the action's result. On Home that was
 * measured on production as a second full page render starting seven
 * seconds in and running for another six, for the sake of writing one
 * `surface_viewed` row. It is the single largest thing standing between
 * that screen and "settled".
 *
 * A route handler returns 204 and re-renders nothing.
 *
 * WHAT IT MAY DO. Exactly what the actions it calls may do, and nothing
 * more: it calls the same functions, which resolve the member from her own
 * session cookie and write through the same RLS-scoped client. A browser
 * cannot name a member, cannot name an event type outside this list, and
 * cannot assert a value the action would not have validated. An unknown
 * event is a 204 with nothing written, because a beacon that argues with
 * the page is worse than a beacon that quietly drops one row.
 */
import {
  trackDailyResetStartedAction,
  trackOnboardingStartedAction,
  trackPaywallViewAction,
  trackSurfaceViewAction,
} from '@/app/actions/analytics';
import { trackPriorityShownAction } from '@/app/actions/priority';
import { trackWeeklyReflectionDeliveredAction } from '@/app/actions/weeklyReflection';
import {
  markTrialArcCtaTappedAction,
  openTrialArcRecapAction,
  trackTrialArcDeliveredAction,
} from '@/app/actions/trialArcDelivery';

/** No cached responses and no static optimization: this writes. */
export const dynamic = 'force-dynamic';

const NO_CONTENT = new Response(null, { status: 204 });

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NO_CONTENT;
  }

  const str = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string) : '');

  switch (body.event) {
    case 'surface_viewed':
      await trackSurfaceViewAction(str('surface'));
      break;
    case 'paywall_viewed':
      await trackPaywallViewAction({ feature: str('feature'), lockReason: str('lockReason') });
      break;
    case 'daily_reset_started':
      await trackDailyResetStartedAction();
      break;
    case 'onboarding_started':
      await trackOnboardingStartedAction();
      break;
    case 'priority_shown':
      await trackPriorityShownAction(str('rule'), str('presentation'), body.isReEntry === true);
      break;
    // The one event here that is not an analytics row. It writes the
    // Weekly Reflection's delivery receipt, and the action re-resolves the
    // member, her timezone, her week and her tier from her own session
    // before it writes, so a hand-built request can only ever record a
    // receipt this member's own screen was entitled to record.
    case 'weekly_reflection_delivered':
      await trackWeeklyReflectionDeliveredAction(str('presentation'));
      break;
    // The trial arc's receipt and its CTA stamp, which are facts the arc's
    // own closer reads back rather than analytics rows. Both actions
    // re-resolve the member, her trial day and today's message from her own
    // session before writing, so a hand built request can only ever record
    // what this member's own screen was entitled to record.
    case 'trial_arc_delivered':
      await trackTrialArcDeliveredAction(str('messageKey'));
      break;
    case 'trial_arc_cta_tapped':
      await markTrialArcCtaTappedAction(str('messageKey'));
      break;
    // Day 6's recap screen, opened. It composes her stored recap if she has
    // none yet and records that she opened it. The browser sends no
    // arguments at all: her eligibility, her trial day and whether she may
    // have a recap are all decided from her own session.
    case 'trial_arc_recap_opened':
      await openTrialArcRecapAction();
      break;
    default:
      break;
  }

  return NO_CONTENT;
}
