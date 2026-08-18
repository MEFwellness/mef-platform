/**
 * /api/exercises is a coaching tool, and a member gets 403 from it.
 *
 * WHY THIS IS A SOURCE TEST AND NOT A FETCH. The route handler calls
 * createClient() from lib/supabase/server, which reads cookies() from
 * next/headers and throws outside a Next request scope, so it cannot be
 * invoked from vitest. Booting a Next server inside the unit suite to
 * assert one status code would be a large amount of machinery for a
 * three-line branch. So the branch is asserted here at the source, the
 * role lookup it depends on is asserted for real against the database
 * below, and the 403 itself is confirmed against the running site as part
 * of the live verification.
 *
 * THE SECOND ROUTE IS THE INTERESTING ONE. /api/exercises/[id]/video-url
 * sits underneath the same path and must NOT be gated this way: it is what
 * a member taps to play an exercise in a Root Movement session. A guard
 * that took the whole subtree would break the only member surface that
 * plays video, so this file asserts that route stays open to a member on
 * purpose rather than by omission.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TEST_USERS, signInAs } from './setup/test-clients';
import { hasActiveRole } from '../lib/auth/guards';

const ROOT = path.resolve(__dirname, '..');
const LIST_ROUTE = 'app/api/exercises/route.ts';
const VIDEO_ROUTE = 'app/api/exercises/[id]/video-url/route.ts';

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

describe('the catalog search route', () => {
  const src = read(LIST_ROUTE);

  it('asks the database which roles the caller holds', () => {
    expect(src).toContain('hasActiveRole');
    expect(src).toContain("'coach'");
    expect(src).toContain("'platform_administrator'");
  });

  it('answers 403 to anyone who holds neither', () => {
    expect(src).toMatch(/if\s*\(!isCoach\s*&&\s*!isAdmin\)/);
    expect(src).toContain('status: 403');
  });

  it('checks the role before it reads a single row', () => {
    const roleCheck = src.indexOf('status: 403');
    const firstRead = Math.min(
      ...['listDistinctCatalogValues', 'searchExerciseCatalog']
        .map((fn) => src.indexOf(`await ${fn}`))
        .filter((i) => i >= 0)
    );
    expect(roleCheck).toBeGreaterThan(0);
    expect(roleCheck).toBeLessThan(firstRead);
  });

  it('still answers 401 rather than 403 to someone with no session at all', () => {
    expect(src).toContain('UNAUTHENTICATED');
    expect(src).toContain('status: 401');
    expect(src.indexOf('status: 401')).toBeLessThan(src.indexOf('status: 403'));
  });
});

describe('the tap-to-play route underneath it', () => {
  const src = read(VIDEO_ROUTE);

  it('is deliberately not role-gated, because a member plays video through it', () => {
    expect(src).not.toContain('hasActiveRole');
    expect(src).not.toContain('status: 403');
  });

  it('still requires a session', () => {
    expect(src).toContain('status: 401');
  });
});

describe('the role lookup the gate relies on, against the real database', () => {
  it('says no for the seeded member', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    expect(await hasActiveRole(member, TEST_USERS.memberOne.id, 'coach')).toBe(false);
    expect(await hasActiveRole(member, TEST_USERS.memberOne.id, 'platform_administrator')).toBe(
      false
    );
  });

  it('says yes for the seeded coach and the seeded administrator', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    expect(await hasActiveRole(coach, TEST_USERS.coachOne.id, 'coach')).toBe(true);

    const admin = await signInAs(TEST_USERS.adminOne);
    expect(await hasActiveRole(admin, TEST_USERS.adminOne.id, 'platform_administrator')).toBe(true);
  });
});
