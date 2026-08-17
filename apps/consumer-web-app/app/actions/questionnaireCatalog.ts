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
 * product decision is preserved, not overridden by this restructuring. See
 * getMyBodyAssessmentAssignmentCard below for its own, separate assignment
 * card (Coach-Assign-Only Gating task, 2026-08-04).
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getMyQuestionnaireList } from './assessments';
import { getMyPrimalPatternListItem } from './primal-pattern';
import { fetchBaselineAssessment } from '@/lib/onboarding/baseline';
import { getMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { listAssessmentRegistryEntries, findAssessmentRegistryEntry } from '@/lib/assessment-registry/registry';
import {
  categorizeForCatalog,
  type CatalogFlags,
  type CatalogSection,
} from '@/lib/assessment-registry/catalog';
import type { AssessmentDefinition, AssessmentKey } from '@/lib/assessment-registry/types';
import { getUnifiedAssessmentDefinitionByKey, getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { findInProgressSession } from '@/lib/assessment-runtime';
import { getMemberVisibility } from '@/lib/visibility';

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
  /** The assessment_assignments row id, when this card is currently in the 'assigned' section — the Root pop-up chain's one source for the exact display title/route it uses, so the pop-up copy can never name a questionnaire differently than the card/page the member actually lands on (see app/actions/rootPopupMessages.ts). Null otherwise. */
  assignmentId: string | null;
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

  // Assessments on the Unified Adaptive Assessment Runtime (WBSA, Core
  // Values Snapshot, and any future one — matched generically by
  // storageAdapter rather than a per-key list, same "no per-assessment
  // hardcoding beyond what content genuinely differs" posture as the
  // engine/onboarding/primal-pattern branches below) don't come through
  // getMyQuestionnaireList (that's the older generic-engine's own list) —
  // one small batched query gets the latest completed session id for
  // each, so "View Results" has somewhere real to point.
  const unifiedRuntimeEntries = entries.filter((e) => e.storageAdapter === 'unified-assessment-runtime-tables');
  const latestUnifiedSessionIdByDefinitionId = new Map<string, string>();
  if (unifiedRuntimeEntries.length > 0) {
    const { data: latestCompletedRows } = await supabase
      .from('assessment_attempts')
      .select('assessment_definition_id, source_id, completed_at')
      .eq('member_id', memberId)
      .eq('source_table', 'unified_assessment_sessions')
      .eq('status', 'completed')
      .in(
        'assessment_definition_id',
        unifiedRuntimeEntries.map((e) => e.databaseId)
      )
      .order('completed_at', { ascending: false });

    for (const row of latestCompletedRows ?? []) {
      const definitionId = row.assessment_definition_id as string;
      // Rows are ordered latest-first, so the first one seen per
      // definition id is the most recent completion.
      if (!latestUnifiedSessionIdByDefinitionId.has(definitionId)) {
        latestUnifiedSessionIdByDefinitionId.set(definitionId, row.source_id as string);
      }
    }
  }

  async function buildUnifiedRuntimeCard(
    entry: AssessmentDefinition,
    section: CatalogSection,
    flags: CatalogFlags,
    facts: NonNullable<ReturnType<typeof factsByKey.get>>
  ): Promise<CatalogCard> {
    let draftProgress: { answered: number; total: number } | null = null;
    const definition = await getUnifiedAssessmentDefinitionByKey(supabase, entry.key);
    if (definition) {
      const draftSession = await findInProgressSession(supabase, memberId!, definition.id);
      if (draftSession) {
        const questions = await getUnifiedAssessmentQuestions(supabase, definition.id);
        draftProgress = {
          answered: draftSession.progress.answered,
          total: questions.filter((q) => q.active).length,
        };
      }
    }

    const latestSessionId = latestUnifiedSessionIdByDefinitionId.get(entry.databaseId) ?? null;

    return {
      key: entry.key,
      title: entry.displayName,
      description: entry.shortDescription,
      estimatedMinutes: entry.estimatedMinutes,
      category: entry.category,
      section,
      flags,
      draftProgress,
      latestCompletedAt: facts.latestCompletedAt,
      primaryHref: entry.route,
      resultHref: latestSessionId ? `${entry.route}/results/${latestSessionId}` : null,
      coachAssignmentReason: facts.pendingAssignment?.reason ?? null,
      assignmentId: facts.pendingAssignment?.id ?? null,
    };
  }

  // Real completed-assessment keys, for the prerequisiteKeys check
  // categorizeForCatalog's own calculateLockReason performs (e.g. Life
  // Signal Check requires Core Values Snapshot) — computed once from the
  // same batched facts query already fetched above, not a new query.
  const completedPrerequisiteKeys = new Set<AssessmentKey>(
    [...factsByKey.entries()].filter(([, facts]) => facts.completionStatus === 'completed').map(([key]) => key)
  );

  const cards: CatalogCard[] = [];

  for (const entry of entries) {
    const facts = factsByKey.get(entry.key);
    if (!facts) continue;

    const { section, flags } = categorizeForCatalog(entry, facts, new Date(), completedPrerequisiteKeys);

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
        assignmentId: facts.pendingAssignment?.id ?? null,
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
        assignmentId: facts.pendingAssignment?.id ?? null,
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
        assignmentId: facts.pendingAssignment?.id ?? null,
      });
      continue;
    }

    if (entry.storageAdapter === 'unified-assessment-runtime-tables') {
      cards.push(await buildUnifiedRuntimeCard(entry, section, flags, facts));
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
      assignmentId: null,
    });
  }

  /**
   * VISIBILITY LAYER (2026-08-17). The catalogue used to be identical for
   * every member: a member whose intake said sleep was her problem and a
   * member whose intake said digestion was hers saw the same six
   * questionnaires in the same order, two of them locked by position in a
   * fixed chain rather than by anything about her.
   *
   * Each assessment now carries its own rule (lib/visibility/catalog.ts),
   * and a card whose rule has not fired is absent rather than locked. That
   * is the whole change of posture in this build: a lock is still an
   * advertisement for something she cannot have, and a member reading
   * "Complete a prior step first to unlock this" is being told about a
   * questionnaire that may never be for her at all.
   *
   * Nothing she has started or completed can be filtered out, because the
   * visibility layer grandfathers every touched feature before any rule is
   * consulted (rule 2). The counts below are computed AFTER the filter, so
   * "2 of 9 complete" counts the library she actually has rather than the
   * library the product has.
   */
  const visibility = await getMemberVisibility();
  const visibleCards = cards.filter(
    (card) => visibility.byKey.get(`assessment.${card.key}`)?.visible ?? false
  );

  const catalog: QuestionnaireCatalog = emptyCatalog();
  for (const card of visibleCards) {
    catalog[card.section].push(card);
    if (!card.flags.comingSoon) catalog.totalCount += 1;
  }
  catalog.completedCount = catalog.completed.length;

  return catalog;
}

