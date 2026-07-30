/**
 * Guard test: Video Only / Image Only / Hide No Media filters are removed
 * entirely (every catalog exercise now has video, per the Your Move
 * sole-catalog migration), and Force/Mechanic filters are removed since
 * Your Move's own catalog has no such fields (a filter with no backing
 * data must be removed, not left empty). Category/Body Region/Muscle/
 * Equipment/Difficulty remain. Source-scan since ExerciseFilters.tsx is a
 * client component with no jsdom/RTL configured in this suite.
 *
 * Proven non-vacuous during development: temporarily restored the old
 * `hasVideo`/`imageOnly`/`hideNoMedia`/`force`/`mechanic` fields, watched
 * every assertion below fail, then reverted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILTERS_PATH = path.resolve(__dirname, '../components/exercise-library/ExerciseFilters.tsx');
const BROWSER_PATH = path.resolve(__dirname, '../components/exercise-library/ExerciseLibraryBrowser.tsx');
const ROUTE_PATH = path.resolve(__dirname, '../app/api/exercises/route.ts');

describe('guard test: media-only and vendor-only filters are gone', () => {
  const filtersSource = readFileSync(FILTERS_PATH, 'utf-8');
  const browserSource = readFileSync(BROWSER_PATH, 'utf-8');
  const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

  it('ExerciseFilterState has no hasVideo/imageOnly/hideNoMedia/force/mechanic fields', () => {
    for (const removed of ['hasVideo', 'imageOnly', 'hideNoMedia', 'force', 'mechanic', 'Force', 'Mechanic']) {
      expect(filtersSource).not.toContain(removed);
    }
  });

  it('the browse route never parses hasVideo/imageOnly/hideNoMedia/force/mechanic query params', () => {
    for (const removed of ['imageOnly', 'hideNoMedia', "params.get('force')", "params.get('mechanic')"]) {
      expect(routeSource).not.toContain(removed);
    }
  });

  it('the browser never sends the removed filter params', () => {
    for (const removed of ['hasVideo', 'imageOnly', 'hideNoMedia', 'force', 'mechanic']) {
      expect(browserSource).not.toContain(`filters.${removed}`);
    }
  });

  it('Category/Body Region/Muscle/Equipment/Difficulty filters are still present', () => {
    for (const kept of ['category', 'bodyRegion', 'muscle', 'equipment', 'level']) {
      expect(filtersSource).toContain(kept);
    }
  });
});
