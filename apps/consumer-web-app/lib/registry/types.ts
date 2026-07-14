/**
 * Universal Metric & Finding Registry — draft type recorded before an
 * id/status/supersede chain exists, same role WellnessInsightDraft plays
 * for wellness_insights (lib/intelligence/types.ts).
 */

import type { RegistryEntry } from '@mef/shared-types-contracts';

export type RegistryEntryDraft = Omit<
  RegistryEntry,
  'id' | 'member_id' | 'status' | 'supersedes_id' | 'superseded_by_id' | 'created_at' | 'updated_at'
>;
