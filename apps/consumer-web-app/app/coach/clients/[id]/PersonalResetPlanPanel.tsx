/**
 * Coach-facing, read-only Personal Reset Plan card — same "list + real
 * data, no editing" shape as ReadinessPulsePanel/CoreValuesSnapshotPanel/
 * LifeSignalCheckPanel on this same page. Shows the current plan, the
 * snapshot inputs that built it, adherence from the daily log (using the
 * same explicit-states language the member's own card uses, never
 * "missed"), and the version history. No coach editing in this build.
 */

import { AREA_LABEL } from '@/lib/core-values-snapshot/constants';
import { SIGNAL_LABEL } from '@/lib/life-signal-check/constants';
import { READINESS_PATTERN_LABEL } from '@/lib/readiness-pulse/constants';
import { Q6_OBSTACLE_LABEL } from '@/lib/reset-plan/copy';
import type { ClientResetPlanView } from '@/app/actions/resetPlan';
import { NotebookPen } from 'lucide-react';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PersonalResetPlanPanel({ view }: { view: ClientResetPlanView }) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <NotebookPen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Personal Reset Plan</p>
      </div>

      {!view ? (
        <p className="mt-3 text-sm text-[#6B7A72]">Not started yet.</p>
      ) : (
        <div className="mt-3 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              {view.plan.status === 'active' ? 'Active plan' : 'In progress'}
            </p>
            <p className="mt-1 text-sm font-medium text-[#1B3A2D]">
              {view.plan.focusSignal ? SIGNAL_LABEL[view.plan.focusSignal] : 'No focus chosen yet'}
              {view.plan.actionTier && ` · ${READINESS_PATTERN_LABEL[view.plan.actionTier]} tier`}
            </p>
            {view.plan.startLocalDate && <p className="text-xs text-[#6B7A72]">Started {view.plan.startLocalDate}</p>}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Snapshot inputs</p>
            <ul className="mt-1 space-y-1 text-sm text-[#1B3A2D]">
              <li>Top value: {view.plan.snapshot.topValue ? AREA_LABEL[view.plan.snapshot.topValue] : 'No completed Core Values Snapshot'}</li>
              <li>Loudest signal: {view.plan.snapshot.loudestSignal ? SIGNAL_LABEL[view.plan.snapshot.loudestSignal] : 'None genuinely loud / no completed Life Signal Check'}</li>
              <li>Readiness pattern: {view.plan.snapshot.finalReadinessPattern ? READINESS_PATTERN_LABEL[view.plan.snapshot.finalReadinessPattern] : 'No completed Readiness Pulse'}</li>
              <li>Named obstacle: {view.plan.snapshot.q6Obstacle ? Q6_OBSTACLE_LABEL[view.plan.snapshot.q6Obstacle] : 'No completed Readiness Pulse'}</li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Adherence (explicit states logged)</p>
            {view.logs.length === 0 ? (
              <p className="mt-1 text-sm text-[#6B7A72]">No days logged yet.</p>
            ) : (
              <p className="mt-1 text-sm text-[#1B3A2D]">
                {view.logs.filter((l) => l.state === 'completed_normal').length} normal ·{' '}
                {view.logs.filter((l) => l.state === 'completed_difficult').length} difficult-day ·{' '}
                {view.logs.filter((l) => l.state === 'not_today').length} not today
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Version history</p>
            <ul className="mt-1 divide-y divide-[#1B3A2D]/5">
              {view.versions.map((version) => (
                <li key={version.id} className="py-2 text-sm text-[#1B3A2D]">
                  <span className="font-medium capitalize">{version.changeType.replace(/_/g, ' ')}</span>{' '}
                  <span className="text-xs text-[#6B7A72]">{formatDate(version.changedAt)}</span>
                  {version.decisionEvidence && (
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-[#F3F6F4] p-2 text-[11px] text-[#6B7A72]">
                      {JSON.stringify(version.decisionEvidence)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
