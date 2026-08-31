'use client';

/**
 * The one switch for reminders, in her account settings.
 *
 * It is the single source of truth for whether anything is ever sent to
 * her phone. Off revokes every device she has saved as well as setting the
 * preference (app/actions/pushNotifications.ts), so there is no state
 * where a device is still live behind a switch that says off.
 *
 * Turning it ON has to happen in the browser, not on the server: a phone
 * only raises its permission request from a real tap. So the switch asks
 * the phone first and saves the preference second, and if the phone says
 * no the switch stays off and says why in plain language.
 *
 * The iPhone case is the same rule as the ask after a Daily Reset. Safari
 * on iOS can only receive push once Rooted Reset is on the Home Screen, so
 * in a plain Safari tab this says what to do instead of offering a switch
 * that could not work.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing } from 'lucide-react';
import { PUSH_SETTINGS_COPY, pushSwitchHelperText } from '@/lib/push/copy';
import { readPushCapability, subscribeToPush, unsubscribeFromPush } from '@/lib/push/client';
import type { PushCapability } from '@/lib/push/platform';
import {
  setMyPushNotificationsEnabledAction,
  saveMyPushSubscriptionAction,
} from '@/app/actions/pushNotifications';

export function NotificationsPreferenceSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [capability, setCapability] = useState<PushCapability | null>(null);
  const [busy, startTransition] = useTransition();
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The prop is the server's answer and always wins over local state once
  // the route re-renders, so a failed change never leaves the switch
  // showing something the database does not say.
  useEffect(() => setOn(enabled), [enabled]);

  useEffect(() => setCapability(readPushCapability()), []);

  const pending = busy || working;

  async function turnOn() {
    setNote(null);
    setWorking(true);
    try {
      const outcome = await subscribeToPush();

      if (!outcome.ok && outcome.reason === 'unsupported') {
        setCapability(outcome.capability);
        setNote(
          outcome.capability === 'ios_needs_install'
            ? PUSH_SETTINGS_COPY.iosNeedsInstall
            : PUSH_SETTINGS_COPY.unsupported
        );
        return;
      }
      if (!outcome.ok && outcome.reason === 'denied') {
        setNote(PUSH_SETTINGS_COPY.blocked);
        return;
      }
      if (!outcome.ok) {
        setNote(outcome.message);
        return;
      }

      const saved = await saveMyPushSubscriptionAction(outcome.subscription, outcome.deviceLabel);
      if (saved.error) {
        setNote(saved.error);
        return;
      }

      setOn(true);
      startTransition(() => router.refresh());
    } finally {
      setWorking(false);
    }
  }

  async function turnOff() {
    setNote(null);
    setWorking(true);
    try {
      const result = await setMyPushNotificationsEnabledAction(false);
      if (result.error) {
        setNote(result.error);
        return;
      }
      // The phone stops holding a subscription too, so nothing is left
      // pointing at a device the server has already retired.
      await unsubscribeFromPush();
      setOn(false);
      startTransition(() => router.refresh());
    } finally {
      setWorking(false);
    }
  }

  function handleToggle() {
    if (pending) return;
    void (on ? turnOff() : turnOn());
  }

  const helper = pushSwitchHelperText({ on, pending, capability });

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="flex items-center gap-2.5 text-[15px] font-medium text-[#1B3A2D]">
            <BellRing className="h-4 w-4 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
            {PUSH_SETTINGS_COPY.label}
          </span>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">{helper}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={PUSH_SETTINGS_COPY.label}
          disabled={pending}
          onClick={handleToggle}
          className={`mef-focus-ring mef-press relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 ${
            on ? 'bg-[#1B3A2D]' : 'bg-[#1B3A2D]/15'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
              on ? 'translate-x-6' : 'translate-x-1'
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      {note && <p className="mt-3 text-sm leading-relaxed text-[#8A5A2B]">{note}</p>}
    </div>
  );
}
