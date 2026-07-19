'use server';

/**
 * MEF Conversation Coach (Milestone 7) server actions — the boundary
 * between the member/coach UI and lib/conversation-coach/. Follows the
 * exact convention every other action file in this app uses: a
 * session-scoped Supabase client, RLS as the real authorization boundary,
 * `{ error }`-shaped results for mutations, and empty/null for
 * unauthenticated reads rather than throwing.
 */

import { createClient } from '@/lib/supabase/server';
import { resolveLocalDate } from './checkin';
import type { ActionResult } from './auth';
import type {
  ConversationEntryPoint,
  ConversationHandoffUrgency,
  ConversationHandoffStatus,
  ConversationMessage,
  ConversationSession,
} from '@mef/shared-types-contracts';
import { sendMessage } from '@/lib/conversation-coach/service';
import { requestHandoff } from '@/lib/conversation-coach/handoff';
import {
  getActiveSession,
  createSession,
  listMessages,
  listSessionsForMember,
  setSessionStatus,
  listHandoffsForSession,
  updateHandoff,
} from '@/lib/conversation-coach/data';

async function currentMemberContext(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ localDate: string; timezone: string; firstName: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', userId)
    .single();
  const timezone = profile?.timezone ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  return { localDate, timezone, firstName };
}

export type ConversationThread = {
  session: ConversationSession;
  messages: ConversationMessage[];
};

/** The member's current active thread (creating one if none exists), plus its transcript so far — the entry point every "start a conversation" UI surface calls. */
export async function getOrStartConversationAction(
  entryPoint: ConversationEntryPoint = 'nav'
): Promise<ConversationThread | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let session = await getActiveSession(supabase, user.id);
  if (!session) {
    session = await createSession(supabase, user.id, entryPoint, null);
  }
  if (!session) return null;

  const messages = await listMessages(supabase, session.id);
  return { session, messages };
}

export async function listConversationMessagesAction(
  sessionId: string
): Promise<ConversationMessage[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listMessages(supabase, sessionId);
}

export async function listMyConversationSessionsAction(): Promise<ConversationSession[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listSessionsForMember(supabase, user.id);
}

export type SendConversationMessageResult = ActionResult & {
  memberMessage?: ConversationMessage;
  coachMessage?: ConversationMessage;
  restricted?: boolean;
  providerFailed?: boolean;
};

export async function sendConversationMessageAction(
  content: string,
  sessionId: string | null,
  sourcePage: string,
  entryPoint: ConversationEntryPoint = 'nav',
  entryContext?: string | null
): Promise<SendConversationMessageResult> {
  const trimmed = content.trim();
  if (!trimmed) return { error: 'Message cannot be empty.' };
  if (trimmed.length > 2000) return { error: 'Message is too long.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { localDate, timezone, firstName } = await currentMemberContext(supabase, user.id);

  const result = await sendMessage({
    supabase,
    memberId: user.id,
    memberFirstName: firstName,
    localDate,
    timezone,
    content: trimmed,
    sourcePage,
    sessionId,
    entryPoint,
    entryContext,
  });

  if (!result) return { error: "Root didn't quite catch that. Give it a moment and try again." };

  return {
    memberMessage: result.memberMessage,
    coachMessage: result.coachMessage,
    restricted: result.restricted,
    providerFailed: result.providerFailed,
  };
}

export async function requestCoachHandoffAction(
  sessionId: string,
  note: string,
  urgency: ConversationHandoffUrgency = 'medium'
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const handoff = await requestHandoff(supabase, user.id, sessionId, note.trim() || null, urgency);
  if (!handoff)
    return { error: "That didn't quite go through. Give it another moment and try again." };
  return {};
}

// ---- Coach-side ----

export async function getClientConversationSessionsAction(
  clientId: string
): Promise<ConversationSession[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listSessionsForMember(supabase, clientId);
}

export async function getClientConversationMessagesAction(
  sessionId: string
): Promise<ConversationMessage[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listMessages(supabase, sessionId);
}

export async function getSessionHandoffsAction(sessionId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listHandoffsForSession(supabase, sessionId);
}

/** A coach pausing (or reopening) a specific conversation thread pending their own review — section 12's "restrict or reopen a topic," implemented at the conversation-thread grain. */
export async function setConversationRestrictionAction(
  sessionId: string,
  restricted: boolean
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await setSessionStatus(supabase, sessionId, restricted ? 'restricted' : 'active');
  return ok ? {} : { error: 'Could not update this conversation.' };
}

export async function updateHandoffStatusAction(
  handoffId: string,
  status: ConversationHandoffStatus,
  coachResponseNote?: string
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await updateHandoff(supabase, handoffId, {
    status,
    ...(coachResponseNote !== undefined ? { coachResponseNote } : {}),
  });
  return ok ? {} : { error: 'Could not update that request.' };
}

/** A coach's private note about a conversation — reuses coach_notes exactly as-is (migration 33 only adds an optional conversation_session_id link), never visible to the member. */
export async function addCoachConversationNoteAction(
  clientId: string,
  sessionId: string,
  note: string
): Promise<ActionResult> {
  const trimmed = note.trim();
  if (!trimmed) return { error: 'Note cannot be empty.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase.from('coach_notes').insert({
    coach_id: user.id,
    client_id: clientId,
    note: trimmed,
    conversation_session_id: sessionId,
  });

  if (error) return { error: error.message };
  return {};
}
