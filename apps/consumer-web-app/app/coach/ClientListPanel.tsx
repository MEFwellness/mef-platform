'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { STATUS_STYLES, type MetricStatus } from '@/lib/wellness/status';
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
};

type SortKey = 'lowest' | 'highest' | 'lastCheckin' | 'name' | 'priority';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'priority', label: 'Priority' },
  { key: 'lowest', label: 'Lowest Index' },
  { key: 'highest', label: 'Highest Index' },
  { key: 'lastCheckin', label: 'Last Check-in' },
  { key: 'name', label: 'Name' },
];

function formatDate(localDate: string | null): string {
  if (!localDate) return 'No check-ins yet';
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function trendGlyph(trend: ClientTrend): string {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  return '→';
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
              className={`${CARD} flex flex-col p-5 transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-semibold text-[#1B3A2D]">{client.name}</p>
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_STYLES[client.status].dot}`}
                  aria-hidden="true"
                />
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                {client.score !== null ? (
                  <>
                    <span
                      className={`font-[family-name:var(--font-cormorant-garamond)] text-3xl ${STATUS_STYLES[client.status].text}`}
                    >
                      {client.score}
                    </span>
                    <span className="text-xs text-[#6B7A72]">/ 100</span>
                    <span
                      className="ml-1 text-sm text-[#6B7A72]"
                      aria-label={`Trend: ${client.trend}`}
                    >
                      {trendGlyph(client.trend)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-[#1B3A2D]/70">No score yet</span>
                )}
              </div>

              <p className="mt-2 text-xs text-[#6B7A72]">
                {client.hasCheckedInToday
                  ? 'Checked in today'
                  : `Last check-in: ${formatDate(client.lastCheckinDate)}`}
              </p>

              {client.attentionReasons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {client.attentionReasons.slice(0, 2).map((reason) => (
                    <span
                      key={reason}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES.poor.bg} ${STATUS_STYLES.poor.text}`}
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
