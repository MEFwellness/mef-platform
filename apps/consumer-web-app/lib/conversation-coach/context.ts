/**
 * Targeted context selection for the MEF Conversation Coach — section 3 of
 * the milestone is explicit that a reply must be grounded in "only the
 * relevant context needed for the current conversation," never the
 * member's full history. Every field here traces back to real data,
 * nothing is fabricated, and a signal with no real data behind it is
 * simply omitted.
 *
 * As of the MEF Intelligence Engine (Milestone 8), the Conversation Coach
 * no longer determines this context on its own: the Coaching Brain
 * decision, the Personal Wellness Intelligence Engine's confirmed
 * insights, the Member Health Narrative highlights, and Safety's
 * restricted topics all come from ONE call into the centralized engine
 * (lib/intelligence-engine/engine.ts's getConversationContextIntelligence)
 * instead of four independent fan-out reads. Only genuinely
 * conversation-session-scoped state — today's selected lesson (the Daily
 * Coaching Feed's own concern, not member-wide intelligence), this
 * session's extracted memory, and this session's recent messages — is
 * still gathered directly here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationMemoryItem, ConversationMessage } from '@mef/shared-types-contracts';
import type { CoachingFocusDecision } from '@/lib/brain/types';
import { getContentItem } from '@/lib/feed/data';
import { getOrCreateTodaysFeed } from '@/lib/feed/service';
import { buildTimeContext } from '@/lib/feed/timeContext';
import { getConversationContextIntelligence } from '@/lib/intelligence-engine/engine';
import { getMemberFocus } from '@/lib/member-interpretation/focus';
import { fetchNutritionActivity, type NutritionActivity } from './nutritionActivity';
import { getSnapshotForDate, getLatestSnapshotBefore } from '@/lib/scoring/data';
import { scoreLabel } from '@/lib/wellness/wellness-index';
import type { CoachingPriorities } from '@/lib/intelligence-engine/types';
import { getConversationCoachingContext } from '@/lib/intelligence-core/service';
import { listActiveMemory, listRecentMessages } from './data';

const RECENT_MESSAGE_WINDOW = 12;

export type ConversationContext = {
  memberFirstName: string | null;
  localDate: string;
  dayOfWeek: string;
  timeOfDayLabel: string;
  decision: CoachingFocusDecision;
  /**
   * The Coaching Brain's area label. Kept because the lesson and the
   * encouragement are built from it, but it is NO LONGER what Root calls
   * the member's focus. See `focusTitle`.
   */
  focusLabel: string;
  /**
   * The member's one focus, verbatim from the Priority Card decision
   * engine through the Member Interpretation Layer. Null when the engine
   * has none, in which case the prompt says so rather than substituting the
   * area label, which is how Root and Home came to disagree.
   */
  focusTitle: string | null;
  /**
   * The member's Root Score exactly as Home renders it, and when it was
   * last calculated.
   *
   * Live on 2026-08-17, asked "What does my root score mean?", Root said
   * "yours hasn't calculated yet today since there's no check-in logged"
   * while Home displayed 27 out of 100 on the same load. Root had no score
   * in its context at all and filled the gap. It has one now.
   */
  rootScore: { score: number | null; label: string | null } | null;
  /**
   * What she has actually logged about food, as counts. Three numbers and
   * no strings, by design: see ./nutritionActivity.ts for the line between
   * food as DATA and food as a finding, and why a logged food may never
   * cross it.
   */
  nutritionActivity: NutritionActivity;
  todaysLessonTitle: string | null;
  todaysAction: string | null;
  restrictedTopics: string[];
  confirmedInsights: string[];
  narrativeHighlights: string[];
  /** The member's longer-term priority picture from the centralized Intelligence Engine — new in Milestone 8, lets the Conversation Coach's grounding reflect the same priorities the Coach Dashboard and Daily Coaching now share. */
  priorities: CoachingPriorities;
  /** A single, carefully-worded coaching hypothesis (never a diagnosis) when the engine has one and no safety restriction is open — null otherwise, see getConversationContextIntelligence's own docblock. */
  topHypothesis: string | null;
  /** Wellness Intelligence Core (Milestone 9) — up to a few member-safe "wellness identity" statements ("your mood tends to be better on days you move"), the same positive-framed subset the member's own Progress surface shows. Lets a reply say "I've noticed X" instead of a generic "you should X." */
  identityHighlights: string[];
  /** Internal-only tone/length/structure steering from the learned Coaching Style Profile — never shown to the member verbatim, only folded into the system prompt (see prompt.ts). Null when not yet confident enough to act on. */
  coachingStyleGuidance: string | null;
  /**
   * A short, real-data-derived note on which page/moment the member opened
   * this conversation from (e.g. "Opened from Today. Current focus: Sleep.
   * Lesson: 'Wind down earlier tonight.'") — set only for the specific
   * turn the floating "Ask Root" launcher (or an in-page "Talk
   * to Root" link) originated, never persisted, never containing
   * anything beyond what that page already legitimately shows the member.
   * Null for an ordinary continuing message.
   */
  entryContext: string | null;
  activeMemory: ConversationMemoryItem[];
  recentMessages: ConversationMessage[];
};

