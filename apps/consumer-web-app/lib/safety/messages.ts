/**
 * Resolves the approved, versioned member-facing message for a
 * classification result. Templates live in safety_message_templates
 * (seeded in supabase/seed/06_safety_message_templates.sql) — never
 * freeform-generated. Falls back from a concern-category-specific
 * template to the generic per-level template if no specific one exists.
 *
 * TTL-cached in-process, same pattern and same caveats as
 * lib/ai/data.ts's getEnabledAgents/getActiveRules — this data changes
 * rarely (an admin editing approved copy is a deliberate, infrequent
 * action).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SafetyClassificationLevel, SafetyMessageTemplate } from '@mef/shared-types-contracts';
import type { ConcernCategoryKey } from './categories';

const CACHE_TTL_MS = 60_000;
let templatesCache: { templates: SafetyMessageTemplate[]; expiresAt: number } | null = null;

async function getAllActiveTemplates(supabase: SupabaseClient): Promise<SafetyMessageTemplate[]> {
  const now = Date.now();
  if (templatesCache && templatesCache.expiresAt > now) return templatesCache.templates;

  const { data, error } = await supabase
    .from('safety_message_templates')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('getAllActiveTemplates failed', error);
    return [];
  }

  const templates = (data ?? []) as SafetyMessageTemplate[];
  templatesCache = { templates, expiresAt: now + CACHE_TTL_MS };
  return templates;
}

/** Test-only escape hatch, mirrors lib/ai/data.ts's clearAiConfigCacheForTests. */
export function clearMessageTemplateCacheForTests(): void {
  templatesCache = null;
}

/**
 * Prefers a template scoped to the specific concern category; falls back
 * to the generic template for the classification level (concern_category
 * is null); returns null only if neither exists (a seeding gap, not
 * expected in normal operation).
 */
export async function resolveMessageTemplate(
  supabase: SupabaseClient,
  classificationLevel: SafetyClassificationLevel,
  concernCategory: ConcernCategoryKey | null
): Promise<SafetyMessageTemplate | null> {
  const templates = await getAllActiveTemplates(supabase);
  const forLevel = templates.filter((t) => t.classification_level === classificationLevel);

  const specific = concernCategory
    ? forLevel.find((t) => t.concern_category === concernCategory)
    : undefined;
  if (specific) return specific;

  return forLevel.find((t) => t.concern_category === null) ?? null;
}
