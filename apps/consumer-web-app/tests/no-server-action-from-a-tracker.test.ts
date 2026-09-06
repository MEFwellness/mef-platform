/**
 * AN INVISIBLE TRACKER NEVER CALLS A SERVER ACTION.
 *
 * WHAT THIS IS ABOUT. A component that renders nothing and fires from a
 * mounted effect exists so that a write happens AFTER the screen has
 * painted and never delays the render the member is waiting on. Calling a
 * Server Action does not have that property: Next POSTs to the route she is
 * standing on and re-renders the whole of it on the server, then streams
 * the fresh payload back with the action's result.
 *
 * MEASURED ON PRODUCTION, TWICE. app/api/analytics/track/route.ts's own
 * header records the first time: a `surface_viewed` row cost Home a second
 * full page render. The 2026-09-06 audit found six more that had been
 * added since, and one of them was the single largest thing on Home's
 * clock: two experiment panels each asked `getMyLifestyleExperiments()`
 * from a mounted effect, which is two more complete server renders of
 * /dashboard, roughly five seconds each, AFTER the page had finished. Home
 * went from settling at 8.9s to settling at a fraction of that when they
 * stopped.
 *
 * THE RULE, AND IT IS NOT "NEVER CALL AN ACTION". A button she pressed may
 * call one: she is waiting for something to happen and the re-render is how
 * the screen catches up. What may not is a component whose whole job is to
 * be invisible — a Track*, a Mark*, an Acknowledge* — because the member
 * gets nothing back for the render it costs. Those report through
 * lib/analytics/beacon.ts, which POSTs to a route handler that returns 204
 * and re-renders nothing.
 *
 * THE SECOND HALF, and it is the one that actually caught the big one: a
 * component that is rendered on a STREAMED screen must not fetch from an
 * effect what the screen it sits on has already read. `LscExperimentPanel`
 * and `RplExperimentPanel` take their active experiments as a prop now, and
 * Home passes the rows it had already fetched.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');

/** Every .tsx under components/ and app/, so a new tracker is covered the day it lands. */
function allComponentFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(APP_ROOT, dir))) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const rel = `${dir}/${entry}`;
      if (statSync(path.join(APP_ROOT, rel)).isDirectory()) walk(rel);
      else if (entry.endsWith('.tsx')) found.push(rel);
    }
  };
  walk('components');
  walk('app');
  return found;
}

/**
 * The name of every component in this file that renders nothing and fires
 * on mount. Recognised by shape rather than by a list, so a new one is
 * covered without anybody remembering to add it: a client component whose
 * name starts with Track, Mark or Acknowledge.
 */
const TRACKER_NAME = /^(Track|Mark|Acknowledge)[A-Z]/;

function trackerComponentsIn(source: string): string[] {
  return [...source.matchAll(/export function ([A-Za-z0-9_]+)\s*\(/g)]
    .map((match) => match[1]!)
    .filter((name) => TRACKER_NAME.test(name));
}

describe('no invisible tracker calls a Server Action', () => {
  const files = allComponentFiles();

  it('finds the trackers at all, so this suite cannot pass by looking at nothing', () => {
    const withTrackers = files.filter((file) => trackerComponentsIn(read(file)).length > 0);
    expect(withTrackers.length).toBeGreaterThanOrEqual(4);
  });

  it('every one of them reports through the beacon and imports no action module', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = read(file);
      const trackers = trackerComponentsIn(source);
      if (trackers.length === 0) continue;
      if (!source.includes("'use client'")) continue;
      // Whole statements, not lines: an import spread over several lines is
      // exactly the shape a line-by-line check misses, and a guard that
      // misses it passes vacuously.
      const importsAnAction = /import\s[\s\S]*?from\s+['"]@\/app\/actions\/[^'"]+['"]/.test(source);
      if (importsAnAction) offenders.push(`${file} (${trackers.join(', ')})`);
    }
    expect(offenders).toEqual([]);
  });

  it('the six that were moved on 2026-09-06 are all on the beacon', () => {
    for (const [file, event] of [
      ['components/programs/MarkProgramOpened.tsx', 'program_opened'],
      ['components/weekly-review/TrackWeeklyReviewViewed.tsx', 'weekly_review_viewed'],
      ['components/visibility/AcknowledgeReveals.tsx', 'reveals_acknowledged'],
      ['components/movement-sessions/MovementSessionPlayer.tsx', 'movement_session_viewed'],
      ['components/exercise-library/TrackExerciseView.tsx', 'exercise_viewed'],
      ['components/locked/LockedCardButton.tsx', 'paywall_viewed'],
    ] as const) {
      const source = read(file);
      expect(source, file).toContain('sendBeacon');
      expect(source, file).toContain(`event: '${event}'`);
    }
  });

  it('every beacon event the trackers send is one the route handler actually handles', () => {
    const route = read('app/api/analytics/track/route.ts');
    const beacon = read('lib/analytics/beacon.ts');
    const declared = [...beacon.matchAll(/event: '([a-z_]+)'/g)].map((match) => match[1]!);
    expect(declared.length).toBeGreaterThan(10);
    for (const event of new Set(declared)) {
      expect(route, `route handler should handle '${event}'`).toContain(`case '${event}':`);
    }
  });
});

describe('a panel on a streamed screen does not re-ask for what the screen already read', () => {
  it('both experiment panels take their active experiments as a prop', () => {
    for (const file of [
      'components/life-signal-check/LscExperimentPanel.tsx',
      'components/readiness-pulse/RplExperimentPanel.tsx',
    ]) {
      const source = read(file);
      expect(source, file).toContain('activeExperiments?: LifestyleExperiment[]');
      // `undefined` means "nobody told me", which is the only case that
      // still asks the server. A caller that passes an empty array is
      // saying she has none, and must not trigger a fetch.
      expect(source, file).toContain('providedExperiments !== undefined');
    }
  });

  it('Home passes them, from rows it had already fetched', () => {
    const source = read('components/dashboard/ActiveExperimentsSection.tsx');
    expect(source).toContain(
      "const activeExperiments = allExperiments.filter((e) => e.status === 'active');"
    );
    // Both offer panels, which are the two branches that reached the fetch.
    expect(source.match(/activeExperiments=\{activeExperiments\}/g) ?? []).toHaveLength(2);
  });

  it('the two standalone result screens pass them too, read on the server', () => {
    for (const file of [
      'app/assessments/life-signal-check/results/[sessionId]/page.tsx',
      'app/assessments/readiness-pulse/results/[sessionId]/page.tsx',
    ]) {
      const source = read(file);
      expect(source, file).toContain('getMyLifestyleExperiments()');
      expect(source, file).toContain('activeExperiments={activeExperiments}');
    }
  });
});
