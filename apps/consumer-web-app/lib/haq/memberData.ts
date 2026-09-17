/**
 * What a member may read about her own HAQ, and nothing more.
 *
 * NO NUMBER CAN ARRIVE HERE. The hidden values, the section totals and the
 * cutoffs live in tables with no member policy (migration 262), so a member
 * session asking for them directly gets no rows. Her section results reach
 * her only through haq_member_section_results(), which returns the section
 * id, the color and the label. This module imports types and nothing else,
 * and tests/haq-member-safety.test.ts fails if it ever reaches
 * scoringRules.ts or scoring.ts.
 *
 * No member screen reads this yet. Prompts 2 and 3 build them on it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HaqInstanceStatus,
  HaqMemberResultLabel,
  HaqMemberSectionResult,
  HaqResultColor,
} from './types';

/** Not Started is no instance at all, exactly as the shared runtime reads it. */
export function haqInstanceStatus(instance: { status: 'in_progress' | 'completed' } | null): HaqInstanceStatus {
  if (!instance) return 'not_started';
  return instance.status;
}

/**
 * Her 21 section results for one completed instance, in section order, or
 * an empty list while the instance is still In Progress. Color and label
 * only.
 */
export async function readHaqMemberSectionResults(
  supabase: SupabaseClient,
  sessionId: string
): Promise<HaqMemberSectionResult[]> {
  // scale-exempt: one instance's section results, at most 21 rows, fixed by the instrument's 21 sections
  const { data, error } = await supabase.rpc('haq_member_section_results', { p_session_id: sessionId });
  if (error) throw new Error(`Failed to load HAQ section results: ${error.message}`);

  return ((data ?? []) as Array<{ section_id: string; result_color: string; member_result_label: string }>).map(
    (row) => ({
      sectionId: row.section_id,
      resultColor: row.result_color as HaqResultColor,
      memberResultLabel: row.member_result_label as HaqMemberResultLabel,
    })
  );
}
