'use server';

/**
 * Coaching Intelligence Engine — server actions. Same conventions as every
 * other action file in this app: a session-scoped Supabase client, RLS
 * (migration 66) as the real authorization boundary.
 *
 * The view type returned to the client deliberately strips
 * data_sources/evidence_refs/confidence (internal identifiers and a raw
 * 0-1 number) — the "Why am I seeing this?" explanation is the
 * already-composed, plain-language `explanation` string
 * (lib/coaching-insights/copy.ts's buildExplanation, written once at
 * generation time), which is the member-facing contract this feature
 * promises ("never expose internal code, explain the reasoning in plain
 * language").
 */

import { createClient } from '@/lib/supabase/server';
import { resolveMemberTimezone } from '@/lib/food-lens/weeklyReportData';
import { getOrGenerateTodaysCoachingInsights } from '@/lib/coaching-insights/service';
import type { CoachingInsightCategory, CoachingInsightLevel } from '@mef/shared-types-contracts';

export type CoachingInsightView = {
  id: string;
  category: CoachingInsightCategory;
  level: CoachingInsightLevel;
  statement: string;
  explanation: string;
  localDate: string;
};

export type MyCoachingInsightsResult = {
  insights: CoachingInsightView[];
  safetyMessage: string | null;
};

export async function getMyCoachingInsightsAction(): Promise<MyCoachingInsightsResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { insights: [], safetyMessage: null };

  const timezone = await resolveMemberTimezone(supabase, user.id);
  const { insights, safetyMessage } = await getOrGenerateTodaysCoachingInsights(
    supabase,
    user.id,
    timezone
  );

  return {
    insights: insights.map((row) => ({
      id: row.id,
      category: row.category,
      level: row.level,
      statement: row.statement,
      explanation: row.explanation,
      localDate: row.local_date,
    })),
    safetyMessage,
  };
}
