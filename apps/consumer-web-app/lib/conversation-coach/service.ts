/**
 * The MEF Conversation Coach's orchestration layer — the one place that
 * combines a member's turn with the Coaching Safety System, the Coaching
 * Brain / Intelligence Engine / Narrative / Feed context, the LLM
 * provider, and structured memory extraction into one persisted exchange.
 * Mirrors lib/ai/dispatcher.ts's own discipline: every external call
 * (safety, provider) is defensive, and a failure downstream of the
 * member's own message being saved must never lose that message.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConversationEntryPoint,
  ConversationMessage,
  ConversationSession,
  SafetyClassificationLevel,
} from '@mef/shared-types-contracts';
import {
  createSession,
  getActiveSession,
  getSession,
  insertMemory,
  insertMessage,
  findSimilarActiveMemory,
  setMessageSafetyClassification,
  setSessionTitle,
  touchSession,
} from './data';
import { gatherConversationContext } from './context';
import { buildSystemPrompt, type PromptSafetyMode } from './prompt';
import { classifyMemberMessage, guardConversationReply } from './safety';
import { extractMemoryCandidates } from './memoryExtraction';
import { buildFallbackReply, SAFETY_BLOCKED_REPLY_FALLBACK } from './fallback';
import { getConversationCoachProvider } from './provider';
import { CONVERSATION_COACH_PROMPT_VERSION } from './promptVersion';
import { recalculateIntelligenceCore } from '../intelligence-core/service';

const NO_LLM_LEVELS = new Set<SafetyClassificationLevel>([
  'coach_review_required',
  'safety_response_only',
]);

function deriveTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

function formatTranscript(messages: ConversationMessage[]): string {
  return messages
    .map((m) => `${m.role === 'member' ? 'Member' : 'Coach'}: ${m.content}`)
    .join('\n');
}

export type SendMessageInput = {
  supabase: SupabaseClient;
  memberId: string;
  memberFirstName: string;
  localDate: string;
  timezone: string;
  content: string;
  sourcePage: string;
  sessionId?: string | null;
  entryPoint?: ConversationEntryPoint;
  /** Set only when this specific turn originated from the floating "Ask Root" launcher (or an in-page "Talk to Root" link) — see lib/conversation-coach/context.ts's ConversationContext.entryContext for what it's used for. */
  entryContext?: string | null | undefined;
};

export type SendMessageResult = {
  session: ConversationSession;
  memberMessage: ConversationMessage;
  coachMessage: ConversationMessage;
  safetyLevel: SafetyClassificationLevel;
  restricted: boolean;
  providerFailed: boolean;
};

async function resolveSession(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string | null | undefined,
  entryPoint: ConversationEntryPoint
): Promise<ConversationSession | null> {
  if (sessionId) {
    const existing = await getSession(supabase, sessionId);
    if (existing && existing.member_id === memberId) return existing;
  }
  const active = await getActiveSession(supabase, memberId);
  if (active) return active;
  return createSession(supabase, memberId, entryPoint, null);
}

