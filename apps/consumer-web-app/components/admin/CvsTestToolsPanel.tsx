'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import {
  resetCvsForMemberAction,
  shiftCvsExperimentAction,
  type CvsShiftPattern,
  type CvsTestableMember,
} from '@/app/actions/coreValuesSnapshotAdmin';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const PRIMARY_BUTTON =
  'mef-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50';
const SECONDARY_BUTTON =
  'mef-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] disabled:opacity-50';

const RECIPES: { branch: string; recipe: string }[] = [
  {
    branch: 'Clear Gap',
    recipe:
      'Pick the same value for Q1, Q2, Q3, Q4, Q11, and Q12 (whenever it’s offered). On Screen 2, set that value’s slider to 1 or 2.',
  },
  {
    branch: 'Aligned',
    recipe: 'Same as Clear Gap (one consistent value everywhere it’s offered), but set that value’s slider to 4 or 5.',
  },
  {
    branch: 'Slipping',
    recipe: 'Same as Clear Gap (one consistent value everywhere it’s offered), but set that value’s slider to exactly 3.',
  },
  {
    branch: 'Split',
    recipe:
      'Pick the same value for Q1, Q2, Q3, Q4 — but for Q11 ("if the next 90 days could only transform ONE…"), pick a DIFFERENT value you didn’t pick in Q1–4. Slider values and Q12 don’t matter for this one.',
  },
  {
    branch: 'S1 bonus observation ("guilt" callout)',
    recipe:
      'Can appear alongside Clear Gap, Aligned, or Slipping (never Split). Whatever value you name in Q3 (“I feel guilty that I don’t ___ enough”), give that value’s own slider a 4 or 5 — easiest way is to make Q3 match your consistent top value (which also gives you Aligned). To pair it with Clear Gap or Slipping instead, make Q3 a DIFFERENT value than your top pick, and rate that different value’s slider 4 or 5 while your top value’s slider stays low/at 3.',
  },
];

export function CvsTestToolsPanel({ members }: { members: CvsTestableMember[] }) {
  const [memberId, setMemberId] = useState('');
  const [pattern, setPattern] = useState<CvsShiftPattern>('mostly_yes');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; summary?: string; error?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok ? { kind: 'ok', text: result.summary ?? 'Done.' } : { kind: 'error', text: result.error ?? 'Something went wrong.' }
      );
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <section className={`${CARD} p-6`}>
        <label htmlFor="cvs-test-member" className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Test member
        </label>
        <select
          id="cvs-test-member"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="mef-focus-ring mt-2 w-full rounded-2xl border border-[#1B3A2D]/15 bg-white px-4 py-3 text-sm text-[#1B3A2D]"
        >
          <option value="">Choose a member…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </section>

      <section className={`${CARD} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Retake</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Clears this member&apos;s Core Values Snapshot answers, sessions, &quot;What Root Knows&quot; entries, and
          any Weekly Experiment. They can then retake it fresh from the Questionnaires page.
        </p>
        <button
          type="button"
          disabled={!memberId || isPending}
          onClick={() => run(() => resetCvsForMemberAction(memberId))}
          className={`${PRIMARY_BUTTON} mt-4 w-full`}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Reset Core Values Snapshot for this member
        </button>
      </section>

      <section className={`${CARD} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Time-shift the Weekly Experiment</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Moves this member&apos;s current experiment&apos;s start date back so it reads as day 3 or day 7 right
          now, and clears any earlier day-3/day-7 message so it can fire again. The member needs to have already
          tapped &quot;I&apos;m in&quot; to start the experiment before this will do anything.
        </p>

        <button
          type="button"
          disabled={!memberId || isPending}
          onClick={() => run(() => shiftCvsExperimentAction(memberId, 3))}
          className={`${PRIMARY_BUTTON} mt-4 w-full`}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Fire day-3 follow-up now
        </button>

        <div className="mt-4">
          <label htmlFor="cvs-day7-pattern" className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Day-7 daily pattern to seed
          </label>
          <select
            id="cvs-day7-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value as CvsShiftPattern)}
            className="mef-focus-ring mt-2 w-full rounded-2xl border border-[#1B3A2D]/15 bg-white px-4 py-3 text-sm text-[#1B3A2D]"
          >
            <option value="mostly_yes">Mostly yes (5 yes / 1 not-today / 1 untapped)</option>
            <option value="patchy">Patchy (1 yes / 2 not-today / 4 untapped)</option>
          </select>
        </div>

        <button
          type="button"
          disabled={!memberId || isPending}
          onClick={() => run(() => shiftCvsExperimentAction(memberId, 7, pattern))}
          className={`${SECONDARY_BUTTON} mt-3 w-full`}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Fire day-7 follow-up now
        </button>
      </section>

      {message && (
        <p
          role="status"
          className={`rounded-2xl px-5 py-4 text-sm leading-relaxed ${
            message.kind === 'ok' ? 'bg-[#EFF6F1] text-[#1B3A2D]' : 'bg-[#FDEEEE] text-[#9B4040]'
          }`}
        >
          {message.text}
        </p>
      )}

      <section className={`${CARD} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Answer recipes for each &quot;What Root Learned&quot; branch
        </p>
        <ul className="mt-3 space-y-4">
          {RECIPES.map((r) => (
            <li key={r.branch}>
              <p className="text-sm font-semibold text-[#1B3A2D]">{r.branch}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-[#6B7A72]">{r.recipe}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
