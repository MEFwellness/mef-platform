'use client';

import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import type { MovementSelectionFactor } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * The "why this session was selected" disclosure — the single most
 * important trust-building surface in Movement Intelligence. Every line
 * comes straight from MovementSession.selection_reasons
 * (lib/movement/rules/engine.ts's buildSelectionReasons), never a canned
 * explanation, so a member can always see exactly which real data point
 * shaped today's session.
 */
export function WhySessionCard({ reasons }: { reasons: MovementSelectionFactor[] }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={`${CARD} p-6`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wider">
            Why this session was selected
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#6B7A72] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul className="mt-4 space-y-3">
          {reasons.map((reason, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F5B700]"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-[#1B3A2D]">{reason.label}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7A72]">{reason.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
