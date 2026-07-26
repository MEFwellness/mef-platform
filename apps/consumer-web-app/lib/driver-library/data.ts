/**
 * Driver Library — database access. Pure functions taking a
 * SupabaseClient, RLS decides who may read/write what, same shape as
 * every other data.ts in this codebase (e.g. lib/correlation-engine/data.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Driver, DriverGoalWeight, MemberDriverState, DriverState } from './types';

type DriverRow = {
  id: string;
  domain_key: string;
  label: string;
  what_it_observes: string;
  wearable_observable: boolean;
  posture_derived: boolean;
  sort_order: number;
  active: boolean;
};

function fromDriverRow(row: DriverRow): Driver {
  return {
    id: row.id,
    domainKey: row.domain_key,
    label: row.label,
    whatItObserves: row.what_it_observes,
    wearableObservable: row.wearable_observable,
    postureDerived: row.posture_derived,
    sortOrder: row.sort_order,
    active: row.active,
  };
}

/** Every active driver (drivers, migration 106) — reference data, not member data. */
export async function listActiveDrivers(supabase: SupabaseClient): Promise<Driver[]> {
  const { data, error } = await supabase.from('drivers').select('*').eq('active', true);

  if (error) {
    console.error('listActiveDrivers failed', error);
    return [];
  }
  return (data as DriverRow[]).map(fromDriverRow);
}

type GoalWeightRow = { driver_id: string; goal_key: string; weight: 'high' | 'medium' };

/** Every seeded high/medium goal weighting (driver_goal_weights, migration 106). */
export async function listDriverGoalWeights(supabase: SupabaseClient): Promise<DriverGoalWeight[]> {
  const { data, error } = await supabase.from('driver_goal_weights').select('*');

  if (error) {
    console.error('listDriverGoalWeights failed', error);
    return [];
  }
  return (data as GoalWeightRow[]).map((row) => ({
    driverId: row.driver_id,
    goalKey: row.goal_key,
    weight: row.weight,
  }));
}

type MemberDriverStateRow = {
  member_id: string;
  driver_id: string;
  state: DriverState;
  evidence_summary: Record<string, unknown>;
  updated_at: string;
};

function fromStateRow(row: MemberDriverStateRow): MemberDriverState {
  return {
    memberId: row.member_id,
    driverId: row.driver_id,
    state: row.state,
    evidenceSummary: row.evidence_summary,
    updatedAt: row.updated_at,
  };
}

/** This member's current state for every driver that has one — a driver with no row is 'unknown' by definition (never persisted until the driver-state engine has something to say about it). */
export async function listMemberDriverStates(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<string, MemberDriverState>> {
  const { data, error } = await supabase
    .from('member_driver_states')
    .select('*')
    .eq('member_id', memberId);

  if (error) {
    console.error('listMemberDriverStates failed', error);
    return new Map();
  }
  return new Map((data as MemberDriverStateRow[]).map((row) => [row.driver_id, fromStateRow(row)]));
}

/** Upsert-by-(member, driver) — written only by lib/driver-state-engine/service.ts's scheduled job. */
export async function upsertMemberDriverState(
  supabase: SupabaseClient,
  state: MemberDriverState
): Promise<void> {
  const { error } = await supabase.from('member_driver_states').upsert(
    {
      member_id: state.memberId,
      driver_id: state.driverId,
      state: state.state,
      evidence_summary: state.evidenceSummary,
      updated_at: state.updatedAt,
    },
    { onConflict: 'member_id,driver_id' }
  );
  if (error) console.error('upsertMemberDriverState failed', error);
}
