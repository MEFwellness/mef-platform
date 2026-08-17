/**
 * Admin/coach chrome cleanup, and Sign Out for every role.
 *
 * TWO DEFECTS, both seen on a real phone in the live admin view.
 *
 *   1. The MEMBER bottom navigation (Home, Food Lens, the gold Check-In
 *      button, Progress, Today) rendered underneath the admin screens.
 *      The cause was not a bug in the navigation component: it was that
 *      every page decided its own chrome. Each admin page looked up ONE
 *      role, `coach`, and handed the answer to BottomNav, where false
 *      meant "draw the member bar". An administrator who does not also
 *      hold the coach grant is exactly that false, so the admin side
 *      shipped with five doors into the member experience on every screen.
 *
 *   2. There was no way to sign out anywhere in the app for a coach or an
 *      administrator at all, and the member's own Sign Out lived only
 *      behind the profile avatar.
 *
 * WHAT THESE TESTS HOLD, in three layers, because the fix spans three:
 *
 *   1. The route layer (real middleware, actually executed). After signing
 *      out there is no session, and every authenticated route, member and
 *      staff alike, must answer a signed out request with a redirect to
 *      /login rather than a page. This is what makes the browser Back
 *      button unable to re-enter the app.
 *   2. The real database. Signing out has to end the session for a member,
 *      a coach and an administrator equally, and "ended" has to mean the
 *      account's own data is no longer readable, not just that a local
 *      variable was cleared.
 *   3. The source itself, for what neither of those can see: which
 *      component each side's chrome comes from, and that the decision now
 *      lives in a route layout rather than in each page. The layout is the
 *      part that makes this stay fixed: a coach or admin page added
 *      tomorrow inherits the right bar without anyone remembering to ask.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { TEST_USERS, signInAs } from './setup/test-clients';

const ROOT = path.resolve(__dirname, '..');

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

/** Every page file under one of the staff route trees. */
function staffPageFiles(): string[] {
  const output = execSync("find app/coach app/admin -name '*.tsx'", {
    cwd: ROOT,
    encoding: 'utf-8',
  });
  return output.split('\n').filter(Boolean);
}

const BOTTOM_NAV = source('components/BottomNav.tsx');
const STAFF_NAV = source('components/StaffNav.tsx');
const COACH_LAYOUT = source('app/coach/layout.tsx');
const ADMIN_LAYOUT = source('app/admin/layout.tsx');
const SIGN_OUT_BUTTON = source('components/SignOutButton.tsx');
const AUTH_ACTIONS = source('app/actions/auth.ts');

/** The five member destinations that must never appear on a staff screen. */
const MEMBER_NAV_DESTINATIONS = ['/dashboard', '/food-lens', '/checkin', '/progress', '/today'];

