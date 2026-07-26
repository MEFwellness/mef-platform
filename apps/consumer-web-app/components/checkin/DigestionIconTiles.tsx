'use client';

/** Morning's digestion (bowel_movement_status) — "small icons beneath, quick and unfussy" instead of a pill row. */

import { CheckCircle2, PauseCircle, Droplets, XCircle, type LucideIcon } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

const ICON_BY_VALUE: Record<string, LucideIcon> = {
  normal: CheckCircle2,
  constipated: PauseCircle,
  loose: Droplets,
  none: XCircle,
};

export function DigestionIconTiles({
  question,
  options,
  value,
  onChange,
}: {
  question: string;
  options: readonly { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-[13px] leading-relaxed text-[#6B7A72]">{question}</p>
      <div className="mt-3 flex w-full gap-2" role="group" aria-label={question}>
        {options.map((option) => {
          const Icon = ICON_BY_VALUE[option.value] ?? CheckCircle2;
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                triggerHaptic();
                onChange(option.value);
              }}
              aria-pressed={isSelected}
              className={`mef-press flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border py-3 transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-[1.02] border-transparent bg-[#1B3A2D] shadow-[0_4px_16px_-4px_rgba(27,58,45,0.4)]'
                  : 'border-[#1B3A2D]/10 bg-white'
              }`}
            >
              <Icon
                className="h-5 w-5"
                strokeWidth={1.75}
                color={isSelected ? '#FFFFFF' : '#1B3A2D'}
                aria-hidden="true"
              />
              <span
                className={`whitespace-normal break-words text-center text-[10px] font-medium leading-tight ${
                  isSelected ? 'text-white' : 'text-[#1B3A2D]/75'
                }`}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
