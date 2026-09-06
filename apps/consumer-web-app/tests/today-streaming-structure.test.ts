/**
 * TODAY NOW STREAMS, AND THAT IS A SHAPE, NOT A NUMBER.
 *
 * Before 2026-09-06 this page awaited five stages of reads before it
 * returned a single tag of JSX: a batch of eight, then her local date, then
 * her hydration answer, then a batch of six, then the Priority Card's own
 * engine. Nothing streams past an unsuspended await, so the whole screen
 * waited on the slowest read on it — measured on production, the first byte
 * of real content arrived 2.87 seconds after the tap.
 *
 * The gain is entirely structural, and structure is exactly what a
 * well-meaning later edit undoes without noticing: one `await` added to the
 * shell puts every card back in front of her heading. So it is written down
 * here as a source rule, the same way tests/home-streaming-structure.test.ts
 * holds Home's.
 *
 * These are source assertions on purpose. What is held is the SHAPE of the
 * render, which a rendered-HTML test cannot see: it gets every boundary
 * resolved and cannot tell whether they resolved before or after the shell
 * was flushed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');

const TODAY = read('app/today/page.tsx');
const FRAME = read('lib/today/frame.ts');
const DATA = read('lib/today/data.ts');

/** The body of `TodayPage` itself, from its signature to the end of its return. */
function shellBody(): string {
  const start = TODAY.indexOf('export default async function TodayPage');
  expect(start).toBeGreaterThan(-1);
  const end = TODAY.indexOf('\n}\n', TODAY.indexOf('return (', start));
  return TODAY.slice(start, end);
}

describe('the shell waits for one thing', () => {
  it('TodayPage awaits the Today frame and nothing else', () => {
    const awaits = shellBody().match(/await [A-Za-z_$][\w$.]*\(/g) ?? [];
    expect(awaits).toEqual(['await requireTodayFrame(']);
  });

  it('the frame is two round trips behind her session, not a data gather', () => {
    // Whatever else moves into lib/today/frame.ts later, it must stay this
    // small: everything in it is in front of the first thing she reads.
    expect(FRAME.match(/\.from\('(\w+)'\)/g) ?? []).toEqual([]);
    expect(FRAME).toContain('memberProfileCore(supabase, user.id)');
    expect(FRAME).toContain("hasActiveRole(supabase, user.id, 'coach')");
    // Her clock is resolved here, from her own stored zone, so the day pill
    // is not UTC's day. Same rule as every other date in this app.
    expect(FRAME).toContain('timeZone: timezone');
  });

  it('the heading and the day pill are rendered by the shell, not by a boundary below it', () => {
    const body = shellBody();
    const heading = body.indexOf('Today\n          </h1>');
    const firstSuspense = body.indexOf('<Suspense');
    expect(heading).toBeGreaterThan(-1);
    expect(heading).toBeLessThan(firstSuspense);
    expect(body).toContain('{frame.timeContext.dayOfWeek}');
  });

  it('the bottom navigation is in the first response too, so she can leave immediately', () => {
    expect(shellBody()).toContain('<MemberBottomNav isCoach={frame.isCoach} />');
  });
});

describe('what streams in behind it', () => {
  it('every region on the first screenful has a placeholder, never a bare null', () => {
    const body = shellBody();
    for (const [region, fallback] of [
      ['<ModeChipsRegion />', '<ModeChipPlaceholder />'],
      ['<EncouragementRegion />', '<EncouragementPlaceholder />'],
      ['<TodayBody />', '<TodayBodyPlaceholder />'],
    ]) {
      const at = body.indexOf(region!);
      expect(at, `${region} is missing`).toBeGreaterThan(-1);
      const boundary = body.lastIndexOf('<Suspense', at);
      expect(body.slice(boundary, at), `${region} has no placeholder`).toContain(fallback!);
    }
  });

  it('the only region with no placeholder is the fixed launcher, which moves nothing', () => {
    const body = shellBody();
    const at = body.indexOf('<CoachLauncherRegion />');
    const boundary = body.lastIndexOf('<Suspense', at);
    expect(body.slice(boundary, at)).toContain('fallback={null}');
  });

  it('the placeholders are the brand settling treatment, and there is no spinner on this screen', () => {
    expect(TODAY).toContain('mef-settling');
    expect(TODAY).not.toMatch(/animate-spin|Loader2|Spinner/);
    // Countable by a verification run, and never read out as a row of boxes.
    const blocks = TODAY.match(/data-settling="true"/g) ?? [];
    const hidden = TODAY.match(/aria-hidden="true"/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(hidden.length).toBeGreaterThanOrEqual(blocks.length);
  });

  it('three regions read one decision between them', () => {
    // Splitting a page into boundaries costs a read per boundary unless
    // somebody says otherwise. lib/today/data.ts is where it is said.
    expect(DATA).toContain('export const todayCoachingDecision = requestCache(');
    expect(TODAY.match(/todayCoachingDecision\(\)/g) ?? []).toHaveLength(4);
    // And the decision is handed her timezone, which the frame already read,
    // so the action does not go back for the same profiles row.
    expect(DATA).toContain('getMyCoachingDecision(frame.timezone)');
  });
});

describe('one card failing is not the whole screen failing', () => {
  it('every streamed region on this page carries its own error boundary', () => {
    const body = shellBody();
    const boundaries = body.match(/<RegionErrorBoundary/g) ?? [];
    const suspenses = body.match(/<Suspense/g) ?? [];
    expect(boundaries.length).toBe(suspenses.length);
  });

  it('the body says something she can act on, and the header chips say nothing at all', () => {
    const body = shellBody();
    expect(body).toContain('<RegionErrorBoundary message="Today didn\'t load.">');
    // A retry card where a chip goes would be louder than the chip it
    // replaced, so those two fail quietly.
    expect((body.match(/<RegionErrorBoundary silent>/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('a render still decides nothing', () => {
  it('the Today frame reads and never writes', () => {
    expect(FRAME).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  });
});
