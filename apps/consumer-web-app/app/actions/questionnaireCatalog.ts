/**
 * The Questionnaires catalog — one query, one grouping, used by both the
 * Home summary card and the Questionnaires destination (app/questionnaires
 * /page.tsx). Reads status/facts generically from lib/assessment-registry/*
 * and reads display detail (title, description, draft progress, result
 * links) from each system's own existing, unmodified action
 * (getMyQuestionnaireList for the generic engine, getMyPrimalPatternListItem
 * for Primal Pattern, fetchBaselineAssessment for Onboarding) — nothing
 * here re-implements any system's own question/scoring/storage logic.
 *
 * Body Assessment is registered in the framework but deliberately excluded
 * here — app/questionnaires/page.tsx (and Home's Questionnaires card) has
 * always been "deliberately separate from /assessment," and that existing
 * product decision is preserved, not overridden by this restructuring.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getMyQuestionnaireList } from './assessments';
import { getMyPrimalPatternListItem } from './primal-pattern';
import { fetchBaselineAssessment } from '@/lib/onboarding/baseline';
import { getMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { listAssessmentRegistryEntries } from '@/lib/assessment-registry/registry';
import {
  categorizeForCatalog,
  type CatalogFlags,
  type CatalogSection,
} from '@/lib/assessment-registry/catalog';
import type { AssessmentKey } from '@/lib/assessment-registry/types';

export type CatalogCard = {
  key: AssessmentKey;
  title: string;
  description: string;
  estimatedMinutes: number;
  category: string;
  section: CatalogSection;
  flags: CatalogFlags;
  draftProgress: { answered: number; total: number } | null;
  latestCompletedAt: string | null;
  primaryHref: string | null;
  resultHref: string | null;
  coachAssignmentReason: string | null;
};

export type QuestionnaireCatalog = {
  assigned: CatalogCard[];
  completed: CatalogCard[];
  premium: CatalogCard[];
  available: CatalogCard[];
  /** Takeable catalog entries (excludes Coming Soon placeholders). */
  totalCount: number;
  completedCount: number;
};

/**
 * A fresh, empty catalog for every call — this must be a factory, not a
 * shared module-level constant. This module is a long-lived Node.js server
 * process, not re-evaluated per request, so a `{ ...EMPTY_CATALOG }`
 * shallow spread of a singleton object would only copy its top-level
 * properties: the four array properties would stay shared by reference
 * across every request, and every call's `.push()` would silently
 * accumulate onto the same arrays forever.
 */
function emptyCatalog(): QuestionnaireCatalog {
  return {
    assigned: [],
    completed: [],
    premium: [],
    available: [],
    totalCount: 0,
    completedCount: 0,
  };
}

async function requireMemberId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getMyQuestionnaireCatalog(): Promise<QuestionnaireCatalog> {
  const memberId = await requireMemberId();
  if (!memberId) return emptyCatalog();

  const supabase = createClient();
  const entries = listAssessmentRegistryEntries().filter((e) => e.key !== 'body-assessment');

  const [factsByKey, engineList, primalPatternItem, onboardingBaseline] = await Promise.all([
    getMemberAssessmentFacts(supabase, memberId),
    getMyQuestionnaireList(),
    getMyPrimalPatternListItem(),
    fetchBaselineAssessment(supabase, memberId),
  ]);

  const engineByKey = new Map(engineList.map((item) => [item.questionnaireId, item] as const));

  const cards: CatalogCard[] = [];

  for (const entry of entries) {
    const facts = factsByKey.get(entry.key);
    if (!facts) continue;

    const { section, flags } = categorizeForCatalog(entry, facts);

    if (entry.key === 'onboarding-health-history') {
      cards.push({
        key: entry.key,
        title: entry.displayName,
        description: entry.shortDescription,
        estimatedMinutes: entry.estimatedMinutes,
        category: entry.category,
        section,
        flags,
        draftProgress: null,
        latestCompletedAt: onboardingBaseline?.submittedAt ?? facts.latestCompletedAt,
        primaryHref: onboardingBaseline ? '/profile/reassessments/new' : '/onboarding',
        resultHref: onboardingBaseline ? '/profile/baseline' : null,
        coachAssignmentReason: facts.pendingAssignment?.reason ?? null,
      });
      continue;
    }

    if (entry.key === 'primal-pattern-diet-type') {
      if (!primalPatternItem) continue;
      cards.push({
        key: entry.key,
        title: primalPatternItem.title,
        description: primalPatternItem.listDescription,
        estimatedMinutes: primalPatternItem.estimatedMinutes,
        category: entry.category,
        section,
        flags,
        draftProgress: primalPatternItem.draft,
        latestCompletedAt: facts.latestCompletedAt,
        primaryHref: `/assessments/${primalPatternItem.questionnaireId}`,
        resultHref: primalPatternItem.latestCompleted
          ? `/assessments/${primalPatternItem.questionnaireId}/results/${primalPatternItem.latestCompleted.id}`
          : null,
        coachAssignmentReason: facts.pendingAssignment?.reason ?? null,
      });
      continue;
    }

    // Generic engine (CHEK/Nutrition & Lifestyle, Four Doctors, and any
    // future registry-based questionnaire) — engineByKey is keyed by the
    // already-public-slug questionnaireId from getMyQuestionnaireList().
    const engineItem =
      entry.key === 'chek-hlc1-nutrition-lifestyle'
        ? engineByKey.get('nutrition-lifestyle')
        : engineByKey.get(entry.key);

    if (engineItem) {
      cards.push({
        key: entry.key,
        title: engineItem.title,
        description: engineItem.listDescription,
        estimatedMinutes: engineItem.estimatedMinutes,
        category: entry.category,
        section,
        flags,
        draftProgress: engineItem.draft,
        latestCompletedAt: facts.latestCompletedAt,
        primaryHref: `/assessments/${engineItem.questionnaireId}`,
        resultHref: engineItem.latestCompleted
          ? `/assessments/${engineItem.questionnaireId}/results/${engineItem.latestCompleted.id}`
          : null,
        coachAssignmentReason: facts.pendingAssignment?.reason ?? null,
      });
      continue;
    }

    // Coming Soon placeholders (readiness-to-change, short-haq, finding-1-love).
    cards.push({
      key: entry.key,
      title: entry.displayName,
      description: entry.shortDescription,
      estimatedMinutes: entry.estimatedMinutes,
      category: entry.category,
      section,
      flags,
      draftProgress: null,
      latestCompletedAt: null,
      primaryHref: null,
      resultHref: null,
      coachAssignmentReason: null,
    });
  }

  const catalog: QuestionnaireCatalog = emptyCatalog();
  for (const card of cards) {
    catalog[card.section].push(card);
    if (!card.flags.comingSoon) catalog.totalCount += 1;
  }
  catalog.completedCount = catalog.completed.length;

  return catalog;
}
