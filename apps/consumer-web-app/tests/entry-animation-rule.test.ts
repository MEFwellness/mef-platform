/**
 * Branded "Reset" entry animation — pure unit tests for the session-entry
 * rule (lib/entry-animation/rule.ts) and its stage timing budget
 * (lib/entry-animation/timing.ts). No database, no cookies, no Next.js
 * runtime involved — middleware.ts and app/layout.tsx are thin,
 * untested-here wiring around this pure logic, same split the dashboard
 * prioritization tests use for lib/dashboard/*.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  decideEntryAnimationPlay,
  isEntryAnimationExcludedPath,
  ENTRY_ANIMATION_REOPEN_THRESHOLD_MS,
} from '../lib/entry-animation/rule';
import {
  RESET_ENTRY_TOTAL_MS,
  RESET_ENTRY_REDUCED_TOTAL_MS,
  RESET_ENTRY_SAFE_TIMEOUT_MS,
  RESET_ENTRY_NAME_WAIT_MS,
} from '../lib/entry-animation/timing';
import { resetEntryGreetingLines } from '../lib/entry-animation/greeting';

const NOW = 1_700_000_000_000;

function baseInput(overrides: Partial<Parameters<typeof decideEntryAnimationPlay>[0]> = {}) {
  return {
    hasUser: true,
    path: '/dashboard',
    isPublicPath: false,
    justLoggedIn: false,
    lastActiveAtMs: NOW - 60_000, // one minute ago — ordinary active browsing
    nowMs: NOW,
    ...overrides,
  };
}

describe('decideEntryAnimationPlay — given state X, the decision is always Y', () => {
  it('never plays for a signed-out request, regardless of every other signal', () => {
    expect(
      decideEntryAnimationPlay(baseInput({ hasUser: false, justLoggedIn: true, lastActiveAtMs: null }))
    ).toBe(false);
  });

  it('always plays immediately after a fresh sign-in', () => {
    expect(decideEntryAnimationPlay(baseInput({ justLoggedIn: true }))).toBe(true);
  });

  it('plays when there is no prior activity recorded at all (a genuinely fresh/reopened browsing context)', () => {
    expect(decideEntryAnimationPlay(baseInput({ lastActiveAtMs: null }))).toBe(true);
  });

  it('does not play during ordinary active browsing (a small gap since the last request)', () => {
    expect(decideEntryAnimationPlay(baseInput({ lastActiveAtMs: NOW - 60_000 }))).toBe(false);
  });

  it('does not play on a gap just under the reopen threshold', () => {
    expect(
      decideEntryAnimationPlay(
        baseInput({ lastActiveAtMs: NOW - (ENTRY_ANIMATION_REOPEN_THRESHOLD_MS - 1000) })
      )
    ).toBe(false);
  });

  it('plays on a gap at or over the reopen threshold — "closed or backgrounded for a meaningful period"', () => {
    expect(
      decideEntryAnimationPlay(baseInput({ lastActiveAtMs: NOW - ENTRY_ANIMATION_REOPEN_THRESHOLD_MS }))
    ).toBe(true);
    expect(
      decideEntryAnimationPlay(
        baseInput({ lastActiveAtMs: NOW - ENTRY_ANIMATION_REOPEN_THRESHOLD_MS - 1 })
      )
    ).toBe(true);
  });

  it('never plays on a public/pre-auth path even with a login flag set', () => {
    expect(
      decideEntryAnimationPlay(baseInput({ isPublicPath: true, justLoggedIn: true, path: '/login' }))
    ).toBe(false);
  });

  for (const path of [
    '/welcome',
    '/onboarding',
    '/onboarding/some-step',
    '/name',
    '/coach',
    '/coach/clients/123',
    '/admin',
    '/admin/users',
  ]) {
    it(`never plays under the excluded first-run/coach/admin area: ${path}`, () => {
      expect(decideEntryAnimationPlay(baseInput({ path, justLoggedIn: true, lastActiveAtMs: null }))).toBe(
        false
      );
    });
  }

  it('does play on an ordinary member-area path with a real gap', () => {
    expect(decideEntryAnimationPlay(baseInput({ path: '/progress', lastActiveAtMs: null }))).toBe(true);
  });
});

describe('isEntryAnimationExcludedPath', () => {
  it('matches an excluded prefix exactly and as a sub-path', () => {
    expect(isEntryAnimationExcludedPath('/coach')).toBe(true);
    expect(isEntryAnimationExcludedPath('/coach/dashboard')).toBe(true);
  });

  it('does not false-positive on an unrelated path that merely starts with the same letters', () => {
    // "/coaching" must not be treated as under "/coach"
    expect(isEntryAnimationExcludedPath('/coaching')).toBe(false);
  });

  it('does not exclude ordinary member-area paths', () => {
    expect(isEntryAnimationExcludedPath('/dashboard')).toBe(false);
    expect(isEntryAnimationExcludedPath('/checkin')).toBe(false);
    expect(isEntryAnimationExcludedPath('/case')).toBe(false);
  });
});

describe('entry animation stage timing budget (brief: 3.2-3.8s, never over 4s)', () => {
  it('the full sequence totals within the required 3.2s-3.8s window', () => {
    expect(RESET_ENTRY_TOTAL_MS).toBeGreaterThanOrEqual(3200);
    expect(RESET_ENTRY_TOTAL_MS).toBeLessThanOrEqual(3800);
  });

  it('the full sequence never exceeds the 4s hard ceiling', () => {
    expect(RESET_ENTRY_TOTAL_MS).toBeLessThan(4000);
  });

  it('even the worst case (first name not yet resolved by Stage 4) stays under the 4s hard ceiling', () => {
    // Regression guard: an earlier version always added
    // RESET_ENTRY_NAME_WAIT_MS to Exit/finish's scheduled delay, even when
    // no wait ever actually happened (the name was already resolved),
    // pushing the *common* case to ~4.4s — confirmed directly against a
    // real production login. RootResetEntryAnimation.tsx now schedules
    // Exit/finish relative to when Welcome actually starts, so
    // RESET_ENTRY_NAME_WAIT_MS only ever adds to the *worst* case.
    expect(RESET_ENTRY_TOTAL_MS + RESET_ENTRY_NAME_WAIT_MS).toBeLessThan(4000);
  });

  it('the reduced-motion sequence totals roughly 1-1.5s', () => {
    expect(RESET_ENTRY_REDUCED_TOTAL_MS).toBeGreaterThanOrEqual(1000);
    expect(RESET_ENTRY_REDUCED_TOTAL_MS).toBeLessThanOrEqual(1500);
  });

  it('the safe timeout backstop always fires after the full sequence would naturally finish', () => {
    expect(RESET_ENTRY_SAFE_TIMEOUT_MS).toBeGreaterThan(RESET_ENTRY_TOTAL_MS);
  });
});

describe('resetEntryGreetingLines — Stage 4 copy', () => {
  it('greets a member by first name when one is known', () => {
    expect(resetEntryGreetingLines('Jamie')).toEqual(['Welcome back, Jamie.', "Let's begin your reset."]);
  });

  it('falls back to the generic greeting when there is no first name', () => {
    expect(resetEntryGreetingLines(null)).toEqual(['Welcome back.', "Let's begin your reset."]);
  });

  it('falls back to the generic greeting while the name is still loading (undefined)', () => {
    expect(resetEntryGreetingLines(undefined)).toEqual(['Welcome back.', "Let's begin your reset."]);
  });

  it('falls back to the generic greeting for a blank/whitespace-only name', () => {
    expect(resetEntryGreetingLines('   ')).toEqual(['Welcome back.', "Let's begin your reset."]);
  });

  it('trims stray whitespace around a real name', () => {
    expect(resetEntryGreetingLines('  Jamie  ')).toEqual(['Welcome back, Jamie.', "Let's begin your reset."]);
  });
});
