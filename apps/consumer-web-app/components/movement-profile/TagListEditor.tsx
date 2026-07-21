'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

/** A small freeform tag list — add via text input + Enter/button, remove via the chip's own X. Used for the Movement Profile's member-controlled text[] fields (goals, mobility/stability/strength priorities), which have no fixed vocabulary. */
export function TagListEditor({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const trimmed = draft.trim();
    if (!trimmed || values.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="flex items-center gap-1.5 rounded-full bg-[#EFF6F1] px-3 py-1.5 text-xs font-medium text-[#1B3A2D]"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((v) => v !== value))}
              aria-label={`Remove ${value}`}
              className="text-[#1B3A2D]/50 hover:text-[#1B3A2D]"
            >
              <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="w-full flex-1 rounded-full border border-[#1B3A2D]/15 bg-white px-4 py-2 text-base text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
        />
        <button
          type="button"
          onClick={addTag}
          aria-label={`Add to ${label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06] text-[#1B3A2D] transition hover:bg-[#1B3A2D]/10"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
