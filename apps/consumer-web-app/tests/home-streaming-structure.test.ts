/**
 * HOME SPEED BUILD (2026-08-28) — what loads first, held as a rule.
 *
 * The gain in this build is entirely structural: her greeting is in Home's
 * first streamed response because the page awaits one small loader and
 * nothing else before it returns. That is the kind of property a later,
 * well-meaning edit undoes without noticing (one `await` added to the shell
 * puts every card back in front of her greeting), so it is written down
 * here as a source rule rather than left to be re-measured.
 *
 * These are source assertions on purpose. What is being held is the SHAPE
 * of the render, which is not something a rendered-HTML test can see: a
 * test that renders the page gets every boundary resolved and cannot tell
 * whether they were resolved before or after the shell was flushed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');

const HOME = read('app/dashboard/page.tsx');
const FRAME = read('lib/home/frame.ts');
const PLACEHOLDERS = read('components/dashboard/HomePlaceholders.tsx');

/** The body of `DashboardPage` itself, from its signature to the end of its return. */
function shellBody(): string {
  const start = HOME.indexOf('export default async function DashboardPage');
  expect(start).toBeGreaterThan(-1);
  const end = HOME.indexOf('\n}\n', HOME.indexOf('return (', start));
  return HOME.slice(start, end);
}

