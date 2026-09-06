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
import { trackAssignmentDeliveredAction } from '@/app/actions/assessmentAssignments';
import { markProgramOpenedAction } from '@/app/actions/coach-programs';
import { trackWeeklyReviewViewedAction } from '@/app/actions/weeklyReview';
import { acknowledgeRevealsAction } from '@/app/actions/visibility';
import { trackMovementSessionViewedAction } from '@/app/actions/movement-sessions';
import { recordExerciseView } from '@/app/actions/exercise-library';
import {
  markTrialArcCloseDoorAction,
  markTrialArcCtaTappedAction,
  openTrialArcCloseAction,
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
  const num = (key: string): number => (typeof body[key] === 'number' ? (body[key] as number) : 0);
  /** Strings only, and never an unbounded list: a beacon names what one screen drew. */
  const strList = (key: string): string[] =>
    Array.isArray(body[key])
      ? (body[key] as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 50)
      : [];

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
    // A coach assignment's delivery receipt, the same kind of fact as the
    // one above and read back by the same kind of screen. The browser
    // names the assignment because it is what knows which one it drew, and
    // the action then re-resolves the member from her own session and
    // refuses any assignment that is not hers or is no longer open, so a
    // hand-built request can only ever record a receipt this member's own
    // screen was entitled to record.
    case 'assignment_delivered':
      await trackAssignmentDeliveredAction(str('assignmentId'), str('presentation'));
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
    // Day 7's close screen, opened. Same shape as the recap's: it composes
    // her stored close if she has none yet and records that she opened it,
    // with her eligibility and her trial day re-resolved from her own
    // session.
    case 'trial_arc_close_opened':
      await openTrialArcCloseAction();
      break;
    // Which door she took on the close, or that she quietly went home. The
    // only thing the browser gets to say is which one, the action refuses
    // anything outside the three names, and the data layer then refuses a
    // door that was never on her own stored close.
    case 'trial_arc_close_door':
      await markTrialArcCloseDoorAction(str('door'));
      break;
    // The "New from your coach" mark, retired because she opened the
    // program. Not an analytics row either: her own program list and her
    // coach's screen both read this back. The action re-resolves the member
    // from her own session and refuses an assignment that is not among her
    // own lifecycles, so a hand built request can only ever stamp a program
    // this member was already entitled to open.
    case 'program_opened':
      await markProgramOpenedAction(str('assignmentId'));
      break;
    // The Weekly Root Review reached her. Not an analytics row: her own
    // Home and her coach's screen read it back. The browser sends nothing
    // at all, and the once-a-week rule is an atomic claim on the server.
    case 'weekly_review_viewed':
      await trackWeeklyReviewViewedAction();
      break;
    // The plain reveal sentences, now said. The action re-resolves the
    // member from her own session and the data layer only acknowledges
    // features that are actually revealed to her, so a hand built request
    // cannot mark anything she was not shown.
    case 'reveals_acknowledged':
      await acknowledgeRevealsAction(strList('featureKeys'));
      break;
    // A guided movement session, opened. Same shape as the program stamp
    // above: the member and her entitlement to that session are re-resolved
    // server side.
    case 'movement_session_viewed':
      await trackMovementSessionViewedAction(str('sessionKey'), num('exerciseCount'));
      break;
    // An exercise, opened. Her own "recently viewed" list reads it back.
    // The row is keyed (member, provider, external_id) and the member comes
    // from her own session, so a hand built request can only ever record an
    // exercise view for the person sending it.
    case 'exercise_viewed':
      await recordExerciseView(str('externalId'), str('exerciseName'));
      break;
    default:
      break;
  }

  return NO_CONTENT;
}
