'use client';

/**
 * The one time Root asks about reminders.
 *
 * WHEN. Right after a Daily Reset, on the ending screen, and only when she
 * has never been asked and reminders are off. The server decides that
 * (lib/push/data.ts's isPushEnableAskDue) and either renders this or does
 * not; this component never re-decides due-ness. Never during onboarding
 * and never on a first login, because the trigger is a finished Daily
 * Reset and nothing else.
 *
 * ONCE. The ask is recorded the instant it is actually put in front of
 * her, not when she answers, which is the same discipline the "start it
 * later" offers in RootMessagePopupClient use. A member who closes the app
 * mid-ask has still been asked. The recorded answer starts at 'declined',
 * the conservative outcome, and is corrected to 'enabled' only once the
 * phone has actually granted permission and the device is saved.
 *
 * The write happens from a mounted effect, never from the render, and it
 * goes over /api/push-response rather than a server action: this screen's
 * render grades the forecast she just submitted, and a server action would
 * re-run all of that behind a tap that has nothing to do with it.
 *
 * THE IPHONE BRANCH. On an iPhone that is not running from the Home
 * Screen there is no push at all, so a permission prompt would be a dead
 * end. That case gets the walkthrough instead, and is recorded as
 * 'needs_install' so the record says what actually happened.
 *
 * Same modal chrome, same Root voice and the same one-question-at-a-time
 * shape as components/hydration/HydrationFocusPopup.tsx, portalled to the
 * body so no transformed ancestor on this screen can capture it.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { PUSH_ASK_COPY, PUSH_IOS_INSTALL_COPY } from '@/lib/push/copy';
import { readPushCapability, subscribeToPush } from '@/lib/push/client';
import type { PushPromptAnswer } from '@/lib/push/data';

type Stage = 'deciding' | 'ask' | 'ios_install' | 'accepted' | 'blocked' | 'declined' | 'closed';

async function post(body: Record<string, unknown>): Promise<{ error?: string }> {
  try {
    const response = await fetch('/api/push-response', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return (await response.json()) as { error?: string };
  } catch (error) {
    console.error('push-response post failed', error);
    return { error: 'Could not reach the server.' };
  }
}

export function PushEnableAsk() {
  const [stage, setStage] = useState<Stage>('deciding');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorded = useRef(false);

  useBodyScrollLock(stage !== 'deciding' && stage !== 'closed');

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;

    const capability = readPushCapability();

    // A browser that cannot do push at all, and never will, is not asked
    // and is not recorded as asked. She has not turned anything down here,
    // and the ask is still waiting for her on a device that can.
    if (capability === 'unsupported') {
      setStage('closed');
      return;
    }

    const iosNeedsInstall = capability === 'ios_needs_install';
    setStage(iosNeedsInstall ? 'ios_install' : 'ask');

    const answer: PushPromptAnswer = iosNeedsInstall ? 'needs_install' : 'declined';
    void post({ kind: 'prompt_shown', answer });
  }, []);

  async function handleAccept() {
    setError(null);
    setBusy(true);
    try {
      const outcome = await subscribeToPush();

      if (!outcome.ok && outcome.reason === 'unsupported') {
        setStage(outcome.capability === 'ios_needs_install' ? 'ios_install' : 'closed');
        return;
      }
      if (!outcome.ok && outcome.reason === 'denied') {
        setStage('blocked');
        return;
      }
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      const saved = await post({
        kind: 'save_subscription',
        subscription: outcome.subscription,
        deviceLabel: outcome.deviceLabel,
      });
      if (saved.error) {
        setError(saved.error);
        return;
      }

      await post({ kind: 'prompt_answer', answer: 'enabled' });
      setStage('accepted');
    } finally {
      setBusy(false);
    }
  }

  function handleDecline() {
    // Already recorded as declined the moment this was shown, so there is
    // nothing more to write. Saying so here rather than firing a second
    // write that would change nothing.
    setStage('declined');
  }

  if (stage === 'deciding' || stage === 'closed') return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <PushEnableAskCard
      stage={stage}
      busy={busy}
      error={error}
      onAccept={handleAccept}
      onDecline={handleDecline}
      onClose={() => setStage('closed')}
    />,
    document.body
  );
}

/**
 * The card itself, with no state and no browser APIs of its own, so every
 * stage can be rendered and read in a test exactly as a member would see
 * it. The wrapper above owns which stage is showing; this owns nothing but
 * how it looks.
 */
export type PushEnableAskStage = 'ask' | 'ios_install' | 'accepted' | 'blocked' | 'declined';

export function PushEnableAskCard({
  stage,
  busy,
  error,
  onAccept,
  onDecline,
  onClose,
}: {
  stage: PushEnableAskStage;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mef-modal-viewport z-[60] flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-[#0E1F17]/55 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-enable-ask-title"
        className="relative max-h-full w-full max-w-sm overflow-y-auto rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
          aria-hidden="true"
        />

        <p className="relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
          {stage === 'ios_install' ? PUSH_IOS_INSTALL_COPY.eyebrow : PUSH_ASK_COPY.eyebrow}
        </p>

        {stage === 'ask' && (
          <>
            <h2
              id="push-enable-ask-title"
              className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]"
            >
              {PUSH_ASK_COPY.title}
            </h2>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">
              {PUSH_ASK_COPY.body}
            </p>

            {error && <p className="relative mt-4 text-sm text-[#F5B7A0]">{error}</p>}

            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="mef-focus-ring mef-press relative mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50"
            >
              {PUSH_ASK_COPY.accept}
            </button>

            <div className="relative mt-5 flex items-center justify-center border-t border-[#F5F0E4]/10 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={onDecline}
                className="mef-press text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
              >
                {PUSH_ASK_COPY.decline}
              </button>
            </div>
          </>
        )}

        {stage === 'ios_install' && (
          <>
            <h2
              id="push-enable-ask-title"
              className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]"
            >
              {PUSH_IOS_INSTALL_COPY.title}
            </h2>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">
              {PUSH_IOS_INSTALL_COPY.body}
            </p>

            <ol className="relative mt-5 space-y-4">
              {PUSH_IOS_INSTALL_COPY.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#C4A050]/50 text-xs font-semibold text-[#C4A050]"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="text-[15px] leading-relaxed text-[#F5F0E4]">{step}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={onClose}
              className="mef-focus-ring mef-press relative mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
            >
              {PUSH_IOS_INSTALL_COPY.dismiss}
            </button>
          </>
        )}

        {(stage === 'accepted' || stage === 'blocked' || stage === 'declined') && (
          <>
            <h2
              id="push-enable-ask-title"
              className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]"
            >
              {stage === 'accepted'
                ? PUSH_ASK_COPY.acceptedTitle
                : stage === 'blocked'
                  ? PUSH_ASK_COPY.blockedTitle
                  : PUSH_ASK_COPY.declinedTitle}
            </h2>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">
              {stage === 'accepted'
                ? PUSH_ASK_COPY.accepted
                : stage === 'blocked'
                  ? PUSH_ASK_COPY.blocked
                  : PUSH_ASK_COPY.declined}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mef-focus-ring mef-press relative mt-6 inline-flex items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
            >
              {PUSH_ASK_COPY.done}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
