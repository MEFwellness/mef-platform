/**
 * Root Map — "Building" compact row (Root Map redesign, 2026-07-28, Part
 * 4). Instrumented domains with no earned finding yet: name, one-line
 * description, coverage count — never a full-height card, never the
 * "still learning" paragraph (that duplication only ever existed for
 * exactly this state; dropping it here removes it rather than
 * reformatting it).
 */

import { buildBuildingRowViewModel, type DomainCoverage, type RootMapDomainView } from '@/lib/root-map';
import { domainAnchorId } from '@/lib/root-map/anchors';

export function RootMapBuildingRow({
  domain,
  coverage,
}: {
  domain: RootMapDomainView;
  coverage: DomainCoverage | null;
}) {
  const view = buildBuildingRowViewModel(domain, coverage);

  return (
    <div
      id={domainAnchorId(domain.domain)}
      className="flex scroll-mt-24 items-start justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#1B3A2D]">{view.label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">{view.memberDescription}</p>
      </div>
      {view.coverageLabel && (
        <span className="shrink-0 whitespace-nowrap rounded-full bg-[#F3F6F4] px-2.5 py-1 text-xs font-medium text-[#6B7A72]">
          {view.coverageLabel}
        </span>
      )}
    </div>
  );
}
