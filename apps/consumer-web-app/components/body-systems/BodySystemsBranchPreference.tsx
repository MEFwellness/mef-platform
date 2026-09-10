'use client';

/**
 * Her own control over which set of questions the MEF Body Systems
 * Survey's last section asks her.
 *
 * IT ONLY EXISTS ONCE SHE HAS ONE. A member who has never answered the
 * branch question is not shown a control about a survey she has never
 * seen, because a profile screen offering to change a setting nothing has
 * set yet is Root talking about something that is not true for her.
 *
 * CHANGING IT CHANGES NEXT TIME AND NOTHING ELSE. No stored sitting is
 * rescored and no result moves, because a finished sitting is an answer to
 * the questions actually asked. The action says so too.
 *
 * Its words are rows in body_systems_copy, like every other word this
 * survey can say.
 */

import { useState, useTransition } from 'react';
import { memberCopy } from '@/lib/body-systems/copyKeys';
import { setBodySystemsBranchAction } from '@/app/actions/bodySystems';
import type { BodySystemsBranch } from '@/lib/body-systems/types';

export function BodySystemsBranchPreference({
  branch,
  copy,
}: {
  branch: BodySystemsBranch;
  copy: Record<string, string>;
}) {
  const [current, setCurrent] = useState<BodySystemsBranch>(branch);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function choose(next: BodySystemsBranch) {
    if (next === current) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setBodySystemsBranchAction(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrent(next);
      setSaved(true);
    });
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        {memberCopy(copy, 'member.branch_profile_label')}
      </p>
      <p className="mt-1.5 text-sm text-[#6B7A72]">
        {memberCopy(copy, 'member.branch_profile_hint')}
      </p>

      <div className="mt-3 space-y-2">
        {(['a', 'b'] as const).map((option) => {
          const on = current === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              disabled={isPending}
              onClick={() => choose(option)}
              className={`mef-focus-ring mef-press flex w-full items-center rounded-2xl border px-4 py-3 text-left text-sm transition disabled:opacity-50 ${
                on
                  ? 'border-[#1B3A2D] bg-[#1B3A2D] font-semibold text-[#F5F0E4]'
                  : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D] hover:bg-[#F3F6F4]'
              }`}
            >
              {memberCopy(
                copy,
                option === 'a' ? 'member.branch_option_a' : 'member.branch_option_b'
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-3 text-sm text-[#1B3A2D]">
          Saved.
        </p>
      )}
    </div>
  );
}
