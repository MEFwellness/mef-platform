/**
 * Universal Registry adapter — Onboarding Assessment.
 *
 * Onboarding never scores anything (ASSESSMENT_INVENTORY.md 1.1) — it's
 * raw stored answers plus lib/wellness/status.ts's shared good/attention/
 * poor classifiers (the exact same classifiers the member dashboard and
 * onboarding-vs-reassessment comparison already use, per
 * lib/onboarding/comparison.ts's own docblock). This adapter re-applies
 * those same classifiers to a single submission's answers (baseline OR any
 * later reassessment — every submission is a real snapshot in time, not
 * just the first one) and registers a finding for anything that lands in
 * 'attention' or 'poor', using the same domain vocabulary the other two
 * new adapters (questionnaireEngine.ts, primalPattern.ts) use, so a
 * "Digestive Complaints" finding reported by Onboarding and one later
 * reported by the Nutrition & Lifestyle Questionnaire supersede the same
 * (domain, code) chain rather than existing as two disconnected facts.
 *
 * A 'good' status resolves any prior active finding for that code (nothing
 * wrong to report now); 'no-data' (question skipped/not_sure/etc.) leaves
 * any prior finding alone — silence is not evidence of improvement.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OnboardingAnswerRecord,
  OnboardingQuestion,
  OnboardingSubmission,
  RegistryDomain,
  RegistryEntrySeverity,
} from '@mef/shared-types-contracts';
import { buildBaselineAssessment, type BaselineAssessment } from '../../onboarding/baseline';
import {
  digestionStatus,
  energyStatus,
  sleepQualityStatus,
  stressStatus,
  type MetricStatus,
} from '../../wellness/status';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import { computeFindingTrendStatus } from '../trendStatus';
import type { RegistryEntryDraft } from '../types';

const PAIN_AREAS = ['neck', 'shoulders', 'upper_back', 'lower_back', 'hips', 'knees'] as const;

type SimpleFindingConfig = { domain: RegistryDomain; code: string; label: string };

const METRIC_FINDING_CONFIG: Record<string, SimpleFindingConfig> = {
  sleep: { domain: 'sleep', code: 'poor_sleep_quality', label: 'Poor Sleep Quality' },
  stress: { domain: 'stress', code: 'elevated_stress', label: 'Elevated Stress' },
  energy: { domain: 'sleep', code: 'low_energy', label: 'Low Energy' },
  digestion: { domain: 'nutrition', code: 'digestive_complaints', label: 'Digestive Complaints' },
};

function severityForStatus(status: MetricStatus): RegistryEntrySeverity | null {
  if (status === 'poor') return 'moderate';
  if (status === 'attention') return 'mild';
  if (status === 'good') return 'none';
  return null; // no-data — not evidence either way
}

async function fetchSubmissionAssessment(
  supabase: SupabaseClient,
  submissionId: string
): Promise<BaselineAssessment | null> {
  const { data: submission, error } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();
  if (error || !submission) return null;

  const [{ data: answerRows }, { data: questions }] = await Promise.all([
    supabase.from('onboarding_answers').select('*').eq('submission_id', submissionId),
    supabase
      .from('onboarding_questions')
      .select('*')
      .eq('assessment_version_id', (submission as OnboardingSubmission).assessment_version_id),
  ]);

  return buildBaselineAssessment(
    submission as OnboardingSubmission,
    (questions ?? []) as OnboardingQuestion[],
    (answerRows ?? []) as OnboardingAnswerRecord[]
  );
}

async function upsertMetricFinding(
  supabase: SupabaseClient,
  memberId: string,
  submissionId: string,
  config: SimpleFindingConfig,
  status: MetricStatus
): Promise<void> {
  const severity = severityForStatus(status);
  if (severity === null) return; // no-data — leave any prior finding untouched

  const existing = await findActiveRegistryEntry(supabase, memberId, config.domain, config.code);

  if (severity === 'none') {
    if (!existing) return;
    await insertRegistryEntry(
      supabase,
      memberId,
      {
        entry_kind: 'finding',
        domain: config.domain,
        code: config.code,
        label: config.label,
        severity: 'none',
        numeric_value: null,
        unit: null,
        confidence: existing.confidence,
        narrative: `${config.label} has resolved on the latest onboarding submission.`,
        evidence_refs: [{ type: 'onboarding_submission', id: submissionId }],
        source_feature: 'onboarding_baseline_finding',
        source_record_id: submissionId,
        member_visible: true,
        coach_context: null,
        coach_reviewed_by: null,
        coach_reviewed_at: null,
        trend_status: computeFindingTrendStatus(existing, { severity: 'none', resolved: true }),
        recorded_at: new Date().toISOString(),
      } satisfies RegistryEntryDraft,
      { supersedesId: existing.id }
    );
    return;
  }

  if (existing && existing.source_record_id === submissionId) return;

  const confidence = severity === 'moderate' ? 0.65 : 0.5;
  const draft: RegistryEntryDraft = {
    entry_kind: 'finding',
    domain: config.domain,
    code: config.code,
    label: config.label,
    severity,
    numeric_value: null,
    unit: null,
    confidence,
    narrative: `${config.label} reported as '${status}' on the latest onboarding submission.`,
    evidence_refs: [{ type: 'onboarding_submission', id: submissionId }],
    source_feature: 'onboarding_baseline_finding',
    source_record_id: submissionId,
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    trend_status: computeFindingTrendStatus(existing, { severity }),
    recorded_at: new Date().toISOString(),
  };
  await insertRegistryEntry(supabase, memberId, draft, { supersedesId: existing?.id ?? null });
}

async function upsertPainAreaFindings(
  supabase: SupabaseClient,
  memberId: string,
  submissionId: string,
  selectedAreas: string[]
): Promise<void> {
  const count = selectedAreas.length;
  const severity: RegistryEntrySeverity = count >= 3 ? 'moderate' : count >= 1 ? 'mild' : 'none';

  for (const area of PAIN_AREAS) {
    const code = `pain_${area}`;
    const existing = await findActiveRegistryEntry(supabase, memberId, 'movement', code);
    const present = selectedAreas.includes(area);

    if (!present) {
      if (existing) {
        await insertRegistryEntry(
          supabase,
          memberId,
          {
            entry_kind: 'finding',
            domain: 'movement',
            code,
            label: `Discomfort — ${area.replaceAll('_', ' ')}`,
            severity: 'none',
            numeric_value: null,
            unit: null,
            confidence: existing.confidence,
            narrative: `No longer reported on the latest onboarding submission.`,
            evidence_refs: [{ type: 'onboarding_submission', id: submissionId }],
            source_feature: 'onboarding_baseline_finding',
            source_record_id: submissionId,
            member_visible: true,
            coach_context: null,
            coach_reviewed_by: null,
            coach_reviewed_at: null,
            trend_status: computeFindingTrendStatus(existing, { severity: 'none', resolved: true }),
            recorded_at: new Date().toISOString(),
          } satisfies RegistryEntryDraft,
          { supersedesId: existing.id }
        );
      }
      continue;
    }

    if (existing && existing.source_record_id === submissionId) continue;

    const draft: RegistryEntryDraft = {
      entry_kind: 'finding',
      domain: 'movement',
      code,
      label: `Discomfort — ${area.replaceAll('_', ' ')}`,
      severity,
      numeric_value: null,
      unit: null,
      confidence: severity === 'moderate' ? 0.6 : 0.45,
      narrative: `Ongoing discomfort in the ${area.replaceAll('_', ' ')} reported on the latest onboarding submission.`,
      evidence_refs: [{ type: 'onboarding_submission', id: submissionId }],
      source_feature: 'onboarding_baseline_finding',
      source_record_id: submissionId,
      member_visible: true,
      coach_context: null,
      coach_reviewed_by: null,
      coach_reviewed_at: null,
      trend_status: computeFindingTrendStatus(existing, { severity }),
      recorded_at: new Date().toISOString(),
    };
    await insertRegistryEntry(supabase, memberId, draft, { supersedesId: existing?.id ?? null });
  }
}

export async function upsertRegistryEntriesFromOnboardingSubmission(
  supabase: SupabaseClient,
  memberId: string,
  submissionId: string
): Promise<void> {
  const assessment = await fetchSubmissionAssessment(supabase, submissionId);
  if (!assessment) return;

  const answerByKey = new Map(assessment.answers.map((a) => [a.questionKey, a]));

  const sleep = answerByKey.get('baseline_sleep_quality');
  if (sleep && typeof sleep.value === 'number') {
    await upsertMetricFinding(
      supabase,
      memberId,
      submissionId,
      METRIC_FINDING_CONFIG.sleep!,
      sleepQualityStatus(sleep.value)
    );
  }

  const stress = answerByKey.get('baseline_stress_level');
  if (stress && typeof stress.value === 'number') {
    await upsertMetricFinding(
      supabase,
      memberId,
      submissionId,
      METRIC_FINDING_CONFIG.stress!,
      stressStatus(stress.value)
    );
  }

  const energy = answerByKey.get('baseline_energy_level');
  if (energy && typeof energy.value === 'number') {
    await upsertMetricFinding(
      supabase,
      memberId,
      submissionId,
      METRIC_FINDING_CONFIG.energy!,
      energyStatus(energy.value)
    );
  }

  const digestion = answerByKey.get('baseline_digestion');
  if (digestion && typeof digestion.value === 'number') {
    await upsertMetricFinding(
      supabase,
      memberId,
      submissionId,
      METRIC_FINDING_CONFIG.digestion!,
      digestionStatus(digestion.value)
    );
  }

  const painAreas = answerByKey.get('baseline_pain_areas');
  if (painAreas && Array.isArray(painAreas.value)) {
    const selected = painAreas.value.filter((area) => area !== 'none');
    await upsertPainAreaFindings(supabase, memberId, submissionId, selected);
  }
}