describe('the member bottom navigation never renders for a coach or an administrator', () => {
  it('no page under /coach or /admin renders or imports BottomNav at all', () => {
    const offenders = staffPageFiles().filter((file) => {
      // The two layouts explain the old arrangement in their own doc
      // comments, which is not the same as rendering it.
      const body = source(file).replace(/\/\*[\s\S]*?\*\//g, '');
      return /BottomNav/.test(body);
    });
    expect(offenders).toEqual([]);
  });

  it('found a real set of staff pages, so the check above is not passing on an empty list', () => {
    expect(staffPageFiles().length).toBeGreaterThanOrEqual(30);
  });

  it('BottomNav hands any staff account to StaffNav before it builds a single member item', () => {
    const handOff = 'if (isCoach || isAdmin) return <StaffNav isCoach={isCoach} isAdmin={isAdmin} />;';
    expect(BOTTOM_NAV).toContain(handOff);
    expect(BOTTOM_NAV.indexOf(handOff)).toBeLessThan(
      BOTTOM_NAV.indexOf('const leftItems: NavItem[]')
    );
  });

  it('the server wrapper hands staff through before it ever asks the visibility layer', () => {
    // VISIBILITY LAYER (2026-08-17). MemberBottomNav is what member screens
    // render now, so the staff hand-off has to hold there too, and it has to
    // hold BEFORE any member-shaped read runs.
    const wrapper = fs.readFileSync(
      path.resolve(__dirname, '..', 'components/MemberBottomNav.tsx'),
      'utf-8'
    );
    const handOff = 'if (isCoach || isAdmin) return <BottomNav isCoach={isCoach} isAdmin={isAdmin} />;';
    expect(wrapper).toContain(handOff);
    expect(wrapper.indexOf(handOff)).toBeLessThan(wrapper.indexOf('await getMemberVisibility()'));
  });

  it('BottomNav no longer carries a coach bar of its own, so there is one staff bar and not two', () => {
    expect(BOTTOM_NAV).not.toContain('COACH_ITEMS');
  });

  it('StaffNav offers no member destination, not even one that would simply redirect', () => {
    for (const memberPath of MEMBER_NAV_DESTINATIONS) {
      expect(STAFF_NAV).not.toContain(memberPath);
    }
  });
});

describe('the staff bar comes from a route layout, so future staff pages inherit it', () => {
  it('both staff route trees have a layout, and each renders StaffNav', () => {
    for (const layout of [COACH_LAYOUT, ADMIN_LAYOUT]) {
      expect(layout).toContain("import { StaffNav } from '@/components/StaffNav'");
      expect(layout).toContain('<StaffNav isCoach={isCoach} isAdmin={isAdmin} />');
    }
  });

  it('each layout resolves BOTH staff roles, which is the actual defect being fixed', () => {
    // Looking up only `coach`, which is what every admin page used to do,
    // is what made an administrator who is not a coach fall through to the
    // member bar.
    for (const layout of [COACH_LAYOUT, ADMIN_LAYOUT]) {
      expect(layout).toContain('const { isCoach, isAdmin } = await getStaffRoles();');
    }
    const roles = source('lib/auth/staffRoles.ts');
    expect(roles).toContain("hasActiveRole(supabase, user.id, 'coach')");
    expect(roles).toContain("hasActiveRole(supabase, user.id, 'platform_administrator')");
  });

  it('no admin page looks up the coach role just to choose a navigation bar any more', () => {
    const offenders = staffPageFiles()
      .filter((file) => file.startsWith('app/admin/') && !file.endsWith('layout.tsx'))
      .filter((file) => /hasActiveRole\([^)]*'coach'/.test(source(file)));
    expect(offenders).toEqual([]);
  });

  it('the analytics section stops carrying a coach lookup it only ever used for chrome', () => {
    expect(source('app/admin/analytics/guard.ts')).not.toContain("'coach'");
    expect(source('app/admin/analytics/layout.tsx')).not.toContain('StaffNav');
  });
});

describe('the admin and coach chrome never renders for a member', () => {
  it('StaffNav is reached only from staff surfaces, never from a member page', () => {
    const importers = execSync("grep -rl \"from '@/components/StaffNav'\" app components", {
      cwd: ROOT,
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(importers).toEqual([
      // The member bar, which only reaches for it when the account is
      // staff standing on a role-neutral screen (/about, /help).
      'components/BottomNav.tsx',
      'app/admin/layout.tsx',
      'app/coach/layout.tsx',
      // The two internal movement tools (2026-08-16). These live outside
      // the /coach and /admin route groups, at URLs they held when they
      // were member screens, so no layout draws their chrome for them and
      // each names StaffNav itself. Both are gated coach/administrator
      // only, in middleware.ts and again server-side in the page — see
      // lib/auth/staffRouting.ts's STAFF_ONLY_PREFIXES and
      // lib/auth/staffOnlyPage.ts.
      'app/exercises/page.tsx',
      'app/exercises/[id]/page.tsx',
      'app/movement/profile/page.tsx',
    ].sort());
  });

  it('a member sees the member bar: the role props default to false, so nothing has to be passed', () => {
    // A third prop joined them (Visibility Layer, 2026-08-17) and it also
    // defaults safely: showFoodLens defaults to true, so a caller that has
    // not been given the server-resolved answer behaves as this bar always
    // has, and no default combination produces a member tab for staff.
    expect(BOTTOM_NAV).toContain('export function BottomNav({ isCoach = false, isAdmin = false, showFoodLens = true }');
  });

  it('the member bar itself is unchanged: the same five destinations, in the same places', () => {
    expect(BOTTOM_NAV).toContain("{ label: 'Home', href: '/dashboard'");
    expect(BOTTOM_NAV).toContain("{ label: 'Food Lens', href: '/food-lens'");
    expect(BOTTOM_NAV).toContain("{ label: 'Progress', href: '/progress'");
    expect(BOTTOM_NAV).toContain("{ label: 'Today', href: '/today'");
    expect(BOTTOM_NAV).toContain("const MORNING_HREF = '/checkin'");
    // And no staff destination appears on it.
    expect(BOTTOM_NAV).not.toContain("href: '/coach'");
    expect(BOTTOM_NAV).not.toContain("href: '/admin'");
  });
});

describe('Sign Out exists for every role, and is one control rather than three', () => {
  it('every placement uses the same component, so there is one confirmation experience', () => {
    for (const file of [
      'components/StaffNav.tsx',
      'components/ProfileSheet.tsx',
      'app/profile/page.tsx',
      'app/trial-ended/page.tsx',
    ]) {
      expect(source(file)).toContain("import { SignOutButton } from '@/components/SignOutButton'");
    }
  });

  it('a coach or an administrator signs out from their own navigation bar', () => {
    // The `audience` argument arrived later, with the dialog fix: the
    // confirmation copy named check-ins and Root Score to everyone, which
    // is member language on a coach screen. See tests/sign-out-dialog.test.ts.
    expect(STAFF_NAV).toContain('<SignOutButton variant="nav"');
    expect(SIGN_OUT_BUTTON).toContain("variant?: SignOutVariant;");
    expect(SIGN_OUT_BUTTON).toContain("export type SignOutVariant = 'row' | 'block' | 'nav';");
  });

  it('a member signs out from the profile sheet and from the Profile screen', () => {
    expect(source('components/ProfileSheet.tsx')).toContain('<SignOutButton variant="row" />');
    expect(source('app/profile/page.tsx')).toContain('<SignOutButton variant="block" />');
  });

  it('there is one sign out action, and it ends the Supabase session before anything else', () => {
    expect(SIGN_OUT_BUTTON).toContain("import { signOut } from '@/app/actions/auth'");
    const action = AUTH_ACTIONS.slice(
      AUTH_ACTIONS.indexOf('export async function signOut('),
      AUTH_ACTIONS.indexOf('export async function requestPasswordReset(')
    );
    expect(action).toContain('await supabase.auth.signOut();');
    expect(action).toContain("redirect('/login');");
    expect(action.indexOf('await supabase.auth.signOut();')).toBeLessThan(
      action.indexOf("redirect('/login');")
    );
  });

  it('signing out empties the client side router cache, so Back has nothing to repaint from', () => {
    // Ending the session is what makes the next REQUEST bounce. Back does
    // not always make a request: Next.js serves it from the Router Cache
    // of payloads rendered while the session was still alive. Invalidating
    // from the root layout down is what removes that copy.
    const action = AUTH_ACTIONS.slice(
      AUTH_ACTIONS.indexOf('export async function signOut('),
      AUTH_ACTIONS.indexOf('export async function requestPasswordReset(')
    );
    expect(action).toContain("revalidatePath('/', 'layout');");
    expect(action.indexOf("revalidatePath('/', 'layout');")).toBeLessThan(
      action.indexOf("redirect('/login');")
    );
  });

  it('no em dash appears in any of the sign out copy or the staff bar copy', () => {
    for (const file of [SIGN_OUT_BUTTON, STAFF_NAV, COACH_LAYOUT, ADMIN_LAYOUT]) {
      expect(file).not.toContain('—');
    }
  });
});

describe('after signing out, no authenticated screen can be reached again', () => {
  /**
   * The real middleware, executed, with no session cookies on the request:
   * exactly the state the browser is in the moment signOut() returns. Every
   * one of these is a screen the Back button could try to return to.
   */
  const AUTHENTICATED_PATHS = [
    '/dashboard',
    '/today',
    '/progress',
    '/checkin',
    '/profile',
    '/food-lens',
    '/case',
    '/root-score',
    '/coach',
    '/coach/clients',
    '/admin',
    '/admin/access',
    '/admin/analytics',
    '/trial-ended',
  ];

  it.each(AUTHENTICATED_PATHS)('a signed out request for %s is redirected to /login', async (p) => {
    const response = await middleware(new NextRequest(`http://localhost:3000${p}`));
    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe('/login');
  });

  it('the redirect remembers where the request was headed, so signing back in resumes it', () => {
    return middleware(new NextRequest('http://localhost:3000/progress')).then((response) => {
      const location = new URL(response.headers.get('location')!);
      expect(location.searchParams.get('redirectedFrom')).toBe('/progress');
    });
  });

  it('the login screen itself stays reachable, or signing back in would be impossible', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/login'));
    expect(response.status).toBe(200);
  });
});

describe('against the real database: signing out ends the session for each role', () => {
  /**
   * Scope 'local' deliberately, matching tests/change-password.test.ts:
   * supabase-js defaults to a global sign out, which revokes every refresh
   * token the seeded account holds, and these test users are shared with
   * every other test file running at the same time. What is being proven
   * here is what the app depends on either way: once the session is gone,
   * this client is anonymous, and the account's own rows stop being
   * readable.
   */
  for (const [role, user] of [
    ['member', TEST_USERS.memberOne],
    ['coach', TEST_USERS.coachOne],
    ['administrator', TEST_USERS.adminOne],
  ] as const) {
    it(`a signed in ${role} can read their own profile, and cannot once signed out`, async () => {
      const client = await signInAs(user);

      const before = await client.from('profiles').select('id').eq('id', user.id).maybeSingle();
      expect(before.error).toBeNull();
      expect(before.data?.id).toBe(user.id);

      const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
      expect(signOutError).toBeNull();

      const { data: session } = await client.auth.getSession();
      expect(session.session).toBeNull();

      const after = await client.from('profiles').select('id').eq('id', user.id).maybeSingle();
      expect(after.data).toBeNull();
    });
  }

  it('signing back in afterwards works normally, so sign out is not a one way door', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await client.auth.signOut({ scope: 'local' });

    const again = await signInAs(TEST_USERS.memberOne);
    const { data } = await again.auth.getUser();
    expect(data.user?.id).toBe(TEST_USERS.memberOne.id);
  });
});
