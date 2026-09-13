/**
 * HOME — QUICK ACTIONS, the compact row under the hero (editorial pass,
 * 2026-09-13).
 *
 * WHAT THIS FILE USED TO HOLD, and why almost all of it had to change.
 * It pinned a treatment that no longer exists: two `rounded-full` capsule
 * pills in a `grid-cols-2`, explicitly NOT scrolling and explicitly NOT
 * snapping, with a gradient icon tile inside each. That shape was the
 * subject of the assertions, so a pass that deliberately replaces the
 * shape cannot keep them. What is kept, assertion for assertion, is every
 * rule underneath the shape, because those are the ones that were about
 * truthfulness rather than about pixels:
 *
 *   - each door is decided by that feature's own visibility rule, never
 *     drawn unconditionally, and the row disappears when none survive;
 *   - no status is invented, and the Case tile still carries no
 *     completion fraction borrowed from the questionnaire count (C2);
 *   - nothing competes with a real status line for the tile's narrow
 *     width, which is why the status is clamped to two lines rather than
 *     truncated to an ellipsis;
 *   - the row is built from a data structure, not from hand-written
 *     per-item markup;
 *   - it has a press state;
 *   - Flag a Concern is still not here and still exists in the app.
 *
 * And three rules are new, one per thing the redesign actually promises:
 * the next tile is visibly exposed, exactly one tile may be lit, and no
 * tile is a door a member did not already have.
 *
 * A source scan, as before: no component harness renders a server
 * component's data assembly, and what is being held is which doors exist
 * and on what conditions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const GRID = source('components/dashboard/QuickActionsGrid.tsx');
const DASHBOARD_PAGE = source('app/dashboard/page.tsx');
const BOTTOM_NAV = source('components/BottomNav.tsx');
const CSS = source('app/globals.css');

describe('Quick Actions: a compact row of doors she already has', () => {
  it('Home imports the row and hands it one built list, rather than four loose props', () => {
    expect(DASHBOARD_PAGE).toContain(
      "  QuickActionsGrid,\n  type QuickAction,\n} from '@/components/dashboard/QuickActionsGrid';",
    );
    expect(DASHBOARD_PAGE).toContain('<QuickActionsGrid actions={actions} />');
    expect(DASHBOARD_PAGE).toContain('const actions: QuickAction[] = [');
  });

  it('the "Quick Actions" zone header is unchanged', () => {
    expect(DASHBOARD_PAGE).toContain('<p className={ZONE_LABEL}>Quick Actions</p>');
  });

  it('every conditional tile is still decided by its own feature rule', () => {
    // Case and Movement keep the exact keys they have always had. Food
    // Lens is decided by the same rule that decides its bottom-bar tab,
    // which is the only reason it may appear here at all.
    expect(DASHBOARD_PAGE).toContain('shows(F.homeQuickActionMovement)');
    expect(DASHBOARD_PAGE).toContain('shows(F.homeQuickActionCase)');
    expect(DASHBOARD_PAGE).toContain('shows(F.trackerFoodLens)');
    expect(BOTTOM_NAV).toContain('showFoodLens');
  });

  it('the two unconditional tiles are doors the bottom bar already carries on every screen', () => {
    // Daily Reset is the gold Check-In button and Progress is a tab. A
    // tile for either one moves a shortcut; it does not reveal a feature,
    // which is the rule that lets them skip a visibility key.
    expect(DASHBOARD_PAGE).toContain("href: '/checkin'");
    expect(DASHBOARD_PAGE).toContain("href: '/progress'");
    expect(BOTTOM_NAV).toContain("const MORNING_HREF = '/checkin'");
    expect(BOTTOM_NAV).toContain("{ label: 'Progress', href: '/progress', Icon: BarChart2 }");
  });

  it('renders nothing at all when no tile survives, rather than an empty row', () => {
    expect(GRID).toContain('if (actions.length === 0) return null;');
  });

  it('the whole row is gone before her first check-in, same gate the welcome card uses', () => {
    expect(DASHBOARD_PAGE).toContain('if (!hasRealHistory) return null;');
  });

  it('the next tile is deliberately exposed, at a fraction of the column rather than a fixed width', () => {
    // 2 tiles + 2 gaps + 0.2 of a tile = the column, so the same fifth of
    // the third tile shows at 320px, 390px and 430px. A fixed pixel width
    // would show a different amount at each, and at one of them nothing.
    expect(CSS).toContain('flex: 0 0 calc((100% - 1.5rem) / 2.2);');
    expect(CSS).toContain('.mef-home-quick-row {');
    expect(CSS).toMatch(/\.mef-home-quick-row \{[^}]*overflow-x: auto;/s);
    expect(CSS).toMatch(/\.mef-home-quick-row \{[^}]*scroll-snap-type: x proximity;/s);
    expect(CSS).toMatch(/\.mef-home-quick-tile \{[^}]*scroll-snap-align: start;/s);
  });

  it('the fraction is a phone rule, and does not survive to a 1024px column', () => {
    // A fifth of max-w-5xl is a 450px tile. The peek says "scroll this
    // with your thumb", which a desktop pointer does not need told.
    expect(CSS).toMatch(
      /@media \(min-width: 768px\) \{\s*\.mef-home-quick-tile \{\s*flex: 0 0 200px;/s,
    );
  });

  it('a row with nothing off screen does not pretend otherwise', () => {
    // Two tiles that fit exactly must not be drawn at 2.2-tile width with
    // dead space beside them: that reads as broken, not as scrollable.
    expect(GRID).toContain('const scrolls = actions.length > 2;');
    expect(GRID).toContain("actions.length === 2 ? 'grid-cols-2' : 'grid-cols-1'");
  });

  it('exactly one tile may be lit, and only from a real row', () => {
    // The accent is the day's undone check-in, read off the stored
    // check-in and nowhere else. Every other tile is unlit.
    const accents = DASHBOARD_PAGE.match(/accent: /g) ?? [];
    expect(accents).toHaveLength(1);
    expect(DASHBOARD_PAGE).toContain('accent: !todaysCheckin,');
    expect(GRID).toContain('mef-home-quick-tile-accent');
  });

  it('the glow is a diffused halo, never an outline', () => {
    expect(CSS).toContain('--mef-home-glow-gold:');
    expect(CSS).toMatch(/\.mef-home-quick-tile-accent \{[^}]*box-shadow: var\(--mef-home-glow-gold\);/s);
    // No hard ring, no neon: the halo's own spread is soft and wide.
    expect(CSS).not.toMatch(/--mef-home-glow-gold:[^;]*rgba\(196, 160, 80, 0\.[6-9]/);
  });

  it('no status is invented: the real one is used where it exists, a fixed line where it does not', () => {
    expect(DASHBOARD_PAGE).toContain('movementActionStatus ?? ');
    expect(DASHBOARD_PAGE).toContain('formatCompletedStatus(latestAnalyzedAssessment.completed_at!)');
    expect(DASHBOARD_PAGE).toContain("hint: todaysCheckin ? 'Logged today' : 'Check in',");
  });

  it('the Case tile still borrows no completion fraction from the questionnaire count (C2)', () => {
    expect(DASHBOARD_PAGE).not.toContain('caseStatus');
    expect(DASHBOARD_PAGE).toContain("label: 'Case', hint: 'What Root has found'");
  });

  it('nothing truncates a true sentence to an ellipsis inside a 148px tile', () => {
    // The previous treatment cut "Completed 26 days ago" to "Completed 26
    // d...". Two lines, clamped, is the fix; `truncate` is what caused it.
    expect(CSS).toMatch(/\.mef-home-quick-hint \{[^}]*-webkit-line-clamp: 2;/s);
    // The word appears in this file's own prose, so what is checked is
    // the utility actually reaching a className, not the string anywhere.
    expect(GRID).not.toMatch(/className=[^>]*\btruncate\b/);
    expect(GRID).not.toContain('ChevronRight');
  });

  it('Flag a Concern is still not in this row, and is still in the app', () => {
    expect(GRID).not.toContain('ConcernFlag');
    expect(GRID).not.toContain('MessageCircleWarning');
    expect(
      readFileSync(path.resolve(__dirname, '..', 'components/checkin/ConcernFlag.tsx'), 'utf-8'),
    ).toContain('export function ConcernFlag');
  });

  it('has a pressed/tap state and a focus ring', () => {
    expect(GRID).toContain('mef-press');
    expect(GRID).toContain('mef-focus-ring');
  });

  it('carries no colour of its own: every value is in the one scoped stylesheet block', () => {
    expect(GRID.match(/#[0-9A-Fa-f]{6}/g)).toBeNull();
  });

  it('tiles stay in a data structure, not hardcoded per-item markup', () => {
    expect(GRID).toContain('actions.map(');
  });

  it('the icon travels as a key, since a server component cannot hand over a component', () => {
    expect(GRID).toContain('const ICONS = {');
    expect(Object.keys({ dailyReset: 1, foodLens: 1, movement: 1, progress: 1, case: 1 })).toEqual([
      'dailyReset',
      'foodLens',
      'movement',
      'progress',
      'case',
    ]);
    for (const key of ['dailyReset', 'foodLens', 'movement', 'progress', 'case']) {
      expect(GRID).toContain(`${key}:`);
      expect(DASHBOARD_PAGE).toContain(`icon: '${key}'`);
    }
  });
});

describe('Bottom nav: unchanged by this pass', () => {
  it('member left/right items include Home, Food Lens, Progress, Today', () => {
    expect(BOTTOM_NAV).toContain(
      "{ label: 'Food Lens', href: '/food-lens', Icon: UtensilsCrossed }",
    );
    expect(BOTTOM_NAV).toContain("{ label: 'Progress', href: '/progress', Icon: BarChart2 }");
  });

  /**
   * Admin/coach chrome cleanup (2026-08-14): the coach bar left this file
   * entirely and became components/StaffNav.tsx, rendered by
   * app/coach/layout.tsx and app/admin/layout.tsx. What broke before that
   * was an administrator who did NOT also hold the coach grant: the page
   * passed isCoach false, false meant member, and the full member bar
   * appeared under the admin screens. So what these pin is that this file
   * builds the member bar and nothing else, and never builds a member
   * item for a staff account.
   */
  it('holds no coach bar of its own any more', () => {
    expect(BOTTOM_NAV).not.toContain('COACH_ITEMS');
    expect(BOTTOM_NAV).not.toContain('COACH_RIGHT_ITEMS');
  });

  it('builds the member groups from the member lists, and hands a staff account to StaffNav first', () => {
    expect(BOTTOM_NAV).toContain('MEMBER_LEFT_ITEMS');
    expect(BOTTOM_NAV).toContain("MEMBER_LEFT_ITEMS.filter((item) => item.href !== '/food-lens')");
    expect(BOTTOM_NAV).toContain('const rightItems: NavItem[] = MEMBER_RIGHT_ITEMS;');
    expect(BOTTOM_NAV).toContain(
      'if (isCoach || isAdmin) return <StaffNav isCoach={isCoach} isAdmin={isAdmin} />;',
    );
    expect(BOTTOM_NAV.indexOf('if (isCoach || isAdmin) return')).toBeLessThan(
      BOTTOM_NAV.indexOf('const leftItems: NavItem[]'),
    );
  });

  it('showFoodLens defaults to true, so a caller that has not been given the answer behaves as the bar always has', () => {
    expect(BOTTOM_NAV).toContain('showFoodLens = true');
  });

  it('the server component that resolves it hands staff straight through without a visibility read', () => {
    const wrapper = source('components/MemberBottomNav.tsx');
    expect(wrapper).toContain(
      'if (isCoach || isAdmin) return <BottomNav isCoach={isCoach} isAdmin={isAdmin} />;',
    );
    expect(wrapper.indexOf('if (isCoach || isAdmin) return')).toBeLessThan(
      wrapper.indexOf('await getMemberVisibility()'),
    );
  });

  it('the center Check-In button keeps its gold and its warm halo', () => {
    // The row above may light one tile; the bar's one gold object is
    // untouched by this pass and stays the signature action.
    expect(BOTTOM_NAV).toContain('bg-[#F5B700] text-[#1B3A2D]');
    expect(BOTTOM_NAV).toContain('h-14 w-14');
    expect(BOTTOM_NAV).toContain('<Plus className="h-7 w-7"');
    expect(BOTTOM_NAV).toContain('shadow-[0_12px_28px_-10px_rgba(245,183,0,0.7)]');
  });
});
