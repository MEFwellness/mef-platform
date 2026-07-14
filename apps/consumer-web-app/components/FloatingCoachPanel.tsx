'use client';

/**
 * The floating coach's compact panel — part 5's "compact coaching panel
 * for a quick question." Reuses the EXACT same session-resolution and
 * message-sending path as the full Conversation Coach page
 * (getOrStartConversationAction / sendConversationMessageAction from
 * app/actions/conversation-coach.ts): there is no second conversation
 * engine here, only a smaller rendering of the same thread. Because
 * sendMessage's resolveSession() always reuses the member's existing
 * active session first, opening this panel from a different page later
 * continues the same conversation rather than starting a new one (part
 * 5's "remember the active conversation").
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { X, ExternalLink, Lock } from 'lucide-react';
import type {
  ConversationEntryPoint,
  ConversationMessage,
  ConversationSession,
} from '@mef/shared-types-contracts';
import {
  getOrStartConversationAction,
  sendConversationMessageAction,
} from '@/app/actions/conversation-coach';
import { SUGGESTED_PROMPTS } from '@/lib/conversation-coach/suggestedPrompts';
import { Bubble } from '@/components/conversation/Bubble';
import { TypingIndicator } from '@/components/conversation/TypingIndicator';
import { MessageInput } from '@/components/conversation/MessageInput';
import { HandoffForm } from '@/components/conversation/HandoffForm';

export function FloatingCoachPanel({
  entryPoint,
  entryContext,
  starterPrompts,
  onClose,
}: {
  entryPoint: ConversationEntryPoint;
  entryContext: string;
  starterPrompts?: string[] | undefined;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState('');
  const [pendingEcho, setPendingEcho] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getOrStartConversationAction(entryPoint).then((thread) => {
      if (cancelled) return;
      if (!thread) {
        setLoadError(true);
      } else {
        setSession(thread.session);
        setMessages(thread.messages);
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Only re-resolves on the panel's own entry point — reopening the
    // panel from a different page still resumes the same active session
    // (resolveSession() in lib/conversation-coach/service.ts), it just
    // re-fetches the current transcript.
  }, [entryPoint]);

  const isRestricted = session?.status === 'restricted';

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending || !session) return;
    setError(null);
    setPendingEcho(trimmed);
    setInput('');

    startTransition(async () => {
      const result = await sendConversationMessageAction(
        trimmed,
        session.id,
        '/conversation (floating coach)',
        entryPoint,
        entryContext
      );
      if (result.error) {
        setError(result.error);
        setPendingEcho(null);
        return;
      }
      setPendingEcho(null);
      setMessages((prev) => [
        ...prev,
        ...(result.memberMessage ? [result.memberMessage] : []),
        ...(result.coachMessage ? [result.coachMessage] : []),
      ]);
    });
  }

  const prompts = starterPrompts ?? SUGGESTED_PROMPTS[entryPoint] ?? SUGGESTED_PROMPTS.nav;
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full max-h-[75vh] flex-col">
      <div className="flex items-center justify-between border-b border-[#1B3A2D]/5 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            Your MEF Coach
          </p>
          <p className="text-sm text-[#6B7A72]">Grounded in your own history, not a chatbot.</p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close coach panel"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#1B3A2D]/50 transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {isLoading && <p className="text-sm text-[#6B7A72]">Loading your conversation…</p>}

        {loadError && (
          <p className="text-sm text-[#6B7A72]">
            We couldn&apos;t start a conversation right now. Please try again shortly.
          </p>
        )}

        {!isLoading && !loadError && (
          <>
            {isRestricted && (
              <div className="flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
                <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                This conversation is paused while your assigned coach reviews it.
              </div>
            )}

            {!hasMessages && !pendingEcho && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-[#6B7A72]">What would you like to talk through?</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      disabled={isPending}
                      className="rounded-full border border-[#1B3A2D]/10 bg-[#FAFAF8] px-3.5 py-1.5 text-xs font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.06] disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.slice(-6).map((message) => (
              <Bubble key={message.id} message={message} />
            ))}
            {pendingEcho && session && (
              <Bubble
                message={{
                  id: 'pending',
                  session_id: session.id,
                  member_id: session.member_id,
                  role: 'member',
                  content: pendingEcho,
                  source_page: null,
                  prompt_version: null,
                  safety_classification_id: null,
                  related_brain_focus: null,
                  related_insight_id: null,
                  member_visible: true,
                  is_archived: false,
                  created_at: new Date().toISOString(),
                }}
              />
            )}
            {isPending && pendingEcho && <TypingIndicator />}

            {error && <p className="text-sm text-red-700">{error}</p>}
          </>
        )}
      </div>

      {!isLoading && !loadError && session && (
        <div className="space-y-2 border-t border-[#1B3A2D]/5 px-5 py-4">
          {!isRestricted && (
            <MessageInput
              value={input}
              onChange={setInput}
              onSend={send}
              disabled={isPending}
              placeholder="Ask a quick question…"
            />
          )}
          <div className="flex items-center justify-between gap-3 pt-1">
            <HandoffForm sessionId={session.id} compact />
            <Link
              href={`/conversation?entry=${entryPoint}`}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#1B3A2D] underline underline-offset-2"
            >
              Open full conversation
              <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
