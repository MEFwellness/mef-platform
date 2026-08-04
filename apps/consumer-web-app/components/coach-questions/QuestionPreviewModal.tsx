'use client';

/**
 * Live preview using the real member-facing DriverProbeField — "so what
 * is on this screen is exactly what a member sees" (task requirement 6),
 * not a redrawn mock-up that could quietly drift from the real thing.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { DriverProbeField, type ProbeAnswerValue } from '@/components/checkin/DriverProbeField';
import type { DriverProbeQuestion } from '@/lib/daily-checkin-adaptive/types';

export function QuestionPreviewModal({
  question,
  onClose,
}: {
  question: DriverProbeQuestion;
  onClose: () => void;
}) {
  const [value, setValue] = useState<ProbeAnswerValue | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-[28px] bg-white p-6 shadow-xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Member preview: {question.screen === 'morning' ? 'Daily Reset' : 'Evening Reflection'}
          </p>
          <button type="button" onClick={onClose} aria-label="Close preview">
            <X className="h-5 w-5 text-[#6B7A72]" />
          </button>
        </div>
        <div className="mt-5">
          <DriverProbeField question={question} value={value} onChange={setValue} />
        </div>
        <p className="mt-5 text-xs text-[#6B7A72]">
          This is the exact component members see. Tapping an option here doesn&apos;t save anything.
        </p>
      </div>
    </div>
  );
}
