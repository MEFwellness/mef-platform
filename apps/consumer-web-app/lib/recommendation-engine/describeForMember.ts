/**
 * Recommendation Engine — member-facing copy transform (Prompt 11). Never
 * renders confidence percentages, the priority enum, the source domain, or
 * any Root Router/Root Model terminology — same discipline as
 * lib/intelligence-engine/memberFacingNoticing.ts and
 * lib/investigation-engine/routerOutcome.ts's MEMBER_MESSAGE.
 */

import type { MemberRecommendation, MemberRecommendationCategory } from './types';

const CATEGORY_LABEL: Record<MemberRecommendationCategory, string> = {
  education: 'Worth learning about',
  lifestyle_experiment: 'Something to try',
  reflection: 'Worth reflecting on',
  coaching_conversation: 'Worth bringing up with your coach',
  movement_focus: 'A movement focus',
  recovery_focus: 'A recovery focus',
  nutrition_focus: 'A nutrition focus',
  stress_management: 'A stress-management focus',
  sleep_optimization: 'A sleep focus',
  breathing_practice: 'A breathing practice',
  daily_habit: 'A daily habit',
  weekly_practice: 'A weekly practice',
  follow_up_investigation: 'Worth a closer look',
  coach_review: 'Your coach has been notified',
  medical_referral_flag: 'Worth discussing with a healthcare provider',
};

export type MemberFacingRecommendation = {
  recommendationId: string;
  categoryLabel: string;
  title: string;
  explanation: string;
  completionTracking: boolean;
};

export function describeForMember(rec: MemberRecommendation): MemberFacingRecommendation {
  return {
    recommendationId: rec.recommendationId,
    categoryLabel: CATEGORY_LABEL[rec.category],
    title: rec.title,
    explanation: rec.explanation,
    completionTracking: rec.completionTracking,
  };
}
