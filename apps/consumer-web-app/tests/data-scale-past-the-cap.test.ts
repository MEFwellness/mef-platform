/**
 * EVERY CONSUMER OF THE BIGGEST TABLES SEES EVERY ROW, PAST THE CAP.
 *
 * tests/data-scale-guard.test.ts proves, from the source, that no request is
 * unbounded. This proves the part a source scan cannot: that the paged reads
 * really return everything when a real PostgREST, with the same
 * `max_rows = 1000` as production (supabase/config.toml), is holding more
 * than a thousand matching rows.
 *
 * Every test in this suite that drives a fake client has no cap, which is
 * why the Association Map lost most of its components on production with
 * the whole suite green. These run against local Supabase.
 *
 * One table per risk named in docs/DATA_SCALE_AUDIT.md: events (and the
 * member analytics timeline read over them, which was short on production),
 * signals, the lexicon, the map, the exercise library and check-ins. Each
 * test seeds past the cap where the local database is not already past it,
 * asserts the consumer's count against `count(*)`, and removes what it
 * seeded.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import { listMemberEventsForDate } from '../lib/events/service';
import { getMemberActivityTimeline } from '../lib/analytics-service/timeline';
import { listAllSignalsForMember } from '../lib/cross-system-signals/data';
import { loadComplaintLexicon } from '../lib/cross-system-complaints/lexiconData';
import { listRelationships } from '../lib/cross-system-relationships/data';
import { getExercisesByExternalIds, listDistinctCatalogValues } from '../lib/your-move/catalog';
import { readCheckins } from '../lib/coach-member-entries/data';
import { getMemberCheckinCounts } from '../lib/member-counts/checkinCounts';
import { selectAllRows, writeInChunks } from '../lib/data/pagedSelect';

const CAP = 1000;
const MEMBER = TEST_USERS.memberOne.id;
const TZ = 'America/New_York';

/** Dates far from every other fixture in the suite, so cleanup is exact. */
const EVENT_DAY = '2031-01-15';
const TIMELINE_DAYS = ['2031-03-01', '2031-03-02', '2031-03-03'];
/** Seeded signals are told apart from real ones by this label and their 2031 capture dates. */
const SIGNAL_LABEL = 'Data scale test';
const CATALOG_PREFIX = 'data-scale-test-';
const CHECKIN_FIRST_DAY = '2034-01-01';

let service: SupabaseClient;

function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

type CountQuery = ReturnType<ReturnType<SupabaseClient['from']>['select']>;

