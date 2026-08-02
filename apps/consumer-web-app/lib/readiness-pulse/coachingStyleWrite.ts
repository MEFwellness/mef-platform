/**
 * Readiness Pulse — Question 5 writes directly into the existing
 * wellness_coaching_style_profile (migration 36), the one, living,
 * single-source-of-truth coaching style store. No competing store.
 *
 * Two things happen, both against that same one table/system:
 *
 *  1. An immediate, explicit write via the existing
 *     upsertCoachingStyleProfile RPC, at high confidence (0.9) — a direct
 *     member statement, not an inference. This intentionally bypasses the
 *     generic computeCoachingStyle() sample-size-based confidence formula
 *     (confidenceFromSample), which starts at 0.4 + 0.05 per signal and
 *     grows with evidence_count: fed only this one new data point, it
 *     would land around 0.45, below the 0.5 floor
 *     coachingStyleGuidanceText() requires before the coach prompt uses a
 *     style at all. The build brief is explicit that a direct member
 *     statement becomes "the current coaching preference at high
 *     confidence" right away, not eventually once enough generic samples
 *     accumulate — so this writes the profile directly, the same RPC
 *     computeCoachingStyle's own caller already uses, just with an
 *     explicit computation object instead of a derived one. Every other
 *     dimension (detail/task-load/time-commitment) is carried forward
 *     unchanged from whatever is already on the profile, never reset.
 *  2. A narrative_items row (category 'coaching_preferences', provenance
 *     'member_reported') recording the real statement, so the profile
 *     stays genuinely living per the build brief: coachingStyle.ts's own
 *     keyword lists were extended (see that file) to recognize this exact
 *     language, so any future scheduled recompute of computeCoachingStyle
 *     keeps landing on the same tone from this same real evidence, not
 *     just from this one-time direct write.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCoachingStyleProfile, upsertCoachingStyleProfile } from '../intelligence-core/data';
import { findActiveItem, insertNarrativeItem, supersedeNarrativeItem } from '../narrative/data';
import type { Q5Answer } from './constants';

export const Q5_OPTION_LABEL: Record<Q5Answer, string> = {
  direct: 'Call it out, straight, no cushion',
  meaning_anchored: 'Remind me why I started',
  adaptive: 'Shrink it, make tomorrow smaller',
  autonomous: 'Say nothing, I will come back on my own',
};

const Q5_NARRATIVE_TEXT: Record<Q5Answer, string> = {
  direct: 'When something slips, call it out, straight, no cushion.',
  meaning_anchored: 'When something slips, remind me why I started.',
  adaptive: 'When something slips, shrink it, make tomorrow smaller.',
  autonomous: 'When something slips, say nothing, I will come back on my own.',
};

export async function applyRplCoachingStyleStatement(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  q5: Q5Answer
): Promise<void> {
  const current = await getCoachingStyleProfile(supabase, memberId);

  await upsertCoachingStyleProfile(supabase, memberId, {
    tonePreference: q5,
    detailPreference: current?.detail_preference ?? 'unclear',
    taskLoadPreference: current?.task_load_preference ?? 'unclear',
    timeCommitmentSweetSpotMinutes: current?.time_commitment_sweet_spot_minutes ?? null,
    confidence: 0.9,
    evidenceCount: (current?.evidence_count ?? 0) + 1,
    rationale: `Directly stated in the Readiness Pulse conversation (Question 5): "${Q5_OPTION_LABEL[q5]}."`,
  });

  const draft = {
    category: 'coaching_preferences' as const,
    title: 'Coaching style, stated directly',
    summary: Q5_NARRATIVE_TEXT[q5],
    provenance: 'member_reported' as const,
    confidence: 0.9,
    memberVisible: false,
    sourceRefs: [{ type: 'unified_assessment_session', id: sessionId, note: 'readiness-pulse' }],
  };

  const existing = await findActiveItem(supabase, memberId, draft.category, draft.title);
  if (existing && existing.summary === draft.summary) return;
  const inserted = await insertNarrativeItem(supabase, memberId, 'system', null, draft);
  if (existing && inserted) await supersedeNarrativeItem(supabase, existing.id, inserted.id);
}