async function readRootScoreSnapshot(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
) {
  return (
    (await getSnapshotForDate(supabase, memberId, localDate)) ??
    (await getLatestSnapshotBefore(supabase, memberId, localDate))
  );
}

function timeOfDayLabel(hour: number): string {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export async function gatherConversationContext(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  localDate: string,
  timezone: string,
  firstName: string | null,
  entryContext: string | null = null
): Promise<ConversationContext> {
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const timeContext = buildTimeContext(nowInTz);

  const [
    intelligence,
    coachingContext,
    feedItem,
    activeMemory,
    recentMessages,
    focus,
    snapshot,
    nutritionActivity,
  ] = await Promise.all([
      getConversationContextIntelligence(supabase, memberId, localDate),
      getConversationCoachingContext(supabase, memberId),
      getOrCreateTodaysFeed(supabase, memberId, localDate),
      listActiveMemory(supabase, memberId, 8),
      listRecentMessages(supabase, sessionId, RECENT_MESSAGE_WINDOW),
      // The one focus and the real score, so a reply can never disagree
      // with the screen the member was just looking at.
      getMemberFocus(),
      // The snapshot as it already stands, READ ONLY. Deliberately not
      // getMyRootScore, which creates its own cookie-scoped client and can
      // calculate a fresh snapshot as a side effect: a member asking Root a
      // question should not trigger a score recalculation, and this module
      // is already holding the right client. Falls back to her most recent
      // snapshot when today's has not been written yet, which is the number
      // Home is showing her in exactly that situation.
      readRootScoreSnapshot(supabase, memberId, localDate),
      // Food read as data rather than as a standing finding: counts only,
      // never a product name.
      fetchNutritionActivity(supabase, memberId, localDate),
    ]);

  const content = feedItem ? await getContentItem(supabase, feedItem.content_item_id) : null;

  return {
    memberFirstName: firstName,
    localDate,
    dayOfWeek: timeContext.dayOfWeek,
    timeOfDayLabel: timeOfDayLabel(timeContext.hour),
    decision: intelligence.decision,
    focusLabel: intelligence.focusLabel,
    focusTitle: focus?.title ?? null,
    nutritionActivity,
    rootScore: snapshot
      ? {
          score: snapshot.root_score,
          label: snapshot.root_score === null ? null : scoreLabel(snapshot.root_score),
        }
      : null,
    todaysLessonTitle: content?.title ?? null,
    todaysAction: content?.suggested_action ?? feedItem?.focus_text ?? null,
    restrictedTopics: intelligence.restrictedTopics,
    confirmedInsights: intelligence.confirmedInsights,
    narrativeHighlights: intelligence.narrativeHighlights,
    priorities: intelligence.priorities,
    topHypothesis: intelligence.topHypothesisForMember,
    identityHighlights: coachingContext.identityHighlights,
    coachingStyleGuidance: coachingContext.coachingStyleGuidance,
    entryContext,
    activeMemory,
    recentMessages,
  };
}
