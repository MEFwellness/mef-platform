'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/** Shared accordion shell for every right-panel section. Expand/collapse is a pure CSS grid-rows transition (0fr -> 1fr) so no JS height measurement is needed. */
export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-[#854D0E]" strokeWidth={1.75} aria-hidden />}
          <span className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            {title}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {badge}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#6B7A72] transition-transform duration-300 ${
              open ? 'rotate-180' : ''
            }`}
            strokeWidth={1.75}
            aria-hidden
          />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