async function extractAndStoreMemory(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  messageId: string,
  content: string
): Promise<void> {
  try {
    const candidates = extractMemoryCandidates(content);
    for (const candidate of candidates) {
      const similar = await findSimilarActiveMemory(
        supabase,
        memberId,
        candidate.memoryType,
        candidate.content
      );
      if (similar) continue;
      await insertMemory(supabase, {
        memberId,
        sessionId,
        memoryType: candidate.memoryType,
        content: candidate.content,
        sourceMessageId: messageId,
      });
    }
  } catch (err) {
    console.error('extractAndStoreMemory failed', err);
  }
}

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult | null> {
  const { supabase, memberId } = input;
  const entryPoint = input.entryPoint ?? 'nav';

  const session = await resolveSession(supabase, memberId, input.sessionId, entryPoint);
  if (!session) return null;

  const memberMessage = await insertMessage(supabase, {
    sessionId: session.id,
    memberId,
    role: 'member',
    content: input.content,
    sourcePage: input.sourcePage,
  });
  if (!memberMessage) return null;

  if (!session.title) {
    await setSessionTitle(supabase, session.id, deriveTitle(input.content));
  }

  // A coach has paused this specific conversation pending review — the
  // member's message is still honestly recorded, but no further coaching
  // (LLM or otherwise) happens on this thread until a coach reopens it.
  if (session.status === 'restricted') {
    const notice = await insertMessage(supabase, {
      sessionId: session.id,
      memberId,
      role: 'system',
      content:
        "This conversation is currently paused while your assigned coach reviews it. You'll be able to continue once they've followed up.",
      sourcePage: input.sourcePage,
    });
    await touchSession(supabase, session.id);
    return {
      session,
      memberMessage,
      coachMessage: notice!,
      safetyLevel: 'standard_coaching',
      restricted: true,
      providerFailed: false,
    };
  }

  // Every member message passes through the existing safety layer before
  // any reply is generated — section 8's core requirement.
  const evaluation = await classifyMemberMessage(
    supabase,
    memberId,
    memberMessage.id,
    input.content
  );
  const safetyLevel = evaluation?.result.classificationLevel ?? 'standard_coaching';
  if (evaluation) {
    await setMessageSafetyClassification(supabase, memberMessage.id, evaluation.classification.id);
  }

  let replyText: string;
  let providerFailed = false;
  // Only carried onto the reply when the member's own message was itself
  // non-standard — a routine message's classification row still exists
  // (evaluateConcern always records one), but linking every ordinary
  // reply to it would show every single coach_ai message as "Flagged" in
  // the coach dashboard (app/coach/clients/[id]/ConversationPanel.tsx),
  // defeating the point of the flag. guardConversationReply below may
  // still attach a classification of its own if the generated text
  // itself needs one.
  let replySafetyClassificationId: string | null =
    safetyLevel !== 'standard_coaching' ? (evaluation?.classification.id ?? null) : null;
  let promptVersion: string | null = null;
  let relatedBrainFocus: string | null = null;

  if (NO_LLM_LEVELS.has(safetyLevel)) {
    // COACH_REVIEW_REQUIRED / SAFETY_RESPONSE_ONLY: stop the normal
    // coaching path for this message entirely and show only the approved,
    // versioned safety copy — never an LLM-generated response for a
    // flagged topic. Section 9 also asks that this stay short, with no
    // long educational explanation attached.
    replyText = evaluation?.memberMessage
      ? `${evaluation.memberMessage.title}\n\n${evaluation.memberMessage.body}`
      : SAFETY_BLOCKED_REPLY_FALLBACK;
    if (safetyLevel === 'coach_review_required') {
      replyText +=
        "\n\nIs there anything else about today's coaching I can help with in the meantime?";
    }
  } else {
    // STANDARD_COACHING / COACHING_WITH_CAUTION / MEDICAL_EVALUATION_RECOMMENDED
    const context = await gatherConversationContext(
      supabase,
      memberId,
      session.id,
      input.localDate,
      input.timezone,
      input.memberFirstName,
      input.entryContext ?? null
    );
    relatedBrainFocus = context.decision.focus;

    const provider = getConversationCoachProvider();
    if (!provider) {
      // getConversationCoachProvider() already logged the specific missing
      // env var(s) once; this line is the per-message consequence, so a
      // real-time log tail shows exactly which conversation turns were
      // affected, not just that configuration is missing somewhere.
      console.error(
        `Conversation Coach: falling back to the deterministic reply for member ${memberId} ` +
          `(session ${session.id}) — no LLM provider is configured.`
      );
      providerFailed = true;
      replyText = buildFallbackReply(context);
    } else {
      try {
        const systemPrompt = buildSystemPrompt(context, safetyLevel as PromptSafetyMode);
        const transcript = formatTranscript([...context.recentMessages, memberMessage]);
        const result = await provider.generateCompletion({
          templateKey: 'conversation_coach',
          systemPrompt,
          userPrompt: `${transcript}\n\nRespond as Root, this member's MEF Wellness Coach, to their latest message above.`,
          maxOutputTokens: 450,
          temperature: 0.6,
        });
        if (!result.content.trim()) {
          // The provider call succeeded (no exception) but returned no
          // usable text — lib/ai/providers/anthropic.ts already logged the
          // raw response shape; this is the point where that gets treated
          // as a real failure instead of silently reusing the fallback
          // copy while reporting providerFailed: false.
          console.error(
            `Conversation Coach: provider "${result.provider}" (model ${result.model}) returned empty ` +
              `content for member ${memberId} (session ${session.id}) — using fallback reply.`
          );
          providerFailed = true;
          replyText = buildFallbackReply(context);
        } else {
          replyText = result.content.trim();
          promptVersion = CONVERSATION_COACH_PROMPT_VERSION;
        }
      } catch (err) {
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
        console.error(
          `Conversation Coach: provider call threw for member ${memberId} (session ${session.id}, ` +
            `safety level ${safetyLevel}) — ${detail}`,
          err
        );
        providerFailed = true;
        replyText = buildFallbackReply(context);
      }
    }

    if (!providerFailed) {
      const guarded = await guardConversationReply(supabase, memberId, memberMessage.id, replyText);
      replyText = guarded.text;
      if (guarded.safetyClassificationId) {
        replySafetyClassificationId = guarded.safetyClassificationId;
      }
    }

    await extractAndStoreMemory(supabase, memberId, session.id, memberMessage.id, input.content);

    // Milestone 9: every real coaching conversation turn is one of the
    // triggers the Wellness Intelligence Core recalculates from (section
    // "THE INTELLIGENCE CORE SHOULD CONTINUOUSLY UPDATE ... after every
    // Conversation"). Best-effort, never throws — see
    // lib/intelligence-core/service.ts.
    await recalculateIntelligenceCore(supabase, memberId, input.localDate);
  }

  const coachMessage = await insertMessage(supabase, {
    sessionId: session.id,
    memberId,
    role: 'coach_ai',
    content: replyText,
    sourcePage: input.sourcePage,
    promptVersion,
    safetyClassificationId: replySafetyClassificationId,
    relatedBrainFocus,
  });
  if (!coachMessage) return null;

  await touchSession(supabase, session.id);

  return {
    session,
    memberMessage,
    coachMessage,
    safetyLevel,
    restricted: false,
    providerFailed,
  };
}
