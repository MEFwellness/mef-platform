/**
 * The publish-time cascade — the concrete mechanism behind "after a coach
 * publishes an approved assessment: update the Universal Registry, update
 * Wellness Insights, update the MEF Intelligence Engine, update the
 * Intelligence Core, update the persisted health profile." Called from
 * app/actions/coach-intelligence.ts's publishAiAnalysisReportAction, once,
 * after the analysis row itself has already flipped to 'published' and the
 * member-facing notification has already been written.
 *
 * Best-effort and non-throwing, same discipline as every other
 * recompute/write path in this codebase (buildMemberIntelligence,
 * recalculateIntelligenceCore, updateNarrativeForEvent) — a failure here
 * must never affect the publish action's already-committed result. Each
 * step is independently wrapped rather than one outer try/catch, so e.g. a
 * Wellness Intelligence hiccup doesn't prevent the registry writes (or the
 * health-profile upsert reflecting them) that already succeeded.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recalculateWellnessIntelligence } from '../intelligence/service';
import { listInsightsForMember } from '../intelligence/data';
import { buildMemberIntelligence } from '../intelligence-engine/engine';
import { listProfileSnapshots } from '../intelligence-engine/data';
import { recalculateIntelligenceCore } from '../intelligence-core/service';
import { upsertRegistryEntriesFromBodyAssessment } from '../registry/adapters/bodyAssessment';
import { upsertRegistryEntriesFromCoachIntelligence } from '../registry/adapters/coachIntelligence';
import { listRegistryEntriesForMember } from '../registry/data';
import { recordTimelineEvent } from '../timeline/data';
import { buildHealthProfileSummary } from './summary';

async function step(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`onAssessmentPublished step failed: ${label}`, err instanceof Error ? err.message : err);
  }
}

export type OnAssessmentPublishedInput = {
  memberId: string;
  assessmentId: string;
  analysisId: string;
  asOfLocalDate: string;
};

export async function onAssessmentPublished(
  supabase: SupabaseClient,
  input: OnAssessmentPublishedInput
): Promise<void> {
  await step('registry: body assessment findings', () =>
    upsertRegistryEntriesFromBodyAssessment(supabase, input.memberId, input.assessmentId)
  );
  await step('registry: coach intelligence observations', () =>
    upsertRegistryEntriesFromCoachIntelligence(supabase, input.memberId, input.analysisId)
  );
  await step('timeline: assessment_published event', async () => {
    await recordTimelineEvent(supabase, {
      memberId: input.memberId,
      eventType: 'assessment_published',
      localDate: input.asOfLocalDate,
      title: 'Coach published your assessment report',
      sourceFeature: 'assessment_ai_analyses',
      sourceRecordId: input.analysisId,
    });
  });
  await step('wellness intelligence recalculation', () =>
    recalculateWellnessIntelligence(supabase, input.memberId, input.asOfLocalDate)
  );

  let reportForSummary: Awaited<ReturnType<typeof buildMemberIntelligence>> | null = null;
  await step('MEF intelligence engine build', async () => {
    reportForSummary = await buildMemberIntelligence(supabase, input.memberId, input.asOfLocalDate);
  });

  await step('intelligence core recalculation', () =>
    recalculateIntelligenceCore(supabase, input.memberId, input.asOfLocalDate)
  );

  await step('persisted health profile upsert', async () => {
    if (!reportForSummary) return; // the engine build failed; nothing honest to summarize yet

    const [snapshots, registryEntries, insights] = await Promise.all([
      listProfileSnapshots(supabase, input.memberId, 1),
      listRegistryEntriesForMember(supabase, input.memberId, { statusFilter: ['active'] }),
      listInsightsForMember(supabase, input.memberId, { statusFilter: ['active', 'confirmed'] }),
    ]);

    const summary = buildHealthProfileSummary(reportForSummary, registryEntries, insights);

    const { error } = await supabase.rpc('upsert_member_health_profile', {
      p_member: input.memberId,
      p_summary: summary,
      p_latest_snapshot_id: snapshots[0]?.id ?? null,
      p_wellness_insight_count: insights.length,
      p_registry_finding_count: registryEntries.filter((e) => e.entry_kind === 'finding').length,
      p_overall_confidence: reportForSummary.hypotheses[0]?.confidence ?? null,
      p_trigger: 'assessment_published',
    });
    if (error) throw error;
  });
}
