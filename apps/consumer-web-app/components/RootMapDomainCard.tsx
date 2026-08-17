/**
 * One Coaching Domain's card on the Root Map (member and coach views share
 * this component — Prompt 10). Purely presentational over
 * lib/root-map/types.ts's RootMapDomainView; computes nothing itself, same
 * "never a diagnosis, never internal scoring exposed" discipline as
 * RootCauseSignalsPanel.
 */

import type { RootMapDomainView, RootMapStage } from '@/lib/root-map';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const STAGE_LABEL: Record<RootMapStage, string> = {
  discovery: 'Discovery',
  stabilization: 'Stabilization',
  optimization: 'Optimization',
};

const STAGE_STYLE: Record<RootMapStage, string> = {
  discovery: 'bg-[#EFF3EE] text-[#6B7A72]',
  stabilization: 'bg-[#FDF2E3] text-[#8A5A1F]',
  optimization: 'bg-[#EAF3EC] text-[#2F5D3A]',
};

/**
 * The coach reads the SAME four evidence tiers the member does, so the two
 * of them can talk about one finding using one vocabulary. This replaced
 * "Building / Low / Moderate / High confidence", which was a different
 * formula from the identically-labelled chip on the Root Score screen and
 * told the reader nothing about what either measured.
 */
const STATE_LABEL: Record<RootMapDomainView['state'], string> = {
  needs_attention: 'Needs attention now',
  worth_watching: 'Worth watching',
  acknowledged: 'Noted, not urgent',
  nothing_flagged_yet: 'Nothing flagged yet',
  too_early: 'Still early here',
  no_data_yet: 'Nothing logged yet',
  not_covered: 'Not covered by an assessment yet',
  paused_for_coach: 'Paused for coach review',
};

export function RootMapDomainCard({ domain }: { domain: RootMapDomainView }) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#1B3A2D]">{domain.label}</p>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STAGE_STYLE[domain.stage]}`}
        >
          {STAGE_LABEL[domain.stage]}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">{domain.definition}</p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6B7A72]">
        <span className="rounded-full bg-[#F3F6F4] px-2.5 py-1">{STATE_LABEL[domain.state]}</span>
        {domain.tierLabel && (
          <span className="rounded-full bg-[#F3F6F4] px-2.5 py-1">{domain.tierLabel}</span>
        )}
      </div>

      {domain.canonicalFindings.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            What We Understand
          </p>
          <ul className="mt-1.5 space-y-3">
            {domain.canonicalFindings.map((f) => (
              <li key={f.id} className="text-sm leading-relaxed text-[#1B3A2D]">
                <p>{f.statement}</p>
                <p className="mt-1 text-xs text-[#6B7A72]">
                  {f.tierLabel}
                  {f.crossReferenceNote ? ` · ${f.crossReferenceNote}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          What We&apos;re Still Learning
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]/80">
          {domain.whatWereStillLearning}
        </p>
      </div>

      {domain.patterns.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Patterns Identified
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {domain.patterns.map((p) => (
              <li key={p.key} className="text-sm leading-relaxed text-[#1B3A2D]/80">
                {p.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-3.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          {domain.currentRecommendation}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{domain.nextSuggestedStep}</p>
      </div>
    </section>
  );
}
