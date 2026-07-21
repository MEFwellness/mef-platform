'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

/** A comma/enter-delimited chip input for the template's tag arrays (equipment, program tags, corrective tags, movement tags, target muscles). Deliberately not a dropdown/autocomplete — these are coach-authored free-text tags, same "coach curation, no fixed taxonomy" posture as mef_exercise_metadata's own tag columns. */
export function TagListInput({
  label,
  values,
  onChange,
  placeholder = 'Type and press Enter…',
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft('');
  }

  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-[#6B7A72]">
      {label}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-2.5">
        {values.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-[#1B3A2D]/[0.08] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(values.filter((v) => v !== tag))}
              aria-label={`Remove ${tag}`}
              className="text-[#1B3A2D]/50 hover:text-[#1B3A2D]"
            >
              <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-[#1B3A2D] focus:outline-none"
        />
      </div>
    </label>
  );
}
