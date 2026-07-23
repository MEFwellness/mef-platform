'use server';

/**
 * Lifestyle Experiments (Prompt 11; Method §8) — member entry points. Every
 * experiment is sourced verbatim from an existing member_recommendations
 * row of category 'lifestyle_experiment'; there is no freeform/coach-
 * authored path in this prompt (see migration 92's header comment).
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMemberRecommendationById, completeRecommendation } from '@/lib/recommendation-engine';
import { recordRecommendationEvent } from '@/lib/longitudinal-intelligence';
import {
  startLifestyleExperiment,
  closeLifestyleExperiment,
  listMyLifestyleExperiments,
  countActiveExperiments,
  deriveEffectiveStatus,
  MAX_ACTIVE_EXPERIMENTS,
  type LifestyleExperiment,
  type LifestyleExperimentOutcome,
} from '@/lib/lifestyle-experiments';
import { localDateFor } from './rootMap';

const ALLOWED_DURATIONS = new Set([7, 14, 21, 28]);

const OUTCOME_EVENT_TYPE = {
  worked: 'reflection_outcome_worked',
  partially_worked: 'reflection_outcome_partially_worked',
  didnt_work: 'reflection_outcome_didnt_work',
  inconclusive: 'reflection_outcome_inconclusive',
} as const;

export async function startMyExperiment(
  recommendationRowId: string,
  durationDays: number
): Promise<{ error?: string; experiment?: LifestyleExperiment }> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  if (!ALLOWED_DURATIONS.has(durationDays)) {
    return { error: 'Choose a 7, 14, 21, or 28 day experiment.' };
  }

  // Guardrail (Prompt 12, Part 3): no more than MAX_ACTIVE_EXPERIMENTS
  // running at once — checked here first for the member-facing error
  // message; lib/lifestyle-experiments/data.ts::startLifestyleExperiment
  // re-checks defensively below.
  const activeCount = await countActiveExperiments(supabase, user.id);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    return {
      error: `You're already working on ${MAX_ACTIVE_EXPERIMENTS} experiments — close one out with a reflection before starting another.`,
    };
  }

  const recommendation = await getMemberRecommendationById(supabase, user.id, recommendationRowId);
  if (!recommendation) return { error: 'Recommendation not found.' };
  if (recommendation.category !== 'lifestyle_experiment') {
    return { error: 'This recommendation is not set up as an experiment.' };
  }

  const startDate = await localDateFor(supabase, user.id);
  const experiment = await startLifestyleExperiment(supabase, user.id, {
    recommendationId: recommendationRowId,
    title: recommendation.title,
    protocol: recommendation.explanation,
    startDate,
    durationDays,
  });
  if (!experiment) return { error: 'Could not start this experiment.' };

  // Starting the experiment IS the member's way of acting on the
  // recommendation — mark it done so it stops showing as an open
  // suggestion once a real experiment is already tracking it.
  await completeRecommendation(supabase, recommendationRowId, user.id);
  await recordRecommendationEvent(supabase, user.id, recommendationRowId, 'started');

  return { experiment };
}

export async function reflectAndCloseMyExperiment(
  experimentId: string,
  reflectionText: string,
  outcome: LifestyleExperimentOutcome
): Promise<{ error?: string }> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  if (!reflectionText.trim()) return { error: 'Add a short reflection before closing this out.' };

  const ok = await closeLifestyleExperiment(supabase, user.id, experimentId, {
    reflectionText: reflectionText.trim(),
    outcome,
  });
  if (ok) {
    const experiments = await listMyLifestyleExperiments(supabase, user.id);
    const closed = experiments.find((e) => e.id === experimentId);
    if (closed?.recommendationId) {
      await recordRecommendationEvent(
        supabase,
        user.id,
        closed.recommendationId,
        OUTCOME_EVENT_TYPE[outcome],
        reflectionText.trim()
      );
    }
  }
  return ok ? {} : { error: 'Could not close this experiment.' };
}

export async function abandonMyExperiment(experimentId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await closeLifestyleExperiment(supabase, user.id, experimentId, {
    reflectionText: 'Stopped early.',
    outcome: 'inconclusive',
    abandoned: true,
  });
  if (ok) {
    const experiments = await listMyLifestyleExperiments(supabase, user.id);
    const closed = experiments.find((e) => e.id === experimentId);
    if (closed?.recommendationId) {
      await recordRecommendationEvent(supabase, user.id, closed.recommendationId, 'stopped_early');
    }
  }
  return ok ? {} : { error: 'Could not update this experiment.' };
}

export async function getMyLifestyleExperiments(): Promise<LifestyleExperiment[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];

  const experiments = await listMyLifestyleExperiments(supabase, user.id);
  const now = new Date();
  return experiments.map((experiment) => ({
    ...experiment,
    status: deriveEffectiveStatus(experiment, now),
  }));
}

/** Coach-only — same shape as getMyLifestyleExperiments, for an assigned client. RLS (migration 92) is the real access control; this makes no additional role decision. */
export async function getClientLifestyleExperiments(clientId: string): Promise<LifestyleExperiment[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const experiments = await listMyLifestyleExperiments(supabase, clientId);
  const now = new Date();
  return experiments.map((experiment) => ({
    ...experiment,
    status: deriveEffectiveStatus(experiment, now),
  }));
}
