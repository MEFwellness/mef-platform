/**
 * Role-based home routing: where a coach or an administrator belongs, and
 * which screens belong to members alone.
 *
 * THE PROBLEM. Every account in this app has always been a member first.
 * `handle_new_user()` (migration 17) grants the `member` role to every
 * account created by any path, including the ones later granted `coach` or
 * `platform_administrator`, and nothing removed the member experience
 * afterwards. resolvePostLoginPath() (lib/auth/postLoginRoute.ts) already
 * sent staff to their own dashboard at sign-in, but every member screen
 * stayed reachable: a bookmark, an old notification link, or the "Home"
 * tab in the bottom bar (which pointed at /dashboard even for a coach) put
 * an administrator back on the member Home, Priority Card and all.
 *
 * THE RULE, stated once here rather than repeated per route: an account
 * holding an active `coach` or `platform_administrator` grant never sees a
 * member engagement screen. It is sent to its own dashboard instead.
 *
 * WHAT THIS IS NOT. Like lib/auth/guards.ts, this is a routing rule for
 * the sake of a coherent experience, not an authorization boundary. The
 * RLS policies in supabase/migrations/00000000000016_rls_policies.sql are
 * what actually decide which rows any of these accounts may read or write,
 * and they do so whether or not this file is correct.
 *
 * FAIL OPEN, TOWARDS THE MEMBER. Every decision here is driven by two
 * booleans supplied by the caller, and both come from hasActiveRole(),
 * which returns false when its RPC fails. So an account with no role rows
 * at all, an account whose grant was revoked, and a request where the role
 * lookup itself broke are all treated identically: as an ordinary member,
 * who keeps their entire app. Nothing in this module can lock a member out
 * of anything.
 */

/** Where each staff role lives. Identical to resolvePostLoginPath()'s own answers, deliberately. */
export const COACH_HOME_PATH = '/coach';
export const ADMIN_HOME_PATH = '/admin';

/**
 * The member-only surfaces, by route prefix.
 *
 * The list is drawn from the member engagement surfaces the product
 * already names in lib/analytics/surfaces.ts (`PRODUCT_SURFACES`) plus the
 * member entry flows that lead into them, so "a screen a member engages
 * with" has one definition in this codebase rather than two that drift.
 *
 * Deliberately NOT listed, and each for its own reason:
 *   - `/coach`, `/admin`: the staff platform itself.
 *   - `/api/`: data endpoints, called by member and staff screens alike.
 *     A routing rule must never break the fetch a page it allows depends
 *     on, and RLS already governs every one of them.
 *   - `/account/password`, `/help`, `/about`: genuinely role-neutral. One
 *     change-password screen serves all three roles by design (see
 *     app/account/password/page.tsx).
 *   - `/login`, `/signup`, `/verify`, `/reset-password`: the auth flow,
 *     which staff use exactly as members do.
 *   - `/start`, `/wellness-check`: public, pre-account marketing surfaces
 *     that never assume a session at all.
 */
export const MEMBER_ONLY_PREFIXES = [
  // Home and the daily engagement loop.
  '/dashboard',
  '/today',
  '/progress',
  '/checkin',
  '/reset-plan',
  // The Weekly Reflection (program tier only). Listed here for the same
  // reason every other member experience is: a coach or an administrator
  // who taps an old link belongs on their own dashboard, not on a member's
  // Friday sit-down. The tier gate inside the route is a separate question
  // and is enforced there.
  '/weekly-reflection',
  '/case',
  '/root-score',
  '/root-map',
  '/insights',
  '/noticing',
  '/recommendations',
  // Included deliberately, and worth stating why. The notifications table
  // is generic and lib/lead-capture/notify.ts does write rows addressed to
  // coaches, but this screen is member chrome throughout (member bottom
  // nav, back button falling to the member Home) and its only entry point
  // in the whole app is the member profile sheet. No coach or admin screen
  // links here, so nothing a coach can currently reach is being taken
  // away. Surfacing coach-addressed notifications on the coach dashboard
  // is a real gap, but it is a gap that already exists, and building it
  // would be redesigning the coach platform rather than deciding where
  // these accounts land.
  '/notifications',
  // Member-facing features. '/movement' owns its subtree here EXCEPT
  // '/movement/profile', which is staff-only (see STAFF_ONLY_PREFIXES
  // below) — isMemberOnlyPath subtracts the staff-only list, so the two
  // can never both claim the same path.
  '/food-lens',
  '/movement',
  '/conversation',
  '/programs',
  '/connections',
  '/membership',
  '/profile',
  // Assessments a member takes for themselves. Both spellings are real,
  // separate route trees in this app (/assessment is the body assessment,
  // /assessments is everything in the questionnaire registry), and because
  // matching below respects path boundaries, listing one would not cover
  // the other. A coach reviewing a client's results has their own routes
  // for it under /coach/clients/[id]/..., which this list never touches.
  '/assessment',
  '/assessments',
  '/questionnaires',
  // The member entry flows. /onboarding and /welcome were already gated
  // for coaches by two one-off checks in middleware.ts; those are replaced
  // by this single list, which also closes the same gap for
  // administrators. /name is the display-name step that only ever exists
  // to make the member greeting work.
  '/onboarding',
  '/welcome',
  '/name',
] as const;

