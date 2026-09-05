import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UnifiedAssessmentDefinition,
  UnifiedAssessmentQuestion,
  UnifiedAssessmentSection,
} from '@mef/shared-types-contracts';
import { readOnce } from '../data/readOnce';

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

/**
 * ONE READ PER REQUEST PER KEY (Home speed build, 2026-08-28). Home asked
 * for the same three definitions eleven times between them: the
 * questionnaire catalog, the free-arc picker and the pop-up chain each walk
 * the same list. A definition is published content, not member state, and
 * nothing in a member request writes one.
 */
export async function getUnifiedAssessmentDefinitionByKey(
  supabase: SupabaseClient,
  key: string
): Promise<UnifiedAssessmentDefinition | null> {
  return readOnce(`unifiedAssessmentDefinition:${key}`, () =>
    readUnifiedAssessmentDefinitionByKey(supabase, key)
  );
}

async function readUnifiedAssessmentDefinitionByKey(
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
    .order('display_order', { ascending: true })
    // THE TIEBREAK IS NOT DECORATION. display_order is not unique, and two
    // rows that tie on it come back in whatever order Postgres felt like,
    // which changes between runs and under load. That order is what a
    // member's question list and progress count are built from, so a tie
    // without a tiebreak is a screen that can reorder itself between two
    // visits. `id` is unique, so this makes the order total.
    .order('id', { ascending: true });

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

  // Ordered by display_order, then by question_key so the order is TOTAL.
  // Questions in two different sections routinely share a display_order (each
  // section numbers its own from zero), and without the second key those rows
  // come back in an order that varies run to run. See the note on sections
  // above: this list is what visibleQuestions, the progress count and the
  // findings list are all built from.
  const { data, error } = await query
    .order('display_order', { ascending: true })
    .order('question_key', { ascending: true });

  if (error) {
    console.error('Failed to load unified assessment questions', error);
    return [];
  }
  return data as UnifiedAssessmentQuestion[];
}
