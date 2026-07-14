/**
 * The narrative update service — the "one reusable process" the
 * milestone asks for. `updateNarrativeForEvent` is called from
 * lib/ai/dispatcher.ts's dispatchEvent() after agents run, reusing the
 * SAME event/facts/session already assembled for that event rather than
 * a second, parallel pipeline — mirrors how each AI agent decides what to
 * do based on event.event_type internally.
 * `recordSafetyRestrictionNarrative` is the second entry point, called
 * directly from wherever Milestone 1's safety layer produces a
 * classification that actually restricts a topic (today: checkin.ts).
 *
 * Dedup discipline ("do not regenerate the entire narrative unnecessarily
 * after every minor event"): a draft whose (category, title) already
 * matches an active item is a no-op. For 'active_restrictions'
 * specifically, a changed set of restricted topics (a different title)
 * supersedes the old item, since that IS a meaningful update. A
 * coach_protected item is never touched by this service, regardless of
 * category.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AiEvent,
  DailyCheckin,
  NarrativeActorType,
  SafetyClassification,
} from '@mef/shared-types-contracts';
import type { RuleFacts } from '../ai/rules/facts';
import type { NarrativeItemDraft } from './types';
import {
  deriveStressSleepPattern,
  deriveFromWellnessInsights,
  deriveFromProgressComparison,
  deriveFromSafetyClassification,
  deriveStreakWin,
  deriveFromBodyAssessment,
} from './generator';
import {
  insertNarrativeItem,
  supersedeNarrativeItem,
  findActiveItem,
  findActiveItemsByCategory,
} from './data';
import { fetchBaselineAssessment } from '../onboarding/baseline';
import { fetchLatestReassessment } from '../onboarding/reassessment';
import { buildComparison, buildProgressSummary } from '../onboarding/comparison';
import { currentStreakLength } from '../ai/agents/accountability';

async function applyDraft(
  supabase: SupabaseClient,
  memberId: string,
  actorType: NarrativeActorType,
  actorId: string | null,
  draft: NarrativeItemDraft
): Promise<void> {
  const existingExact = await findActiveItem(supabase, memberId, draft.category, draft.title);
  if (existingExact) return; // identical fact already active — nothing new to say

  if (draft.category === 'active_restrictions') {
    const currentlyActive = await findActiveItemsByCategory(
      supabase,
      memberId,
      'active_restrictions'
    );
    const replaceable = currentlyActive.find((item) => !item.coach_protected);
    if (replaceable) {
      const created = await insertNarrativeItem(
        supabase,
        memberId,
        actorType,
        actorId,
        draft,
        replaceable.id
      );
      if (created) await supersedeNarrativeItem(supabase, replaceable.id, created.id);
      return;
    }
  }

  await insertNarrativeItem(supabase, memberId, actorType, actorId, draft);
}

export async function updateNarrativeForEvent(
  supabase: SupabaseClient,
  event: AiEvent,
  _facts: RuleFacts
): Promise<void> {
  try {
    const drafts: NarrativeItemDraft[] = [];
    const actorType = event.source as NarrativeActorType; // AiEventSource ('member'|'coach'|'system') is the exact same union

    if (event.event_type === 'member_completed_checkin') {
      const payload = event.payload as { recentCheckins?: DailyCheckin[] };
      const checkins = payload.recentCheckins ?? [];
      if (checkins.length > 0) {
        const stressSleep = deriveStressSleepPattern(checkins);
        if (stressSleep) drafts.push(stressSleep);
        drafts.push(...deriveFromWellnessInsights(checkins));

        const streak = currentStreakLength(checkins);
        const latestId = checkins[checkins.length - 1]?.id ?? null;
        const win = deriveStreakWin(streak, latestId);
        if (win) drafts.push(win);
      }
    }

    if (event.event_type === 'reassessment_completed') {
      const [baseline, latest] = await Promise.all([
        fetchBaselineAssessment(supabase, event.member_id),
        fetchLatestReassessment(supabase, event.member_id),
      ]);
      if (baseline && latest) {
        const metrics = buildComparison(baseline, latest);
        const summary = buildProgressSummary(metrics);
        drafts.push(
          ...deriveFromProgressComparison(summary, baseline.submissionId, latest.submissionId)
        );
      }
    }

    if (event.event_type === 'body_assessment_completed') {
      const payload = event.payload as {
        assessmentId?: string;
        assessmentTypeLabel?: string;
        findingsCount?: number;
      };
      if (payload.assessmentId && payload.assessmentTypeLabel) {
        const draft = deriveFromBodyAssessment(
          payload.assessmentId,
          payload.assessmentTypeLabel,
          payload.findingsCount ?? 0
        );
        if (draft) drafts.push(draft);
      }
    }

    for (const draft of drafts) {
      await applyDraft(supabase, event.member_id, actorType, null, draft);
    }
  } catch (err) {
    // Narrative updates must never break the caller — same discipline as
    // every other best-effort integration point in this app (AI event
    // emission, safety classification).
    console.error('updateNarrativeForEvent failed', err instanceof Error ? err.message : err);
  }
}

/** Called directly from a safety-evaluated surface (checkin.ts today) right after a classification restricts a topic — not event-driven, since Milestone 1's safety layer isn't itself an AiEvent producer. */
export async function recordSafetyRestrictionNarrative(
  supabase: SupabaseClient,
  memberId: string,
  actorType: NarrativeActorType,
  actorId: string | null,
  classification: Pick<
    SafetyClassification,
    'id' | 'classification_level' | 'restricted_topics' | 'created_at'
  >
): Promise<void> {
  try {
    const draft = deriveFromSafetyClassification(classification);
    if (draft) await applyDraft(supabase, memberId, actorType, actorId, draft);
  } catch (err) {
    console.error(
      'recordSafetyRestrictionNarrative failed',
      err instanceof Error ? err.message : err
    );
  }
}
