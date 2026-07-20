/**
 * Orchestrates the new Questionnaires page (guided member journey) on top
 * of the Assessment Registry framework. Reads status/facts generically
 * from lib/assessment-registry/*, and reads display detail (title,
 * description, draft progress, result links) from each system's own
 * existing, unmodified action (getMyQuestionnaireList for the generic
 * engine, getMyPrimalPatternListItem for Primal Pattern,
 * fetchBaselineAssessment for Onboarding) — nothing here re-implements
 * any system's own question/scoring/storage logic.
 *
 * Body Assessment is registered in the framework (for status/
 * recommendation purposes) but deliberately does not get a card here —
 * app/questionnaires/page.tsx has always been "deliberately separate from
 * /assessment," and that existing product decision is preserved, not
 * overridden by this task.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getMyQuestionnaireList } from './assessments';
import { getMyPrimalPatternListItem } from './primal-pattern';
import { fetchBaselineAssessment } from '@/lib/onboarding/baseline';
import { getMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { listAssessmentRegistryEntries } from '@/lib/assessment-registry/registry';
import {
  calculateAssessmentStatus,
  describeLockReason,
  type AssessmentStatus,
  type LockReason,
} from '@/lib/assessment-registry/status';
import { pickRecommendation } from '@/lib/assessment-registry/recommendation';
import type { AssessmentKey } from '@/lib/assessment-registry/types';

export type JourneyCard = {
  key: AssessmentKey;
  title: string;
  description: string;
  estimatedMinutes: number;
  category: string;
  status: AssessmentStatus;
  isRecommended: boolean;
  lockMessage: string | null;
  draftProgress: { answered: number; total: number } | null;
  latestCompletedAt: string | null;
  primaryHref: string | null;
  resultHref: string | null;
  coachAssignmentReason: string | null;
  reassessmentDueAt: string | null;
};

export type QuestionnaireJourney = {
  recommended: JourneyCard | null;
  continueWhereLeftOff: JourneyCard[];
  available: JourneyCard[];
  completed: JourneyCard[];
  scheduled: JourneyCard[];
  locked: JourneyCard[];
  comingSoon: JourneyCard[];
};

const EMPTY_JOURNEY: QuestionnaireJourney = {
  recommended: null,
  continueWhereLeftOff: [],
  available: [],
  completed: [],
  scheduled: [],
  locked: [],
  comingSoon: [],
};

async function requireMemberId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getMyQuestionnaireJourney(): Promise<QuestionnaireJourney> {
  const memberId = await requireMemberId();
  if (!memberId) return EMPTY_JOURNEY;

  const supabase = createClient();
  const entries = listAssessmentRegistryEntries().filter((e) => e.key !== 'body-assessment');

  const [factsByKey, engineList, primalPatternItem, onboardingBaseline] = await Promise.all([
    getMemberAssessmentFacts(supabase, memberId),
    getMyQuestionnaireList(),
    getMyPrimalPatternListItem(),
    fetchBaselineAssessment(supabase, memberId),
  ]);

  const engineByKey = new Map(engineList.map((item) => [item.questionnaireId, item] as const));
  const recommendation = pickRecommendation(factsByKey);

  const cards: JourneyCard[] = [];

  for (const entry of entries) {
    const facts = factsByKey.get(entry.key);
    if (!facts) continue;

    const { status, lockReason } = calculateAssessmentStatus(entry, facts);
    const isRecommended = recommendation.key === entry.key;

    if (entry.key === 'onboarding-health-history') {
      cards.push({
        key: entry.key,
        title: entry.displayName,
        description: entry.shortDescription,
        estimatedMinutes: entry.estimatedMinutes,
        category: entry.category,
        // Once a baseline exists, fall back to 'completed' only when
        // nothing more specific (a pending coach assignment or due
        // reassessment) is already in play — those signals still win.
        status:
          onboardingBaseline && (status === 'available' || status === 'locked')
            ? 'completed'
            : status,
        isRecommended,
        lockMessage: lockReason ? describeLockReason(lockReason) : null,
        draftProgress: null,
        latestCompletedAt: onboardingBaseline?.submittedAt ?? null,
        primaryHref: onboardingBaseline ? '/profile/reassessments/new' : '/onboarding',
        resultHref: onboardingBaseline ? '/profile/baseline' : null,
        coachAssignmentReason: facts.pendingAssignment?.reason ?? null,
        reassessmentDueAt: facts.pendingReassessmentSchedule?.dueAt ?? null,
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
        status,
        isRecommended,
        lockMessage: lockReason ? describeLockReason(lockReason) : null,
        draftProgress: primalPatternItem.draft,
        latestCompletedAt: facts.latestCompletedAt,
        primaryHref: `/assessments/${primalPatternItem.questionnaireId}`,
        resultHref: primalPatternItem.latestCompleted
          ? `/assessments/${primalPatternItem.questionnaireId}/results/${primalPatternItem.latestCompleted.id}`
          : null,
        coachAssignmentReason: facts.pendingAssignment?.reason ?? null,
        reassessmentDueAt: facts.pendingReassessmentSchedule?.dueAt ?? null,
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
        status,
        isRecommended,
        lockMessage: lockReason ? describeLockReason(lockReason) : null,
        draftProgress: engineItem.draft,
        latestCompletedAt: facts.latestCompletedAt,
        primaryHref: `/assessments/${engineItem.questionnaireId}`,
        resultHref: engineItem.latestCompleted
          ? `/assessments/${engineItem.questionnaireId}/results/${engineItem.latestCompleted.id}`
          : null,
        coachAssignmentReason: facts.pendingAssignment?.reason ?? null,
        reassessmentDueAt: facts.pendingReassessmentSchedule?.dueAt ?? null,
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
      status: 'coming_soon',
      isRecommended: false,
      lockMessage: null,
      draftProgress: null,
      latestCompletedAt: null,
      primaryHref: null,
      resultHref: null,
      coachAssignmentReason: null,
      reassessmentDueAt: null,
    });
  }

  const journey: QuestionnaireJourney = { ...EMPTY_JOURNEY };
  for (const card of cards) {
    // A card that is the single Recommended Next appears only in its own
    // hero section — every other bucket excludes it, so no card ever
    // renders twice on the page.
    if (card.isRecommended) {
      journey.recommended = card;
      continue;
    }

    switch (card.status) {
      case 'in_progress':
        journey.continueWhereLeftOff.push(card);
        break;
      case 'coach_assigned':
        // Coach-assigned surfaces alongside Available — a coach
        // assignment is actionable now, same bucket as anything else the
        // member can start today.
        journey.available.push(card);
        break;
      case 'available':
        journey.available.push(card);
        break;
      case 'completed':
        journey.completed.push(card);
        break;
      case 'scheduled':
        journey.scheduled.push(card);
        break;
      case 'locked':
        journey.locked.push(card);
        break;
      case 'coming_soon':
        journey.comingSoon.push(card);
        break;
      default:
        break;
    }
  }

  return journey;
}

export type { AssessmentStatus, LockReason };
