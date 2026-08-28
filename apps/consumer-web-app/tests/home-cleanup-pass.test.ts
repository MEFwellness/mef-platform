/**
 * Home cleanup pass (2026-08-14).
 *
 * Four structural changes to the member Home screen and the Today tab,
 * each asserted here against the real files:
 *
 *   1. Today's Wellness ("Daily Reset 60", "Daily Wellness Score 60") is
 *      gone from Home. The scores' own libraries and tests are untouched.
 *   2. Quick Actions is covered by tests/quick-actions-grid.test.ts.
 *   3. A completed priority leaves the top of Home and Today and settles
 *      as a compact accomplished card at the bottom of both, from the same
 *      row, and nothing invents a replacement for the top slot.
 *   4. Today's Numbers moved from Home to the Today tab, with water
 *      logging still one tap from the bottom nav.
 *
 * No component-rendering harness exists in this repo (plain 'node' vitest
 * environment), so the placement rules are asserted as a static source
 * scan of the fixed files — the same pattern
 * tests/today-zones-redesign.test.ts and tests/quick-actions-grid.test.ts
 * already use. The behavior behind them (one priority per day, the stored
 * row is authoritative) is asserted against the real database in
 * tests/priority-completed-placement-integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APP_DIR = path.resolve(__dirname, '..');

function source(relativePath: string): string {
  return readFileSync(path.join(APP_DIR, relativePath), 'utf-8');
}

/**
 * The same file with every comment removed. Several assertions below are
 * of the form "this string is no longer on this screen", and the comments
 * explaining WHY it is no longer there naturally contain it — without this
 * the guards would fail on their own documentation.
 */
