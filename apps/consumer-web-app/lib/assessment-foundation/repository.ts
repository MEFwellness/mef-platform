import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UnifiedAssessmentDefinition,
  UnifiedAssessmentQuestion,
  UnifiedAssessmentSection,
} from '@mef/shared-types-contracts';

/**
 * Read-only queries against the Unified Adaptive Assessment Foundation
 * tables (migration 98: unified_assessment_definitions/sections/questions).
 * Every function takes an already-authenticated client and makes no role
 * decision of its own — same trust boundary as lib/assessments/store.ts and
 * lib/registry/data.ts (RLS is the actual authorization boundary). A caller
 * inside a Server Action passes the session client from
 * lib/supabase/server.ts; a test passes a signed-in client directly (see
 * tests/setup/test-clients.ts) — cookies()-bound clients can't be
 * constructed outside a Next.js request scope, so accepting the client as a
 * parameter (rather than calling createClient() internally, as this file
 * did before lib/assessment-runtime/ needed to compose with it) is what
 * makes this module real-RLS-testable, matching every other data-layer
 * module in this codebase.
 */

export async function getUnifiedAssessmentDefinitionByKey(
  supabase: SupabaseClient,
  key: string
): Promise<UnifiedAssessmentDefinition | null> {
  const { data, error } = await supabase
    .from('unified_assessment_definitions')
    .select('*')
    .eq('key', key)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('Failed to load unified assessment definition', error);
    return null;
  }
  return data as UnifiedAssessmentDefinition | null;
}

export async function getUnifiedAssessmentSections(
  supabase: SupabaseClient,
  assessmentDefinitionId: string
): Promise<UnifiedAssessmentSection[]> {
  const { data, error } = await supabase
    .from('unified_assessment_sections')
    .select('*')
    .eq('assessment_definition_id', assessmentDefinitionId)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Failed to load unified assessment sections', error);
    return [];
  }
  return data as UnifiedAssessmentSection[];
}

export async function getUnifiedAssessmentQuestions(
  supabase: SupabaseClient,
  assessmentDefinitionId: string,
  options: { activeOnly?: boolean } = {}
): Promise<UnifiedAssessmentQuestion[]> {
  const { activeOnly = true } = options;
  let query = supabase
    .from('unified_assessment_questions')
    .select('*')
    .eq('assessment_definition_id', assessmentDefinitionId);

  if (activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query.order('display_order', { ascending: true });

  if (error) {
    console.error('Failed to load unified assessment questions', error);
    return [];
  }
  return data as UnifiedAssessmentQuestion[];
}