/**
 * Coach-Assign-Only Gating task (2026-08-04) — Body Assessment's own
 * assignment card, deliberately kept separate from getMyQuestionnaireCatalog()
 * above rather than merged into it: that catalog (and /questionnaires,
 * and Home's Questionnaires summary count) has always deliberately
 * excluded Body Assessment, and that stays true here — this function
 * exists only so a pending Body Assessment assignment can reuse the exact
 * same CatalogCard shape, the same AssignedQuestionnairePriorityCard
 * rendering, and the same questionnaire_assigned Root pop-up as every
 * other coach-assigned questionnaire, without pulling Body Assessment
 * into the Questionnaires page/count it was always meant to stay apart
 * from. Returns null whenever there is no pending assignment for it.
 */
export async function getMyBodyAssessmentAssignmentCard(): Promise<CatalogCard | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const entry = findAssessmentRegistryEntry('body-assessment' as AssessmentKey);
  if (!entry) return null;

  const factsByKey = await getMemberAssessmentFacts(supabase, memberId);
  const facts = factsByKey.get(entry.key);
  if (!facts) return null;

  const { section, flags } = categorizeForCatalog(entry, facts, new Date());
  if (section !== 'assigned') return null;

  return {
    key: entry.key,
    title: entry.displayName,
    description: entry.shortDescription,
    estimatedMinutes: entry.estimatedMinutes,
    category: entry.category,
    section,
    flags,
    draftProgress: null,
    latestCompletedAt: facts.latestCompletedAt,
    primaryHref: entry.takeRoute,
    resultHref: null,
    coachAssignmentReason: facts.pendingAssignment?.reason ?? null,
    assignmentId: facts.pendingAssignment?.id ?? null,
  };
}
