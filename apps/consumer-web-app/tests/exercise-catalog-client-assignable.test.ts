/**
 * The one rule about what may be given to a member, held in three places
 * at once: the column that states it, the pool that reads it, and every
 * program the generator can produce.
 *
 * Real local Supabase, no mocks, same as every other integration test in
 * this suite.
 *
 * THE TEST THAT MATTERS MOST is the last describe block: every corrective
 * pattern at every severity, generated for real, with every selected
 * exercise checked against a set of non-assignable ids loaded SEPARATELY
 * from the pool the generator used. Checking the generator's output
 * against the generator's own input would prove nothing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { loadCorrectiveExercisePool } from '../lib/corrective-engine/exercisePool';
import {
  listAssignableCatalogNames,
  listAssignableExternalIds,
  loadAssignableExerciseMetadata,
} from '../lib/exercise-library/assignable';
import { generateCorrectiveProgramDraft } from '../lib/corrective-engine/programGenerator';
import { BLUEPRINT_KEYS } from '../lib/corrective-engine/types';
import type { CorrectiveExercise, CorrectiveSeverity, DetectedPattern } from '../lib/corrective-engine/types';

const SEVERITIES: CorrectiveSeverity[] = ['mild', 'moderate', 'severe'];

type CatalogRow = {
  external_id: string;
  provider: string;
  has_video: boolean;
  is_client_assignable: boolean;
};

let catalog: CatalogRow[];
/** Loaded independently of anything the generator reads. */
let notAssignableIds: Set<string>;

beforeAll(async () => {
  const supabase = serviceRoleClient();
  const rows: CatalogRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from('exercise_catalog')
      .select('external_id, provider, has_video, is_client_assignable')
      .range(offset, offset + 499);
    if (error) throw error;
    const page = (data ?? []) as CatalogRow[];
    rows.push(...page);
    if (page.length < 500) break;
  }
  catalog = rows;
  notAssignableIds = new Set(rows.filter((r) => !r.is_client_assignable).map((r) => r.external_id));
});

describe('is_client_assignable, the column', () => {
  it('exists on every row and is never null', () => {
    expect(catalog.length).toBeGreaterThan(800);
    for (const row of catalog) {
      expect(typeof row.is_client_assignable).toBe('boolean');
    }
  });

  it('says exactly what having a video says, on every row', () => {
    for (const row of catalog) {
      expect(row.is_client_assignable).toBe(row.has_video);
    }
  });

  it('divides the catalog rather than waving everything through, or nothing', () => {
    const assignable = catalog.filter((r) => r.is_client_assignable);
    expect(assignable.length).toBeGreaterThan(0);
    expect(assignable.length).toBeLessThan(catalog.length);
  });

  it('holds back the MEF-authored exercises today, and holds them back for having no video rather than for being MEF s', () => {
    const mefCustom = catalog.filter((r) => r.provider === 'mef_custom');
    expect(mefCustom.length).toBeGreaterThan(0);
    for (const row of mefCustom) {
      // The whole point of the rule: the day one of these gets a video it
      // becomes assignable, with no code change and no migration. If that
      // ever happens this assertion is the thing that notices.
      expect(row.is_client_assignable).toBe(row.has_video);
    }
  });

  it('cannot be written to, because Postgres generates it', async () => {
    const supabase = serviceRoleClient();
    const target = catalog.find((r) => !r.is_client_assignable);
    expect(target).toBeDefined();
    const { error } = await supabase
      .from('exercise_catalog')
      .update({ is_client_assignable: true })
      .eq('external_id', target!.external_id);
    expect(error).not.toBeNull();

    // And the row is untouched.
    const { data } = await supabase
      .from('exercise_catalog')
      .select('is_client_assignable')
      .eq('external_id', target!.external_id)
      .single();
    expect((data as { is_client_assignable: boolean }).is_client_assignable).toBe(false);
  });
});

describe('the readers that feed a member program', () => {
  it('listAssignableCatalogNames returns every assignable exercise and no other', async () => {
    const names = await listAssignableCatalogNames(serviceRoleClient());
    const expected = catalog.filter((r) => r.is_client_assignable);
    expect(names.size).toBe(expected.length);
    for (const id of notAssignableIds) expect(names.has(id)).toBe(false);
  });

  it('pages past 500 rather than truncating, which is the bug this replaced', async () => {
    // Both former callers used a flat .limit(500) against a table with
    // more rows than that. A reader that still truncated would come back
    // with exactly 500 and this would go red.
    const ids = await listAssignableExternalIds(serviceRoleClient());
    expect(ids.size).toBeGreaterThan(500);

    const metadata = await loadAssignableExerciseMetadata(serviceRoleClient(), 'test');
    expect(metadata.length).toBeGreaterThan(500);
    for (const row of metadata) expect(notAssignableIds.has(row.external_id)).toBe(false);
  });

  it('the corrective pool contains no non-assignable exercise', async () => {
    const pool = await loadCorrectiveExercisePool(serviceRoleClient());
    expect(pool.length).toBeGreaterThan(0);
    for (const exercise of pool) {
      expect(notAssignableIds.has(exercise.externalId)).toBe(false);
    }
  });
});

describe('every program the generator can produce', () => {
  let pool: CorrectiveExercise[];

  beforeAll(async () => {
    pool = await loadCorrectiveExercisePool(serviceRoleClient());
  });

  for (const blueprint of BLUEPRINT_KEYS) {
    for (const severity of SEVERITIES) {
      it(`${blueprint} / ${severity} selects nothing that cannot be assigned`, () => {
        const patterns: DetectedPattern[] = [{ blueprint, severity, supportingFindingIds: [] }];
        const draft = generateCorrectiveProgramDraft({
          patterns,
          daysPerWeek: 3,
          seed: `assignability:${blueprint}:${severity}`,
          pool,
        });

        const selected = draft.weeklySessions.flatMap((session) =>
          session.blocks.flatMap((block) => block.exercises)
        );

        for (const exercise of selected) {
          expect(notAssignableIds.has(exercise.externalId)).toBe(false);
        }
      });
    }
  }

  it('the guard is not vacuous: at least one real program was actually built', () => {
    const draft = generateCorrectiveProgramDraft({
      patterns: [{ blueprint: 'lower_cross', severity: 'moderate', supportingFindingIds: [] }],
      daysPerWeek: 3,
      seed: 'assignability:non-vacuous',
      pool,
    });
    const count = draft.weeklySessions.flatMap((s) => s.blocks.flatMap((b) => b.exercises)).length;
    expect(count).toBeGreaterThan(10);
  });
});
