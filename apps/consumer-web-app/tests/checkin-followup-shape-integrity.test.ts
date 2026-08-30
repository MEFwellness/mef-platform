/**
 * The bug-class sweep, as a standing test against the real question bank
 * (migration 157). The reported bug was a data shape, not a code path: a
 * `count` parent ("How many meals did you skip today?") paired with a
 * `single_select` follow-up ("Which meal(s) did you skip?"). Anyone with
 * the coach Question Bank screen can recreate that pairing tomorrow with
 * no deploy, so the guard belongs against the bank itself rather than
 * against the two questions that happened to be wrong.
 *
 * Runs against the local Supabase instance the rest of the integration
 * suite uses (`supabase start` + `supabase db reset`).
 */
import { describe, it, expect } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { CHECKIN_COLUMN_QUESTION_KEYS } from '../lib/daily-checkin-adaptive/answeredMap';

type Row = {
  question_key: string;
  prompt: string;
  response_type: string;
  options: unknown;
  requires: { question_key: string; op: string; value: unknown }[] | null;
  active: boolean;
};

async function bank(): Promise<Row[]> {
  const { data, error } = await serviceRoleClient()
    .from('driver_probe_questions')
    .select('question_key, prompt, response_type, options, requires, active');
  expect(error).toBeNull();
  return (data ?? []) as Row[];
}

function optionValues(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options.map((o) => (o !== null && typeof o === 'object' ? String((o as { value: unknown }).value) : String(o)));
}

describe('migration 157 — the two questions the sweep found are really fixed in the database', () => {
  it('checkin_probe.skipped_meal_which is multi_select over exactly Breakfast, Lunch, Dinner', async () => {
    const row = (await bank()).find((r) => r.question_key === 'checkin_probe.skipped_meal_which');
    expect(row).toBeDefined();
    expect(row!.response_type).toBe('multi_select');
    expect(row!.active).toBe(true);
    expect(optionValues(row!.options)).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('its "More than one" stand-in option is gone, not merely hidden', async () => {
    const row = (await bank()).find((r) => r.question_key === 'checkin_probe.skipped_meal_which');
    expect(optionValues(row!.options)).not.toContain('more_than_one');
    expect(JSON.stringify(row!.options).toLowerCase()).not.toContain('more than one');
  });

  it('checkin_probe.digestive_symptom_type is multi_select over the five real symptoms, with no "More than one"', async () => {
    const row = (await bank()).find((r) => r.question_key === 'checkin_probe.digestive_symptom_type');
    expect(row).toBeDefined();
    expect(row!.response_type).toBe('multi_select');
    expect(optionValues(row!.options)).toEqual(['bloating', 'cramping', 'reflux_or_heartburn', 'gas', 'nausea']);
  });

  it('the parent count question is untouched: still a count, still 0 to 3', async () => {
    const row = (await bank()).find((r) => r.question_key === 'checkin_probe.meals_skipped_today');
    expect(row!.response_type).toBe('count');
    expect(row!.options).toEqual([0, 1, 2, 3]);
  });

  it('the follow-up still only appears once at least one meal was skipped, so a count of 0 never shows it', async () => {
    const row = (await bank()).find((r) => r.question_key === 'checkin_probe.skipped_meal_which');
    expect(row!.requires).toEqual([{ question_key: 'checkin_probe.meals_skipped_today', op: 'gte', value: 1 }]);
  });

  it('nothing was retired or deactivated to achieve any of this — the bank still has its 87 active questions', async () => {
    const rows = await bank();
    expect(rows.filter((r) => r.active).length).toBe(87);
  });
});

describe('the bug class itself cannot come back through a plain data edit', () => {
  it('no active count question has an active single_select follow-up', async () => {
    const rows = await bank();
    const byKey = new Map(rows.map((r) => [r.question_key, r]));
    const offenders = rows
      .filter((child) => child.active && child.response_type === 'single_select')
      .filter((child) => {
        const parent = byKey.get(child.requires?.[0]?.question_key ?? '');
        return !!parent && parent.active && parent.response_type === 'count';
      })
      .map((child) => `${child.question_key} (parent ${child.requires![0]!.question_key})`);
    expect(offenders).toEqual([]);
  });

  it('every active multi_select follow-up of a count parent offers at least as many options as the largest count that parent allows', async () => {
    const rows = await bank();
    const byKey = new Map(rows.map((r) => [r.question_key, r]));
    const offenders: string[] = [];
    for (const child of rows) {
      if (!child.active || child.response_type !== 'multi_select') continue;
      const parent = byKey.get(child.requires?.[0]?.question_key ?? '');
      if (!parent || !parent.active || parent.response_type !== 'count') continue;
      const maxCount = Math.max(...(parent.options as number[]));
      const offered = Array.isArray(child.options) ? child.options.length : 0;
      if (offered < maxCount) offenders.push(`${child.question_key}: ${offered} options vs a max count of ${maxCount}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no active single_select question leans on a "more than one" stand-in option, apart from crash_timing, whose parent is a plain yes/no and whose option is a real answer about timing', async () => {
    const rows = await bank();
    const offenders = rows
      .filter((r) => r.active && r.response_type === 'single_select')
      .filter((r) => optionValues(r.options).some((v) => v === 'more_than_one' || v === 'more_than_once'))
      .map((r) => r.question_key);
    expect(offenders).toEqual(['checkin_probe.crash_timing']);
  });

  it('every active follow-up has a parent that is really put to her, in the bank or in the fixed core, so no follow-up can be gated on a question nobody is ever asked', async () => {
    const rows = await bank();
    // The fixed core's own questions count as parents. They are asked on
    // every check-in by the check-in screen itself rather than drawn from
    // this bank, and migration 192 gates the two pain follow-ups on one of
    // them: pain is asked by the body outline, so a rule may name it.
    const keys = new Set([
      ...rows.map((r) => r.question_key),
      ...Object.values(CHECKIN_COLUMN_QUESTION_KEYS),
    ]);
    const dangling = rows
      .filter((r) => r.active && (r.requires?.length ?? 0) > 0)
      .filter((r) => !keys.has(r.requires![0]!.question_key))
      .map((r) => `${r.question_key} -> ${r.requires![0]!.question_key}`);
    expect(dangling).toEqual([]);
  });

  it('the two pain follow-ups say, as data, that they only exist on a day with pain above zero', async () => {
    // The live bug, 2026-08-30: with no rule at all, nothing outside the
    // check-in component knew "Where is it, mainly?" was conditional, so a
    // coach's history listed it against a day of "No pain (0 of 5)".
    const rows = await bank();
    for (const key of ['checkin_probe.pain_location', 'checkin_probe.pain_aggravating_factor']) {
      const row = rows.find((r) => r.question_key === key);
      expect(row).toBeDefined();
      expect(row!.requires).toEqual([
        { question_key: 'checkin_probe.pain_discomfort_level', op: 'gt', value: 0 },
      ]);
    }
  });
});

describe('recorded answers survived the conversion in the shape the app reads', () => {
  it('no answer for either converted question is left as a bare string, and none still says "more_than_one"', async () => {
    const { data, error } = await serviceRoleClient()
      .from('daily_checkin_probe_answers')
      .select('question_key, value')
      .in('question_key', ['checkin_probe.skipped_meal_which', 'checkin_probe.digestive_symptom_type']);
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(Array.isArray((row as { value: unknown }).value)).toBe(true);
      expect(JSON.stringify((row as { value: unknown }).value)).not.toContain('more_than_one');
    }
  });
});
