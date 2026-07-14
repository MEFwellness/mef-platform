/**
 * Universal Registry adapter — Coach Intelligence Workspace.
 *
 * Maps accepted assessment_ai_observations rows into registry_entries,
 * once their parent analysis has been published (called from
 * lib/health-profile/orchestration.ts's onAssessmentPublished, never
 * before). Only 'observation'/'compensation'/'red_flag' categories are
 * registered — these are findings about the member's body;
 * 'four_doctors_consideration'/'education_topic'/'corrective_exercise_category'/
 * 'coach_question' are coaching-plan artifacts, not findings, and are
 * deliberately excluded to keep the registry a findings/metrics landing
 * zone rather than a mirror of coaching guidance.
 *
 * A 'red_flag' observation is force-set member_visible=false — the same
 * invisibility assessment_ai_observations' own RLS already enforces for
 * that category (migration 39's member_read_published_assessment_ai_observations
 * excludes 'red_flag'/'coach_question'), reasserted explicitly here rather
 * than re-derived from category at every future read.
 *
 * No NLP classification into finer-grained domains — every entry this
 * adapter writes uses domain='movement' (a body-assessment-context
 * observation), a known simplification rather than building detector logic
 * for a taxonomy this milestone has no real signal to support.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiObservationCategory } from '@mef/shared-types-contracts';
import { listObservations } from '../../coach-intelligence/data';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import type { RegistryEntryDraft } from '../types';

const REGISTERED_CATEGORIES = new Set<AiObservationCategory>(['observation', 'compensation', 'red_flag']);

function codeForObservation(observationId: string, text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .slice(0, 6)
    .join('_');
  return slug ? `${slug}_${observationId.slice(0, 8)}` : observationId;
}

export async function upsertRegistryEntriesFromCoachIntelligence(
  supabase: SupabaseClient,
  memberId: string,
  analysisId: string
): Promise<void> {
  const observations = await listObservations(supabase, analysisId);
  const registerable = observations.filter(
    (o) => o.status === 'accepted' && REGISTERED_CATEGORIES.has(o.category)
  );

  for (const observation of registerable) {
    const text = observation.coach_text ?? observation.ai_text;
    const code = codeForObservation(observation.id, text);
    const existing = await findActiveRegistryEntry(supabase, memberId, 'movement', code);
    if (existing && existing.source_record_id === observation.id) continue;

    const draft: RegistryEntryDraft = {
      entry_kind: 'finding',
      domain: 'movement',
      code,
      label: text.slice(0, 120),
      severity: observation.severity,
      numeric_value: null,
      unit: null,
      confidence: observation.confidence ?? 0.5,
      narrative: text,
      evidence_refs: observation.evidence,
      source_feature: 'assessment_ai_observation',
      source_record_id: observation.id,
      member_visible: observation.category !== 'red_flag',
      coach_context: null,
      coach_reviewed_by: observation.coach_reviewed_by,
      coach_reviewed_at: observation.coach_reviewed_at,
      recorded_at: observation.updated_at,
    };

    await insertRegistryEntry(supabase, memberId, draft, {
      supersedesId: existing?.id ?? null,
    });
  }
}
