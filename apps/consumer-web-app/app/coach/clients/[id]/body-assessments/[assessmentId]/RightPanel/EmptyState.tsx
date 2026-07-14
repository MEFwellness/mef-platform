import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="mef-animate-in flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1B3A2D]/[0.05] text-[#1B3A2D]/40">
        <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="text-sm font-medium text-[#1B3A2D]">{title}</p>
      {description && <p className="max-w-[220px] text-xs text-[#6B7A72]">{description}</p>}
    </div>
  );
}