describe('the shell waits for one thing', () => {
  it('DashboardPage awaits the Home frame and nothing else', () => {
    const body = shellBody();
    const awaits = body.match(/await [A-Za-z_$][\w$.]*\(/g) ?? [];
    expect(awaits).toEqual(['await requireHomeFrame(']);
  });

  it('the frame is three round trips and a role check, not a data gather', () => {
    // Whatever else moves into lib/home/frame.ts later, it must stay this
    // small: everything in it is in front of her greeting.
    const tables = FRAME.match(/\.from\('(\w+)'\)/g) ?? [];
    expect(tables).toEqual(["from('daily_checkins_current')"].map((t) => `.${t}`));
    expect(FRAME).toContain('memberProfileCore(supabase, user.id)');
    expect(FRAME).toContain("hasActiveRole(supabase, user.id, 'coach')");
    expect(FRAME).toContain('getDailyPriority(supabase, user.id, localDate)');
  });

  it('her greeting is rendered by the shell, not by a boundary below it', () => {
    const body = shellBody();
    const hero = body.indexOf('<HomeHeroFrame');
    const firstSuspense = body.indexOf('<Suspense');
    expect(hero).toBeGreaterThan(-1);
    expect(hero).toBeLessThan(firstSuspense);
    // And the frame component is what draws the <h1>.
    expect(read('components/dashboard/HomeHero.tsx')).toContain(
      'export function HomeHeroFrame('
    );
  });

  it('the bottom navigation is in the first response too, so she can leave immediately', () => {
    const body = shellBody();
    expect(body).toContain('<MemberBottomNav isCoach={frame.isCoach} />');
  });
});

describe('the order she reads in is the order in the markup', () => {
  /**
   * QUICK ACTIONS LEADS <main> (final structural pass, 2026-09-13).
   *
   * It was second, under the day's chosen action drawn as the one feature
   * card on the page, so the top of Home was a photograph and then a job.
   * The two swapped: the row of doors that answers "what can I do right
   * now" is the first thing under the hero, and the day's chosen action
   * renders in the active/today half of the page, under the day frame,
   * in the ordinary card treatment the Today screen has always used for
   * it. Both still have their own boundary, so neither waits on the
   * other, and the assertion below is the whole of what the swap means.
   */
  it('the regions inside <main> are quick actions, day frame, priority, stream, completed priority', () => {
    const body = shellBody();
    const at = (needle: string) => {
      const i = body.indexOf(needle);
      expect(i, `${needle} is missing`).toBeGreaterThan(-1);
      return i;
    };
    expect(at('<main')).toBeLessThan(at('<QuickActionsRegion />'));
    expect(at('<QuickActionsRegion />')).toBeLessThan(at('<DayFrameRegion />'));
    expect(at('<DayFrameRegion />')).toBeLessThan(at('<PriorityRegion />'));
    expect(at('<PriorityRegion />')).toBeLessThan(at('<StreamRegion />'));
    expect(at('<StreamRegion />')).toBeLessThan(at('<CompletedPriorityRegion />'));
    expect(at('<CompletedPriorityRegion />')).toBeLessThan(at('</main>'));
  });

  it('every region on the first screenful has a placeholder, never a bare null', () => {
    const body = shellBody();
    for (const [region, fallback] of [
      ['<HeroBodyRegion />', '<HomeHeroBodyPlaceholder'],
      ['<PriorityRegion />', '<PriorityPlaceholder'],
      ['<QuickActionsRegion />', '<QuickActionsPlaceholder'],
      ['<DayFrameRegion />', '<DayFramePlaceholder'],
      ['<StreamRegion />', '<StreamPlaceholder'],
    ]) {
      const at = body.indexOf(region!);
      const boundary = body.lastIndexOf('<Suspense', at);
      expect(body.slice(boundary, at), `${region} has no placeholder`).toContain(fallback!);
    }
  });

  it('the quick-actions placeholder reserves the row it is standing in for, peek included', () => {
    // Two whole tiles and a fifth of a third, at the tile's own height and
    // its own computed width. A placeholder that reserves two whole tiles
    // against a row that draws two and a slice grows sideways under her
    // thumb the moment it resolves.
    const at = PLACEHOLDERS.indexOf('export function QuickActionsPlaceholder');
    expect(at).toBeGreaterThan(-1);
    const fn = PLACEHOLDERS.slice(at, PLACEHOLDERS.indexOf('\n}\n', at));
    expect(fn.match(/basis-\[calc\(\(100%-1\.5rem\)\/2\.2\)\]/g)).toHaveLength(3);
    // 124px since the tiles gained a tone, a 36px icon chip and the room
    // to carry both (final structural pass, 2026-09-13). The placeholder
    // and `.mef-home-quick-tile`'s own min-height are the same number or
    // the row grows under her thumb the moment it resolves.
    expect(fn).toContain('h-[124px]');
    expect(read('app/globals.css')).toMatch(
      /\.mef-home-quick-tile \{[^}]*min-height: 124px;/s,
    );
  });
});

describe('the placeholders are the brand settling, not a spinner circus', () => {
  it('every placeholder uses the one settling treatment', () => {
    expect(PLACEHOLDERS).toContain('mef-settling');
    // No spinners anywhere on this screen.
    expect(PLACEHOLDERS).not.toMatch(/animate-spin|Loader|Spinner/);
    expect(HOME).not.toMatch(/animate-spin|Loader2|Spinner/);
  });

  it('the route placeholder is Home-shaped, so the hero does not arrive as a whole screen of movement', () => {
    const loading = read('app/dashboard/loading.tsx');
    expect(loading).toContain('<HomeShellPlaceholder />');
    expect(loading).not.toMatch(/import .*PageSkeleton/);
    // The hero band it reserves is the hero's own height, and since
    // 2026-09-06 that is ONE height rather than two. It used to be 440px on
    // a phone and 500px from md up, and the tall hero's real content sits
    // between the two: a five-line Root Score explanation measured 499px on
    // production, so the whole page dropped 59px the moment the score landed
    // in a box reserved at 440. That one swap was 0.060 of Home's 0.061
    // layout shift. Both files carry the same number, which is the point.
    //
    // THE NUMBER CHANGED WITH THE LAYOUT (Home presentation pass,
    // 2026-09-13) and the property it protects did not. The hero is a
    // masthead now rather than the whole first screen: the score moved
    // from under the greeting to beside it as a ring, and its explanation
    // is held to two lines (`line-clamp-2`). The band was then MEASURED
    // on a 390px viewport rather than estimated: 396px in its tallest
    // state (baseline note showing), 375px without it, 340px while the
    // body is still settling. 400 is above all three, so the band is the
    // same height in every one of them. What is asserted is unchanged in
    // substance: ONE committed height, and the two files that reserve it
    // carrying the identical value, so the box the body lands in is the
    // box the route skeleton reserved.
    const COMMITTED_HERO_HEIGHT = 'min-h-[400px]';
    expect(PLACEHOLDERS).toContain(COMMITTED_HERO_HEIGHT);
    expect(PLACEHOLDERS).not.toContain('min-h-[440px]');
    expect(PLACEHOLDERS).not.toContain('min-h-[500px]');
    const hero = read('components/dashboard/HomeHero.tsx');
    expect(hero).toContain(COMMITTED_HERO_HEIGHT);
    expect(hero).not.toContain('min-h-[440px]');
    expect(hero).not.toContain('min-h-[500px]');
  });

  it('every placeholder is hidden from a screen reader and countable by a verification run', () => {
    const blocks = PLACEHOLDERS.match(/data-settling="true"/g) ?? [];
    const hidden = PLACEHOLDERS.match(/aria-hidden="true"/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    expect(hidden.length).toBe(blocks.length);
  });

  it('the settling treatment respects reduced motion', () => {
    const css = read('app/globals.css');
    const at = css.indexOf('.mef-settling {');
    expect(at).toBeGreaterThan(-1);
    const after = css.slice(at);
    expect(after).toContain('prefers-reduced-motion: reduce');
    expect(after.slice(0, after.indexOf('prefers-reduced-motion'))).toContain('mef-settling-on-photo');
  });

  it("the day's chosen action reserves the shape she is actually going to get", () => {
    // A card-shaped hole for a card, a line-shaped hole for the pointer she
    // gets once today's priority is done or saved. The prediction comes from
    // today's stored row, read in the frame.
    expect(PLACEHOLDERS).toContain('export function PriorityPlaceholder({ expectCard }');
    expect(HOME).toContain('<PriorityPlaceholder expectCard={frame.expectPriorityCard} />');
    expect(FRAME).toContain(
      "expectPriorityCard: storedPriority === null || storedPriority.status === 'active',"
    );
  });

  it('the hero cannot move under her: its height is decided in the first response', () => {
    expect(HOME).toContain('hasCheckins={frame.hasCheckins}');
    expect(read('components/dashboard/HomeHero.tsx')).toContain('compact={!hasCheckins}');
  });
});

describe('a render still decides nothing', () => {
  it('the Home frame reads and never writes', () => {
    expect(FRAME).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  });

  it('every date in the frame names her timezone', () => {
    expect(FRAME).toContain('nowInTimezone(timezone)');
    expect(FRAME).toContain('timeContextInTimezone(timezone)');
    expect(FRAME).not.toContain('toLocaleString');
    expect(FRAME).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice/);
  });
});
