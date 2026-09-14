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

  it('the frame is her session, one wave, and a role check, not a data gather', () => {
    // Whatever else moves into lib/home/frame.ts later, it must stay this
    // small: everything in it is in front of her greeting.
    const tables = FRAME.match(/\.from\('(\w+)'\)/g) ?? [];
    expect(tables).toEqual(["from('daily_checkins_current')"].map((t) => `.${t}`));
    expect(FRAME).toContain('memberProfileCore(supabase, user.id)');
    expect(FRAME).toContain("hasActiveRole(supabase, user.id, 'coach')");
    expect(FRAME).toContain('getDailyPrioritiesOn(supabase, user.id, candidateLocalDates())');
  });

  it('nothing in the frame waits on anything else in it (login/Home speed, 2026-09-13)', () => {
    // The priority row used to be read AFTER the wave, because it is keyed
    // by her own calendar day and the day needs the timezone the wave was
    // fetching: 211ms against 131ms, measured on production, paid on every
    // open of Home. It is asked for by candidate day inside the wave now,
    // so the frame is her session and then one round trip. Two awaits, and
    // the second of them is the wave.
    const at = FRAME.indexOf('export const getHomeFrame');
    const body = FRAME.slice(at, FRAME.indexOf('\n});', at));
    const awaits = body.match(/await /g) ?? [];
    expect(awaits, 'a third await in the frame is a third round trip in front of her greeting').toHaveLength(2);
    expect(body).toContain('await getCachedUser()');
    expect(body).toContain('await Promise.all([');
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
    //
    // The row's placeholder draws three of ONE tile placeholder since
    // 2026-09-13, rather than three inline rectangles, so the tile's
    // anatomy (its padding, its icon chip, its label and its one status
    // line) is stated once. Both halves are checked: the row draws three,
    // and the tile it draws carries the fraction and the height.
    const rowAt = PLACEHOLDERS.indexOf('export function QuickActionsPlaceholder');
    expect(rowAt).toBeGreaterThan(-1);
    const row = PLACEHOLDERS.slice(rowAt, PLACEHOLDERS.indexOf('\n}\n', rowAt));
    expect(row.match(/<QuickTilePlaceholder \/>/g)).toHaveLength(3);

    const tileAt = PLACEHOLDERS.indexOf('function QuickTilePlaceholder');
    expect(tileAt).toBeGreaterThan(-1);
    const tile = PLACEHOLDERS.slice(tileAt, PLACEHOLDERS.indexOf('\n}\n', tileAt));
    expect(tile.match(/basis-\[calc\(\(100%-1\.5rem\)\/2\.2\)\]/g)).toHaveLength(1);
    // THE TILE'S FLOOR AND THE ROW'S MEASURED HEIGHT ARE TWO NUMBERS.
    // `.mef-home-quick-tile` sets a 124px min-height; the rendered row is
    // 126px at every phone width, because the longest label in it wraps to
    // two lines and carries the tile past that floor. Reserving the floor
    // dropped the whole page six pixels when the row resolved (measured on
    // production: 0.019 of Home's 0.030 layout shift, its largest single
    // movement), so the placeholder reserves the measured height and the
    // floor is what it is checked against.
    expect(tile).toContain('h-[126px]');
    const css = read('app/globals.css');
    expect(css).toMatch(/\.mef-home-quick-tile \{[^}]*min-height: 124px;/s);
    const reservedHeight = Number(tile.match(/h-\[(\d+)px\]/)![1]);
    const tileFloor = Number(css.match(/\.mef-home-quick-tile \{[^}]*min-height: (\d+)px;/s)![1]);
    expect(reservedHeight).toBeGreaterThanOrEqual(tileFloor);
    expect(reservedHeight - tileFloor, 'a placeholder more than a label-line above the floor is reserving a row that is not there').toBeLessThanOrEqual(17);
    // And the row's own padding-bottom, which is part of the band's height
    // whether or not anything is scrolling in it yet.
    expect(row).toContain('pb-1');
    expect(css).toMatch(/\.mef-home-quick-row \{[^}]*padding-bottom: 0\.25rem;/s);
    // And the tile's own anatomy, which is what stops the row reading as
    // three grey slabs: the tile's padding, its icon chip, and the label
    // pushed to the tile's foot exactly as `margin-top: auto` pushes the
    // real one.
    expect(tile).toContain('p-[0.875rem]');
    expect(tile).toContain('h-9 w-9 rounded-[12px]');
    expect(tile).toContain('mt-auto');
  });

  it('the route skeleton is assembled from the regions own placeholders, not a second copy of them', () => {
    // Two copies of one layout is two chances to disagree: the route
    // skeleton reserved one thing, the shell that replaced it a moment
    // later reserved another, and the page moved between them.
    const at = PLACEHOLDERS.indexOf('export function HomeShellPlaceholder');
    expect(at).toBeGreaterThan(-1);
    const shell = PLACEHOLDERS.slice(at);
    for (const part of [
      '<QuickActionsPlaceholder />',
      '<DayFramePlaceholder />',
      '<PriorityPlaceholder expectCard />',
      '<StreamPlaceholder />',
    ]) {
      expect(shell, `the route skeleton does not compose ${part}`).toContain(part);
    }
    // In the same order <main> draws them.
    const order = ['QuickActionsPlaceholder /', 'DayFramePlaceholder /', 'PriorityPlaceholder expectCard', 'StreamPlaceholder /'].map(
      (needle) => shell.indexOf(needle),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('the hero body is reserved at the column the real one measures, change note included', () => {
    // The hero body is bottom-anchored inside a band of committed height,
    // so a placeholder that is short does not leave a gap at the foot, it
    // moves HER GREETING. The ring column was reserved at 64px against a
    // real 89 (a 66px ring plus its change note), and the greeting settled
    // 18px upwards about a second after the page arrived: measured on
    // production, the last layout shift left on Home.
    const hero = read('components/dashboard/HomeHero.tsx');
    const at = hero.indexOf('export function HomeHeroBodyPlaceholder');
    const fn = hero.slice(at, hero.indexOf('\n}\n', at));
    expect(fn).toContain('h-[66px] w-[66px]');
    expect(fn).toContain('h-[15px]');
    expect(fn).toContain('h-[46px]');
    expect(fn).toContain('h-[38px]');
    // And the route skeleton uses that one definition rather than a second
    // copy of those numbers.
    expect(PLACEHOLDERS).toContain('<HomeHeroBodyPlaceholder hasCheckins />');
    expect(PLACEHOLDERS).not.toContain('h-[64px]');
  });

  it('a placeholder that stands in for an object has a surface its bars can be seen on', () => {
    // A tile placeholder and an assigned-card placeholder are surfaces
    // with bars on them. One wash for both would make the bars invisible
    // against the box holding them.
    expect(PLACEHOLDERS).toContain('mef-settling-surface');
    const css = read('app/globals.css');
    expect(css).toContain('.mef-settling-surface {');
    // Deliberately still: only the bars inside it breathe, so there is one
    // rhythm per object rather than two.
    const block = css.slice(css.indexOf('.mef-settling-surface {'));
    expect(block.slice(0, block.indexOf('}'))).not.toContain('animation');
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
