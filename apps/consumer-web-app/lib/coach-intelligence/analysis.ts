/**
 * Runs the configured Coach Intelligence provider (if any) for one
 * assessment. Directly mirrors performAnalysis() in
 * app/actions/body-assessment.ts: with no provider registered — the
 * expected state for this milestone — this leaves the analysis in
 * 'not_configured' rather than fabricating a summary or observations. The
 * analysis row is get-or-created here so this single function serves both
 * the inline best-effort call from submitAssessmentAction (member session,
 * row never exists yet) and the explicit "Run analysis" retry a coach can
 * trigger later (runAiAnalysisAction, coach session, row usually already
 * exists), including the backfill case of an assessment submitted before
 * this feature existed. get-then-insert rather than a DB-level upsert
 * because the member session can't SELECT its own non-published row (RLS,
 * migration 39) to discover whether one already exists — see insertAnalysis.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAnalysisBySource, insertAnalysis, updateAnalysis, insertObservations } from './data';
import {
  getCoachIntelligenceProvider,
  resolveConfiguredCoachIntelligenceProvider,
} from './providers/registry';
import type { CoachIntelligenceAnalysisRequest } from './providers/types';

export async function performCoachIntelligenceAnalysis(
  supabase: SupabaseClient,
  request: CoachIntelligenceAnalysisRequest
): Promise<{ error?: string; analysisId?: string }> {
  const existing = await getAnalysisBySource(supabase, request.sourceFeature, request.sourceRecordId);
  const analysis =
    existing ??
    (await insertAnalysis(supabase, {
      sourceFeature: request.sourceFeature,
      sourceRecordId: request.sourceRecordId,
      memberId: request.memberId,
    }));
  if (!analysis) return { error: 'Could not create the AI analysis record.' };

  const providerName = resolveConfiguredCoachIntelligenceProvider();
  if (!providerName) {
    await updateAnalysis(supabase, analysis.id, { provider_status: 'not_configured' });
    return {
      analysisId: analysis.id,
      error:
        'No Coach Intelligence provider is configured yet. The assessment is saved as pending ' +
        'coach review and will be analyzed automatically once a provider is connected.',
    };
  }

  await updateAnalysis(supabase, analysis.id, { provider_name: providerName, provider_status: 'pending' });

  try {
    const provider = getCoachIntelligenceProvider(providerName);
    const result = await provider.analyze(request);

    await updateAnalysis(supabase, analysis.id, {
      provider_status: 'completed',
      ai_summary: result.summary,
      overall_confidence: result.overallConfidence,
    });
    await insertObservations(supabase, analysis.id, request.memberId, result.observations);

    return { analysisId: analysis.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Coach Intelligence analysis failed.';
    await updateAnalysis(supabase, analysis.id, { provider_status: 'failed', provider_error: message });
    return { analysisId: analysis.id, error: message };
  }
}
