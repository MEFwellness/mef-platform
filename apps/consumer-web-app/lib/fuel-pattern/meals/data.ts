/**
 * Rooted Reset Fuel Pattern Assessment, Build 3 — the one place her meal
 * rows are read and written.
 *
 * SAME DISCIPLINE AS lib/fuel-pattern/data.ts. Pure functions taking a
 * SupabaseClient, RLS as the real authorization boundary, and every write
 * reads its row back, because a write matching no policy returns zero
 * rows and no error and a silent success is worse than a failure.
 *
 * READ THEN INSERT, WITH AN INDEX UNDERNEATH IT. Recording an exclusion
 * or a save is a read then insert, and a member tapping twice makes that
 * a race. Every one of these tables carries a unique index for exactly
 * that reason (migration 237), and the duplicate case is treated as the
 * success it is rather than reported as a failure.
 *
 * IT ALSO READS HER FOOD LENS PREFERENCES, AND NEVER WRITES THEM. See
 * lib/fuel-pattern/meals/preferences.ts for why.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMemberFoodPreferences } from '@/lib/food-products/data';
import { selectAllRows } from '@/lib/data/pagedSelect';
import {
  exclusionsForAllergyList,
  exclusionsForDietaryPattern,
  isFpaExclusionKey,
  isFpaRejectionReason,
  type FpaExclusionKey,
  type FpaRejectionReason,
} from './preferences';
import { FPA_MEAL_TYPES, type FpaMealType } from './types';
import type { FuelPattern } from '../types';

export type FpaMealExclusion = {
  key: FpaExclusionKey;
  isAllergy: boolean;
  sourceMealId: string | null;
  createdAt: string;
};

export type FpaMealRejection = {
  mealId: string;
  reason: FpaRejectionReason | null;
  note: string | null;
  createdAt: string;
};

export type FpaMealSave = {
  mealId: string;
  patternAtSave: FuelPattern;
  createdAt: string;
};

export type FpaStoredSlotState = {
  mealType: FpaMealType;
  pattern: FuelPattern;
  currentMealId: string | null;
  shownMealIds: string[];
};

function isMealType(value: string): value is FpaMealType {
  return (FPA_MEAL_TYPES as readonly string[]).includes(value);
}

export async function listFpaMealExclusions(
  supabase: SupabaseClient,
  memberId: string
): Promise<FpaMealExclusion[]> {
  // scale-exempt: unique (member_id, exclusion_key) and exclusion_key is checked against a closed set of 12 keys (migration 237)
  const { data, error } = await supabase
    .from('fuel_meal_exclusions')
    .select('exclusion_key, is_allergy, source_meal_id, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listFpaMealExclusions failed', error);
    return [];
  }
  return (data ?? [])
    .filter((row) => isFpaExclusionKey(row.exclusion_key as string))
    .map((row) => ({
      key: row.exclusion_key as FpaExclusionKey,
      isAllergy: Boolean(row.is_allergy),
      sourceMealId: (row.source_meal_id as string | null) ?? null,
      createdAt: row.created_at as string,
    }));
}

export async function listFpaMealRejections(
  supabase: SupabaseClient,
  memberId: string
): Promise<FpaMealRejection[]> {
  const { rows: data, error } = await selectAllRows<Record<string, unknown>>(() =>
    supabase
      .from('fuel_meal_rejections')
      .select('meal_id, reason, note, created_at')
      .eq('member_id', memberId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
  );
  if (error) {
    console.error('listFpaMealRejections failed', error);
    return [];
  }
  return (data ?? []).map((row) => {
    const reason = row.reason as string | null;
    return {
      mealId: row.meal_id as string,
      reason: reason && isFpaRejectionReason(reason) ? reason : null,
      note: (row.note as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });
}

export async function listFpaMealSaves(
  supabase: SupabaseClient,
  memberId: string
): Promise<FpaMealSave[]> {
  const { rows: data, error } = await selectAllRows<Record<string, unknown>>(() =>
    supabase
      .from('fuel_meal_saves')
      .select('meal_id, pattern_at_save, created_at')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  );
  if (error) {
    console.error('listFpaMealSaves failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    mealId: row.meal_id as string,
    patternAtSave: row.pattern_at_save as FuelPattern,
    createdAt: row.created_at as string,
  }));
}

export async function listFpaSlotStates(
  supabase: SupabaseClient,
  memberId: string
): Promise<FpaStoredSlotState[]> {
  // scale-exempt: primary key (member_id, meal_type) and meal_type is checked against 4 values (migration 237)
  const { data, error } = await supabase
    .from('fuel_meal_slot_state')
    .select('meal_type, pattern, current_meal_id, shown_meal_ids')
    .eq('member_id', memberId);
  if (error) {
    console.error('listFpaSlotStates failed', error);
    return [];
  }
  return (data ?? [])
    .filter((row) => isMealType(row.meal_type as string))
    .map((row) => ({
      mealType: row.meal_type as FpaMealType,
      pattern: row.pattern as FuelPattern,
      currentMealId: (row.current_meal_id as string | null) ?? null,
      shownMealIds: (row.shown_meal_ids as string[] | null) ?? [],
    }));
}

/**
 * Remember where one slot has got to.
 *
 * AN UPSERT, AND IT CAN USE ONE. The primary key is (member_id,
 * meal_type), a whole unique constraint rather than a partial index, so
 * PostgREST can arbitrate it. That is the difference between this and
 * the read then insert everything else in this file does.
 */
