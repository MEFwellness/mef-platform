/**
 * Today page full redesign (2026-07-27) — "one list, two zones."
 *
 * Forward Zone: the merged focus card (untouched, see
 * today-focus-merge-and-checkin-cta.test.ts) leads, followed by open
 * quick actions (check-in / water / movement / habits / unread coach
 * messages) from app/today/TodayZones.tsx. Accomplished Zone: Done Today,
 * then cumulative totals, then earned capability — in that order, per the
 * brief. The two assessment cards (Guided Posture & Movement Assessment,
 * Comprehensive Health Assessment / "Personalized Insights") are removed
 * from Today entirely, since both already live on Home
 * (app/dashboard/page.tsx) with their own real paths to the assessment
 * and its results.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so these are static source scans of the fixed
 * files; live behavior (the zone-travel/tick-up/unlock animations, the
 * thin-data screenshots) was verified via Playwright, reported
 * separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const TODAY_PAGE = source('app/today/page.tsx');
const TODAY_ZONES = source('app/today/TodayZones.tsx');
const DASHBOARD_PAGE = source('app/dashboard/page.tsx');
const CAPABILITY = source('lib/today/capability.ts');
const CHECKIN_ACTIONS = source('app/actions/checkin.ts');
const EVIDENCE = source('lib/correlation-engine/evidence.ts');

describe('Today page: the two assessment cards are removed, with a confirmed path still on Home', () => {
  it('MovementAssessmentCard and ComprehensiveAssessmentCard are no longer imported or rendered on Today', () => {
    expect(TODAY_PAGE).not.toContain('MovementAssessmentCard');
    expect(TODAY_PAGE).not.toContain('ComprehensiveAssessmentCard');
  });

  it('both cards are still rendered on the Home dashboard, so removing them from Today does not remove any member\'s path to the assessment or its results', () => {
    expect(DASHBOARD_PAGE).toContain('<MovementAssessmentCard');
    expect(DASHBOARD_PAGE).toContain('<ComprehensiveAssessmentCard');
  });

  it('the standalone TodayHabits card is gone — its per-habit rows are folded into TodayZones instead', () => {
    expect(TODAY_PAGE).not.toContain('TodayHabits');
  });
});

describe('TodayZones: Forward Zone shrinks and collapses to one line, never an empty container', () => {
  it('quick actions are gated on being open: check-in, water, movement, habits, and unread coach messages', () => {
    expect(TODAY_ZONES).toContain('!todaysCheckinDone');
    expect(TODAY_ZONES).toContain('!waterLoggedToday');
    expect(TODAY_ZONES).toContain('!movementLoggedToday');
    expect(TODAY_ZONES).toContain('openHabits.length > 0');
    expect(TODAY_ZONES).toContain('notifications.length > 0');
  });

  it('collapses to a small done-for-today line, not an empty card, once every quick action is handled', () => {
    expect(TODAY_ZONES).toContain('hasOpenQuickActions');
    expect(TODAY_ZONES).toContain("You&apos;re all set for today.");
  });

  it('a scheduled-session time-bound item was NOT invented — no such data source exists in this codebase', () => {
    expect(TODAY_ZONES).not.toMatch(/scheduled.?session/i);
  });
});

describe('TodayZones: Accomplished Zone order — Done Today, then Totals, then Earned Capability', () => {
  it('the three sections appear in the required order', () => {
    const doneIdx = TODAY_ZONES.indexOf('Done Today');
    const totalsIdx = TODAY_ZONES.indexOf('Your Totals');
    const capabilityIdx = TODAY_ZONES.indexOf("What's Next");
    expect(doneIdx).toBeGreaterThan(-1);
    expect(totalsIdx).toBeGreaterThan(doneIdx);
    expect(capabilityIdx).toBeGreaterThan(totalsIdx);
  });

  it('Done Today only renders once something is actually done today — no stranded heading at zero', () => {
    expect(TODAY_ZONES).toContain('doneTodayCount > 0 && (');
  });

  it('Cumulative Totals and Earned Capability are unconditional (day-one safe: a member with just 1 check-in still sees real, non-zero content)', () => {
    // Unlike Done Today (gated on `doneTodayCount > 0 && (`), neither the
    // Totals nor the Capability <section> is wrapped in its own truthy-count
    // guard — within the Accomplished Zone (from its marker comment
    // onward), the only such guard present at all is Done Today's.
    const accomplishedZone = TODAY_ZONES.slice(TODAY_ZONES.indexOf('ACCOMPLISHED ZONE'));
    const countGuards = accomplishedZone.match(/\w+(?:Count|\.length)\s*>\s*0\s*&&\s*\(/g) ?? [];
    expect(countGuards).toEqual(['doneTodayCount > 0 && (']);
  });
});

describe('Nothing forbidden: no streaks, no adherence percentages, no red-for-zero', () => {
  it('no streak or consecutive-day language anywhere in the new component', () => {
    expect(TODAY_ZONES.toLowerCase()).not.toMatch(/streak/);
    expect(TODAY_ZONES.toLowerCase()).not.toMatch(/in a row/);
    expect(TODAY_ZONES.toLowerCase()).not.toMatch(/consecutive/);
  });

  it('cumulative totals are never rendered as "X of Y" or a percentage', () => {
    expect(TODAY_ZONES).not.toMatch(/totalCheckins\s*\/\s*/);
    expect(TODAY_ZONES).not.toMatch(/cumulativeMovementDays\s*\/\s*/);
    expect(TODAY_ZONES).not.toContain('%');
  });

  it('cumulative totals only ever increase — no decrement path exists for either counter', () => {
    expect(TODAY_ZONES).not.toMatch(/setCumulativeMovementDays\([^)]*-\s*1/);
    expect(TODAY_ZONES).not.toMatch(/totalCheckins\s*-/);
  });
});