async function exactCount(
  table: string,
  filter: (query: CountQuery) => CountQuery = (query) => query
): Promise<number> {
  const { count, error } = await filter(
    service.from(table).select('*', { count: 'exact', head: true })
  );
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function insertAll(table: string, rows: Record<string, unknown>[]): Promise<void> {
  const { error } = await writeInChunks(rows, (chunk) => service.from(table).insert(chunk), 500);
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

async function cleanup(): Promise<void> {
  await service
    .from('member_wellness_events')
    .delete()
    .eq('member_id', MEMBER)
    .gte('local_date', '2031-01-01')
    .lte('local_date', '2031-12-31');
  await service
    .from('cross_system_signals')
    .delete()
    .eq('member_id', MEMBER)
    .eq('source_label', SIGNAL_LABEL)
    .gte('captured_on', '2031-01-01');
  await service.from('exercise_catalog').delete().like('external_id', `${CATALOG_PREFIX}%`);
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', MEMBER)
    .gte('local_date', CHECKIN_FIRST_DAY);
}

beforeAll(async () => {
  service = serviceRoleClient();
  await cleanup();
}, 120_000);

afterAll(cleanup, 120_000);

describe('events', () => {
  it('one member-day holding more than a thousand events is read whole', async () => {
    const base = Date.parse(`${EVENT_DAY}T12:00:00Z`);
    const rows = Array.from({ length: 1150 }, (_, index) => ({
      member_id: MEMBER,
      event_type: 'surface_viewed',
      occurred_at: new Date(base + index * 1000).toISOString(),
      timezone: TZ,
      local_date: EVENT_DAY,
      payload: { surface: 'home', seq: index },
    }));
    await insertAll('member_wellness_events', rows);

    const truth = await exactCount('member_wellness_events', (q) =>
      q.eq('member_id', MEMBER).eq('local_date', EVENT_DAY)
    );
    expect(truth).toBe(1150);

    const events = await listMemberEventsForDate(service, MEMBER, EVENT_DAY);
    expect(events).toHaveLength(truth);
    // Oldest first, and nothing repeated across page boundaries.
    expect(new Set(events.map((event) => event.id)).size).toBe(truth);
    expect((events[0]!.payload as { seq: number }).seq).toBe(0);
    expect((events[events.length - 1]!.payload as { seq: number }).seq).toBe(1149);
  }, 120_000);

  it('the member analytics timeline counts every event in its range (it was capped at 1,000 on production)', async () => {
    const rows = TIMELINE_DAYS.flatMap((day, dayIndex) =>
      Array.from({ length: 500 }, (_, index) => ({
        member_id: MEMBER,
        event_type: 'surface_viewed',
        occurred_at: new Date(Date.parse(`${day}T15:00:00Z`) + index * 1000).toISOString(),
        timezone: TZ,
        local_date: day,
        payload: { surface: 'home', day: dayIndex, seq: index },
      }))
    );
    await insertAll('member_wellness_events', rows);
    await service.from('profiles').update({ is_test: false }).eq('id', MEMBER);

    const admin = await signInAs(TEST_USERS.adminOne);
    const timeline = await getMemberActivityTimeline(admin, MEMBER, {
      period: { start: TIMELINE_DAYS[0]!, end: TIMELINE_DAYS[2]! },
      today: TIMELINE_DAYS[2]!,
    });

    // Before the fix the read asked for 2,001 rows, was handed 1,000, and the
    // oldest day vanished without `truncated` ever being set.
    expect(timeline.totalEvents).toBe(1500);
    expect(timeline.truncated).toBe(false);
    expect(timeline.days.map((day) => day.localDate).sort()).toEqual(TIMELINE_DAYS);
    expect(timeline.days.every((day) => day.totalEvents === 500)).toBe(true);
  }, 120_000);
});

describe('signals', () => {
  it("a member's whole signal history is read, past the cap", async () => {
    // A signal row names a real entry in the Signal Library, so the seed
    // cycles through the library's own names.
    const names = await selectAllRows<{
      signal_slug: string;
      display_name: string;
      category_key: string;
    }>(() =>
      service
        .from('cross_system_signal_names')
        .select('signal_slug, display_name, category_key')
        .order('signal_slug', { ascending: true })
    );
    expect(names.rows.length).toBeGreaterThan(0);
    const rows = Array.from({ length: 1100 }, (_, index) => ({
      member_id: MEMBER,
      signal_slug: names.rows[index % names.rows.length]!.signal_slug,
      signal_name: names.rows[index % names.rows.length]!.display_name,
      category_key: names.rows[index % names.rows.length]!.category_key,
      value_kind: 'presence',
      value_label: 'Present',
      source_key: 'coach_entered',
      entry_mode: 'coach_entered',
      source_label: SIGNAL_LABEL,
      captured_on: addDays('2031-06-01', index % 200),
      captured_at: new Date(Date.parse('2031-06-01T12:00:00Z') + index * 60_000).toISOString(),
    }));
    await insertAll('cross_system_signals', rows);

    const truth = await exactCount('cross_system_signals', (q) => q.eq('member_id', MEMBER));
    expect(truth).toBeGreaterThan(CAP);

    const { ok, records } = await listAllSignalsForMember(service, MEMBER);
    expect(ok).toBe(true);
    expect(records).toHaveLength(truth);
    expect(new Set(records.map((record) => record.id)).size).toBe(truth);
  }, 120_000);
});

describe('lexicon', () => {
  it('every active phrase is loaded (the local lexicon is already past the cap)', async () => {
    const truth = await exactCount('cross_system_complaint_lexicon', (q) =>
      q.eq('is_active', true)
    );
    expect(truth).toBeGreaterThan(CAP);
    const lexicon = await loadComplaintLexicon(service);
    expect(lexicon.phrases).toHaveLength(truth);
  }, 120_000);
});

describe('map', () => {
  it('every entry and every component of its current version is loaded, including the deepest entry', async () => {
    const heads = await selectAllRows<{ id: string; current_version: number }>(() =>
      service
        .from('cross_system_relationships')
        .select('id, current_version')
        .order('id', { ascending: true })
    );
    const versions = await selectAllRows<{
      id: string;
      relationship_id: string;
      version_number: number;
    }>(() =>
      service
        .from('cross_system_relationship_versions')
        .select('id, relationship_id, version_number')
        .order('id', { ascending: true })
    );
    const currentVersionIds = new Set(
      versions.rows
        .filter((version) =>
          heads.rows.some(
            (head) =>
              head.id === version.relationship_id && head.current_version === version.version_number
          )
        )
        .map((version) => version.id)
    );
    const components = await selectAllRows<{ version_id: string }>(() =>
      service
        .from('cross_system_relationship_components')
        .select('version_id')
        .order('id', { ascending: true })
    );
    const truthByVersion = new Map<string, number>();
    for (const component of components.rows) {
      if (!currentVersionIds.has(component.version_id)) continue;
      truthByVersion.set(component.version_id, (truthByVersion.get(component.version_id) ?? 0) + 1);
    }
    const truthTotal = [...truthByVersion.values()].reduce((sum, n) => sum + n, 0);
    expect(truthTotal).toBeGreaterThan(CAP);

    const { ok, summaries } = await listRelationships(service);
    expect(ok).toBe(true);
    expect(summaries).toHaveLength(heads.rows.length);
    expect(summaries.reduce((sum, summary) => sum + summary.current.components.length, 0)).toBe(
      truthTotal
    );

    const [deepestId, deepestCount] = [...truthByVersion.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const deepest = summaries.find((summary) => summary.current.id === deepestId)!;
    expect(deepest.current.components).toHaveLength(deepestCount);
  }, 120_000);
});

describe('exercise library', () => {
  it('the filter vocabulary and an id lookup see catalog rows past the cap', async () => {
    const rows = Array.from({ length: 300 }, (_, index) => ({
      external_id: `${CATALOG_PREFIX}${String(index).padStart(3, '0')}`,
      name: `Data Scale Test Movement ${index}`,
      category: `Data Scale Category ${String(index).padStart(3, '0')}`,
    }));
    await insertAll('exercise_catalog', rows);

    const truth = await exactCount('exercise_catalog');
    expect(truth).toBeGreaterThan(CAP);

    const categories = await listDistinctCatalogValues(service, 'category');
    for (const row of rows) expect(categories).toContain(row.category);

    const allIds = await selectAllRows<{ external_id: string }>(() =>
      service.from('exercise_catalog').select('external_id').order('id', { ascending: true })
    );
    expect(allIds.rows).toHaveLength(truth);
    const byId = await getExercisesByExternalIds(
      service,
      allIds.rows.map((row) => row.external_id)
    );
    expect(byId.size).toBe(new Set(allIds.rows.map((row) => row.external_id)).size);
  }, 120_000);
});

describe('check-ins', () => {
  it('a history longer than a thousand days is read whole by the coach view and by the shared counts', async () => {
    const days = Array.from({ length: 1100 }, (_, index) => addDays(CHECKIN_FIRST_DAY, index));
    await insertAll(
      'daily_checkins',
      days.map((local_date) => ({ user_id: MEMBER, timezone: TZ, local_date }))
    );
    const lastDay = days[days.length - 1]!;

    const truth = await exactCount('daily_checkins_current', (q) =>
      q.eq('user_id', MEMBER).gte('local_date', CHECKIN_FIRST_DAY).lte('local_date', lastDay)
    );
    expect(truth).toBe(1100);

    const entries = await readCheckins(service, MEMBER, CHECKIN_FIRST_DAY, lastDay);
    expect(entries.available).toBe(true);
    if (entries.available) expect(entries.items).toHaveLength(truth);

    const counts = await getMemberCheckinCounts(service, MEMBER, lastDay, 1100);
    expect(counts.windowLoggedDays).toBe(truth);
  }, 120_000);
});
