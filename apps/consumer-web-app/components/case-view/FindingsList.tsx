import type { FindingView } from '@/lib/case-view/types';
import { OverlayChart } from './OverlayChart';

const TIER_BADGE_STYLE: Record<1 | 2 | 3, string> = {
  1: 'bg-[#F3F6F4] text-[#6B7A72]',
  2: 'bg-[#FDF2E3] text-[#8A5A1F]',
  3: 'bg-[#EAF3EC] text-[#2F5D3A]',
};

function FindingCard({ finding, coachMode }: { finding: FindingView; coachMode: boolean }) {
  return (
    <div className="rounded-2xl border border-[#1B3A2D]/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium text-[#1B3A2D]">{finding.label}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${TIER_BADGE_STYLE[finding.tier]}`}>
          {finding.tierLabel}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#1B3A2D]">{finding.memberSentence}</p>

      {coachMode && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-[#FAFAF8] p-3 text-[11px] text-[#6B7A72] sm:grid-cols-4">
          <div>
            <dt className="text-[#9AA79F]">Observations</dt>
            <dd className="font-medium text-[#1B3A2D]">{finding.observationCount}</dd>
          </div>
          <div>
            <dt className="text-[#9AA79F]">Span</dt>
            <dd className="font-medium text-[#1B3A2D]">{finding.spanDays ?? '-'} days</dd>
          </div>
          <div>
            <dt className="text-[#9AA79F]">Strength (ρ)</dt>
            <dd className="font-medium text-[#1B3A2D]">{finding.rho !== null ? finding.rho.toFixed(2) : '-'}</dd>
          </div>
          <div>
            <dt className="text-[#9AA79F]">Split-window agreement</dt>
            <dd className="font-medium text-[#1B3A2D]">{finding.splitWindowAgreement ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-[#9AA79F]">Lag</dt>
            <dd className="font-medium text-[#1B3A2D]">{finding.lag === 'next_day' ? 'Next day' : 'Same day'}</dd>
          </div>
          <div>
            <dt className="text-[#9AA79F]">Direction</dt>
            <dd className="font-medium text-[#1B3A2D]">{finding.direction ?? '-'}</dd>
          </div>
          <div>
            <dt className="text-[#9AA79F]">Confidence</dt>
            <dd className="font-medium text-[#1B3A2D]">{Math.round(finding.confidence * 100)}%</dd>
          </div>
          <div>
            <dt className="text-[#9AA79F]">Computed</dt>
            <dd className="font-medium text-[#1B3A2D]">{finding.computedAt.slice(0, 10)}</dd>
          </div>
        </dl>
      )}

      {finding.showOverlay && finding.overlay && <OverlayChart overlay={finding.overlay} />}
    </div>
  );
}

export function FindingsList({ findings, coachMode = false }: { findings: FindingView[]; coachMode?: boolean }) {
  if (findings.length === 0) return null;

  return (
    <div className="mef-card space-y-5 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">What&apos;s showing up</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6B7A72]">
          Relationships in your own data, not claims about what&apos;s causing what.
        </p>
      </div>
      <div className="space-y-4">
        {findings.map((f) => (
          <FindingCard key={f.pairKey} finding={f} coachMode={coachMode} />
        ))}
      </div>
    </div>
  );
}
