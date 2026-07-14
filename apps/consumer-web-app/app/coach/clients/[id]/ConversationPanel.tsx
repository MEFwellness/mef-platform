'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Lock, Unlock, LifeBuoy, ShieldAlert } from 'lucide-react';
import type {
  ConversationHandoff,
  ConversationHandoffStatus,
  ConversationMessage,
  ConversationSession,
} from '@mef/shared-types-contracts';
import {
  getClientConversationMessagesAction,
  getSessionHandoffsAction,
  setConversationRestrictionAction,
  updateHandoffStatusAction,
  addCoachConversationNoteAction,
} from '@/app/actions/conversation-coach';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const HANDOFF_STATUS_LABEL: Record<ConversationHandoffStatus, string> = {
  pending: 'Pending',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ConversationPanel({
  clientId,
  sessions,
  initialMessages,
  initialHandoffs,
}: {
  clientId: string;
  sessions: ConversationSession[];
  initialMessages: ConversationMessage[];
  initialHandoffs: ConversationHandoff[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(sessions[0]?.id ?? null);
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const [handoffs, setHandoffs] = useState<ConversationHandoff[]>(initialHandoffs);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

  function selectSession(sessionId: string) {
    setSelectedId(sessionId);
    setNoteSaved(false);
    startTransition(async () => {
      const [msgs, hos] = await Promise.all([
        getClientConversationMessagesAction(sessionId),
        getSessionHandoffsAction(sessionId),
      ]);
      setMessages(msgs);
      setHandoffs(hos);
    });
  }

  function toggleRestriction() {
    if (!selectedSession) return;
    setError(null);
    startTransition(async () => {
      const result = await setConversationRestrictionAction(
        selectedSession.id,
        selectedSession.status !== 'restricted'
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function resolveHandoff(handoffId: string, status: ConversationHandoffStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateHandoffStatusAction(handoffId, status);
      if (result.error) {
        setError(result.error);
        return;
      }
      setHandoffs((prev) => prev.map((h) => (h.id === handoffId ? { ...h, status } : h)));
    });
  }

  function saveNote() {
    if (!selectedSession || !note.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addCoachConversationNoteAction(clientId, selectedSession.id, note);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNote('');
      setNoteSaved(true);
    });
  }

  if (sessions.length === 0) {
    return (
      <section className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#854D0E]">
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Coaching Conversation</p>
        </div>
        <p className="mt-3 text-sm text-[#6B7A72]">
          This member hasn&apos;t started a coaching conversation yet.
        </p>
      </section>
    );
  }

  const pendingHandoffs = handoffs.filter((h) => h.status !== 'resolved');

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Coaching Conversation</p>
        </div>
        {selectedSession && (
          <button
            type="button"
            disabled={isPending}
            onClick={toggleRestriction}
            className="flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/10 px-3 py-1.5 text-xs font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.06] disabled:opacity-40"
          >
            {selectedSession.status === 'restricted' ? (
              <>
                <Unlock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Reopen conversation
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Pause for review
              </>
            )}
          </button>
        )}
      </div>

      {sessions.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSession(s.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                s.id === selectedId
                  ? 'bg-[#1B3A2D] text-white'
                  : 'bg-[#FAFAF8] text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]'
              }`}
            >
              {s.title ?? s.entry_point} · {formatDateTime(s.last_message_at)}
            </button>
          ))}
        </div>
      )}

      {pendingHandoffs.length > 0 && (
        <div className="mt-4 space-y-2">
          {pendingHandoffs.map((h) => (
            <div key={h.id} className="rounded-2xl bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-amber-800">
                <LifeBuoy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Coach follow-up requested · {h.urgency} · {HANDOFF_STATUS_LABEL[h.status]}
                </p>
              </div>
              {h.member_note && <p className="mt-1.5 text-sm text-[#1B3A2D]">{h.member_note}</p>}
              <div className="mt-2 flex gap-2">
                {h.status === 'pending' && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => resolveHandoff(h.id, 'acknowledged')}
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:brightness-95"
                  >
                    Acknowledge
                  </button>
                )}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => resolveHandoff(h.id, 'resolved')}
                  className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:brightness-95"
                >
                  Mark resolved
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 max-h-96 space-y-2 overflow-y-auto rounded-2xl bg-[#FAFAF8] p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-[#6B7A72]">No messages in this thread yet.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'member' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === 'member'
                    ? 'bg-[#1B3A2D] text-white'
                    : m.role === 'system'
                      ? 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]'
                      : 'border border-[#1B3A2D]/10 bg-white text-[#1B3A2D]'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-70">
                  <span>{formatDateTime(m.created_at)}</span>
                  {m.safety_classification_id && (
                    <span className="inline-flex items-center gap-0.5">
                      <ShieldAlert className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                      Flagged
                    </span>
                  )}
                  {m.related_brain_focus && <span>· Focus: {m.related_brain_focus}</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 border-t border-[#1B3A2D]/5 pt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
          Add a private coach note about this conversation
        </p>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setNoteSaved(false);
          }}
          rows={2}
          placeholder="Never visible to the member…"
          className="mt-2 w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-end gap-3">
          {noteSaved && <span className="text-xs text-[#6B7A72]">Saved.</span>}
          <button
            type="button"
            disabled={isPending || !note.trim()}
            onClick={saveNote}
            className="rounded-full bg-[#1B3A2D] px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save note
          </button>
        </div>
      </div>
    </section>
  );
}
