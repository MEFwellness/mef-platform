/**
 * Home dashboard Quick Actions: icon-circle grid replaced with two capsule
 * pills (Case, Movement) (2026-07-27) — Food Lens and Progress moved to
 * the bottom nav, Flag a Concern was removed from Quick Actions entirely.
 * No component-rendering harness exists in this repo (plain 'node' vitest
 * environment), so this is a static source scan of the fixed files, same
 * pattern as today-zones-redesign.test.ts.
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

describe('Quick Actions: exactly two pills, Case and Movement', () => {
  it('Home imports and renders the grid with real status props, not the old no-arg call', () => {
    expect(DASHBOARD_PAGE).toContain(
      "import { QuickActionsGrid } from '@/components/dashboard/QuickActionsGrid'",
    );
    expect(DASHBOARD_PAGE).toContain(
      '<QuickActionsGrid caseStatus={caseStatus} movementStatus={movementActionStatus} />',
    );
  });

  it('the "Quick Actions" zone header is unchanged', () => {
    expect(DASHBOARD_PAGE).toContain('<p className={ZONE_LABEL}>Quick Actions</p>');
  });

  it('renders exactly two actions, Case and Movement, with their original hrefs and icons', () => {
    expect(GRID).toContain("{ label: 'Case', href: '/case', Icon: Compass, status: caseStatus }");
    expect(GRID).toContain(
      "{ label: 'Movement', href: '/movement', Icon: Activity, status: movementStatus }",
    );
    expect(GRID).not.toContain("'/food-lens'");
    expect(GRID).not.toContain("href: '/progress'");
  });

  it('Flag a Concern was removed from Quick Actions (but not deleted from the app)', () => {
    expect(GRID).not.toContain('ConcernFlag');
    expect(GRID).not.toContain('MessageCircleWarning');
    expect(
      readFileSync(
        path.resolve(__dirname, '..', 'components/checkin/ConcernFlag.tsx'),
        'utf-8',
      ),
    ).toContain('export function ConcernFlag');
  });

  it('two pills in a single row, no wrapping, no horizontal scroll', () => {
    expect(GRID).toContain('grid-cols-2');
    expect(GRID).not.toContain('overflow-x-auto');
    expect(GRID).not.toContain('snap-x');
  });

  it('a null status renders label-only — no invented/placeholder value', () => {
    expect(GRID).toContain('{status && ');
  });

  it('nothing else competes with the status line for the pill\'s narrow inner width', () => {
    // A trailing chevron truncated "2 of 9 complete" to "2 of 9 com..." on
    // a 390px screen. Found by screenshotting the rendered pills.
    expect(GRID).not.toContain('ChevronRight');
  });

  it('is a capsule pill shape (rounded-full), not icon circles', () => {
    expect(GRID).toContain('rounded-full');
  });

  /**
   * Home cleanup pass (2026-08-14), task 2. The pills read as plain labels
   * next to the image-backed cards above them. The SHAPE is settled and
   * unchanged (asserted above: rounded-full, grid-cols-2, one row); the
   * treatment is what changed, to the brand-palette gradient option:
   *
   *   - the icon now sits in a small illustrated tile (rounded square,
   *     forest -> gold gradient, one soft highlight), not a flat circle;
   *   - the pill carries a cream-to-white gradient and a deeper shadow.
   *
   * These two assertions replace "icon sits in a small filled circle" and
   * "gold is not introduced in this section" — both described the older
   * treatment, and gold (#C4A050) is now deliberately part of this one.
   */
  it('the icon sits in an illustrated brand-gradient tile, not a flat circle', () => {
    expect(GRID).toMatch(/ICON_TILE\s*=\s*\n?\s*'[^']*rounded-\[14px\][^']*from-\[#1B3A2D\][^']*to-\[#C4A050\]/);
    expect(GRID).not.toContain('ICON_CIRCLE');
  });

  it('the pill itself is filled from the brand palette and reads as raised', () => {
    expect(GRID).toContain('bg-gradient-to-br from-[#F5F0E4] to-white');
    expect(GRID).toContain('shadow-');
  });

  it('has a pressed/tap state', () => {
    expect(GRID).toContain('mef-press');
  });

  it('uses only the three brand colours, no fourth palette', () => {
    const hexes = new Set(GRID.toUpperCase().match(/#[0-9A-F]{6}/g) ?? []);
    for (const hex of hexes) {
      expect([
        '#1B3A2D', // forest green
        '#C4A050', // warm gold
        '#F5F0E4', // cream
        '#24503C', // the one mid-stop between forest and gold on the tile's gradient
        '#6B7A72', // the app's existing muted caption gray, already used for the status line
        '#F5B700', // the existing focus-ring gold, unchanged
      ]).toContain(hex);
    }
  });

  it('labels stay in the actions data structure, not hardcoded per-item markup', () => {
    expect(GRID).toContain('ACTIONS.map(');
  });
});

describe('Bottom nav: Food Lens and Progress added for members, coach nav separate', () => {
  it('member left/right items include Home, Food Lens, Progress, Today', () => {
    expect(BOTTOM_NAV).toContain(
      "{ label: 'Food Lens', href: '/food-lens', Icon: UtensilsCrossed }",
    );
    expect(BOTTOM_NAV).toContain("{ label: 'Progress', href: '/progress', Icon: BarChart2 }");
  });

  /**
   * These two assertions used to pin the coach bar as Home (/dashboard) +
   * Coach (/coach) on the left and Today (/today) on the right, under the
   * heading "coach nav unchanged" — the point being that the member-side
   * addition of Food Lens and Progress had not disturbed it.
   *
   * Role-based home routing (2026-08-14) changed that deliberately: three
   * of those four destinations were member engagement screens, a coach
   * account is now redirected off all of them, and that bar was the most
   * likely way a coach or an administrator ended up on the member Home in
   * the first place. So what these now pin is the same underlying
   * intention, against the new shape: the member bar is untouched, and the
   * coach bar offers nothing that would bounce. The route-level proof
   * lives in tests/role-based-home-routing.test.ts.
   */
  it('coach items are exactly one Home tab pointing at the coach dashboard', () => {
    expect(BOTTOM_NAV).toContain(
      "const COACH_ITEMS: NavItem[] = [{ label: 'Home', href: '/coach', Icon: Users }]"
    );
    expect(BOTTOM_NAV).not.toContain('COACH_RIGHT_ITEMS');
  });

  it('leftItems/rightItems branch on isCoach so member and coach layouts differ', () => {
    expect(BOTTOM_NAV).toContain(
      'const leftItems: NavItem[] = isCoach ? COACH_ITEMS : MEMBER_LEFT_ITEMS;'
    );
    expect(BOTTOM_NAV).toContain(
      'const rightItems: NavItem[] = isCoach ? [] : MEMBER_RIGHT_ITEMS;'
    );
  });

  it('the center Check-In button markup is unchanged (gold circle, Plus icon, h-14 w-14)', () => {
    expect(BOTTOM_NAV).toContain('bg-[#F5B700] text-[#1B3A2D]');
    expect(BOTTOM_NAV).toContain('h-14 w-14');
    expect(BOTTOM_NAV).toContain('<Plus className="h-7 w-7"');
  });
});
