/**
 * Data access for exercise_open_license_images (migration 118) — Phase 3
 * fallback images sourced from free open-license providers for exercises
 * neither video source covers. This table doubles as the license manifest
 * (source_url + license_type + attribution per image). Pure functions
 * taking a SupabaseClient, same shape as every other exercise-library
 * data.ts file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { ExerciseLibraryProvider, ExerciseOpenLicenseImage } from '@mef/shared-types-contracts';

export async function getOpenLicenseImageMap(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalIds: string[]
): Promise<Map<string, ExerciseOpenLicenseImage>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('exercise_open_license_images')
    .select('*')
    .eq('provider', provider)
    .in('external_id', externalIds);
  if (error) {
    console.error('getOpenLicenseImageMap failed', error);
    return new Map();
  }

  const rows = (data as ExerciseOpenLicenseImage[]) ?? [];
  return new Map(rows.map((row) => [row.external_id, row]));
}

export async function getOpenLicenseImage(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalId: string
): Promise<ExerciseOpenLicenseImage | null> {
  const { data, error } = await supabase
    .from('exercise_open_license_images')
    .select('*')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) {
    console.error('getOpenLicenseImage failed', error);
    return null;
  }
  return data as ExerciseOpenLicenseImage | null;
}

/** Written by the Phase 3 image-sourcing script (service-role client) — never by request-time application code. Every insert must carry a real, verifiable commercial-use license — that's the whole point of this table. */
export async function upsertOpenLicenseImage(
  supabase: SupabaseClient,
  input: {
    provider: ExerciseLibraryProvider;
    externalId: string;
    storagePath: string;
    sourceUrl: string;
    sourceProvider: ExerciseOpenLicenseImage['source_provider'];
    licenseType: string;
    attribution: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase.from('exercise_open_license_images').upsert(
    {
      id: randomUUID(),
      provider: input.provider,
      external_id: input.externalId,
      storage_path: input.storagePath,
      source_url: input.sourceUrl,
      source_provider: input.sourceProvider,
      license_type: input.licenseType,
      attribution: input.attribution,
    },
    { onConflict: 'provider,external_id' }
  );
  if (error) {
    console.error('upsertOpenLicenseImage failed', error);
    return false;
  }
  return true;
}
