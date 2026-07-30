import { describe, it, expect } from 'vitest';
import {
  normalizeCatalogName,
  findDuplicateGroups,
  chooseKeeper,
  mergeCatalogFields,
  mergeMetadataFields,
} from '../lib/exercise-library/catalogDedupe';
import type { ExerciseCatalogRow } from '@mef/shared-types-contracts';

function row(overrides: Partial<ExerciseCatalogRow> & { external_id: string; name: string }): ExerciseCatalogRow {
  return {
    id: overrides.external_id,
    provider: 'your_move',
    slug: null,
    description: null,
    instructions: [],
    exercise_tips: [],
    primary_muscle: null,
    secondary_muscles: [],
    equipment: null,
    category: null,
    difficulty: null,
    exercise_type: [],
    has_video: false,
    has_video_white: false,
    has_video_gym: false,
    video_url: null,
    video_url_expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeCatalogName', () => {
  it('treats case and spacing differences as the same name', () => {
    expect(normalizeCatalogName('Barbell Sumo Squat')).toBe(normalizeCatalogName('barbell   sumo squat'));
  });

  it('treats punctuation-only differences as the same name', () => {
    expect(normalizeCatalogName('Push-Up Wide')).toBe(normalizeCatalogName('Push Up Wide'));
    expect(normalizeCatalogName("One-Arm Kettlebell Snatch - From ground")).toBe(
      normalizeCatalogName('One-Arm Kettlebell Snatch from ground')
    );
  });

  it('strips a trailing vendor "(N)" collision-marker suffix', () => {
    expect(normalizeCatalogName('Squats to knee(1)')).toBe(normalizeCatalogName('Squats to knee'));
  });

  it('does not collapse a real distinguishing word', () => {
    // "Smith Machine Squat" vs "Smith Machine Squats" differ by more than
    // spacing/casing/punctuation — this normalizer must not merge them.
    expect(normalizeCatalogName('Smith Machine Squat')).not.toBe(normalizeCatalogName('Smith Machine Squats'));
  });
});

describe('findDuplicateGroups', () => {
  it('groups rows with the same normalized name and ignores unique names', () => {
    const rows = [
      row({ external_id: 'a', name: 'Barbell Deadlift' }),
      row({ external_id: 'b', name: 'barbell deadlift' }),
      row({ external_id: 'c', name: 'Leg Press' }),
    ];
    const groups = findDuplicateGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((r) => r.external_id).sort()).toEqual(['a', 'b']);
  });

  it('returns no groups when every name is unique', () => {
    const rows = [row({ external_id: 'a', name: 'Plank' }), row({ external_id: 'b', name: 'Push Up' })];
    expect(findDuplicateGroups(rows)).toEqual([]);
  });
});

describe('chooseKeeper', () => {
  it('prefers the row with video over one without', () => {
    const withVideo = row({ external_id: 'a', name: 'Plank', has_video: true });
    const withoutVideo = row({ external_id: 'b', name: 'plank', has_video: false, instructions: ['x', 'y', 'z'] });
    const { keeper } = chooseKeeper([withoutVideo, withVideo]);
    expect(keeper.external_id).toBe('a');
  });

  it('given equal video status, prefers more complete instructions', () => {
    const terse = row({ external_id: 'a', name: 'Plank', has_video: true, instructions: ['one'] });
    const detailed = row({
      external_id: 'b',
      name: 'plank',
      has_video: true,
      instructions: ['one', 'two', 'three'],
    });
    const { keeper } = chooseKeeper([terse, detailed]);
    expect(keeper.external_id).toBe('b');
  });

  it('given equal video and instructions, prefers more complete metadata', () => {
    const sparse = row({
      external_id: 'a',
      name: 'Plank',
      has_video: true,
      instructions: ['one'],
      category: null,
      difficulty: null,
    });
    const rich = row({
      external_id: 'b',
      name: 'plank',
      has_video: true,
      instructions: ['one'],
      category: 'core',
      difficulty: 'beginner',
      description: 'A core hold.',
    });
    const { keeper } = chooseKeeper([sparse, rich]);
    expect(keeper.external_id).toBe('b');
  });

  it('is deterministic when rows are otherwise tied (tie-break by external_id)', () => {
    const a = row({ external_id: 'zzz', name: 'Plank' });
    const b = row({ external_id: 'aaa', name: 'plank' });
    expect(chooseKeeper([a, b]).keeper.external_id).toBe('aaa');
    expect(chooseKeeper([b, a]).keeper.external_id).toBe('aaa');
  });
});

