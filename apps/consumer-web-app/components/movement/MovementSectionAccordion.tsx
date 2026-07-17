'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MovementSessionSection } from '@mef/shared-types-contracts';
import { MOVEMENT_SESSION_SECTION_LABEL } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function MovementSectionAccordion({
  section,
  exerciseCount,
  completedCount,
  defaultOpen = false,
  children,
}: {
  section: MovementSessionSection;
  exerciseCount: number;
  completedCount: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={CARD}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-6 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-cormorant-garamond)] text-xl text-[#1B3A2D]">
            {MOVEMENT_SESSION_SECTION_LABEL[section]}
          </span>
          <span className="text-xs font-medium text-[#6B7A72]">
            {completedCount}/{exerciseCount}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#6B7A72] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open && <div className="space-y-4 px-6 pb-6">{children}</div>}
    </section>
  );
}
