/**
 * The Exercise Library and the Movement Profile are internal tools.
 *
 * THE CHANGE. Both were member screens, reached from two cards on the
 * member Movement dashboard. Both are really coaching instruments: a
 * browsable catalog of every exercise in the system, and the permanent
 * movement record a prescription is derived from. They are now coach and
 * administrator only, removed from the member app entirely rather than
 * locked or teased, and surfaced on the coach and admin dashboards so
 * nothing was lost from the platform.
 *
 * WHAT THESE TESTS HOLD, in three layers, mirroring
 * tests/role-based-home-routing.test.ts (the Aug 14 rule this reuses):
 *
 *   1. The pure decision (lib/auth/staffRouting.ts), including the
 *      property that matters more than any single case: a path is
 *      staff-only or member-only and never both, so the two middleware
 *      gates can never fight over the same request.
 *   2. The real database, signing in as the actual seeded member, coach
 *      and administrator and routing them through the same hasActiveRole()
 *      the RLS policies use, so "a member is blocked" is proven against
 *      real role grants rather than a boolean someone typed here.
 *   3. The source itself, for what a runtime test cannot see: that no
 *      member-facing screen links to either tool anymore, that both pages
 *      re-check the role server-side and draw staff chrome, and that both
 *      are reachable from the staff dashboards.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TEST_USERS, signInAs } from './setup/test-clients';
import { hasActiveRole } from '../lib/auth/guards';
import {
  MEMBER_FALLBACK_PATH,
  STAFF_ONLY_PREFIXES,
  isMemberOnlyPath,
  isStaffOnlyPath,
  memberRedirectForStaffOnlyPath,
  staffRedirectFor,
} from '../lib/auth/staffRouting';

const ROOT = path.resolve(__dirname, '..');

const MEMBER = { isCoach: false, isAdmin: false };
const COACH = { isCoach: true, isAdmin: false };
const ADMIN = { isCoach: false, isAdmin: true };
const BOTH = { isCoach: true, isAdmin: true };

const EXERCISE_LIBRARY = '/exercises';
const MOVEMENT_PROFILE = '/movement/profile';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
}

describe('the staff-only route list', () => {
  it('covers exactly the two internal movement tools', () => {
    expect([...STAFF_ONLY_PREFIXES]).toEqual([EXERCISE_LIBRARY, MOVEMENT_PROFILE]);
  });

  it('claims each tool whole, including its subtree and its query string', () => {
    expect(isStaffOnlyPath(EXERCISE_LIBRARY)).toBe(true);
    expect(isStaffOnlyPath('/exercises/barbell-back-squat')).toBe(true);
    expect(isStaffOnlyPath('/exercises?q=squat')).toBe(true);
    expect(isStaffOnlyPath(MOVEMENT_PROFILE)).toBe(true);
  });

  it('does not swallow a sibling route that merely starts with the same letters', () => {
    expect(isStaffOnlyPath('/exercises-archive')).toBe(false);
    expect(isStaffOnlyPath('/movement/profiles-report')).toBe(false);
  });

  it('leaves the rest of the Movement section a member surface', () => {
    // The single most important line here. /movement is still the member's
    // own screen, and only the one child moved.
    expect(isMemberOnlyPath('/movement')).toBe(true);
    expect(isMemberOnlyPath('/movement/sessions')).toBe(true);
    expect(isMemberOnlyPath('/movement/session')).toBe(true);
    expect(isMemberOnlyPath('/movement/sessions/foundation')).toBe(true);
  });

  it('makes staff-only and member-only mutually exclusive, so the two gates cannot both claim a request', () => {
    for (const prefix of STAFF_ONLY_PREFIXES) {
      expect(isStaffOnlyPath(prefix)).toBe(true);
      expect(isMemberOnlyPath(prefix)).toBe(false);
    }
  });

  it('does not redirect a coach or an administrator off either tool by the member-only rule', () => {
    // The regression this guards: /movement/profile sits under the
    // /movement member prefix, so before the subtraction a coach opening
    // it was bounced to /coach by the rule meant for member screens.
    for (const roles of [COACH, ADMIN, BOTH]) {
      for (const tool of [EXERCISE_LIBRARY, MOVEMENT_PROFILE]) {
        expect(staffRedirectFor({ hasUser: true, ...roles, path: tool })).toBeNull();
      }
    }
  });
});

describe('who is turned away from an internal movement tool', () => {
  it('sends a member back to their own Movement screen, not a dead end', () => {
    expect(
      memberRedirectForStaffOnlyPath({ hasUser: true, ...MEMBER, path: EXERCISE_LIBRARY })
    ).toBe(MEMBER_FALLBACK_PATH);
    expect(
      memberRedirectForStaffOnlyPath({ hasUser: true, ...MEMBER, path: MOVEMENT_PROFILE })
    ).toBe(MEMBER_FALLBACK_PATH);
    expect(
      memberRedirectForStaffOnlyPath({ hasUser: true, ...MEMBER, path: '/exercises/deadlift' })
    ).toBe(MEMBER_FALLBACK_PATH);
  });

  it('lets a coach, an administrator, and an account holding both straight through', () => {
    for (const roles of [COACH, ADMIN, BOTH]) {
      expect(
        memberRedirectForStaffOnlyPath({ hasUser: true, ...roles, path: EXERCISE_LIBRARY })
      ).toBeNull();
      expect(
        memberRedirectForStaffOnlyPath({ hasUser: true, ...roles, path: MOVEMENT_PROFILE })
      ).toBeNull();
    }
  });

  it('never touches a signed-out request, so the sign-in redirect keeps running first', () => {
    expect(
      memberRedirectForStaffOnlyPath({ hasUser: false, ...MEMBER, path: EXERCISE_LIBRARY })
    ).toBeNull();
  });

  it('never touches a path that is not one of the two tools', () => {
    for (const path of ['/movement', '/dashboard', '/coach', '/food-lens', '/movement/sessions']) {
      expect(memberRedirectForStaffOnlyPath({ hasUser: true, ...MEMBER, path })).toBeNull();
    }
  });

  it('cannot loop: the destination is never itself a staff-only path', () => {
    expect(isStaffOnlyPath(MEMBER_FALLBACK_PATH)).toBe(false);
  });
});

describe('against the real role grants', () => {
  async function rolesFor(user: (typeof TEST_USERS)[keyof typeof TEST_USERS]) {
    const client = await signInAs(user);
    const [isCoach, isAdmin] = await Promise.all([
      hasActiveRole(client, user.id, 'coach'),
      hasActiveRole(client, user.id, 'platform_administrator'),
    ]);
    return { isCoach, isAdmin };
  }

  it('a real member cannot reach the Exercise Library or the Movement Profile', async () => {
    const roles = await rolesFor(TEST_USERS.memberOne);
    expect(roles).toEqual(MEMBER);

    for (const tool of [EXERCISE_LIBRARY, MOVEMENT_PROFILE]) {
      expect(memberRedirectForStaffOnlyPath({ hasUser: true, ...roles, path: tool })).toBe(
        MEMBER_FALLBACK_PATH
      );
    }
  });

  it('a real coach can reach both', async () => {
    const roles = await rolesFor(TEST_USERS.coachOne);
    expect(roles.isCoach).toBe(true);

    for (const tool of [EXERCISE_LIBRARY, MOVEMENT_PROFILE]) {
      expect(memberRedirectForStaffOnlyPath({ hasUser: true, ...roles, path: tool })).toBeNull();
    }
  });

  it('a real administrator can reach both', async () => {
    const roles = await rolesFor(TEST_USERS.adminOne);
    expect(roles.isAdmin).toBe(true);

    for (const tool of [EXERCISE_LIBRARY, MOVEMENT_PROFILE]) {
      expect(memberRedirectForStaffOnlyPath({ hasUser: true, ...roles, path: tool })).toBeNull();
    }
  });

  it('a member still keeps the rest of the Movement section', async () => {
    const roles = await rolesFor(TEST_USERS.memberOne);
    for (const memberPath of ['/movement', '/movement/sessions', '/movement/session']) {
      expect(memberRedirectForStaffOnlyPath({ hasUser: true, ...roles, path: memberPath })).toBeNull();
      expect(staffRedirectFor({ hasUser: true, ...roles, path: memberPath })).toBeNull();
    }
  });
});

describe('the middleware wiring', () => {
  const source = read('middleware.ts');

  it('runs the staff-only gate before the member-only rule', () => {
    const staffOnlyGate = source.indexOf('isStaffOnlyPath(path)');
    const memberOnlyGate = source.indexOf('isMemberOnlyPath(path)');
    expect(staffOnlyGate).toBeGreaterThan(-1);
    expect(memberOnlyGate).toBeGreaterThan(-1);
    expect(staffOnlyGate).toBeLessThan(memberOnlyGate);
  });

  it('redirects rather than rendering, using the shared decision', () => {
    expect(source).toContain('memberRedirectForStaffOnlyPath');
    expect(source).toContain('NextResponse.redirect(new URL(memberDestination, request.url))');
  });
});

describe('no member-facing surface points at either tool', () => {
  // Every member screen, plus the components a member screen can render.
  // Deliberately walks the whole tree rather than naming files: a link
  // added later to a screen nobody thought of is exactly the failure this
  // is for. The exercise-library components and the two tool pages
  // themselves are excluded, since they ARE the staff tool and link
  // within it.
  const EXCLUDED = [
    'app/exercises',
    'app/movement/profile',
    'app/coach',
    'app/admin',
    'components/exercise-library',
    'components/movement-profile',
  ];

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (EXCLUDED.some((ex) => rel === ex || rel.startsWith(`${ex}/`))) continue;
      if (entry.isDirectory()) walk(rel, out);
      else if (rel.endsWith('.tsx') || rel.endsWith('.ts')) out.push(rel);
    }
    return out;
  }

  const memberFiles = [...walk('app'), ...walk('components')];

  it('finds no member-side link, card, or route push to the Exercise Library', () => {
    // Matches an href/push to /exercises but never the /api/exercises data
    // route, which coach tooling legitimately fetches.
    const offenders = memberFiles.filter((file) =>
      /(?:href|push\()\s*=?\s*[{(]?\s*[`'"]\/exercises(?![a-z-])/.test(read(file))
    );
    expect(offenders).toEqual([]);
  });

  it('finds no member-side link to the Movement Profile', () => {
    const offenders = memberFiles.filter((file) => read(file).includes('/movement/profile'));
    expect(offenders).toEqual([]);
  });

  it('leaves the member Movement dashboard with neither card', () => {
    const movement = read('app/movement/page.tsx');
    expect(movement).not.toContain("href={'/exercises' as Route}");
    expect(movement).not.toContain("href={'/movement/profile' as Route}");
    // Root Movement, the one member entry that remains, is untouched.
    expect(movement).toContain("href={'/movement/sessions' as Route}");
  });
});

describe('the two tool pages themselves', () => {
  const pages = ['app/exercises/page.tsx', 'app/exercises/[id]/page.tsx', 'app/movement/profile/page.tsx'];

  it('each re-checks the role server-side, so middleware is not the only line', () => {
    for (const page of pages) {
      expect(read(page)).toContain('requireStaffForInternalTool');
    }
  });

  it('each draws staff navigation, never the member bottom bar', () => {
    for (const page of pages) {
      const source = read(page);
      expect(source).toContain('<StaffNav');
      expect(source).not.toContain('<BottomNav');
    }
  });
});

describe('nothing was lost from the staff platform', () => {
  it('the coach dashboard reaches both tools', () => {
    const coach = read('app/coach/page.tsx');
    expect(coach).toContain("href={'/exercises' as Route}");
    expect(coach).toContain("href={'/movement/profile' as Route}");
  });

  it('the admin dashboard reaches both tools, for an administrator who is not also a coach', () => {
    const admin = read('app/admin/page.tsx');
    expect(admin).toContain("href={'/exercises' as Route}");
    expect(admin).toContain("href={'/movement/profile' as Route}");
  });

  it("the coach's per-client Movement Profile panel is untouched", () => {
    // The real per-client tool, and the one a coach actually works in. It
    // was never on the member side and nothing here should have moved it.
    expect(fs.existsSync(path.join(ROOT, 'app/coach/clients/[id]/MovementProfilePanel.tsx'))).toBe(
      true
    );
    expect(read('app/coach/clients/[id]/page.tsx')).toContain('MovementProfilePanel');
  });

  it('a coach-assigned program still renders its exercises inline, with no trip through the library', () => {
    // Requirement: a member keeps the media and cues for exercises her
    // coach prescribed. Those render in place; neither component routes to
    // /exercises, so removing the library takes nothing from her program.
    for (const component of [
      'components/movement/MovementExerciseCard.tsx',
      'components/movement-sessions/MovementSessionPlayer.tsx',
    ]) {
      expect(read(component)).not.toMatch(/[`'"]\/exercises/);
    }
  });
});
