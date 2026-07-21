/**
 * Turns real member data into the PrescriptionFacts the Prescription
 * Intelligence Engine's constraint and strategy logic compose a
 * prescription from. Same discipline as lib/movement/rules/facts.ts: every
 * fact traces back to an actual row — the Movement Profile (migration 81,
 * Layer 1 "who is this person"), Universal Registry entries (migration 40,
 * the same read path lib/movement/rules/facts.ts uses for posture/
 * movement/breathing findings and wearable metrics), today's check-in
 * (Layer 2 "how are they today"), and this member's own exercise
 * completion history (migration 81, for variety/progression). Nothing here
 * is invented; a signal with no real data behind it is null.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberExerciseCompletion, MemberMovementProfile } from '@mef/shared-types-contracts';
import { getMovementProfile } from '../movement-profile/data';
import { listRegistryEntriesForMember } from '../registry/data';
import { listMyExerciseCompletions } from '../exercise-library/completions';
import { buildWearableSnapshot, type WearableDailySnapshot } from '../wearables/snapshot';

export type PrescriptionActiveFinding = {
  code: string;
  label: string;
  domain: string;
  severity: string | null;
};

export type PrescriptionLatestCheckin = {
  localDate: string;
  painLevel: number | null;
  stressLevel: number | null;
  sleepQuality: number | null;
  sleepDuration: string | null;
  energyLevel: number | null;
  newOrWorseningConcern: boolean;
};

export type PrescriptionFacts = {
  memberId: string;
  movementProfile: MemberMovementProfile | null;
  activeFindings: PrescriptionActiveFinding[];
  hasBaselineAssessment: boolean;
  hasMovementAssessment: boolean;
  wearableSnapshot: WearableDailySnapshot | null;
  latestCheckin: PrescriptionLatestCheckin | null;
  recentCompletions: MemberExerciseCompletion[];
  /** External ids completed in roughly the last two weeks — used to rotate variety rather than repeat the same picks run over run. */
  recentlyCompletedExternalIds: string[];
};

export async function gatherPrescriptionFacts(
  supabase: SupabaseClient,
  memberId: string
): Promise<PrescriptionFacts> {
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
    console.error('gatherPrescriptionFacts (checkin) failed', checkinResult.error);
  }

  const activeFindings: PrescriptionActiveFinding[] = registryEntries
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