describe('Earned Capability: real thresholds from the correlation engine, not invented numbers', () => {
  it('lib/today/capability.ts imports the real gate constant rather than hardcoding a copy of it', () => {
    expect(CAPABILITY).toContain("import { MIN_PAIRED_OBSERVATIONS } from '@/lib/correlation-engine/evidence'");
    expect(CAPABILITY).toContain('CAPABILITY_LOG_DAYS_REQUIRED = MIN_PAIRED_OBSERVATIONS');
  });

  it('the correlation engine really does declare MIN_PAIRED_OBSERVATIONS as a named constant (the import target actually exists)', () => {
    expect(EVIDENCE).toContain('export const MIN_PAIRED_OBSERVATIONS = 21');
  });

  it('the capability card is framed as remaining logging, not a fraction or a percentage', () => {
    expect(TODAY_ZONES).toContain('capability.remaining');
    expect(TODAY_ZONES).not.toMatch(/capability\.loggedDays\s*\/\s*capability\.required/);
  });

  it('the one-time unlock celebration is localStorage-gated so it never replays on a later page load', () => {
    expect(TODAY_ZONES).toContain('mef_today_capability_unlocked_seen');
    expect(TODAY_ZONES).toContain('window.localStorage.getItem(CAPABILITY_SEEN_KEY)');
  });
});

describe('Cumulative totals: all-time counts, not a windowed read', () => {
  it('getTotalCheckinCount and getTotalMovementLoggedDaysCount are real count queries with no .limit(...) window', () => {
    const checkinFnIdx = CHECKIN_ACTIONS.indexOf('export async function getTotalCheckinCount');
    const checkinFnBody = CHECKIN_ACTIONS.slice(checkinFnIdx, CHECKIN_ACTIONS.indexOf('\n}', checkinFnIdx));
    expect(checkinFnBody).toContain("{ count: 'exact', head: true }");
    expect(checkinFnBody).not.toContain('.limit(');

    const movementFnIdx = CHECKIN_ACTIONS.indexOf('export async function getTotalMovementLoggedDaysCount');
    const movementFnBody = CHECKIN_ACTIONS.slice(movementFnIdx, CHECKIN_ACTIONS.indexOf('\n}', movementFnIdx));
    expect(movementFnBody).toContain("{ count: 'exact', head: true }");
    expect(movementFnBody).not.toContain('.limit(');
  });

  it('total check-ins and total days logged collapse to the same real number in this schema, so "Your Totals" shows exactly two stat tiles, not three (no fabricated duplicate)', () => {
    const totalsSection = TODAY_ZONES.slice(
      TODAY_ZONES.indexOf('Your Totals'),
      TODAY_ZONES.indexOf('mef-scale-settle')
    );
    expect(totalsSection).toContain('Check-in logged');
    expect(totalsSection).toContain('Check-ins logged');
    const tickingNumberCount = (totalsSection.match(/<TickingNumber/g) ?? []).length;
    expect(tickingNumberCount).toBe(2);
  });
});

describe('Reduced motion: all three animations degrade to their end state instantly', () => {
  it('the zone-travel FLIP checks prefers-reduced-motion before applying any transform', () => {
    const flipFnIdx = TODAY_ZONES.indexOf('function useZoneTravelFlip');
    const flipFnBody = TODAY_ZONES.slice(flipFnIdx, TODAY_ZONES.indexOf('\n}', TODAY_ZONES.indexOf('return (key: string)', flipFnIdx)));
    expect(flipFnBody).toContain('prefersReducedMotion()');
  });

  it('the cumulative count-up (TickingNumber) checks prefers-reduced-motion and jumps straight to the new value', () => {
    const tickingIdx = TODAY_ZONES.indexOf('function TickingNumber');
    const tickingBody = TODAY_ZONES.slice(tickingIdx, TODAY_ZONES.indexOf('\nfunction useCapabilityJustUnlocked'));
    expect(tickingBody).toContain('prefersReducedMotion()');
    expect(tickingBody).toContain('setDisplay(to)');
  });

  it('the count-up never plays on first mount — only on a later change — so reopening the app does not replay it', () => {
    const tickingIdx = TODAY_ZONES.indexOf('function TickingNumber');
    const tickingBody = TODAY_ZONES.slice(tickingIdx, TODAY_ZONES.indexOf('\nfunction useCapabilityJustUnlocked'));
    expect(tickingBody).toContain('if (!mounted.current)');
  });

  it('the capability-unlock celebration reuses an existing, already reduced-motion-safe keyframe rather than adding new decorative motion', () => {
    const globalsCss = source('app/globals.css');
    expect(TODAY_ZONES).toContain("justUnlocked ? 'mef-scale-settle' : ''");
    expect(globalsCss).toMatch(/\.mef-scale-settle\s*\{[\s\S]*?\}/);
    expect(globalsCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.mef-scale-settle/);
  });
});
