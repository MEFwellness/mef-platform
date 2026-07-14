'use client';

/**
 * The message composer — textarea, mic button, send button. Shared by the
 * full Conversation Coach page and the floating coach's compact panel so
 * voice input is built ONE place (part 1's "do not scatter browser speech
 * logic throughout UI components") rather than per-surface.
 *
 * Voice flow: tap mic -> browser requests permission if needed -> member
 * speaks -> final transcript is merged into the editable textarea -> the
 * member reviews/edits -> the member presses Send, exactly like a typed
 * message. Nothing is ever auto-sent from speech (part 1's explicit
 * requirement) — useSpeechToText only ever hands back text for this
 * component to insert into `value`.
 */

import { useEffect, useRef, useState } from 'react';
import { Send, Mic, Square, AlertCircle } from 'lucide-react';
import { useSpeechToText } from '@/hooks/useSpeechToText';

const PRIVACY_ACK_KEY = 'mef_voice_privacy_ack';

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = "Type how you're doing…",
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
  const {
    status,
    isSupported,
    interimTranscript,
    transcript,
    errorMessage,
    start,
    stop,
    cancel,
    clearTranscript,
  } = useSpeechToText();

  // Merge a finished transcript into the editable text once, then hand
  // control back to normal typing — the member can freely edit before
  // sending, per part 1's "do not automatically send speech without
  // allowing review."
  useEffect(() => {
    if (!transcript) return;
    const merged = value.trim() ? `${value.trim()} ${transcript}` : transcript;
    onChange(merged);
    clearTranscript();
    textareaRef.current?.focus();
  }, [transcript]);

  const isListening = status === 'listening' || status === 'requesting_permission';
  const isProcessing = status === 'processing';

  function handleMicClick() {
    if (isListening || isProcessing) {
      stop();
      return;
    }
    if (typeof window !== 'undefined' && !window.localStorage.getItem(PRIVACY_ACK_KEY)) {
      setShowPrivacyNotice(true);
      window.localStorage.setItem(PRIVACY_ACK_KEY, '1');
    }
    start();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSend(value);
  }

  const micLabel = isListening
    ? 'Stop listening'
    : isProcessing
      ? 'Processing your speech'
      : 'Start voice input';

  return (
    <div>
      {showPrivacyNotice && (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-2xl bg-[#1B3A2D]/[0.05] px-3 py-2 text-xs leading-relaxed text-[#6B7A72]">
          <span>Your speech is converted to text for this message. Audio is not saved.</span>
          <button
            type="button"
            onClick={() => setShowPrivacyNotice(false)}
            className="shrink-0 font-medium text-[#1B3A2D] underline underline-offset-2"
          >
            Got it
          </button>
        </div>
      )}

      {status === 'permission_denied' && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Microphone access was denied. You can still type your message below.
        </div>
      )}

      {status === 'error' && errorMessage && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Voice input hit a snag. You can still type your message below.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={
              isListening && interimTranscript ? `${value} ${interimTranscript}`.trim() : value
            }
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isListening) {
                e.preventDefault();
                onSend(value);
              }
            }}
            readOnly={isListening}
            rows={1}
            autoFocus={autoFocus}
            placeholder={isListening ? 'Listening…' : placeholder}
            aria-label="Message"
            className="max-h-32 w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          {isListening && (
            <span
              className="pointer-events-none absolute right-3 top-3 flex h-2.5 w-2.5 items-center justify-center"
              aria-hidden="true"
            >
              <span className="mef-voice-pulse h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
          )}
        </div>

        {isSupported ? (
          <button
            type="button"
            onClick={handleMicClick}
            aria-label={micLabel}
            aria-pressed={isListening}
            aria-live="polite"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] ${
              isListening
                ? 'bg-red-500 text-white'
                : 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.12]'
            } disabled:cursor-not-allowed disabled:opacity-40`}
            disabled={disabled && !isListening}
          >
            {isListening ? (
              <Square className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Mic className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Voice input isn't supported in this browser"
            title="Voice input isn't supported in this browser"
            className="flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-[#1B3A2D]/[0.04] text-[#1B3A2D]/25"
          >
            <Mic className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}

        <button
          type="submit"
          disabled={disabled || !value.trim() || isListening}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>

      {isListening && (
        <button
          type="button"
          onClick={cancel}
          className="mt-1.5 text-xs font-medium text-[#6B7A72] underline underline-offset-2 hover:text-[#1B3A2D]"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
