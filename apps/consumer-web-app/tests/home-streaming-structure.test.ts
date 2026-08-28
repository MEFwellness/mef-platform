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
  it('the regions inside <main> are priority, day frame, stream, completed priority', () => {
    const body = shellBody();
    const at = (needle: string) => {
      const i = body.indexOf(needle);
      expect(i, `${needle} is missing`).toBeGreaterThan(-1);
      return i;
    };
    expect(at('<main')).toBeLessThan(at('<PriorityRegion />'));
    expect(at('<PriorityRegion />')).toBeLessThan(at('<DayFrameRegion />'));
    expect(at('<DayFrameRegion />')).toBeLessThan(at('<StreamRegion />'));
    expect(at('<StreamRegion />')).toBeLessThan(at('<CompletedPriorityRegion />'));
    expect(at('<CompletedPriorityRegion />')).toBeLessThan(at('</main>'));
  });

  it('every region on the first screenful has a placeholder, never a bare null', () => {
    const body = shellBody();
    for (const [region, fallback] of [
      ['<HeroBodyRegion />', '<HomeHeroBodyPlaceholder'],
      ['<PriorityRegion />', '<PriorityPlaceholder'],
      ['<DayFrameRegion />', '<DayFramePlaceholder'],
      ['<StreamRegion />', '<StreamPlaceholder'],
    ]) {
      const at = body.indexOf(region!);
      const boundary = body.lastIndexOf('<Suspense', at);
      expect(body.slice(boundary, at), `${region} has no placeholder`).toContain(fallback!);
    }
  });
});

describe('the placeholders are the brand settling, not a spinner circus', () => {
  it('every placeholder uses the one settling treatment', () => {
    expect(PLACEHOLDERS).toContain('mef-settling');
    // No spinners anywhere on this screen.
    expect(PLACEHOLDERS).not.toMatch(/animate-spin|Loader|Spinner/);
    expect(HOME).not.toMatch(/animate-spin|Loader2|Spinner/);
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

  it('the dominant slot reserves the shape she is actually going to get', () => {
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
