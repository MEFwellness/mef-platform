/**
 * Loads the library's six vocabulary tables into the one object every
 * adapter and every view builder is handed.
 *
 * HELD BRIEFLY, BECAUSE IT IS THE SAME FOR EVERY MEMBER. One ingestion run
 * maps five sources for one member and a backfill maps them for many, and
 * every one of those calls wants the identical six reads. The hold is a
 * few minutes rather than forever, so a coach who adds a body area sees it
 * shortly without a deploy and without a restart. Same shape as
 * lib/body-systems/contentData.ts's own hold.
 *
 * NOTHING HERE IS MEMBER DATA. Six lists of words. The store itself is
 * ./data.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { mappingKey } from './library';
import type {
  SignalBodyArea,
  SignalCategory,
  SignalExternalKind,
  SignalLibrary,
  SignalSource,
  SignalSourceMapping,
  SignalSymptomType,
  StandardizedSignalName,
} from './types';

const LIBRARY_TTL_MS = 5 * 60 * 1000;

let held: { at: number; value: SignalLibrary } | null = null;

/** Drops the held bundle. For a test that changes content between cases, and for the coach's own add. */
export function forgetSignalLibrary(): void {
  held = null;
}

async function fetchCategories(supabase: SupabaseClient): Promise<SignalCategory[]> {
  const { data, error } = await supabase
    .from('cross_system_signal_categories')
    .select('category_key, position, display_name')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('cross-system signal categories read failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    categoryKey: row.category_key as string,
    position: row.position as number,
    displayName: row.display_name as string,
  }));
}

async function fetchBodyAreas(supabase: SupabaseClient): Promise<SignalBodyArea[]> {
  const { data, error } = await supabase
    .from('cross_system_body_areas')
    .select('area_key, position, display_name, takes_side')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('cross-system body areas read failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    areaKey: row.area_key as string,
    position: row.position as number,
    displayName: row.display_name as string,
    takesSide: Boolean(row.takes_side),
  }));
}

async function fetchSymptoms(supabase: SupabaseClient): Promise<SignalSymptomType[]> {
  const { data, error } = await supabase
    .from('cross_system_symptom_types')
    .select('symptom_key, position, display_name, phrase, default_category_key')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('cross-system symptom types read failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    symptomKey: row.symptom_key as string,
    position: row.position as number,
    displayName: row.display_name as string,
    phrase: row.phrase as string,
    defaultCategoryKey: (row.default_category_key as string | null) ?? null,
  }));
}

async function fetchNames(supabase: SupabaseClient): Promise<StandardizedSignalName[]> {
  const { data, error } = await supabase
    .from('cross_system_signal_names')
    .select(
      'signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable'
    )
    .eq('is_active', true)
    .order('display_name', { ascending: true });
  if (error) {
    console.error('cross-system signal names read failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    signalSlug: row.signal_slug as string,
    displayName: row.display_name as string,
    categoryKey: row.category_key as string,
    defaultBodyAreaKey: (row.default_body_area_key as string | null) ?? null,
    defaultSymptomKey: (row.default_symptom_key as string | null) ?? null,
    searchTerms: (row.search_terms as string | null) ?? '',
    isCoachAddable: Boolean(row.is_coach_addable),
  }));
}

async function fetchSources(supabase: SupabaseClient): Promise<SignalSource[]> {
  const { data, error } = await supabase
    .from('cross_system_signal_sources')
    .select('source_key, position, display_name, assessment_definition_id')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('cross-system signal sources read failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    sourceKey: row.source_key as string,
    position: row.position as number,
    displayName: row.display_name as string,
    assessmentDefinitionId: (row.assessment_definition_id as string | null) ?? null,
  }));
}

async function fetchMappings(supabase: SupabaseClient): Promise<SignalSourceMapping[]> {
  const { data, error } = await supabase
    .from('cross_system_signal_source_map')
    .select('source_key, external_kind, external_key, signal_slug, body_area_key')
    .eq('is_active', true);
  if (error) {
    console.error('cross-system signal source map read failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    sourceKey: row.source_key as string,
    externalKind: row.external_kind as SignalExternalKind,
    externalKey: row.external_key as string,
    signalSlug: row.signal_slug as string,
    bodyAreaKey: (row.body_area_key as string | null) ?? null,
  }));
}

/** The whole library, as adapters and views receive it. Every list arrives at once. */
export async function loadSignalLibrary(supabase: SupabaseClient): Promise<SignalLibrary> {
  const cached = held;
  if (cached && Date.now() - cached.at < LIBRARY_TTL_MS) return cached.value;

  const [categories, bodyAreas, symptoms, names, sources, mappings] = await Promise.all([
    fetchCategories(supabase),
    fetchBodyAreas(supabase),
    fetchSymptoms(supabase),
    fetchNames(supabase),
    fetchSources(supabase),
    fetchMappings(supabase),
  ]);

  const value: SignalLibrary = {
    categories: new Map(categories.map((row) => [row.categoryKey, row])),
    bodyAreas: new Map(bodyAreas.map((row) => [row.areaKey, row])),
    symptoms: new Map(symptoms.map((row) => [row.symptomKey, row])),
    names: new Map(names.map((row) => [row.signalSlug, row])),
    sources: new Map(sources.map((row) => [row.sourceKey, row])),
    mappings: new Map(
      mappings.map((row) => [mappingKey(row.sourceKey, row.externalKind, row.externalKey), row])
    ),
  };

  // An empty read is a failed read, not a library with nothing in it, so
  // it is never held: holding one would keep a whole feature dark for the
  // life of the hold after one bad minute.
  if (categories.length > 0 && names.length > 0) held = { at: Date.now(), value };
  return value;
}