describe('mergeCatalogFields', () => {
  it('fills a keeper gap from a discard without overwriting a value the keeper already has', () => {
    const keeper = row({ external_id: 'a', name: 'Leg Press', category: 'legs', difficulty: null });
    const discard = row({ external_id: 'b', name: 'leg press', category: 'strength', difficulty: 'beginner' });
    const merged = mergeCatalogFields(keeper, [discard]);
    expect(merged.category).toBe('legs'); // keeper's own value wins
    expect(merged.difficulty).toBe('beginner'); // keeper had none, borrowed from discard
  });

  it('unions secondary_muscles instead of dropping either side', () => {
    const keeper = row({ external_id: 'a', name: 'Deadlift', secondary_muscles: ['core'] });
    const discard = row({ external_id: 'b', name: 'deadlift', secondary_muscles: ['core', 'forearms'] });
    const merged = mergeCatalogFields(keeper, [discard]);
    expect(new Set(merged.secondary_muscles)).toEqual(new Set(['core', 'forearms']));
  });

  it('does not splice instructions together — keeper keeps its own steps when it has any', () => {
    const keeper = row({ external_id: 'a', name: 'Squat', instructions: ['keeper step 1', 'keeper step 2'] });
    const discard = row({ external_id: 'b', name: 'squat', instructions: ['discard step 1'] });
    const merged = mergeCatalogFields(keeper, [discard]);
    expect(merged.instructions).toEqual(['keeper step 1', 'keeper step 2']);
  });

  it('borrows a discard’s instructions wholesale only when the keeper has none at all', () => {
    const keeper = row({ external_id: 'a', name: 'Squat', instructions: [] });
    const discard = row({ external_id: 'b', name: 'squat', instructions: ['discard step 1', 'discard step 2'] });
    const merged = mergeCatalogFields(keeper, [discard]);
    expect(merged.instructions).toEqual(['discard step 1', 'discard step 2']);
  });

  it('OR-combines video flags so a video is never lost', () => {
    const keeper = row({ external_id: 'a', name: 'Row', has_video: false, has_video_gym: false });
    const discard = row({ external_id: 'b', name: 'row', has_video: true, has_video_gym: true });
    const merged = mergeCatalogFields(keeper, [discard]);
    expect(merged.has_video).toBe(true);
    expect(merged.has_video_gym).toBe(true);
  });
});

describe('mergeMetadataFields', () => {
  it('unions coaching_cues from keeper and discards, deduplicated', () => {
    const keeper = { coaching_cues: ['Keep your core tight', 'Breathe steadily'] };
    const discard = { coaching_cues: ['Breathe steadily', 'Push through your heels'] };
    const merged = mergeMetadataFields(keeper, [discard]);
    expect(new Set(merged.coaching_cues as string[])).toEqual(
      new Set(['Keep your core tight', 'Breathe steadily', 'Push through your heels'])
    );
  });

  it('keeps the keeper’s scalar curation value over a discard’s when both are set', () => {
    const keeper = { program_section: 'strength' };
    const discard = { program_section: 'mobility' };
    const merged = mergeMetadataFields(keeper, [discard]);
    expect(merged.program_section).toBe('strength');
  });

  it('borrows a discard’s scalar curation value when the keeper has none', () => {
    const keeper = { coach_notes: null };
    const discard = { coach_notes: 'Watch for knee valgus.' };
    const merged = mergeMetadataFields(keeper, [discard]);
    expect(merged.coach_notes).toBe('Watch for knee valgus.');
  });
});