/**
 * The internal movement tooling, by route prefix. The mirror image of the
 * list above: these belong to coaches and administrators, and a member
 * never sees them at all.
 *
 * WHY THESE TWO. The Exercise Library is a browsable catalog of every
 * exercise in the system, and the Movement Profile is the permanent
 * movement record a coach builds a prescription from. Both were built as
 * member-facing screens and reached from the Movement dashboard; both are
 * really coaching instruments, and a member browsing raw catalog entries
 * or editing the record their programming is derived from is not the
 * experience this product wants to offer. They are removed from the member
 * app entirely rather than locked or teased, so a member has no reason to
 * know they exist.
 *
 * WHAT A MEMBER KEEPS. Everything a coach has actually prescribed. A
 * program or session still renders each exercise's own media and cues
 * inline (components/movement/MovementExerciseCard.tsx,
 * components/movement-sessions/MovementSessionPlayer.tsx) — none of which
 * routes through /exercises. Only the browsable library and the profile
 * page are gone.
 *
 * SAME KIND OF RULE AS ABOVE, POINTED THE OTHER WAY. This is routing, not
 * authorization: RLS still decides which rows any account may read or
 * write. The pages themselves each re-check the role server-side too, so a
 * request that somehow bypasses middleware still does not render.
 */
export const STAFF_ONLY_PREFIXES = ['/exercises', '/movement/profile'] as const;

/** Shared prefix-boundary match, so `/case` never swallows a future `/cases-study` while still matching `/case` and `/case/anything`. */
function matchesPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)
  );
}

/** Whether this path is one of the internal movement tools. */
export function isStaffOnlyPath(path: string): boolean {
  return matchesPrefix(path, STAFF_ONLY_PREFIXES);
}

/**
 * Prefix match, not equality: a member surface owns its whole subtree
 * (/checkin/evening, /food-lens/protein/ledger, /assessments/wbsa/take).
 *
 * The staff-only list is subtracted rather than the member list being
 * hand-pruned, so `/movement` can keep owning its subtree in one entry and
 * `/movement/profile` can still be staff-only. A path is one kind or the
 * other, never both, which is what keeps the two middleware gates from
 * fighting over the same request.
 */
export function isMemberOnlyPath(path: string): boolean {
  if (isStaffOnlyPath(path)) return false;
  return matchesPrefix(path, MEMBER_ONLY_PREFIXES);
}

export interface StaffRoles {
  isCoach: boolean;
  isAdmin: boolean;
}

/**
 * The dashboard this account calls home, or null for an ordinary member.
 *
 * Coach wins over administrator for an account holding both, matching
 * resolvePostLoginPath()'s existing order exactly. That ordering is not
 * arbitrary and must not be flipped: an account that coaches real clients
 * has people waiting on it, and the administrator tools are one tap away
 * from the coach dashboard either way.
 */
export function staffHomePath(roles: StaffRoles): string | null {
  if (roles.isCoach) return COACH_HOME_PATH;
  if (roles.isAdmin) return ADMIN_HOME_PATH;
  return null;
}

export interface StaffRoutingInput extends StaffRoles {
  hasUser: boolean;
  path: string;
}

/**
 * Where this request must be redirected instead of rendering, or null to
 * let it through untouched.
 *
 * Returns null for every signed-out request, so nothing here can interfere
 * with the sign-in redirect middleware.ts performs first, and null for
 * every member, so a member's request reaches exactly the page it always
 * did.
 */
export function staffRedirectFor(input: StaffRoutingInput): string | null {
  if (!input.hasUser) return null;
  if (!isMemberOnlyPath(input.path)) return null;

  const home = staffHomePath(input);
  if (!home) return null;

  // Not reachable through isMemberOnlyPath today (no staff home sits under
  // a member prefix), but a redirect to the path being redirected FROM is
  // an infinite loop, and this is the one place that could ever produce
  // one.
  if (input.path === home) return null;

  return home;
}

/** Where a member who typed an internal movement tool's URL is sent instead. Their own Movement screen, not a dead end and not an error. */
export const MEMBER_FALLBACK_PATH = '/movement';

/**
 * Where this request must be redirected because the path is an internal
 * movement tool and this account is not staff, or null to let it through.
 *
 * The same shape and the same failure posture as staffRedirectFor above,
 * pointed the other way: null for every signed-out request (middleware's
 * own sign-in redirect runs first), and null for every coach or
 * administrator, who reach the tool untouched.
 *
 * hasActiveRole() fails closed to false, which HERE means "treat as a
 * member" and redirect. That is the safe direction for this rule: a broken
 * role lookup sends a coach to the Movement screen for one request, which
 * is a small annoyance, rather than opening an internal tool to a member.
 * It is the opposite trade-off from the member-only rule above, and
 * deliberately so, because the consequence of being wrong is not symmetric.
 */
export function memberRedirectForStaffOnlyPath(input: StaffRoutingInput): string | null {
  if (!input.hasUser) return null;
  if (!isStaffOnlyPath(input.path)) return null;
  if (input.isCoach || input.isAdmin) return null;
  return MEMBER_FALLBACK_PATH;
}

/**
 * Whether behavioral analytics should record anything for this account.
 *
 * Staff accounts browsing the product would otherwise land in the same
 * member_wellness_events stream the funnel, retention and drop-off
 * reports read, quietly inflating exactly the numbers those reports
 * exist to answer. The redirects above already stop staff reaching the
 * screens that fire these events; this is the second line, at the write
 * itself, so an event cannot appear through a path that skips a
 * navigation.
 */
export function shouldRecordMemberAnalytics(roles: StaffRoles): boolean {
  return staffHomePath(roles) === null;
}
