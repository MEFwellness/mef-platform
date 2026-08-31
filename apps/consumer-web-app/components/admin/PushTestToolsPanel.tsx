'use client';

/**
 * "Send a test notification" — the administrator's way to prove a real
 * phone receives a real push before the daily job that would send one
 * exists.
 *
 * Same shape as CvsTestToolsPanel and ResetPlanTestToolsPanel: pick one
 * member, press one button, read one plain sentence about what happened.
 * It only ever acts on the one member picked.
 */

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import {
  sendTestPushToMemberAction,
  type PushTestableMember,
} from '@/app/actions/pushNotificationsAdmin';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const PRIMARY_BUTTON =
  'mef-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50';

export function PushTestToolsPanel({
  members,
  sendingConfigured,
}: {
  members: PushTestableMember[];
  sendingConfigured: boolean;
}) {
  const [memberId, setMemberId] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = members.find((m) => m.id === memberId) ?? null;

  function send() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendTestPushToMemberAction(memberId);
      setMessage(
        result.ok
          ? { kind: 'ok', text: result.summary }
          : { kind: 'error', text: result.error }
      );
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {!sendingConfigured && (
        <section className={`${CARD} border border-[#B45309]/30 p-6`}>
          <p className="text-sm leading-relaxed text-[#8A5A2B]">
            This environment has no push keys set, so nothing can be sent from here. Add
            NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to the project environment
            variables, then redeploy.
          </p>
        </section>
      )}

      <section className={`${CARD} p-6`}>
        <label
          htmlFor="push-test-member"
          className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]"
        >
          Member with a saved device
        </label>
        <select
          id="push-test-member"
          value={memberId}
          onChange={(e) => {
            setMemberId(e.target.value);
            setMessage(null);
          }}
          className="mef-focus-ring mt-2 w-full rounded-2xl border border-[#1B3A2D]/15 bg-white px-4 py-3 text-sm text-[#1B3A2D]"
        >
          <option value="">Choose a member</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName} ({m.deviceCount} {m.deviceCount === 1 ? 'device' : 'devices'})
            </option>
          ))}
        </select>

        {members.length === 0 && (
          <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
            Nobody has turned reminders on yet, so there is nowhere to send. A member turns them on
            from her profile, or from the one-time question after a Daily Reset.
          </p>
        )}

        {selected && (
          <div className="mt-4 rounded-2xl bg-[#F5F0E4]/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Devices saved
            </p>
            <ul className="mt-2 space-y-1 text-sm text-[#1B3A2D]">
              {selected.deviceLabels.map((label, index) => (
                <li key={`${label}-${index}`}>{label}</li>
              ))}
            </ul>
            {!selected.remindersEnabled && (
              <p className="mt-3 text-sm leading-relaxed text-[#8A5A2B]">
                Her reminders switch is off, so nothing will be sent to her whatever devices are
                listed. That is the same rule the real sends obey.
              </p>
            )}
          </div>
        )}
      </section>

      <section className={`${CARD} p-6`}>
        <p className="text-[15px] font-medium text-[#1B3A2D]">Send a test notification</p>
        <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
          Sends one notification, right now, to every device this one member has saved. It says on
          the notification itself that it is a test, and tapping it opens her Home screen.
        </p>
        <button
          type="button"
          disabled={isPending || !memberId}
          onClick={send}
          className={`${PRIMARY_BUTTON} mt-4`}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Send test notification
        </button>
      </section>

      {message && (
        <section
          className={`${CARD} p-5 ${message.kind === 'ok' ? 'border border-[#1B3A2D]/10' : 'border border-[#B45309]/30'}`}
        >
          <p
            className={`text-sm leading-relaxed ${message.kind === 'ok' ? 'text-[#1B3A2D]' : 'text-[#8A5A2B]'}`}
          >
            {message.text}
          </p>
        </section>
      )}
    </div>
  );
}
