'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { STATUS_LABEL, STATUS_STYLES, type MetricStatus } from '@/lib/wellness/status';
import { TestAccountChip } from '@/components/staff/TestAccountChip';
import { formatDisplayDate } from '@/lib/time/displayDate';
import type { ClientTrend } from './lib';

export type ClientListEntry = {
  id: string;
  name: string;
  score: number | null;
  status: MetricStatus;
  trend: ClientTrend;
  lastCheckinDate: string | null;
  hasCheckedInToday: boolean;
  attentionReasons: string[];
  /** `profiles.is_test`. A flagged client is a full client here, and labelled. */
  isTest: boolean;
};

type SortKey = 'lowest' | 'highest' | 'lastCheckin' | 'name' | 'priority';

/** The page's ordinary flat panel, used by the "no matches" state only. */
const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/*
 * A CLIENT CARD IS NOT AN ORDINARY PANEL, so it stopped borrowing the
 * ordinary panel's styling. On a #EFF6F1-to-#FAFAF8 page these were white
 * on near-white with a 10%-opacity shadow and no border: the most
 * important tappable objects on the coach's screen were the least visible
 * things on it. A real border, a deeper resting shadow, a hover lift and
 * `.mef-press` for the tap, which is the treatment this app already uses
 * for a card that navigates.
 *
 * Presentation only. Every field on the card is the field that was there.
 */
const CLIENT_CARD =
  'mef-focus-ring mef-press rounded-[28px] border border-[#1B3A2D]/12 bg-white ' +
  'shadow-[0_6px_20px_-10px_rgba(27,58,45,0.28)] ' +
  'hover:border-[#C4A050]/60 hover:shadow-[0_14px_32px_-12px_rgba(27,58,45,0.34)]';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'priority', label: 'Priority' },
  { key: 'lowest', label: 'Lowest Index' },
  { key: 'highest', label: 'Highest Index' },
  { key: 'lastCheckin', label: 'Last Check-in' },
  { key: 'name', label: 'Name' },
];

function formatDate(localDate: string | null): string {
  if (!localDate) return 'No check-ins yet';
  // A bare YYYY-MM-DD on a staff surface, so formatDisplayDate, not a
  // toLocaleDateString whose timezone nobody named.
  return formatDisplayDate(localDate, { month: 'short', day: 'numeric' });
}

function trendGlyph(trend: ClientTrend): string {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  return '→';
}

/*
 * THE STATUS DOT SAYS WHAT IT MEANS NOW. It was a 10px dot in the corner
 * with `aria-hidden`, so a coach had to already know the color code and a
 * screen reader was told nothing at all. Same four bands, same colors
 * from lib/wellness/status.ts, with the label that file already holds
 * printed beside the dot. No new status vocabulary was invented here.
 */
function StatusChip({ status }: { status: MetricStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status].bg} ${STATUS_STYLES[status].text}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_STYLES[status].dot}`}
        aria-hidden="true"
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function sortClients(clients: ClientListEntry[], sortKey: SortKey): ClientListEntry[] {
  const list = [...clients];
  switch (sortKey) {
    case 'lowest':
      return list.sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
    case 'highest':
      return list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    case 'lastCheckin':
      return list.sort((a, b) => (b.lastCheckinDate ?? '').localeCompare(a.lastCheckinDate ?? ''));
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'priority':
    default:
      return list.sort((a, b) => {
        if (b.attentionReasons.length !== a.attentionReasons.length) {
          return b.attentionReasons.length - a.attentionReasons.length;
        }
        return (a.score ?? 100) - (b.score ?? 100);
      });
  }
}

export function ClientListPanel({ clients }: { clients: ClientListEntry[] }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('priority');

  const visible = useMemo(() => {
    const filtered = clients.filter((c) =>
      c.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    return sortClients(filtered, sortKey);
  }, [clients, query, sortKey]);

  return (
    <div className="mt-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients by name"
            aria-label="Search clients by name"
            className="w-full rounded-full border border-[#1B3A2D]/10 bg-white py-2.5 pl-9 pr-4 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#6B7A72]">
          Sort by
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="rounded-full border border-[#1B3A2D]/10 bg-white px-3 py-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className={`${CARD} mt-3 p-6`}>
          <p className="text-sm text-[#6B7A72]">No clients match &quot;{query}&quot;.</p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((client) => (
            <Link
              key={client.id}
              href={`/coach/clients/${client.id}`}
              data-client-card="true"
              className={`${CLIENT_CARD} flex flex-col p-5`}
            >
              {/* The name is the anchor of the card, so it is the largest
                  and heaviest thing in the top row rather than the same
                  size as the caption under it. The status chip sits beside
                  it and does not shrink. */}
              <div className="flex items-start justify-between gap-3">
                <p className="flex flex-wrap items-center gap-2 text-lg font-bold leading-snug tracking-tight text-[#1B3A2D]">
                  {client.name}
                  {client.isTest ? <TestAccountChip /> : null}
                </p>
                <StatusChip status={client.status} />
              </div>

              {/* THE SCORE IS THE FOCAL POINT. It was a bare number on
                  white at the same visual weight as the line beneath it.
                  It is now set on its own tinted block in the band's own
                  brand color, and a client with no score gets the same
                  block saying so, so the cards keep one rhythm instead of
                  collapsing to different heights. */}
              <div
                className={`mt-4 flex items-baseline gap-2 rounded-2xl px-4 py-3 ${STATUS_STYLES[client.score !== null ? client.status : 'no-data'].bg}`}
              >
                {client.score !== null ? (
                  <>
                    <span
                      className={`font-[family-name:var(--font-cormorant-garamond)] text-[2.75rem] font-semibold leading-none ${STATUS_STYLES[client.status].text}`}
                    >
                      {client.score}
                    </span>
                    <span className="text-xs font-medium text-[#6B7A72]">/ 100</span>
                    <span
                      className="ml-auto text-base text-[#6B7A72]"
                      aria-label={`Trend: ${client.trend}`}
                    >
                      {trendGlyph(client.trend)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-[#1B3A2D]/70">No score yet</span>
                )}
              </div>

              {/* Same sentence as before, word for word, as a chip rather
                  than a grey caption floating under the number. */}
              <span className="mt-3 inline-flex w-fit items-center rounded-full bg-[#F3F6F4] px-2.5 py-1 text-[11px] font-medium text-[#1B3A2D]/70">
                {client.hasCheckedInToday
                  ? 'Checked in today'
                  : `Last check-in: ${formatDate(client.lastCheckinDate)}`}
              </span>

              {client.attentionReasons.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {client.attentionReasons.slice(0, 2).map((reason) => (
                    <span
                      key={reason}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES.poor.bg} ${STATUS_STYLES.poor.text}`}
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
