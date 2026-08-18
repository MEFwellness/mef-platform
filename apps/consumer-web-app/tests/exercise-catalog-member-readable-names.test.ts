/**
 * Guard test: no exercise a coach can put in front of a member carries
 * vendor plumbing in its name.
 *
 * CLAUDE.md: "An exercise name a member can read describes the MOVEMENT...
 * it never carries vendor plumbing: no (L) / (R) side suffixes, no provider
 * ids, no internal variant codes." Migration 176 fixed one such name by
 * hand ("Split squat (R)" -> "Split Squat"); migration 182 swept the other
 * 119. This is what stops them coming back, and Your Move's catalog sync
 * (scripts/exercise-media/fetch-your-move-catalog.ts) writes the vendor's
 * own `title` straight into `name`, so they genuinely can come back.
 *
 * The rule itself lives in lib/exercise-library/memberReadableNames.ts, the
 * same list migration 182's assertion is written from, so the two cannot
 * drift into describing different rules.
 *
 * Real local Supabase, no mocks, same as every other integration test here.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import {
  VENDOR_PLUMBING_PATTERNS,
  DEFERRED_PLUMBING_EXTERNAL_IDS,
  findVendorPlumbing,
} from '../lib/exercise-library/memberReadableNames';
import { resolveSearchAlias } from '../lib/exercise-library/searchAliases';

type CatalogRow = { external_id: string; name: string; is_client_assignable: boolean };

const TEST_EXTERNAL_ID = `test-plumbing-guard-${Date.now()}`;

async function fetchCatalog(): Promise<CatalogRow[]> {
  const supabase = serviceRoleClient();
  const rows: CatalogRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from('exercise_catalog')
      .select('external_id, name, is_client_assignable')
      .range(offset, offset + 499);
    if (error) throw new Error(`exercise_catalog read failed: ${error.message}`);
    const page = (data ?? []) as CatalogRow[];
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}

let catalog: CatalogRow[];
let assignable: CatalogRow[];

beforeAll(async () => {
  catalog = await fetchCatalog();
  assignable = catalog.filter((r) => r.is_client_assignable);
});

describe('member-readable exercise names', () => {
  it('scans the whole real catalog, not a truncated page', () => {
    expect(catalog.length).toBeGreaterThan(800);
    expect(assignable.length).toBeGreaterThan(500);
  });

  it('no client-assignable name carries vendor plumbing', () => {
    const offenders = assignable
      .filter((r) => !(r.external_id in DEFERRED_PLUMBING_EXTERNAL_IDS))
      .map((r) => ({ row: r, hits: findVendorPlumbing(r.name) }))
      .filter((x) => x.hits.length > 0);

    if (offenders.length > 0) {
      throw new Error(
        `${offenders.length} client-assignable exercise name(s) carry vendor plumbing:\n` +
          offenders
            .map(
              (o) =>
                `  "${o.row.name}" [${o.row.external_id}] — ${o.hits.map((h) => h.label).join(', ')}`
            )
            .join('\n') +
          '\nFix the name in exercise_catalog (see migration 182). Never paper over it with a display-only alias.'
      );
    }
    expect(offenders).toEqual([]);
  });

  it('the names migration 182 produced are the ones actually in the catalog', () => {
    // A spot sample across all four rename shapes, so a partially-applied
    // migration reads as a failure here rather than as a clean run.
    const names = new Set(catalog.map((r) => r.name));
    for (const expected of [
      'Calf Stretch, Left Side', // pair
      'Calf Stretch, Right Side', // pair
      'Warrior III, Left Side', // pair, roman numeral preserved
      'Standing Palm-In One-Arm Dumbbell Press, Left Side', // pair, bracket was never closed
      'Dumbbell Get Ups', // orphan, bare name was free
      'Over and Under, Left Side', // orphan, bare name was taken
      'Power Snatch', // junk, vendor note removed
      "Child's Pose for Lower Back", // junk, underscore was an apostrophe
      'Split Squat', // migration 176, still standing
    ]) {
      expect(names.has(expected), `catalog is missing "${expected}"`).toBe(true);
    }

    for (const gone of [
      'Calf stretch (left)',
      'Warrior III (left)',
      'Standing Palm-In One-Arm Dumbbell Press (L',
      'Dumbbell get ups (R)',
      'Power Snatch (ISSUE_ back on pick up a bit bend)',
      'Split squat (R)',
    ]) {
      expect(names.has(gone), `catalog still carries "${gone}"`).toBe(false);
    }
  });

  it('a coach searching the movement words still finds the renamed exercise', async () => {
    // Search is a plain substring match (searchExerciseCatalog, ilike
    // '%q%'). There is no alias column in the schema, so the old name in
    // full no longer matches — but every rename kept the movement words in
    // the same order, which is what a coach actually types.
    const supabase = serviceRoleClient();
    for (const [query, expectedCount] of [
      ['calf stretch', 2],
      ['warrior iii', 2],
      ['palm-in', 2],
    ] as const) {
      const { data, error } = await supabase
        .from('exercise_catalog')
        .select('name')
        .ilike('name', `%${query}%`);
      expect(error).toBeNull();
      expect((data ?? []).length, `search "${query}"`).toBe(expectedCount);
    }
  });

  it('a coach who typed the OLD name of a word-changed rename is redirected to the new one', async () => {
    // Substring search follows every rename that only re-punctuated or
    // re-cased a name. It cannot follow the seven where a word changed
    // (three vendor typos, a stray "My", an abbreviation, two inserted
    // words), so those are the ones lib/exercise-library/searchAliases.ts
    // now carries. Each alias is checked to actually land on rows.
    const supabase = serviceRoleClient();
    for (const oldName of [
      'Singel arm push up',
      'Cuads Belt Squat Machine',
      'My Side Bend Stretch',
      'Standing One-Arm DB Triceps ExtensioN',
      'Standing One-Arm DBl Triceps Extension',
      'narrow squats chair',
      'Jumping Ropes skips',
    ]) {
      const resolved = resolveSearchAlias(oldName);
      expect(resolved, `"${oldName}" has no alias`).not.toBe(oldName);

      const { data, error } = await supabase
        .from('exercise_catalog')
        .select('name')
        .ilike('name', `%${resolved}%`);
      expect(error).toBeNull();
      expect(
        (data ?? []).length,
        `alias "${oldName}" -> "${resolved}" finds nothing`
      ).toBeGreaterThan(0);

      // And the old name on its own genuinely does not, which is what
      // makes the alias necessary rather than decorative.
      const { data: direct } = await supabase
        .from('exercise_catalog')
        .select('name')
        .ilike('name', `%${oldName}%`);
      expect((direct ?? []).length, `"${oldName}" still matches directly`).toBe(0);
    }
  });

  it('every deferred exemption still points at a real row that still needs it', () => {
    const ids = Object.keys(DEFERRED_PLUMBING_EXTERNAL_IDS);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const row = catalog.find((r) => r.external_id === id);
      expect(row, `deferred exemption ${id} names a row that no longer exists`).toBeDefined();
      // If someone has since cleaned it, the exemption is dead weight and
      // should be deleted rather than left to hide a future regression.
      expect(
        findVendorPlumbing(row!.name).length,
        `deferred exemption ${id} ("${row!.name}") is no longer needed — delete it`
      ).toBeGreaterThan(0);
    }
  });

  it('is proven non-vacuous: every pattern still catches its own real example', () => {
    for (const p of VENDOR_PLUMBING_PATTERNS) {
      expect(p.test(p.example), `pattern "${p.label}" no longer matches its example`).toBe(true);
    }
    // And a clean name trips none of them.
    for (const clean of ['Split Squat', 'Bodyweight Squat (air squat)', 'Warrior II, Left Side']) {
      expect(findVendorPlumbing(clean), `"${clean}" should be clean`).toEqual([]);
    }
  });
});

describe('the guard catches a real regression, not just a synthetic string', () => {
  afterEach(async () => {
    await serviceRoleClient().from('exercise_catalog').delete().eq('external_id', TEST_EXTERNAL_ID);
  });

  it('a plumbing-named row inserted into the real catalog is found by the same scan', async () => {
    const supabase = serviceRoleClient();
    const { error } = await supabase.from('exercise_catalog').insert({
      provider: 'your_move',
      external_id: TEST_EXTERNAL_ID,
      name: 'Guard Test Stretch (L)',
      has_video: true,
    });
    expect(error).toBeNull();

    const rows = await fetchCatalog();
    const injected = rows.find((r) => r.external_id === TEST_EXTERNAL_ID);
    expect(injected).toBeDefined();
    // It arrived assignable, so the real guard above would have seen it.
    expect(injected!.is_client_assignable).toBe(true);
    expect(findVendorPlumbing(injected!.name).map((p) => p.label)).toContain('side marker');
  });
});
