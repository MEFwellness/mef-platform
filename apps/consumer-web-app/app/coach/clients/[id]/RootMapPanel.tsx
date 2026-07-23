/**
 * Coach Dashboard — Root Map (Prompt 10). Coach-only view over the same
 * builder (lib/root-map/) the member's own Root Map uses, extended with
 * exactly what a coach needs and a member shouldn't see in this form: open
 * safety flags, pending reassessments, and the Root Router's logged
 * decision history (member_agency honesty log, migrations 89/90). Same
 * "never a diagnosis, purely presentational" discipline as
 * RootCauseSignalsPanel — nothing here computes anything itself.
 */

import { ShieldAlert } from 'lucide-react';
import type { CoachRootMapView } from '@/app/actions/rootMap';
import { RootMapDomainCard } from '@/components/RootMapDomainCard';
import { findAssessmentRegistryEntry } from '@/lib/assessment-registry/registry';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function displayNameFor(key: string): string {
  return findAssessmentRegistryEntry(key)?.displayName ?? key;
}

export function RootMapPanel({ rootMap }: { rootMap: CoachRootMapView }) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#3E5C46]">
        <p className="text-sm font-semibold uppercase tracking-wider">Root Map</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        The same plain-language per-domain view the member sees, plus safety flags, pending
        reassessments, and Root Router decision history — coaching signals only, never a diagnosis.
      </p>

      {rootMap.restrictedTopics.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#FDEEEE] p-3.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#9B4040]" strokeWidth={1.75} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#9B4040]">Open safety review</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[#9B4040]/90">
              Restricted topics: {rootMap.restrictedTopics.join(', ')}. This member&apos;s Root Map
              is showing suppressed detail until this is resolved.
            </p>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm font-semibold text-[#1B3A2D]">
        {rootMap.routerOutcome.memberMessage}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rootMap.domains.map((domain) => (
          <RootMapDomainCard key={domain.domain} domain={domain} />
        ))}
      </div>

      {rootMap.pendingReassessments.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Upcoming Reassessments</p>
          <ul className="mt-2 space-y-1.5">
            {rootMap.pendingReassessments.map((r) => (
              <li key={r.assessmentKey} className="text-sm text-[#1B3A2D]/80">
                · {r.displayName} — due {new Date(r.dueAt).toLocaleDateString()} ({r.triggerSource})
              </li>
            ))}
          </ul>
        </div>
      )}

      {rootMap.recentRouterDecisions.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Recent Router Decisions</p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {rootMap.recentRouterDecisions.map((d, i) => (
              <li key={i} className="py-2 text-sm text-[#1B3A2D]/80">
                Recommended <span className="font-medium">{displayNameFor(d.recommendedKey)}</span>{' '}
                ({d.recommendedReason.replace(/_/g, ' ')})
                {d.chosenKey && d.chosenKey !== d.recommendedKey && (
                  <> — member chose <span className="font-medium">{displayNameFor(d.chosenKey)}</span> instead</>
                )}
                <span className="ml-1 text-xs text-[#6B7A72]">
                  {new Date(d.decidedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
