'use server';

/**
 * Longitudinal Intelligence (Prompt 12) — member-facing entry point. Reuses
 * the existing Coaching Insights page (app/insights) rather than a new
 * route: this feature's five member-facing views ("What's changing,"
 * "Patterns we're beginning to notice," "What seems to be helping," "What
 * we're still learning," "Your next best step") are additive sections on
 * that same page, in the same visual language as its existing five
 * generators — never a new bottom-nav tab, never a new page.
 *
 * "Your next best step" is a direct reuse of the Root Router's own
 * already-computed RootRouterOutcomeView.memberMessage (via getMyRootMap())
 * — not a new decision, just surfaced here too. Every other line traces to
 * a real LongitudinalSignal (lib/longitudinal-intelligence/) or a real,
 * member-reported Lifestyle Experiment outcome — nothing here is generated
 * freeform, and no raw confidence numbers, domain keys, or algorithm names
 * are ever included in what's returned.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { localDateFor } from './rootMap';
import { getMyRootMap } from './rootMap';
import {
  computeLongitudinalSignals,
  describeSignalForMember,
  listRecommendationEventsForMember,
  type LongitudinalSignal,
  type RecommendationEvent,
} from '@/lib/longitudinal-intelligence';
import { listMyLifestyleExperiments } from '@/lib/lifestyle-experiments';
import { insertCoachRequestedReassessmentSchedule } from '@/lib/reassessment-intelligence/data';
import type { AssessmentKey } from '@/lib/assessment-registry/types';

export type LongitudinalPictureView = {
  whatsChanging: string[];
  emergingPatterns: string[];
  whatSeemsToBeHelping: string[];
  stillLearning: string[];
  nextBestStep: string | null;
};

const MAX_ITEMS_PER_SECTION = 3;

export async function getMyLongitudinalPicture(): Promise<LongitudinalPictureView> {
  const empty: LongitudinalPictureView = {
    whatsChanging: [],
    emergingPatterns: [],
    whatSeemsToBeHelping: [],
    stillLearning: [],
    nextBestStep: null,
  };

  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return empty;

  const localDate = await localDateFor(supabase, user.id);
  const [signals, experiments, rootMap] = await Promise.all([
    computeLongitudinalSignals(supabase, user.id, localDate),
    listMyLifestyleExperiments(supabase, user.id),
    getMyRootMap(),
  ]);

  if (rootMap?.safetyGated) return empty;

  const whatsChanging = signals
    .filter((s) => (s.state === 'worsening' || s.state === 'improving') && s.tier !== null && s.tier >= 2)
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(describeSignalForMember);

  const emergingPatterns = signals
    .filter((s) => s.state === 'one_time_observation' || s.state === 'repeated_signal' || s.state === 'emerging_pattern')
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(describeSignalForMember);

  const whatSeemsToBeHelping = experiments
    .filter((e) => e.outcome === 'worked' || e.outcome === 'partially_worked')
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((e) => `${e.title} — ${e.outcome === 'worked' ? 'this has been working well' : 'this has helped somewhat'}.`);

  const stillLearning = signals
    .filter((s) => s.state === 'insufficient_data' || s.state === 'stale')
    .slice(0, 2)
    .map(describeSignalForMember);

  return {
    whatsChanging,
    emergingPatterns,
    whatSeemsToBeHelping,
    stillLearning,
    nextBestStep: rootMap?.routerOutcome.memberMessage ?? null,
  };
}

/** Coach-only — the raw, current LongitudinalSignal[] for a client (lib/longitudinal-intelligence/), same RLS-backed access boundary every other getClient* action in this file's family relies on. Unlike the member view, nothing here is filtered into member-safe phrasing — the coach panel renders the fuller describeSignalForCoach() copy. */
export async function getClientLongitudinalSignals(clientId: string): Promise<LongitudinalSignal[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const localDate = await localDateFor(supabase, clientId);
  return computeLongitudinalSignals(supabase, clientId, localDate);
}

/** Coach-only — every recorded outcome event for a client's recommendations (member_recommendation_events, migration 94), most recent first. */
export async function getClientRecommendationEvents(clientId: string): Promise<RecommendationEvent[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return listRecommendationEventsForMember(supabase, clientId);
}

/**
 * Part 7's coach-requested reassessment trigger — the one write path in
 * this file. Writes trigger_source='coach_action' (already reserved by
 * migration 84, never written until now); RLS (migration 72's
 * coach_insert_assigned_reassessment_schedules policy) is the real
 * authorization boundary, this action makes no separate role check.
 */
export async function requestClientReassessment(
  clientId: string,
  assessmentKey: AssessmentKey,
  reason: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const trimmedReason = reason.trim() || 'Requested by coach.';
  await insertCoachRequestedReassessmentSchedule(supabase, clientId, assessmentKey, trimmedReason);
  return {};
}
