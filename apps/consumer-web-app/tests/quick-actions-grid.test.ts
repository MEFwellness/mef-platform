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

  it('is a capsule pill shape (rounded-full), not icon circles', () => {
    expect(GRID).toContain('rounded-full');
  });

  it('icon sits in a small filled circle for contrast', () => {
    expect(GRID).toMatch(/ICON_CIRCLE\s*=\s*\n?\s*'flex h-8 w-8.*rounded-full bg-\[#1B3A2D\]/);
  });

  it('has a pressed/tap state', () => {
    expect(GRID).toContain('mef-press');
  });

  it('gold (#C4A050) is not introduced in this section', () => {
    expect(GRID.toUpperCase()).not.toContain('#C4A050');
  });

  it('labels stay in the actions data structure, not hardcoded per-item markup', () => {
    expect(GRID).toContain('ACTIONS.map(');
  });
});

describe('Bottom nav: Food Lens and Progress added for members, coach nav unchanged', () => {
  it('member left/right items include Home, Food Lens, Progress, Today', () => {
    expect(BOTTOM_NAV).toContain(
      "{ label: 'Food Lens', href: '/food-lens', Icon: UtensilsCrossed }",
    );
    expect(BOTTOM_NAV).toContain("{ label: 'Progress', href: '/progress', Icon: BarChart2 }");
  });

  it('coach items are still exactly Home + Coach (left) and Today (right)', () => {
    expect(BOTTOM_NAV).toContain('const COACH_LEFT_ITEMS: NavItem[] = [{ label: \'Home\', href: \'/dashboard\', Icon: Home }]');
    expect(BOTTOM_NAV).toContain('const COACH_RIGHT_ITEMS: NavItem[] = [{ label: \'Today\', href: \'/today\', Icon: Sparkles }]');
  });

  it('leftItems/rightItems branch on isCoach so member and coach layouts differ', () => {
    expect(BOTTOM_NAV).toContain(
      'const leftItems = isCoach ? [...COACH_LEFT_ITEMS, COACH_NAV_ITEM] : MEMBER_LEFT_ITEMS;',
    );
    expect(BOTTOM_NAV).toContain('const rightItems = isCoach ? COACH_RIGHT_ITEMS : MEMBER_RIGHT_ITEMS;');
  });

  it('the center Check-In button markup is unchanged (gold circle, Plus icon, h-14 w-14)', () => {
    expect(BOTTOM_NAV).toContain('bg-[#F5B700] text-[#1B3A2D]');
    expect(BOTTOM_NAV).toContain('h-14 w-14');
    expect(BOTTOM_NAV).toContain('<Plus className="h-7 w-7"');
  });
});
