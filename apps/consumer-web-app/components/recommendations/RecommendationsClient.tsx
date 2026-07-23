'use client';

/**
 * /recommendations — the interactive member surface for the Recommendation
 * Engine and Lifestyle Experiments (Prompt 11). Owns the one piece of
 * cross-list interaction (starting an experiment from a recommendation
 * opens an inline duration picker) that doesn't fit cleanly inside a
 * single row component. Same useTransition + router.refresh() convention
 * as MemberIntelligencePanel.tsx/RecommendationRow.tsx.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MemberRecommendationView } from '@/app/actions/recommendations';
import { RecommendationRow } from './RecommendationRow';
import {
  startMyExperiment,
  reflectAndCloseMyExperiment,
  abandonMyExperiment,
} from '@/app/actions/lifestyleExperiments';
import type { LifestyleExperiment, LifestyleExperimentOutcome } from '@/lib/lifestyle-experiments';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const DURATIONS = [7, 14, 21, 28] as const;

const OUTCOME_LABEL: Record<LifestyleExperimentOutcome, string> = {
  worked: 'It worked',
  partially_worked: 'It partially worked',
  didnt_work: "It didn't work",
  inconclusive: 'Inconclusive',
};

const STATUS_LABEL: Record<LifestyleExperiment['status'], string> = {
  active: 'In progress',
  completed: 'Completed',
  abandoned: 'Stopped early',
  expired_no_reflection: 'Tracking period ended — add a reflection',
};

function StartExperimentForm({ rowId, onDone }: { rowId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function start(days: number) {
    setError(null);
    startTransition(async () => {
      const result = await startMyExperiment(rowId, days);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-2 rounded-2xl bg-[#FAFAF8] p-3">
      <p className="text-xs font-medium text-[#1B3A2D]">How long would you like to try this?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DURATIONS.map((days) => (
          <button
            key={days}
            type="button"
            disabled={isPending}
            onClick={() => start(days)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#1B3A2D] ring-1 ring-[#1B3A2D]/10 hover:bg-[#EFF6F1]"
          >
            {days} days
          </button>
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ReflectForm({ experiment }: { experiment: LifestyleExperiment }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<LifestyleExperimentOutcome>('partially_worked');
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    startTransition(async () => {
      const result = await reflectAndCloseMyExperiment(experiment.id, text, outcome);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function abandon() {
    setError(null);
    startTransition(async () => {
      const result = await abandonMyExperiment(experiment.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (experiment.status === 'completed' || experiment.status === 'abandoned') {
    return (
      <div className="mt-2 rounded-2xl bg-[#FAFAF8] p-3">
        <p className="text-xs font-semibold text-[#1B3A2D]">
          {experiment.outcome ? OUTCOME_LABEL[experiment.outcome] : STATUS_LABEL[experiment.status]}
        </p>
        {experiment.reflectionText && (
          <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]/80">{experiment.reflectionText}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      {!open ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#16302A]"
          >
            Reflect and close
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={abandon}
            className="rounded-full px-2.5 py-1.5 text-xs font-medium text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/[0.06]"
          >
            Stop early
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#FAFAF8] p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="How did it go?"
            rows={3}
            className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-white p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(OUTCOME_LABEL) as LifestyleExperimentOutcome[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setOutcome(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  outcome === value
                    ? 'bg-[#1B3A2D] text-white'
                    : 'bg-white text-[#1B3A2D] ring-1 ring-[#1B3A2D]/10'
                }`}
              >
                {OUTCOME_LABEL[value]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={close}
            className="mt-2 rounded-full bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#16302A]"
          >
            Save reflection
          </button>
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function RecommendationsClient({
  recommendations,
  experiments,
}: {
  recommendations: MemberRecommendationView[];
  experiments: LifestyleExperiment[];
}) {
  const [startingRowId, setStartingRowId] = useState<string | null>(null);
  const active = recommendations.filter((r) => r.status === 'shown');

  return (
    <>
      <section className={`${CARD} mef-animate-in mt-3 p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Your Recommendations
        </p>
        {active.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
            Nothing new right now — keep checking in and completing assessments, and
            recommendations will show up here as patterns emerge.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {active.map((r) => (
              <div key={r.rowId}>
                <RecommendationRow recommendation={r} onStartExperiment={setStartingRowId} />
                {startingRowId === r.rowId && (
                  <StartExperimentForm rowId={r.rowId} onDone={() => setStartingRowId(null)} />
                )}
              </div>
            ))}
          </ul>
        )}
      </section>

      {experiments.length > 0 && (
        <section className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Your Experiments
          </p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {experiments.map((experiment) => (
              <li key={experiment.id} className="py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-[#1B3A2D]">{experiment.title}</p>
                  <span className="rounded-full bg-[#F3F6F4] px-2.5 py-1 text-xs text-[#6B7A72]">
                    {STATUS_LABEL[experiment.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]/80">{experiment.protocol}</p>
                <p className="mt-1 text-xs text-[#6B7A72]">
                  Started {new Date(experiment.startDate).toLocaleDateString()} ·{' '}
                  {experiment.durationDays} days
                </p>
                <ReflectForm experiment={experiment} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
