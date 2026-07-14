'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import type {
  ConversationEntryPoint,
  ConversationMessage,
  ConversationSession,
} from '@mef/shared-types-contracts';
import { sendConversationMessageAction } from '@/app/actions/conversation-coach';
import { Bubble } from '@/components/conversation/Bubble';
import { TypingIndicator } from '@/components/conversation/TypingIndicator';
import { MessageInput } from '@/components/conversation/MessageInput';
import { HandoffForm } from '@/components/conversation/HandoffForm';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function ConversationView({
  session,
  initialMessages,
  entryPoint,
  suggestedPrompts,
}: {
  session: ConversationSession;
  initialMessages: ConversationMessage[];
  entryPoint: ConversationEntryPoint;
  suggestedPrompts: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState('');
  const [pendingEcho, setPendingEcho] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFailedRef = useRef<string | null>(null);

  const isRestricted = session.status === 'restricted';

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setError(null);
    setPendingEcho(trimmed);
    setInput('');
    lastFailedRef.current = null;

    startTransition(async () => {
      const result = await sendConversationMessageAction(
        trimmed,
        session.id,
        `/conversation?entry=${entryPoint}`,
        entryPoint
      );
      if (result.error) {
        setError(result.error);
        setPendingEcho(null);
        lastFailedRef.current = trimmed;
        return;
      }
      setPendingEcho(null);
      router.refresh();
    });
  }

  const hasMessages = initialMessages.length > 0;

  return (
    <div className="space-y-4">
      {isRestricted && (
        <div className="flex items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          This conversation is paused while your assigned coach reviews it.
        </div>
      )}

      <section className={`${CARD} flex flex-col p-5`}>
        <div className="flex min-h-[220px] flex-col">
          {!hasMessages && !pendingEcho && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
              <p className="text-sm text-[#6B7A72]">What would you like to talk through today?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => send(prompt)}
                    disabled={isPending}
                    className="rounded-full border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.06] disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {initialMessages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
          {pendingEcho && (
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
        </div>

        {error && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            {lastFailedRef.current && (
              <button
                type="button"
                onClick={() => send(lastFailedRef.current!)}
                className="font-medium underline underline-offset-2"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {!isRestricted && (
          <div className="mt-4">
            <MessageInput value={input} onChange={setInput} onSend={send} disabled={isPending} />
          </div>
        )}
      </section>

      <HandoffForm sessionId={session.id} />
    </div>
  );
}
