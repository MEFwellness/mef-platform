/**
 * Root Map — "What We're Seeing" full card (Root Map redesign,
 * 2026-07-28, Part 4/Part 2). One per domain with a real earned finding
 * (`whatWeUnderstand.length > 0`). Renders `buildFindingCardViewModel`'s
 * output directly — `stateMessage` appears exactly once, and `nextStep`
 * is only rendered when the view model already determined it says
 * something different from `stateMessage`, so this component structurally
 * cannot render the same sentence twice.
 */

import { buildFindingCardViewModel, type DomainCoverage, type RootMapDomainView } from '@/lib/root-map';
import { domainAnchorId } from '@/lib/root-map/anchors';

export function RootMapFindingCard({
  domain,
  coverage,
}: {
  domain: RootMapDomainView;
  coverage: DomainCoverage | null;
}) {
  const view = buildFindingCardViewModel(domain, coverage);

  return (
    <section id={domainAnchorId(domain.domain)} className="mef-card scroll-mt-24 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#1B3A2D]">{view.label}</p>
        {view.coverageLabel && (
          <span className="shrink-0 rounded-full bg-[#FDF2E3] px-2.5 py-1 text-xs font-medium text-[#8A5A1F]">
            {view.coverageLabel}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">{view.memberDescription}</p>

      {view.findings.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            What We&apos;re Seeing
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {view.findings.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-sm leading-relaxed text-[#1B3A2D]/80">{view.stateMessage}</p>

      {view.nextStep && (
        <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            {view.nextStep.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{view.nextStep.body}</p>
        </div>
      )}
    </section>
  );
}
