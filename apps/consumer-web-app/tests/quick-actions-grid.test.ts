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
 * THE FINAL STRUCTURAL PASS (2026-09-13) CHANGED TWO MORE THINGS AND THE
 * RULES ABOVE ALL SURVIVED THEM.
 *
 *   The bottom bar gave up Food Lens and Progress, because both were also
 *   tiles in this row and a bar on every screen in the app plus a row of
 *   shortcuts on the main one were advertising the same two destinations.
 *   The bar is Home, Check-In and Today. The Food Lens VISIBILITY RULE
 *   did not move with the tab: this row still asks `tracker.food_lens`
 *   before it draws that tile, which is the assertion that matters.
 *
 *   Every tile carries a TONE, and a sixth door (Your Week with Root)
 *   joined the row. That door is the Weekly Root Review entry which
 *   already stands further down Home, drawn on exactly the two
 *   conditions that entry is drawn on, so it is still a shortcut to
 *   something she has rather than a new feature.
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
    // Lens is decided by the rule that used to decide its bottom-bar tab,
    // and since that tab is gone this row is the ONLY thing left asking
    // the question, which makes this assertion the whole of the gate.
    expect(DASHBOARD_PAGE).toContain('shows(F.homeQuickActionMovement)');
    expect(DASHBOARD_PAGE).toContain('shows(F.homeQuickActionCase)');
    expect(DASHBOARD_PAGE).toContain('shows(F.trackerFoodLens)');
    // The word appears in this file's own prose (it records where the
    // tab went), so what is checked is an item actually reaching the bar.
    expect(BOTTOM_NAV).not.toContain("href: '/food-lens'");
  });

  it('Your Week with Root points at a real existing screen, on that screen\'s own conditions', () => {
    // The Weekly Root Review has no route of its own: it is the collapsed
    // entry further down Home. So the tile is an anchor to that entry,
    // and it is drawn on the identical pair of conditions the entry is
    // drawn on, which is what stops a tile pointing at nothing.
    expect(DASHBOARD_PAGE).toContain(
      "const WEEKLY_REVIEW_ANCHOR_ID = 'your-week-with-root';",
    );
    expect(DASHBOARD_PAGE).toContain(
      'const WEEKLY_REVIEW_ANCHOR_HREF = `/dashboard#${WEEKLY_REVIEW_ANCHOR_ID}`;',
    );
    expect(DASHBOARD_PAGE).toContain('href: WEEKLY_REVIEW_ANCHOR_HREF,');
    expect(DASHBOARD_PAGE).toContain('<div id={WEEKLY_REVIEW_ANCHOR_ID}');
    // The tile's gate and the entry's gate are the same two facts.
    expect(DASHBOARD_PAGE).toContain('...(weeklyReview && shows(F.homeWeeklyReview)');
    expect(DASHBOARD_PAGE).toContain('{weeklyReview && shows(F.homeWeeklyReview) && (');
  });

  it('the two unconditional tiles are doors she already had, and neither is a new permission', () => {
    // Daily Reset is the gold Check-In button, which is still in the bar
    // on every screen. Progress WAS a tab in that bar and is now this
    // tile instead: the route, and who may open it, are untouched, and a
    // tile for it moves a shortcut rather than revealing a feature, which
    // is the rule that lets both skip a visibility key.
    expect(DASHBOARD_PAGE).toContain("href: '/checkin'");
    expect(DASHBOARD_PAGE).toContain("href: '/progress'");
    expect(BOTTOM_NAV).toContain("const MORNING_HREF = '/checkin'");
    expect(BOTTOM_NAV).not.toContain("href: '/progress'");
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
    expect(DASHBOARD_PAGE).toContain("label: 'Case',");
    expect(DASHBOARD_PAGE).toContain("hint: 'What Root has found',");
  });

  it('every tile carries a tone, no two neighbours share one, and there are only five tones', () => {
    // A row of five identical near-white tiles is what this replaced: a
    // member could see something was there and had no reason to want any
    // of it. The tones are assigned on the server, AFTER the gating, so a
    // tile that disappears cannot leave two matching neighbours behind.
    const region = DASHBOARD_PAGE.slice(
      DASHBOARD_PAGE.indexOf('async function QuickActionsRegion()'),
      DASHBOARD_PAGE.indexOf('async function TodayZone()'),
    );
    const tones = [...region.matchAll(/tone: '(\w+)'/g)].map((m) => m[1]);
    expect(tones).toEqual(['gold', 'cream', 'forest', 'sage', 'charcoal', 'cream']);
    for (let i = 1; i < tones.length; i += 1) {
      expect(tones[i], `two neighbouring tiles share ${tones[i]}`).not.toBe(tones[i - 1]);
    }
    // Five names, and the component holds exactly those five.
    expect(new Set(tones).size).toBe(5);
    expect(GRID).toContain('const TONE_CLASS = {');
    for (const tone of ['cream', 'sage', 'forest', 'gold', 'charcoal']) {
      expect(GRID).toContain(`${tone}:`);
    }
    // And every tone but cream (the base surface) has its own block.
    for (const tone of ['sage', 'forest', 'gold', 'charcoal']) {
      expect(CSS).toContain(`.mef-home-quick-tile--${tone} {`);
    }
  });

  it('a tone is six custom properties, so it cannot be half applied', () => {
    // Surface, edge, ink, soft ink, icon chip and sheen move together or
    // a tile ends up with dark text on a dark ground.
    for (const tone of ['sage', 'forest', 'gold', 'charcoal']) {
      const at = CSS.indexOf(`.mef-home-quick-tile--${tone} {`);
      const block = CSS.slice(at, CSS.indexOf('\n  }', at));
      for (const prop of [
        '--mef-quick-surface',
        '--mef-quick-border',
        '--mef-quick-ink',
        '--mef-quick-ink-soft',
        '--mef-quick-chip',
        '--mef-quick-chip-ink',
        '--mef-quick-sheen',
      ]) {
        expect(block, `${tone} is missing ${prop}`).toContain(prop);
      }
    }
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
    for (const key of [
      'dailyReset',
      'foodLens',
      'weekWithRoot',
      'movement',
      'progress',
      'case',
    ]) {
      expect(GRID).toContain(`${key}:`);
      expect(DASHBOARD_PAGE).toContain(`icon: '${key}'`);
    }
  });
});

