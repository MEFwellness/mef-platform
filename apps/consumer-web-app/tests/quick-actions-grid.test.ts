/**
 * Home dashboard Quick Actions: horizontal scrolling pill carousel
 * replaced with a fixed icon grid (2026-07-27) — actions past the scroll
 * edge were undiscoverable. No component-rendering harness exists in
 * this repo (plain 'node' vitest environment), so this is a static
 * source scan of the fixed files, same pattern as
 * today-zones-redesign.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const GRID = source('components/dashboard/QuickActionsGrid.tsx');
const DASHBOARD_PAGE = source('app/dashboard/page.tsx');

describe('Quick Actions: scrolling carousel is gone, replaced by a fixed grid', () => {
  it('the old carousel component file no longer exists', () => {
    expect(
      existsSync(path.resolve(__dirname, '..', 'components/dashboard/QuickActionsCarousel.tsx')),
    ).toBe(false);
  });

  it('Home imports and renders the grid, not the carousel', () => {
    expect(DASHBOARD_PAGE).toContain("import { QuickActionsGrid } from '@/components/dashboard/QuickActionsGrid'");
    expect(DASHBOARD_PAGE).toContain('<QuickActionsGrid />');
    expect(DASHBOARD_PAGE).not.toContain('QuickActionsCarousel');
  });

  it('the "Quick Actions" zone header is unchanged', () => {
    expect(DASHBOARD_PAGE).toContain('<p className={ZONE_LABEL}>Quick Actions</p>');
  });

  it('the grid has no horizontal-scroll affordances', () => {
    expect(GRID).not.toContain('overflow-x-auto');
    expect(GRID).not.toContain('snap-x');
    expect(GRID).not.toContain('mef-scrollbar-hidden');
  });

  it('renders a static 4-column grid (4 per row, max 2 rows for 5 actions)', () => {
    expect(GRID).toContain('grid-cols-4');
  });
});

describe('Quick Actions: every existing action survives, with a one-word label each', () => {
  it('all four link actions are present with their original hrefs, icons, and shortened one-word labels', () => {
    expect(GRID).toContain("{ label: 'Case', href: '/case', Icon: Compass }");
    expect(GRID).toContain("{ label: 'Movement', href: '/movement', Icon: Activity }");
    expect(GRID).toContain("{ label: 'Lens', href: '/food-lens', Icon: UtensilsCrossed }");
    expect(GRID).toContain("{ label: 'Progress', href: '/progress', Icon: BarChart2 }");
  });

  it('Flag a Concern survives as a one-word "Concern" tile wired to the same ConcernFlag panel', () => {
    expect(GRID).toContain('MessageCircleWarning');
    expect(GRID).toContain('<ConcernFlag open={concernOpen} onOpenChange={setConcernOpen} />');
    expect(GRID).toContain('<span className={ITEM_LABEL}>Concern</span>');
  });

  it('no label in the data structure is longer than one word', () => {
    const labelMatches = [...GRID.matchAll(/label: '([^']+)'/g)].map((m) => m[1]!);
    expect(labelMatches.length).toBeGreaterThan(0);
    for (const label of labelMatches) {
      expect(label.trim().split(/\s+/)).toHaveLength(1);
    }
  });

  it('the action list is a single data structure, not hardcoded per-item markup for the four link actions', () => {
    expect(GRID).toContain('LINKS.map(');
  });
});

describe('Quick Actions: styling follows the pale-sage / forest-green spec, no gold', () => {
  it('icon circle uses a pale sage background with forest-green (#1B3A2D) stroke', () => {
    expect(GRID).toContain('bg-[#E8F0EA]');
    expect(GRID).toContain('text-[#1B3A2D]');
  });

  it('gold (#C4A050) is not introduced in this section', () => {
    expect(GRID.toUpperCase()).not.toContain('#C4A050');
  });
});
