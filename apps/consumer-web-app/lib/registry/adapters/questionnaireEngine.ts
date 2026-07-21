/**
 * Universal Registry adapter — generic points-scored questionnaire engine
 * (CHEK HLC1 Nutrition & Lifestyle + Four Doctors — lib/assessments/).
 *
 * The Unified Findings Engine's core gap this closes: per
 * ASSESSMENT_INVENTORY.md, `registry_entries.domain='questionnaire'` has
 * been reserved since migration 40 but neither questionnaire ever wrote a
 * finding into it. A category landing in the questionnaire's own
 * 'moderate'/'high' priority band (lib/assessments/engine/scoring.ts) is a
 * real, already-computed clinical signal — this adapter reshapes it into
 * the registry's one common contract, same non-re-deriving discipline as
 * lib/registry/adapters/bodyAssessment.ts. A 'low' priority category is not
 * a finding (nothing wrong to report) and is never registered; if a prior
 * active finding for that category exists, it's resolved instead (see
 * below) rather than left stale.
 *
 * Domain/code choice is real member-facing wellness vocabulary (sleep,
 * stress, nutrition, movement), never the internal questionnaire id or
 * category id — per lib/assessment-registry/types.ts's own established
 * rule, internal identifiers are for engineering traceability only and
 * must never reach member-visible copy.
 *
 * Confidence is grounded in where the real score sits within its own
 * priority band (never fabricated): higher in the band → higher
 * confidence, within a fixed [0.55, 0.9] range.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistryDomain, RegistryEntrySeverity } from '@mef/shared-types-contracts';
import type { CategoryScoreResult } from '../../assessments/engine/types';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import { computeFindingTrendStatus } from '../trendStatus';
import type { RegistryEntryDraft } from '../types';

type CategoryFindingConfig = {
  domain: RegistryDomain;
  code: string;
  label: string;
  moderateBand: [number, number];
  highBand: [number, number];
};

const CATEGORY_FINDING_MAP: Record<string, Record<string, CategoryFindingConfig>> = {
  'chek-hlc1-nutrition-lifestyle': {
    you_are_what_you_eat: {
      domain: 'nutrition',
      code: 'nutrition_quality_concern',
      label: 'Nutrition Quality Concerns',
      moderateBand: [30, 49],
      highBand: [50, 130],
    },
    stress: {
      domain: 'stress',
      code: 'elevated_stress',
      label: 'Elevated Stress',
      moderateBand: [20, 39],
      highBand: [40, 81],
    },
    circadian_health: {
      domain: 'sleep',
      code: 'circadian_disruption',
      label: 'Circadian Rhythm Disruption',
      moderateBand: [30, 49],
      highBand: [50, 90],
    },
    you_are_when_you_eat: {
      domain: 'nutrition',
      code: 'meal_timing_irregularity',
      label: 'Irregular Meal Timing',
      moderateBand: [10, 19],
      highBand: [20, 50],
    },
    digestive_system_health: {
      domain: 'nutrition',
      code: 'digestive_complaints',
      label: 'Digestive Complaints',
      moderateBand: [20, 39],
      highBand: [40, 81],
    },
    fungus_and_parasites: {
      domain: 'nutrition',
      code: 'gut_fungal_parasite_concern',
      label: 'Gut Fungal & Parasite Concerns',
      moderateBand: [40, 59],
      highBand: [60, 115],
    },
    detoxification_system_health: {
      domain: 'nutrition',
      code: 'detoxification_load_concern',
      label: 'Detoxification Load Concerns',
      moderateBand: [20, 39],
      highBand: [40, 88],
    },
  },
  'four-doctors': {
    dr_happiness: {
      domain: 'stress',
      code: 'emotional_wellbeing_concern',
      label: 'Emotional Wellbeing Concern',
      moderateBand: [55, 74],
      highBand: [75, 160],
    },
    dr_quiet: {
      domain: 'sleep',
      code: 'poor_sleep_quality',
      label: 'Poor Sleep Quality',
      moderateBand: [30, 49],
      highBand: [50, 80],
    },
    dr_diet: {
      domain: 'nutrition',
      code: 'diet_quality_concern',
      label: 'Diet Quality Concern',
      moderateBand: [50, 94],
      highBand: [95, 220],
    },
    dr_movement: {
      domain: 'movement',
      code: 'movement_deficiency',
      label: 'Movement Deficiency',
      moderateBand: [50, 69],
      highBand: [70, 150],
    },
  },
};

function confidenceWithinBand(score: number, band: [number, number]): number {
  const [min, max] = band;
  const ratio = max === min ? 1 : Math.min(1, Math.max(0, (score - min) / (max - min)));
  return Math.round((0.55 + 0.35 * ratio) * 100) / 100;
}

export async function upsertRegistryEntriesFromQuestionnaireAttempt(
  supabase: SupabaseClient,
  memberId: string,
  questionnaireId: string,
  assessmentId: string,
  categoryScores: CategoryScoreResult[]
): Promise<void> {
  const categoryMap = CATEGORY_FINDING_MAP[questionnaireId];
  if (!categoryMap) return; // no finding vocabulary defined for this questionnaire yet

  for (const category of categoryScores) {
    const config = categoryMap[category.categoryId];
    if (!config) continue;

    const existing = await findActiveRegistryEntry(supabase, memberId, config.domain, config.code);

    if (category.priority === 'low') {
      // Nothing wrong to report — resolve a prior active finding rather than leaving it stale.
      if (existing) {
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
            narrative: `${config.label} has resolved to a low-priority range on the latest attempt.`,
            evidence_refs: [{ type: 'wellness_assessment', id: assessmentId }],
            source_feature: 'questionnaire_category_finding',
            source_record_id: assessmentId,
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

    const severity: RegistryEntrySeverity =
      category.priority === 'high' ? 'significant' : 'moderate';
    const band = category.priority === 'high' ? config.highBand : config.moderateBand;
    const confidence = confidenceWithinBand(category.score, band);

    if (existing && existing.source_record_id === assessmentId) continue; // already registered this attempt

    const draft: RegistryEntryDraft = {
      entry_kind: 'finding',
      domain: config.domain,
      code: config.code,
      label: config.label,
      severity,
      numeric_value: category.score,
      unit: 'points',
      confidence,
      narrative: `${config.label} scored ${category.score}/${category.maxScore} (${category.priority} priority) on the latest attempt.`,
      evidence_refs: [{ type: 'wellness_assessment', id: assessmentId }],
      source_feature: 'questionnaire_category_finding',
      source_record_id: assessmentId,
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
