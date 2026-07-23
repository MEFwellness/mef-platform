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

const CONFIDENCE_LABEL: Record<RootMapDomainView['confidence']['label'], string> = {
  building: 'Building confidence',
  low: 'Low confidence',
  moderate: 'Moderate confidence',
  high: 'High confidence',
};

const PRIORITY_LABEL: Record<RootMapDomainView['priority'], string> = {
  quiet: 'Quiet',
  worth_watching: 'Worth watching',
  needs_attention_now: 'Needs attention now',
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
        <span className="rounded-full bg-[#F3F6F4] px-2.5 py-1">
          {CONFIDENCE_LABEL[domain.confidence.label]}
        </span>
        <span className="rounded-full bg-[#F3F6F4] px-2.5 py-1">{PRIORITY_LABEL[domain.priority]}</span>
      </div>

      {domain.whatWeUnderstand.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            What We Understand
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {domain.whatWeUnderstand.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
                {item}
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
