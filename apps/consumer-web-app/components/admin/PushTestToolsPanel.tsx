'use client';

/**
 * The administrator's two push buttons, for one member at a time.
 *
 * "Send a test notification" proves a real phone receives a real push,
 * with fixed words that say they are a test.
 *
 * "Run today's decision now" is the different and more useful one: it
 * runs the REAL daily job for this one member, right now, and prints what
 * it decided and why. Same function the hourly schedule calls, so its
 * answer is the schedule's answer. It ignores the send window and the
 * test-account exclusion, which is what makes it runnable at all, and
 * ignores nothing else.
 *
 * Same shape as CvsTestToolsPanel and ResetPlanTestToolsPanel: pick one
 * member, press one button, read one plain sentence about what happened.
 * It only ever acts on the one member picked.
 */

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import {
  runNotificationDecisionAction,
  sendTestPushToMemberAction,
  type PushTestableMember,
} from '@/app/actions/pushNotificationsAdmin';
import type { NotificationDecision } from '@/lib/push-decision/service';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const PRIMARY_BUTTON =
  'mef-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50';
const SECONDARY_BUTTON =
  'mef-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl border border-[#1B3A2D]/25 bg-white px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]/60 disabled:opacity-50';

export function PushTestToolsPanel({
  members,
  sendingConfigured,
}: {
  members: PushTestableMember[];
  sendingConfigured: boolean;
}) {
  const [memberId, setMemberId] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [decision, setDecision] = useState<NotificationDecision | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = members.find((m) => m.id === memberId) ?? null;

  function send() {
    setMessage(null);
    setDecision(null);
    startTransition(async () => {
      const result = await sendTestPushToMemberAction(memberId);
      setMessage(
        result.ok
          ? { kind: 'ok', text: result.summary }
          : { kind: 'error', text: result.error }
      );
    });
  }

  function runDecision() {
    setMessage(null);
    setDecision(null);
    startTransition(async () => {
      const result = await runNotificationDecisionAction(memberId);
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error });
        return;
      }
      setDecision(result.decision);
      setMessage({
        kind: result.decision.outcome === 'sent' ? 'ok' : 'error',
        text: result.decision.sentence,
      });
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
            setDecision(null);
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

      <section className={`${CARD} p-6`}>
        <p className="text-[15px] font-medium text-[#1B3A2D]">Run today&apos;s decision now</p>
        <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
          Runs the real daily job for this one member, right now, and says exactly what it decided
          and why. It ignores the send window and the test-account rule so it can be run at any
          hour on a test account. Everything else applies: her switch, her devices, the one a day
          cap, the quiet period, and the check that the thing is not already done.
        </p>
        <button
          type="button"
          disabled={isPending || !memberId}
          onClick={runDecision}
          className={`${SECONDARY_BUTTON} mt-4`}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Run today&apos;s decision now
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

      {decision && (
        <section className={`${CARD} p-5`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            What the job saw
          </p>
          <dl className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7A72]">Their day</dt>
              <dd>
                {decision.localDate} ({decision.timezone})
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7A72]">Their clock, and their send hour</dt>
              <dd>
                {decision.localHour}:00, sends at {decision.sendHour}:00
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7A72]">Cadence</dt>
              <dd>
                {decision.cadence === 'daily' ? 'One a day' : 'One a week'}
                {decision.ignoredStreak > 0
                  ? `, ${decision.ignoredStreak} unopened in a row`
                  : ''}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7A72]">Outcome</dt>
              <dd>{decision.outcome}</dd>
            </div>
            {decision.rule && (
              <div className="flex justify-between gap-4">
                <dt className="text-[#6B7A72]">Priority Card rule</dt>
                <dd>{decision.rule}</dd>
              </div>
            )}
            {decision.title && (
              <div className="flex justify-between gap-4">
                <dt className="text-[#6B7A72]">Notification</dt>
                <dd className="text-right">
                  {decision.title}: {decision.body}
                </dd>
              </div>
            )}
            {decision.url && (
              <div className="flex justify-between gap-4">
                <dt className="text-[#6B7A72]">A tap opens</dt>
                <dd>{decision.url}</dd>
              </div>
            )}
          </dl>
          {decision.failures.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-[#8A5A2B]">
              {decision.failures.map((failure, index) => (
                <li key={index}>{failure}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