describe('Bottom nav: three doors, evenly balanced', () => {
  /**
   * FOOD LENS AND PROGRESS LEFT THIS BAR (final structural pass,
   * 2026-09-13), because both are tiles in Home's Quick Actions row and
   * the two surfaces were advertising the same destinations. The bar is
   * the three places a member is always going: Home, the Check-In
   * button, Today.
   *
   * Nothing was removed from the app. /food-lens and /progress are
   * unchanged routes with unchanged permissions, still reachable from
   * Home and still reachable directly, and the Food Lens reveal rule
   * moved with the shortcut rather than being dropped (see the Quick
   * Actions block above, which is now the only thing asking it).
   */
  it('holds Home, Check-In and Today, and nothing else', () => {
    expect(BOTTOM_NAV).toContain("{ label: 'Home', href: '/dashboard', Icon: Home, quiet: true }");
    expect(BOTTOM_NAV).toContain(
      "const MEMBER_RIGHT_ITEMS: NavItem[] = [{ label: 'Today', href: '/today', Icon: Sparkles }];",
    );
    expect(BOTTOM_NAV).toContain("const MORNING_HREF = '/checkin'");
    // Exactly three destinations, counted rather than eyeballed.
    const hrefs = [...BOTTOM_NAV.matchAll(/href: '(\/[\w-]+)'/g)].map((m) => m[1]);
    expect(new Set(hrefs)).toEqual(new Set(['/dashboard', '/today']));
    expect(BOTTOM_NAV).not.toContain("href: '/food-lens'");
    expect(BOTTOM_NAV).not.toContain("href: '/progress'");
  });

  it('does not import the icons of the two tabs it no longer has', () => {
    // A leftover import is how a removed tab comes back by accident.
    expect(BOTTOM_NAV).toContain("import { Home, Sparkles, Plus } from 'lucide-react';");
    expect(BOTTOM_NAV).not.toContain('UtensilsCrossed');
    expect(BOTTOM_NAV).not.toContain('BarChart2');
  });

  it('the three items are evenly balanced across the bar', () => {
    // One item a side, each in a flex-1 half, with the check-in button as
    // a fixed-width sibling between them: its midpoint lands on the bar's
    // exact centre and the two labels sit at the midpoints of the halves
    // either side of it. The pill is capped and centred inside its cell
    // rather than filling it, which is what stops a one-item side reading
    // as a slab running to the screen edge.
    expect(BOTTOM_NAV).toContain('grid min-w-0 flex-1 items-start gap-1 px-1 md:contents');
    expect(BOTTOM_NAV).toContain(
      'gridTemplateColumns: `repeat(${leftItems.length}, minmax(0, 1fr))`',
    );
    expect(BOTTOM_NAV).toContain(
      'gridTemplateColumns: `repeat(${rightItems.length}, minmax(0, 1fr))`',
    );
    expect(BOTTOM_NAV).toContain('max-w-[84px]');
    expect(BOTTOM_NAV).toContain('flex shrink-0 flex-col items-center gap-1.5 px-2 -mt-7');
  });

  it('no gate is left behind: the bar asks the server for nothing', () => {
    // `showFoodLens` was the one server-resolved prop this bar took. With
    // the tab gone there is nothing left to decide, so the prop and the
    // visibility read in the wrapper went with it. Keeping a prop nothing
    // reads is how a gate quietly stops being a gate.
    expect(BOTTOM_NAV).not.toContain('showFoodLens');
    const wrapper = source('components/MemberBottomNav.tsx');
    expect(wrapper).not.toContain('getMemberVisibility');
    expect(wrapper).not.toContain('trackerFoodLens');
    expect(wrapper).toContain('return <BottomNav isCoach={isCoach} isAdmin={isAdmin} />;');
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
    expect(BOTTOM_NAV).toContain('const leftItems: NavItem[] = MEMBER_LEFT_ITEMS;');
    expect(BOTTOM_NAV).toContain('const rightItems: NavItem[] = MEMBER_RIGHT_ITEMS;');
    expect(BOTTOM_NAV).toContain(
      'if (isCoach || isAdmin) return <StaffNav isCoach={isCoach} isAdmin={isAdmin} />;',
    );
    expect(BOTTOM_NAV.indexOf('if (isCoach || isAdmin) return')).toBeLessThan(
      BOTTOM_NAV.indexOf('const leftItems: NavItem[]'),
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

  it('Home and Today keep the existing selected-state treatment', () => {
    // The forest pill, the 3px forest mark above the icon, and the one
    // icon weight. Unchanged by this pass, and worth holding because a
    // bar with three items is the one a later edit would restyle.
    expect(BOTTOM_NAV).toContain("'bg-[#1B3A2D]/[0.07] font-semibold text-[#1B3A2D]'");
    expect(BOTTOM_NAV).toContain(
      'absolute left-1/2 top-0 h-[3px] w-6 -translate-x-1/2 rounded-full bg-[#1B3A2D]',
    );
    expect(BOTTOM_NAV).toContain('<Icon className="h-5 w-5 shrink-0" strokeWidth={1.75}');
  });
});
