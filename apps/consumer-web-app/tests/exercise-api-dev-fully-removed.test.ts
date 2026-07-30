/**
 * Guard test: ExerciseAPI.dev integration code is gone entirely — Your
 * Move is the sole Exercise Library catalog (migration 119). The
 * 'exercise_api_dev' string literal is still legitimately allowed as a
 * legacy provider marker on pre-existing member data (favorites,
 * completions, recent views, coach program/prescription rows), so this
 * doesn't ban that literal outright — it bans the actual vendor
 * integration: the API client file, the vendor's own base URL, and its
 * env var, anywhere in application source (lib/, app/, components/,
 * scripts/ — excluding tests and committed historical JSON reports).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_DIRS = ['lib', 'app', 'components', 'scripts'];
const ROOT = path.resolve(__dirname, '..');

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      collectFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('guard test: ExerciseAPI.dev integration is fully removed', () => {
  const files = SOURCE_DIRS.flatMap((dir) => collectFiles(path.join(ROOT, dir)));

  it('scans a non-trivial number of source files (proves this is not vacuously passing on an empty file list)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no file imports lib/exercise-library/apiClient (deleted) or references ExerciseApiClient/EXERCISE_API_KEY/api.exerciseapi.dev', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      if (
        /exercise-library\/apiClient/.test(source) ||
        /\bExerciseApiClient\b/.test(source) ||
        /\bEXERCISE_API_KEY\b/.test(source) ||
        /api\.exerciseapi\.dev/.test(source)
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no file imports the deleted your-move/links or exercise-library/openLicenseImages|wikimediaCommons modules', () => {
    // Table names like your_move_exercise_links/exercise_open_license_images
    // may still legitimately appear in prose (this migration's own header,
    // the one-time cleanup script that empties those tables before the
    // migration drops them) — what must be gone is the deleted *modules*
    // themselves, checked by their actual import paths.
    const bannedImportPatterns = [
      /from\s+['"][^'"]*your-move\/links['"]/,
      /from\s+['"][^'"]*exercise-library\/openLicenseImages['"]/,
      /from\s+['"][^'"]*exercise-library\/wikimediaCommons['"]/,
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      if (bannedImportPatterns.some((pattern) => pattern.test(source))) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the one legitimate mention of exercise_open_license_images (the pre-migration cleanup script) is exactly one file, proving the assertion above isn't vacuous", () => {
    const mentioning = files.filter((file) => /exercise_open_license_images/.test(readFileSync(file, 'utf-8')));
    const relative = mentioning.map((f) => path.relative(ROOT, f));
    expect(relative).toEqual(['scripts/exercise-media/cleanup-exercise-api-media.ts']);
  });
});
