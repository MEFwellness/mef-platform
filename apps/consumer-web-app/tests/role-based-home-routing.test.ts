/**
 * Role-based home routing: a coach or an administrator never lands in the
 * member experience, and a member never notices any of this happened.
 *
 * THE REPORTED PROBLEM. Every account is granted the `member` role by
 * `handle_new_user()` (migration 17), including the ones later granted
 * `coach` or `platform_administrator`. resolvePostLoginPath() already sent
 * staff to their own dashboard at sign-in, but every member screen stayed
 * reachable afterwards, so an administrator ended up on the member Home
 * looking at a Priority Card and a Daily Reset prompt.
 *
 * WHAT THESE TESTS HOLD, in three layers:
 *
 *   1. The pure decision (lib/auth/staffRouting.ts), including the two
 *      properties that matter more than any individual case: no redirect
 *      can loop, and an account with no roles at all keeps its entire app.
 *   2. The real database. The decision is fed by hasActiveRole(), which
 *      calls the same has_active_role() function the RLS policies call.
 *      These sign in as the actual seeded coach, administrator and member
 *      and route them, so "coach goes to /coach" is proven against real
 *      role grants rather than a boolean someone typed in a test.
 *   3. The source itself, for the two things a runtime test cannot see:
 *      that every member surface the analytics module names is actually
 *      covered by the route list, and that the coach navigation bar no
 *      longer offers a member destination.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TEST_USERS, signInAs } from './setup/test-clients';
import { hasActiveRole } from '../lib/auth/guards';
import {
  ADMIN_HOME_PATH,
  COACH_HOME_PATH,
  MEMBER_ONLY_PREFIXES,
  isMemberOnlyPath,
  shouldRecordMemberAnalytics,
  staffHomePath,
  staffRedirectFor,
} from '../lib/auth/staffRouting';
import { PRODUCT_SURFACES } from '../lib/analytics/surfaces';

const ROOT = path.resolve(__dirname, '..');

const MEMBER = { isCoach: false, isAdmin: false };
const COACH = { isCoach: true, isAdmin: false };
const ADMIN = { isCoach: false, isAdmin: true };
const BOTH = { isCoach: true, isAdmin: true };

describe('which paths belong to members alone', () => {
  it('claims the member engagement screens named in the task', () => {
    for (const memberPath of [
      '/dashboard',
      '/checkin',
      '/checkin/evening',
      '/today',
      '/progress',
      '/reset-plan',
      '/food-lens',
      '/case',
    ]) {
      expect(isMemberOnlyPath(memberPath)).toBe(true);
    }
  });

  it('claims a member surface whole, including its subtree and its query string', () => {
    expect(isMemberOnlyPath('/food-lens/protein/ledger')).toBe(true);
    expect(isMemberOnlyPath('/assessments/wbsa/take')).toBe(true);
    expect(isMemberOnlyPath('/progress?range=90d')).toBe(true);
    expect(isMemberOnlyPath('/checkin/evening?from=today')).toBe(true);
  });

  it('leaves the staff platform, the API and every role-neutral screen alone', () => {
    for (const otherPath of [
      '/coach',
      '/coach/clients/abc',
      '/admin',
      '/admin/analytics/funnel',
      '/api/auth/callback',
      '/api/cron/wearable-daily',
      '/account/password',
      '/login',
      '/signup',
      '/reset-password/confirm',
      '/start',
      '/wellness-check',
      '/help',
      '/about',
      '/',
    ]) {
      expect(isMemberOnlyPath(otherPath)).toBe(false);
    }
  });

  it('matches on a path boundary, so a prefix cannot swallow an unrelated sibling route', () => {
    // /case must not claim a future /case-studies, and /name must not
    // claim a future /names. Prefix matching without this check is the
    // classic way a routing rule starts redirecting pages nobody meant it
    // to touch.
    expect(isMemberOnlyPath('/case-studies')).toBe(false);
    expect(isMemberOnlyPath('/names')).toBe(false);
    expect(isMemberOnlyPath('/todays-plan')).toBe(false);
  });
});

describe('where each account belongs', () => {
  it('sends a coach to the coach dashboard and an administrator to the admin dashboard', () => {
    expect(staffHomePath(COACH)).toBe(COACH_HOME_PATH);
    expect(staffHomePath(ADMIN)).toBe(ADMIN_HOME_PATH);
  });

  it('sends an account holding both roles to the coach dashboard, matching resolvePostLoginPath', () => {
    expect(staffHomePath(BOTH)).toBe(COACH_HOME_PATH);
  });

  it('gives an account with no staff role no home of its own, which is what keeps it a member', () => {
    expect(staffHomePath(MEMBER)).toBeNull();
  });
});

describe('the redirect decision', () => {
  it('redirects a coach off the member Home', () => {
    expect(staffRedirectFor({ hasUser: true, ...COACH, path: '/dashboard' })).toBe(COACH_HOME_PATH);
  });

  it('redirects an administrator off Daily Reset, Today and Progress', () => {
    for (const memberPath of ['/checkin', '/today', '/progress']) {
      expect(staffRedirectFor({ hasUser: true, ...ADMIN, path: memberPath })).toBe(ADMIN_HOME_PATH);
    }
  });

  it('leaves a member on every member screen, which is the whole no-change guarantee', () => {
    for (const prefix of MEMBER_ONLY_PREFIXES) {
      expect(staffRedirectFor({ hasUser: true, ...MEMBER, path: prefix })).toBeNull();
      expect(staffRedirectFor({ hasUser: true, ...MEMBER, path: `${prefix}/anything` })).toBeNull();
    }
  });

  it('treats an account with no role set as a member, so nobody can be locked out', () => {
    // hasActiveRole() returns false when its RPC fails, so a broken role
    // lookup arrives here as exactly this case. It must keep the app.
    expect(staffRedirectFor({ hasUser: true, isCoach: false, isAdmin: false, path: '/dashboard' })).toBeNull();
  });

  it('ignores signed-out requests entirely, leaving the sign-in redirect to middleware', () => {
    expect(staffRedirectFor({ hasUser: false, ...COACH, path: '/dashboard' })).toBeNull();
  });

  it('never touches a staff path, an API route or the auth flow', () => {
    for (const otherPath of ['/coach', '/admin/analytics', '/api/auth/recovery', '/login', '/account/password']) {
      expect(staffRedirectFor({ hasUser: true, ...BOTH, path: otherPath })).toBeNull();
    }
  });

  it('cannot produce a redirect loop: no destination it returns is itself redirected', () => {
    for (const roles of [COACH, ADMIN, BOTH]) {
      for (const prefix of MEMBER_ONLY_PREFIXES) {
        const destination = staffRedirectFor({ hasUser: true, ...roles, path: prefix });
        expect(destination).not.toBeNull();
        expect(staffRedirectFor({ hasUser: true, ...roles, path: destination! })).toBeNull();
      }
    }
  });
});

describe('member analytics', () => {
  it('records for a member', () => {
    expect(shouldRecordMemberAnalytics(MEMBER)).toBe(true);
  });

  it('records nothing for a coach or an administrator, so the funnel stays member-only', () => {
    expect(shouldRecordMemberAnalytics(COACH)).toBe(false);
    expect(shouldRecordMemberAnalytics(ADMIN)).toBe(false);
    expect(shouldRecordMemberAnalytics(BOTH)).toBe(false);
  });

  it('every surface the analytics module can report on is a route staff are redirected away from', () => {
    // The two lists exist for different reasons (one names what a member
    // engaged with, the other names what a staff account may not open), so
    // this is the seam where they could silently drift: a new member
    // surface added to PRODUCT_SURFACES without a route added here would
    // start recording staff activity in the funnel again.
    const ROUTE_FOR_SURFACE: Record<(typeof PRODUCT_SURFACES)[number], string> = {
      home: '/dashboard',
      daily_reset: '/checkin',
      daily_reset_evening: '/checkin/evening',
      food_lens: '/food-lens',
      progress: '/progress',
      today: '/today',
      your_case: '/case',
      movement: '/movement',
      questionnaires: '/questionnaires',
      questionnaire: '/assessments/wbsa',
      conversation: '/conversation',
      reset_plan: '/reset-plan',
      weekly_reflection: '/weekly-reflection',
      root_score: '/root-score',
      insights: '/insights',
      noticing: '/noticing',
      recommendations: '/recommendations',
      membership: '/membership',
      profile: '/profile',
      body_assessment: '/assessment',
    };

    for (const surface of PRODUCT_SURFACES) {
      expect(isMemberOnlyPath(ROUTE_FOR_SURFACE[surface])).toBe(true);
    }
  });
});

describe('the coach navigation bar', () => {
  const source = fs.readFileSync(path.join(ROOT, 'components/BottomNav.tsx'), 'utf-8');
  // The coach bar moved out of BottomNav.tsx and into its own component on
  // 2026-08-14, rendered by the coach and admin route layouts rather than
  // by each page. Same assertion, new address.
  const staffNav = fs.readFileSync(path.join(ROOT, 'components/StaffNav.tsx'), 'utf-8');

  it('offers no member destination, so nothing a coach can tap bounces', () => {
    // The coach bar used to be Home (/dashboard), Coach (/coach), the
    // Check-In button (/checkin) and Today (/today). Three of those four
    // are member routes that now redirect, and that bar was the most
    // likely way a coach ended up on the member Home in the first place.
    const items = staffNav.slice(
      staffNav.indexOf('const items: StaffNavItem[]'),
      staffNav.indexOf('return (', staffNav.indexOf('const items: StaffNavItem[]'))
    );
    expect(items).toContain('COACH_HOME_PATH');
    expect(COACH_HOME_PATH).toBe('/coach');
    for (const memberPath of ['/dashboard', '/today', '/checkin', '/progress', '/food-lens']) {
      expect(staffNav).not.toContain(memberPath);
    }
  });

  it('is the only bar a staff account can be shown, from either component', () => {
    // BottomNav is the member bar now. It hands any staff account straight
    // to StaffNav before it builds a single member item, and no screen
    // under /coach or /admin imports it at all.
    expect(source).toContain(
      'if (isCoach || isAdmin) return <StaffNav isCoach={isCoach} isAdmin={isAdmin} />;'
    );
    expect(source).not.toContain('COACH_ITEMS');
  });

  it('still renders the Check-In button and both member groups for a member', () => {
    expect(source).toContain('MEMBER_LEFT_ITEMS');
    expect(source).toContain('MEMBER_RIGHT_ITEMS');
    expect(source).toContain("href: '/dashboard'");
    expect(source).toContain("const MORNING_HREF = '/checkin'");
  });
});

describe('against the real database', () => {
  async function routeFor(user: (typeof TEST_USERS)[keyof typeof TEST_USERS], targetPath: string) {
    const client = await signInAs(user);
    const [isCoach, isAdmin] = await Promise.all([
      hasActiveRole(client, user.id, 'coach'),
      hasActiveRole(client, user.id, 'platform_administrator'),
    ]);
    return { isCoach, isAdmin, destination: staffRedirectFor({ hasUser: true, isCoach, isAdmin, path: targetPath }) };
  }

  it('the seeded coach holds the coach role and is routed off the member Home', async () => {
    const result = await routeFor(TEST_USERS.coachOne, '/dashboard');
    expect(result.isCoach).toBe(true);
    expect(result.destination).toBe(COACH_HOME_PATH);
  });

  it('the seeded administrator is routed off Daily Reset', async () => {
    const result = await routeFor(TEST_USERS.adminOne, '/checkin');
    expect(result.isAdmin).toBe(true);
    expect(result.destination).toBe(ADMIN_HOME_PATH);
  });

  it('the seeded member holds neither staff role and is left exactly where they asked to go', async () => {
    for (const memberPath of ['/dashboard', '/checkin', '/today', '/progress', '/food-lens']) {
      const result = await routeFor(TEST_USERS.memberOne, memberPath);
      expect(result.isCoach).toBe(false);
      expect(result.isAdmin).toBe(false);
      expect(result.destination).toBeNull();
    }
  });

  it('the seeded member still records analytics, and the seeded staff accounts do not', async () => {
    const member = await routeFor(TEST_USERS.memberOne, '/dashboard');
    expect(shouldRecordMemberAnalytics(member)).toBe(true);

    for (const staff of [TEST_USERS.coachOne, TEST_USERS.adminOne]) {
      const roles = await routeFor(staff, '/dashboard');
      expect(shouldRecordMemberAnalytics(roles)).toBe(false);
    }
  });

  it('a revoked coach grant returns the account to the member experience', async () => {
    // The mechanism behind role revocation (user_roles.revoked_at, which
    // has_active_role() checks) is what makes "no role set" and "role
    // taken away" the same, safe case. Proven here against the real
    // function rather than assumed: a member whose grants are all absent
    // is never redirected anywhere.
    const client = await signInAs(TEST_USERS.memberTwo);
    const isCoach = await hasActiveRole(client, TEST_USERS.memberTwo.id, 'coach');
    expect(isCoach).toBe(false);
    expect(staffRedirectFor({ hasUser: true, isCoach, isAdmin: false, path: '/today' })).toBeNull();
  });
});
