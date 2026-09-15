/**
 * The Daily Check-In's pain and discomfort report, as signals.
 *
 * ONE QUESTION, AND ONLY WHEN SHE REPORTED SOMETHING. The check-in asks
 * for a nought to five pain and discomfort level. A nought is her saying
 * there is nothing to report, and writing a row for it every single day
 * would bury every other signal she has under a year of zeroes. So a
 * level of one or more writes a row and a nought writes nothing.
 *
 * THAT IS A DIFFERENT RULE FROM THE ASSESSMENT ADAPTERS, deliberately.
 * A sitting happens when a coach sends one, so carrying a settled signal
 * across is a handful of rows a year. A check-in happens daily, so the
 * same rule there would be a row a day forever. The window a coach reads
 * this on is the DATES the rows carry, which is why every row names its
 * own day.
 *
 * NOTHING ABOUT THE CHECK-IN MOVES. This reads `daily_checkins_current`,
 * the existing view of the latest version of each day's row, and writes
 * nothing back. No score, no streak, no Root Score input and no member
 * screen is touched.
 *
 * HER OWN LOCAL DAY IS THE CAPTURE DAY, taken from the row's own
 * local_date column rather than from a server clock. A check-in row
 * already carries the day it belongs to, computed at write time in her
 * timezone, which is exactly the value this library wants.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SOURCE_DAILY_CHECK_IN } from '../constants';
import { resolveMapped, sourceLabel } from '../library';
import { fingerprint, type BuildContext, type IngestibleSitting, type SignalAdapter } from '../registry';
import type { SignalDraft } from '../types';

export type DailyCheckInAdapterInput = {
  checkinId: string;
  /** The day the check-in itself already resolved, in her own timezone. */
  localDate: string;
  recordedAt: string;
  /** Nought to five, or null when she skipped the question. */
  painDiscomfortLevel: number | null;
};

/** The lowest level that is a report rather than an absence. */
export const DAILY_PAIN_MIN_LEVEL = 1;

export function buildDailyCheckInSignals(
  input: DailyCheckInAdapterInput,
  context: BuildContext
): SignalDraft[] {
  const { library } = context;
  const level = input.painDiscomfortLevel;
  if (level === null || !Number.isFinite(level) || level < DAILY_PAIN_MIN_LEVEL) return [];

  const resolved = resolveMapped(
    library,
    SOURCE_DAILY_CHECK_IN,
    'metric',
    'pain_discomfort_level'
  );
  if (!resolved) return [];

  return [
    {
      ...resolved,
      side: null,
      valueKind: 'scale',
      valueLabel: `${level} of 5`,
      valueKey: `level_${level}`,
      valueNumeric: level,
      sourceKey: SOURCE_DAILY_CHECK_IN,
      sourceLabel: sourceLabel(library, SOURCE_DAILY_CHECK_IN),
      sourceSessionId: input.checkinId,
      sourceQuestionRef: 'pain_discomfort_level',
      sourceQuestionPrompt: 'Pain or discomfort today',
      sourceRecordId: null,
      // The check-in's own local_date, never a server clock. The caller
      // passes the same value in the context, and this adapter prefers the
      // row's because the row is the authority on which day it belongs to.
      capturedOn: input.localDate,
      capturedAt: input.recordedAt,
      note: null,
      ingestFingerprint: fingerprint(
        SOURCE_DAILY_CHECK_IN,
        input.checkinId,
        'metric:pain_discomfort_level'
      ),
    },
  ];
}

type CheckinRow = {
  id: string;
  local_date: string;
  recorded_at: string;
  pain_discomfort_level: number | null;
};

const CHECKIN_COLUMNS = 'id, local_date, recorded_at, pain_discomfort_level';

export const dailyCheckInAdapter: SignalAdapter<DailyCheckInAdapterInput> = {
  sourceKey: SOURCE_DAILY_CHECK_IN,
  description: 'Daily Check-In pain and discomfort reports',

  async listCompleted(supabase: SupabaseClient, memberId: string): Promise<IngestibleSitting[]> {
    // Only days that carry a report. A backfill over a year of noughts
    // would load, map and discard three hundred and sixty five rows.
    const { data, error } = await supabase
      .from('daily_checkins_current')
      .select(CHECKIN_COLUMNS)
      .eq('user_id', memberId)
      .gte('pain_discomfort_level', DAILY_PAIN_MIN_LEVEL)
      .order('local_date', { ascending: false })
      .limit(400);
    if (error) {
      console.error('dailyCheckInAdapter.listCompleted failed', error);
      return [];
    }
    return ((data ?? []) as CheckinRow[]).map((row) => ({
      id: row.id,
      completedAt: row.recorded_at,
    }));
  },

  async load(supabase, memberId, sittingId) {
    const { data, error } = await supabase
      .from('daily_checkins_current')
      .select(CHECKIN_COLUMNS)
      .eq('user_id', memberId)
      .eq('id', sittingId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('dailyCheckInAdapter.load failed', error);
      return null;
    }
    const row = data as CheckinRow;
    return {
      checkinId: row.id,
      localDate: row.local_date,
      recordedAt: row.recorded_at,
      painDiscomfortLevel: row.pain_discomfort_level,
    };
  },

  build: buildDailyCheckInSignals,
};
