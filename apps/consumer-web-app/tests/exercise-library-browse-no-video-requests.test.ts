/**
 * Guard test (e): the browse grid must make zero Your Move video-field
 * requests — browsing/searching/scrolling the Exercise Library should
 * never spend Your Move quota. app/api/exercises/route.ts (the only route
 * the browser talks to for search/browse) gets all of its Your Move data
 * from OUR OWN database (getYourMoveLinkMap/getExtractedPosterMap — rows
 * written ahead of time by the offline scripts), never from a live Your
 * Move HTTP call. This is proven structurally: the route's source must
 * never reference YourMoveApiClient, buildYourMoveApiClientFromEnv,
 * listExercises, or getExercise (the two methods capable of making an
 * actual Your Move request) — only the read-only DB helpers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTE_PATH = path.resolve(__dirname, '../app/api/exercises/route.ts');

describe('guard test (e): browse route never triggers a Your Move HTTP request', () => {
  const source = readFileSync(ROUTE_PATH, 'utf-8');

  it('does not import the Your Move HTTP client at all', () => {
    expect(source).not.toMatch(/from ['"].*your-move\/apiClient['"]/);
  });

  it('does not reference YourMoveApiClient, buildYourMoveApiClientFromEnv, listExercises, or a live getExercise call', () => {
    expect(source).not.toMatch(/YourMoveApiClient/);
    expect(source).not.toMatch(/buildYourMoveApiClientFromEnv/);
    expect(source).not.toMatch(/\.listExercises\(/);
  });

  it('does use the DB-only Your Move link/poster lookups (proves the test isn\'t vacuously passing on an empty/broken file)', () => {
    expect(source).toMatch(/getYourMoveLinkMap/);
    expect(source).toMatch(/getExtractedPosterMap/);
  });
});
