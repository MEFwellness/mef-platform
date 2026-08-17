/**
 * One domain row inside the Root Score detail experience — score or
 * baseline state, direction of change, a one-line explanation, and a
 * link to the relevant feature (never a dead route: every domain here
 * maps to a real, already-shipping destination — see lib/scoring/copy.ts).
 */

import Link from 'next/link';
import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { DomainScore } from '@mef/shared-types-contracts';
import { scoreToStatus } from '@/lib/wellness/wellness-index';
import { STATUS_STYLES } from '@/lib/wellness/status';
import { DOMAIN_COPY } from '@/lib/scoring/copy';

/**
 * Trust cleanup, 2026-08-17: this row no longer prints a per-domain
 * confidence label. Five of these reading "Building" sat directly under a
 * roll-up that read "High confidence", computed a different way, under the
 * same word. `domain.confidence_level` still exists and is still computed
 * (lib/scoring/domains.ts); nothing renders it to a member until the two
 * calculations mean the same thing.
 *
 * "Building" was the one entry here that described the member's data rather
 * than our certainty about it, so it is the one that stays, said plainly.
 */
const BASELINE_NOTE = 'Still building';

function DirectionIcon({ direction }: { direction: DomainScore['direction'] }) {
  if (direction === 'improving')
    return <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />;
  if (direction === 'declining')
    return <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />;
  if (direction === 'stable')
    return <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />;
  return null;
}

export function RootScoreDomainRow({ domain }: { domain: DomainScore }) {
  const copy = DOMAIN_COPY[domain.domain];
  const status = domain.score !== null ? scoreToStatus(domain.score) : 'no-data';

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[#1B3A2D]">{domain.label}</p>
          {domain.direction !== 'unknown' && (
            <span className={`inline-flex items-center gap-0.5 ${STATUS_STYLES[status].text}`}>
              <DirectionIcon direction={domain.direction} />
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">{domain.explanation}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {domain.confidence_level === 'building' && (
            <span className="text-xs text-[#1B3A2D]/50">{BASELINE_NOTE}</span>
          )}
          <Link
            href={copy.linkHref}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-[#1B3A2D] hover:underline"
          >
            {copy.linkLabel}
            <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {domain.score !== null ? (
          <span className={`text-2xl font-semibold ${STATUS_STYLES[status].text}`}>
            {domain.score}
          </span>
        ) : (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES['no-data'].bg} ${STATUS_STYLES['no-data'].text}`}
          >
            No data yet
          </span>
        )}
      </div>
    </div>
  );
}
