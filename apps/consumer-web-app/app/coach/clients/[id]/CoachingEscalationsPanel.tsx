'use client';

/**
 * Adaptive Coaching Direction Part 3 — "Root has flagged".
 *
 * A section on the existing coach client page, not a dashboard and not a
 * page of its own. It lists the coaching threads Root tried three ways and
 * could not make land, and gives the coach one action: resolve, which
 * clears the flag and lets the engine carefully try the thread again after
 * a cooldown.
 *
 * WHAT IT SHOWS IS BEHAVIORAL, NOT CLINICAL. Every value on the screen came
 * from lib/coaching-direction/escalation.ts's pure builder, whose only
 * inputs are a thread row (counters, slugs, dates) and the identifying keys
 * out of an evidence object that migration 150's own sanitizer already
 * restricted to library identifiers and numbers. The member's answers, her
 * concern, her pain, her sleep and her food have no path into this
 * component. A coach who needs the clinical picture has the whole record
 * further down the same page.
 *
 * It renders in the empty state too, deliberately. "Root has flagged
 * nothing" is a real and useful answer, and a section that vanishes when
 * empty leaves a coach unable to tell it apart from a section that is
 * broken.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';
import { resolveCoachingEscalationAction } from '@/app/actions/coachingEscalations';
import type { CoachingEscalationView } from '@/lib/coaching-direction/escalation';
import { ESCALATION_COOLDOWN_DAYS } from '@/lib/coaching-direction/escalationData';
import { formatDisplayDate } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** Day-level precision is enough for "when did Root give up on this". */
const ESCALATED_AT_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

type Props = {
  clientId: string;
  escalations: CoachingEscalationView[];
};

export function CoachingEscalationsPanel({ clientId, escalations }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleResolve(threadKey: string) {
    setError(null);
    setResolving(threadKey);
    startTransition(async () => {
      const result = await resolveCoachingEscalationAction(clientId, threadKey);
      setResolving(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Flag className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Root has flagged</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        Coaching threads Root offered three ways and could not make land. Resolving one clears the
        flag and lets Root try it again after {ESCALATION_COOLDOWN_DAYS} days.
      </p>

      {escalations.length === 0 ? (
        <p className="mt-4 text-sm text-[#6B7A72]">
          Nothing is flagged for this client right now.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {escalations.map((item) => (
            <li
              key={item.threadKey}
              className="rounded-2xl border border-[#E4EBE6] bg-[#FAFAF8] p-4"
            >
              <p className="text-sm font-semibold text-[#1B3A2D]">{item.ruleLabel}</p>
              <p className="mt-1 text-sm text-[#3E5C46]">
                Root was offering {item.actionTypeLabel}.
              </p>
              {item.itemLabel && (
                <p className="mt-1 break-words text-xs text-[#6B7A72]">{item.itemLabel}</p>
              )}

              {item.signalKeys.length > 0 && (
                <dl className="mt-3 space-y-0.5">
                  {item.signalKeys.map((signal) => (
                    <div key={signal.key} className="flex flex-wrap gap-x-2 text-xs">
                      <dt className="text-[#6B7A72]">{signal.key}</dt>
                      <dd className="break-all font-medium text-[#3E5C46]">{signal.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <p className="mt-3 text-xs text-[#6B7A72]">
                {item.approachesTried} {item.approachesTried === 1 ? 'approach' : 'approaches'}{' '}
                tried across {item.deliveredCount}{' '}
                {item.deliveredCount === 1 ? 'day' : 'days'} it was shown.
              </p>

              {item.responses.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {item.responses.map((tally) => (
                    <li
                      key={tally.response}
                      className="rounded-full bg-white px-2.5 py-1 text-xs text-[#3E5C46] shadow-[0_1px_4px_-2px_rgba(27,58,45,0.18)]"
                    >
                      {tally.label}: {tally.count}
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-xs text-[#6B7A72]">
                {/* The shared UTC-pinned helper, not a bare toLocaleDateString.
                    A coach page that formats a timestamp against the host's own
                    zone renders differently server side and client side, which
                    React reports as a hydration mismatch. */}
                Flagged {formatDisplayDate(item.escalatedAt, ESCALATED_AT_FORMAT)}
                {item.escalationCount > 1 && `, for the ${item.escalationCount}th time`}.
              </p>

              <button
                type="button"
                onClick={() => handleResolve(item.threadKey)}
                disabled={isPending && resolving === item.threadKey}
                className="mt-3 rounded-full bg-[#1B3A2D] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {isPending && resolving === item.threadKey ? 'Resolving...' : 'Resolve'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}
    </section>
  );
}
