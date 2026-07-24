import { createClient } from '../supabase/server';
import type {
  UnifiedAssessmentDefinition,
  UnifiedAssessmentQuestion,
  UnifiedAssessmentSection,
} from '@mef/shared-types-contracts';

/**
 * Read-only queries against the Unified Adaptive Assessment Foundation
 * tables (migration 98: unified_assessment_definitions/sections/questions).
 * Nothing calls these yet — no existing assessment uses this schema. They
 * exist so the foundation is provably queryable ahead of the first future
 * assessment built on it. Follows the same shape as
 * app/actions/onboarding.ts's query functions (RLS-respecting session
 * client, ordered reads, error-logged-and-empty-array on failure).
 */

export async function getUnifiedAssessmentDefinitionByKey(
  key: string
): Promise<UnifiedAssessmentDefinition | null> {
  const supabase = createClient();
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
  assessmentDefinitionId: string
): Promise<UnifiedAssessmentSection[]> {
  const supabase = createClient();
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
  assessmentDefinitionId: string,
  options: { activeOnly?: boolean } = {}
): Promise<UnifiedAssessmentQuestion[]> {
  const { activeOnly = true } = options;
  const supabase = createClient();
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
