'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronRight } from 'lucide-react';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function CorrectiveMemberPickerPanel({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState('');

  const visible = useMemo(
    () => clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())),
    [clients, query]
  );

  return (
    <div>
      <div className="relative">
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

      {visible.length === 0 ? (
        <div className={`${CARD} mt-3 p-6`}>
          <p className="text-sm text-[#6B7A72]">No clients match &quot;{query}&quot;.</p>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-[#1B3A2D]/5 overflow-hidden rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
          {visible.map((client) => (
            <Link
              key={client.id}
              href={`/coach/corrective-programs/${client.id}`}
              className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-[#EFF6F1]"
            >
              <span className="text-sm font-medium text-[#1B3A2D]">{client.name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
