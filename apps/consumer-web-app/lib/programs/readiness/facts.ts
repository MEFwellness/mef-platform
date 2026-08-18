/**
 * WHO SHE IS AND HOW SHE IS TODAY, from rows she actually wrote.
 *
 * Harvested from the retired Prescription Intelligence Engine (migration
 * 178's cleanup), which is the only part of it that ever earned its keep:
 * gathering real member facts and grading them. The engine that consumed
 * these facts and generated a workout from them is deleted. What survives
 * is the fact gathering, the constraint ladder in ./constraints.ts and the
 * "do not prescribe at all" gate in ./gate.ts, and all three are now read
 * by two live callers:
 *
 *   lib/programs/feedback/safety.ts    a member reporting pain on an
 *                                      exercise enters the same ladder.
 *   lib/programs/review/recommend.ts   the end-of-phase review reads
 *                                      readiness before it recommends a
 *                                      next phase.
 *
 * Same discipline as lib/movement/rules/facts.ts: every fact traces back to
 * an actual row, the Movement Profile (migration 81), Universal Registry
 * entries (migration 40), today's check-in, and this member's own exercise
 * completion history. Nothing here is invented; a signal with no real data
 * behind it is null.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberExerciseCompletion, MemberMovementProfile } from '@mef/shared-types-contracts';
import { getMovementProfile } from '../../movement-profile/data';
import { listRegistryEntriesForMember } from '../../registry/data';
import { listMyExerciseCompletions } from '../../exercise-library/completions';
import { buildWearableSnapshot, type WearableDailySnapshot } from '../../wearables/snapshot';

export type ReadinessActiveFinding = {
  code: string;
  label: string;
  domain: string;
  severity: string | null;
};

export type ReadinessLatestCheckin = {
  localDate: string;
  painLevel: number | null;
  stressLevel: number | null;
  sleepQuality: number | null;
  sleepDuration: string | null;
  energyLevel: number | null;
  newOrWorseningConcern: boolean;
};

export type ReadinessFacts = {
  memberId: string;
  movementProfile: MemberMovementProfile | null;
  activeFindings: ReadinessActiveFinding[];
  hasBaselineAssessment: boolean;
  hasMovementAssessment: boolean;
  wearableSnapshot: WearableDailySnapshot | null;
  latestCheckin: ReadinessLatestCheckin | null;
  recentCompletions: MemberExerciseCompletion[];
  /** External ids completed in roughly the last two weeks. */
  recentlyCompletedExternalIds: string[];
};

export async function gatherReadinessFacts(
  supabase: SupabaseClient,
  memberId: string
): Promise<ReadinessFacts> {
  const [movementProfile, registryEntries, checkinResult, recentCompletions] = await Promise.all([
    getMovementProfile(supabase, memberId),
    listRegistryEntriesForMember(supabase, memberId, { statusFilter: ['active'] }),
    supabase
      .from('daily_checkins_current')
      .select(
        'local_date, pain_discomfort_level, stress_level, sleep_quality, sleep_duration, energy_level, new_or_worsening_concern'
      )
      .eq('user_id', memberId)
      .order('local_date', { ascending: false })
      .limit(1),
    listMyExerciseCompletions(supabase, memberId, 30),
  ]);

  if (checkinResult.error) {
    console.error('gatherReadinessFacts (checkin) failed', checkinResult.error);
  }

  const activeFindings: ReadinessActiveFinding[] = registryEntries
    .filter(
      (e) =>
        e.entry_kind === 'finding' &&
        (e.domain === 'posture' || e.domain === 'movement' || e.domain === 'breathing')
    )
    .map((e) => ({ code: e.code, label: e.label, domain: e.domain, severity: e.severity }));

  const checkinRow = checkinResult.data?.[0] ?? null;
  const correctivePriorityCount = movementProfile?.corrective_priorities.length ?? 0;

  return {
    memberId,
    movementProfile,
    activeFindings,
    hasBaselineAssessment: movementProfile !== null,
    hasMovementAssessment: activeFindings.length > 0 || correctivePriorityCount > 0,
    wearableSnapshot: buildWearableSnapshot(registryEntries),
    latestCheckin: checkinRow
      ? {
          localDate: checkinRow.local_date,
          painLevel: checkinRow.pain_discomfort_level ?? null,
          stressLevel: checkinRow.stress_level ?? null,
          sleepQuality: checkinRow.sleep_quality ?? null,
          sleepDuration: checkinRow.sleep_duration ?? null,
          energyLevel: checkinRow.energy_level ?? null,
          newOrWorseningConcern: checkinRow.new_or_worsening_concern ?? false,
        }
      : null,
    recentCompletions,
    recentlyCompletedExternalIds: Array.from(
      new Set(recentCompletions.slice(0, 15).map((c) => c.external_id))
    ),
  };
}
