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
  listRecommendationEventsForMember,
  type LongitudinalSignal,
  type RecommendationEvent,
} from '@/lib/longitudinal-intelligence';
import { listMyLifestyleExperiments } from '@/lib/lifestyle-experiments';
import { insertCoachRequestedReassessmentSchedule } from '@/lib/reassessment-intelligence/data';
import type { AssessmentKey } from '@/lib/assessment-registry/types';
import {
  describeSignalAsPictureItem,
  nextBestStepView,
  splitObservationsAndPatterns,
  type LongitudinalPictureItem,
  type NextBestStepView,
} from '@/lib/longitudinal-intelligence/picture';

export type LongitudinalPictureView = {
  whatsChanging: LongitudinalPictureItem[];
  /**
   * Things seen exactly once. Kept apart from `emergingPatterns` because a
   * single mention is not a pattern, and grouping the two put sentences
   * that honestly say "We noticed this once" under a heading that called
   * them patterns. The tiering underneath (lib/longitudinal-intelligence/)
   * was always right about this; only the grouping was wrong.
   */
  singleObservations: LongitudinalPictureItem[];
  /** Repeated signals only: seen more than once, so "pattern" is fair. */
  emergingPatterns: LongitudinalPictureItem[];
  whatSeemsToBeHelping: LongitudinalPictureItem[];
  stillLearning: LongitudinalPictureItem[];
  nextBestStep: NextBestStepView | null;
};

const MAX_ITEMS_PER_SECTION = 3;

function toNamedItems(signals: LongitudinalSignal[]): LongitudinalPictureItem[] {
  const items: LongitudinalPictureItem[] = [];
  for (const s of signals) {
    const item = describeSignalAsPictureItem(s);
    if (item) items.push(item);
  }
  return items;
}

export async function getMyLongitudinalPicture(): Promise<LongitudinalPictureView> {
  const empty: LongitudinalPictureView = {
    whatsChanging: [],
    singleObservations: [],
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

  const whatsChanging = toNamedItems(
    signals.filter((s) => (s.state === 'worsening' || s.state === 'improving') && s.tier !== null && s.tier >= 2)
  ).slice(0, MAX_ITEMS_PER_SECTION);

  // Split, not merged. 'one_time_observation' is exactly what its name
  // says, and its own sentence says so too ("We noticed this once"), so it
  // cannot sit under a heading that calls it a pattern.
  const split = splitObservationsAndPatterns(signals);
  const singleObservations = toNamedItems(split.singleObservations).slice(0, MAX_ITEMS_PER_SECTION);
  const emergingPatterns = toNamedItems(split.repeatedPatterns).slice(0, MAX_ITEMS_PER_SECTION);

  const whatSeemsToBeHelping: LongitudinalPictureItem[] = experiments
    .filter((e) => e.outcome === 'worked' || e.outcome === 'partially_worked')
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((e) => ({
      subject: e.title,
      sentence: e.outcome === 'worked' ? 'This has been working well.' : 'This has helped somewhat.',
    }));

  const stillLearning = toNamedItems(
    signals.filter((s) => s.state === 'insufficient_data' || s.state === 'stale')
  ).slice(0, 2);

  return {
    whatsChanging,
    singleObservations,
    emergingPatterns,
    whatSeemsToBeHelping,
    stillLearning,
    nextBestStep: rootMap ? nextBestStepView(rootMap.routerOutcome) : null,
  };
}

/** Coach-only — the raw, current LongitudinalSignal[] for a client (lib/longitudinal-intelligence/), same RLS-backed access boundary every other getClient* action in this file's family relies on. Unlike the member view, nothing here is filtered into member-safe phrasing — the coach panel renders the fuller describeSignalForCoach() copy. */
export async function getClientLongitudinalSignals(clientId: string): Promise<LongitudinalSignal[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];

  const localDate = await localDateFor(supabase, clientId);
  return computeLongitudinalSignals(supabase, clientId, localDate);
}

/** Coach-only — every recorded outcome event for a client's recommendations (member_recommendation_events, migration 94), most recent first. */
export async function getClientRecommendationEvents(clientId: string): Promise<RecommendationEvent[]> {
  const supabase = createClient();
  const user = await getCachedUser();
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
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const trimmedReason = reason.trim() || 'Requested by coach.';
  await insertCoachRequestedReassessmentSchedule(supabase, clientId, assessmentKey, trimmedReason);
  return {};
}