export async function saveFpaSlotState(
  supabase: SupabaseClient,
  memberId: string,
  state: FpaStoredSlotState
): Promise<boolean> {
  const { data, error } = await supabase
    .from('fuel_meal_slot_state')
    .upsert(
      {
        member_id: memberId,
        meal_type: state.mealType,
        pattern: state.pattern,
        current_meal_id: state.currentMealId,
        shown_meal_ids: state.shownMealIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id,meal_type' }
    )
    .select('meal_type')
    .maybeSingle();

  if (error) {
    console.error('saveFpaSlotState failed', error);
    return false;
  }
  if (!data) {
    console.error('saveFpaSlotState wrote no row', { memberId, mealType: state.mealType });
    return false;
  }
  return true;
}

/** Record that she does not eat this one meal. Idempotent. */
export async function recordFpaMealRejection(
  supabase: SupabaseClient,
  memberId: string,
  input: { mealId: string; reason: FpaRejectionReason | null; note: string | null }
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('fuel_meal_rejections')
    .select('id, reason, note')
    .eq('member_id', memberId)
    .eq('meal_id', input.mealId)
    .maybeSingle();

  if (existing) {
    // A second tap that carries a reason where the first carried none is
    // her telling us more, not a duplicate to drop.
    if (input.reason && !existing.reason) {
      const { error } = await supabase
        .from('fuel_meal_rejections')
        .update({ reason: input.reason, note: input.note })
        .eq('id', existing.id as string);
      if (error) {
        console.error('recordFpaMealRejection update failed', error);
        return false;
      }
    }
    return true;
  }

  const { data, error } = await supabase
    .from('fuel_meal_rejections')
    .insert({
      member_id: memberId,
      meal_id: input.mealId,
      reason: input.reason,
      note: input.note,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    const settled = await supabase
      .from('fuel_meal_rejections')
      .select('id')
      .eq('member_id', memberId)
      .eq('meal_id', input.mealId)
      .maybeSingle();
    if (settled.data) return true;
    console.error('recordFpaMealRejection failed', error);
    return false;
  }
  if (!data) {
    console.error('recordFpaMealRejection wrote no row', { memberId, mealId: input.mealId });
    return false;
  }
  return true;
}

/** Record one or more standing exclusions. Idempotent, and an allergy stays an allergy. */
export async function recordFpaMealExclusions(
  supabase: SupabaseClient,
  memberId: string,
  entries: Array<{ key: FpaExclusionKey; isAllergy: boolean; sourceMealId: string | null }>
): Promise<boolean> {
  let allLanded = true;

  for (const entry of entries) {
    const { data: existing } = await supabase
      .from('fuel_meal_exclusions')
      .select('id, is_allergy')
      .eq('member_id', memberId)
      .eq('exclusion_key', entry.key)
      .maybeSingle();

    if (existing) {
      // An exclusion she first recorded as a preference and later as an
      // allergy is upgraded, never downgraded: the stronger label is the
      // one the coach needs to see.
      if (entry.isAllergy && !existing.is_allergy) {
        const { error } = await supabase
          .from('fuel_meal_exclusions')
          .update({ is_allergy: true })
          .eq('id', existing.id as string);
        if (error) {
          console.error('recordFpaMealExclusions upgrade failed', error);
          allLanded = false;
        }
      }
      continue;
    }

    const { data, error } = await supabase
      .from('fuel_meal_exclusions')
      .insert({
        member_id: memberId,
        exclusion_key: entry.key,
        is_allergy: entry.isAllergy,
        source_meal_id: entry.sourceMealId,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      const settled = await supabase
        .from('fuel_meal_exclusions')
        .select('id')
        .eq('member_id', memberId)
        .eq('exclusion_key', entry.key)
        .maybeSingle();
      if (settled.data) continue;
      console.error('recordFpaMealExclusions failed', error);
      allLanded = false;
      continue;
    }
    if (!data) {
      console.error('recordFpaMealExclusions wrote no row', { memberId, key: entry.key });
      allLanded = false;
    }
  }

  return allLanded;
}

export async function saveFpaMeal(
  supabase: SupabaseClient,
  memberId: string,
  mealId: string,
  patternAtSave: FuelPattern
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('fuel_meal_saves')
    .select('id')
    .eq('member_id', memberId)
    .eq('meal_id', mealId)
    .maybeSingle();
  if (existing) return true;

  const { data, error } = await supabase
    .from('fuel_meal_saves')
    .insert({ member_id: memberId, meal_id: mealId, pattern_at_save: patternAtSave })
    .select('id')
    .maybeSingle();

  if (error) {
    const settled = await supabase
      .from('fuel_meal_saves')
      .select('id')
      .eq('member_id', memberId)
      .eq('meal_id', mealId)
      .maybeSingle();
    if (settled.data) return true;
    console.error('saveFpaMeal failed', error);
    return false;
  }
  if (!data) {
    console.error('saveFpaMeal wrote no row', { memberId, mealId });
    return false;
  }
  return true;
}

export async function unsaveFpaMeal(
  supabase: SupabaseClient,
  memberId: string,
  mealId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('fuel_meal_saves')
    .delete()
    .eq('member_id', memberId)
    .eq('meal_id', mealId);
  if (error) {
    console.error('unsaveFpaMeal failed', error);
    return false;
  }
  return true;
}

/**
 * Every standing exclusion that applies to her, from both sources: the
 * ones this feature recorded, and the ones she had already given the Food
 * Lens preferences screen.
 */
export async function resolveFpaExclusionKeys(
  supabase: SupabaseClient,
  memberId: string,
  own: readonly FpaMealExclusion[]
): Promise<FpaExclusionKey[]> {
  const keys = new Set<FpaExclusionKey>(own.map((entry) => entry.key));

  const preferences = await getMemberFoodPreferences(supabase, memberId);
  if (preferences) {
    for (const key of exclusionsForDietaryPattern(preferences.dietary_pattern ?? null)) {
      keys.add(key);
    }
    for (const key of exclusionsForAllergyList(preferences.allergies ?? [])) {
      keys.add(key);
    }
  }

  return [...keys];
}