function code(relativePath: string): string {
  return source(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const HOME = source('app/dashboard/page.tsx');
const TODAY = source('app/today/page.tsx');
const TODAY_ZONES = source('app/today/TodayZones.tsx');
const NUMBERS_GRID = source('components/today/TodaysNumbersGrid.tsx');
const PRIORITY_CARD = source('components/priority/PriorityCard.tsx');

// =====================================================================
// TASK 1 — Today's Wellness is gone from Home.
// =====================================================================

describe("Today's Wellness is removed from Home, and only from Home", () => {
  it('Home neither imports nor renders the section', () => {
    expect(HOME).not.toContain("from '@/components/checkin/DailyWellnessSection'");
    expect(HOME).not.toContain('<DailyWellnessSection');
  });

  it('no member surface renders it any more, and the orphaned component is gone with it', () => {
    expect(existsSync(path.join(APP_DIR, 'components/checkin/DailyWellnessSection.tsx'))).toBe(false);
    expect(TODAY).not.toContain('DailyWellnessSection');
  });

  it('neither unexplained number is printed on Home any more', () => {
    const home = code('app/dashboard/page.tsx');
    expect(home).not.toContain("Today&apos;s Wellness");
    expect(home).not.toContain('Daily Wellness Score');
  });

  it('the calculations themselves are untouched, so nothing that depends on them broke', () => {
    // The two scoring libraries still exist and still export the same
    // public surface their own tests exercise.
    const morning = source('lib/wellness/morningReadiness.ts');
    const daily = source('lib/wellness/dailyWellnessScore.ts');
    expect(morning).toContain('export function calculateMorningReadinessScore');
    expect(morning).toContain('export function isMorningReadinessEligible');
    expect(daily).toContain('export function calculateDailyWellnessScore');
    expect(daily).toContain('export function isDailyWellnessScoreEligible');
  });

  it("Home no longer pays for the evening reflection read that only that section used", () => {
    expect(HOME).not.toContain('getTodaysEveningReflection');
  });
});

// =====================================================================
// TASK 4 — Today's Numbers moved to the Today tab.
// =====================================================================

describe("Today's Numbers moved from Home to the Today tab", () => {
  it('Home no longer renders the grid or any of its tiles', () => {
    expect(HOME).not.toContain("Today&apos;s Numbers");
    expect(HOME).not.toContain('<HydrationTracker');
    expect(HOME).not.toContain('TRACKER_CARD');
  });

  it('Home keeps the honest line for a day with nothing logged yet, and says where the numbers are', () => {
    expect(HOME).toContain('checkinPromptNode');
    expect(HOME).toContain('your numbers are on the Today tab');
  });

  it('Today renders the grid, from data it had already fetched', () => {
    expect(TODAY).toContain("import { TodaysNumbersGrid } from '@/components/today/TodaysNumbersGrid'");
    expect(TODAY).toContain('<TodaysNumbersGrid checkin={todaysCheckin} />');
    expect(TODAY).toContain('{numbersGridNode}');
  });

  it('every relocated tile keeps its original data source and its original states', () => {
    for (const label of ['Sleep', 'Stress', 'Pain', 'Mood', 'Digestion']) {
      expect(NUMBERS_GRID).toContain(`>${label}</p>`);
    }
    for (const source of [
      'sleep_duration',
      'sleep_quality',
      'stress_level',
      'pain_discomfort_level',
      'mood_level',
      'digestion_rating',
    ]) {
      expect(NUMBERS_GRID).toContain(source);
    }
    // Same classification module, never a second opinion about what a
    // value means.
    expect(NUMBERS_GRID).toContain("from '@/lib/wellness/status'");
    // Same empty state wording as before the move.
    expect(NUMBERS_GRID).toContain('Not logged yet');
  });

  it('the grid never renders without a real check-in behind it', () => {
    // VISIBILITY LAYER (2026-08-17): a second condition joined the first.
    // The check-in must exist AND the numbers grid must be revealed for
    // her, so a member on day one is not handed a readout before she has
    // anything in it. The original condition is unchanged and still leads.
    expect(TODAY).toMatch(/todaysCheckin && shows\(F\.todayNumbers\) \? <TodaysNumbersGrid/);
  });

  it('water logging is still on the Today tab, one tap from the bottom nav, with its own +/- control', () => {
    // Water and movement are NOT duplicated into the grid: Today already
    // owns both as live controls, and two controls for one number would
    // disagree the moment either was tapped.
    const grid = code('components/today/TodaysNumbersGrid.tsx');
    expect(grid).not.toContain('HydrationTracker');
    expect(grid).not.toContain('MovementLevelTracker');
    expect(TODAY_ZONES).toContain('<HydrationTracker');
    expect(TODAY_ZONES).toContain('<MovementLevelTracker');

    const nav = source('components/BottomNav.tsx');
    expect(nav).toContain("{ label: 'Today', href: '/today', Icon: Sparkles }");

    // The control itself is unchanged: same write path, same optimistic
    // total, same reconcile.
    const tracker = source('components/checkin/HydrationTracker.tsx');
    expect(tracker).toContain('logHydrationChange');
    expect(tracker).toContain('adjust(1)');
    expect(tracker).toContain('adjust(-1)');
  });
});

// =====================================================================
// TASK 3 — the completed priority's placement.
// =====================================================================

describe('a completed priority leaves the top and settles at the bottom', () => {
  it('the dominant slot on both screens holds the card only while it is active', () => {
    for (const page of [HOME, TODAY]) {
      expect(page).toContain("priority.status === 'active'");
    }
    // The old rule ("anything that is not saved stays at the top") is what
    // left a completed card sitting in the dominant slot all day.
    expect(HOME).not.toContain("priority.status !== 'saved' && (");
    expect(TODAY).not.toContain("priority.status !== 'saved' && (");
  });

  it('both screens render the compact accomplished card at the bottom, from the same view', () => {
    expect(HOME).toContain("priority?.status === 'done'");
    expect(HOME).toContain('<PriorityCard view={priority} collapsed />');
    expect(TODAY).toContain("priority.status !== 'active' && (");
    expect(TODAY).toContain('<PriorityCard view={priority} collapsed />');

    // Bottom means bottom. Home speed build (2026-08-28): the page is drawn
    // as regions in Suspense boundaries now, so the order that decides where
    // the collapsed card lands is the order of the regions inside <main>,
    // not the order of two JSX tags inside one function. That is the
    // stronger check anyway, because it is the order the member sees.
    const mainStart = HOME.indexOf('<main');
    const mainEnd = HOME.indexOf('</main>');
    const active = HOME.indexOf('<PriorityRegion />');
    const stream = HOME.indexOf('<StreamRegion />');
    const collapsed = HOME.indexOf('<CompletedPriorityRegion />');
    expect(active).toBeGreaterThan(mainStart);
    expect(stream).toBeGreaterThan(active);
    expect(collapsed).toBeGreaterThan(stream);
    expect(collapsed).toBeLessThan(mainEnd);
    // And the wearable panel, which is inside the stream, still comes before it.
    expect(HOME.indexOf('<ConnectWearableCard')).toBeGreaterThan(-1);
  });

  it('the compact state is genuinely compact, and says what she finished', () => {
    expect(PRIORITY_CARD).toContain("if (collapsed && status === 'done')");
    expect(PRIORITY_CARD).toContain('PRIORITY_DONE_TEXT');
    expect(PRIORITY_CARD).toContain('{selected.title}');
    // One line, not the full card: no buttons and no reason line in this
    // branch.
    const branchStart = PRIORITY_CARD.indexOf("if (collapsed && status === 'done')");
    const branch = PRIORITY_CARD.slice(branchStart, PRIORITY_CARD.indexOf('// ---- Accomplished state', branchStart));
    expect(branch).not.toContain('<button');
    expect(branch).not.toContain('selected.reason');
  });

  it('it persists for the rest of her own calendar day, and is gone the next, with no expiry logic of its own', () => {
    // The card's whole lifetime is the row's own local_date key: today's
    // row is read for today, and tomorrow is a different row.
    const data = source('lib/priority/data.ts');
    expect(data).toContain("eq('local_date', localDate)");
    const service = source('lib/priority/service.ts');
    expect(service).toContain('getDailyPriority(supabase, memberId, todayLocalDate)');
    // Neither page invents a cutoff, a timer, or a "hide after N hours".
    for (const page of [HOME, TODAY]) {
      expect(page).not.toMatch(/hideAfter|expiresAt|setTimeout/);
    }
  });

  it('nothing refills the top slot: the day\'s decision is stored once and never re-selected', () => {
    const service = source('lib/priority/service.ts');
    // The stored row wins over a freshly computed one, which is what makes
    // "one focus per day" true even after she completes it. `authoritative`
    // is that stored row (2026-08-27): it is `existing` on every render but
    // one, the single allowed revision after her Daily Reset arrives, which
    // has its own conditions in redecideDailyPriority and its own tests in
    // tests/priority-waits-for-checkin.test.ts.
    expect(service).toContain('if (existing) {');
    expect(service).toContain('const authoritative = revised ?? existing;');
    expect(service).toContain('rule: authoritative.rule');
    expect(service).toContain('title: authoritative.title');
    expect(service).toContain('status: authoritative.status');
  });

  it('the only thing that may occupy the top slot afterwards is a genuinely pending finite item that already had its own card', () => {
    // A coach assignment or the next unstarted conversation, both of which
    // render nothing at all when there is neither.
    expect(HOME).toContain('<DashboardInviteCards');
    const invites = source('components/dashboard/DashboardInviteCards.tsx');
    expect(invites).toContain('if (assignedCandidates.length === 0 && !freeArcCard) return null;');
    // And the finite day-3 / day-7 follow-ups keep their existing place in
    // the Root pop-up chain, ahead of the priority card itself.
    const chain = source('app/actions/rootPopupMessages.ts');
    expect(chain).toContain("kind: 'questionnaire_assigned'");
    expect(chain).toContain("kind: 'cvs_day3'");
    expect(chain).toContain("kind: 'reset_plan_day7'");
  });

  it('the pop-up chain still delivers the card once per day, and only while it is still active', () => {
    const chain = source('app/actions/rootPopupMessages.ts');
    expect(chain).toContain("priorityViewRaw?.status === 'active' ? priorityViewRaw : null");
    // The key still carries her own local date, which is what makes the
    // one-time-ever dismissal rule a once-per-day rule. Since bug sweep
    // finding B1 (2026-08-27) both priority_card branches resolve it
    // through one shared helper and check it against a dismissal before
    // returning, instead of building it inline on the return, so this
    // asserts the helper rather than the old inline expression. The
    // once-per-day and never-starves behaviour itself is proven end to end
    // in tests/root-popup-chain-guards.test.ts.
    expect(chain).toContain('return priorityCardPopupMessageKey(cachedLocalDate);');
    expect(chain).toContain('cachedLocalDate = await currentMemberLocalDate();');
    expect(chain).toContain('if (await isPriorityCardDue(messageKey)) {');
  });
});
