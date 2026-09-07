'use client';

/**
 * The one piece of reading The Weight of Yes offers, on its last screen.
 *
 * Same shape as the three Happiness templates beside it and the free arc's
 * before them: the short version is always visible, the full piece expands
 * in place, and nothing navigates away. There is no audio button here,
 * deliberately: no recording of this piece exists, and a control that would
 * sit there dead is a promise the app cannot keep today.
 */

import { useState } from 'react';
import { TWOY_COPY, TWOY_RESOURCE } from '@/lib/the-weight-of-yes/copy';

export function TheWeightOfYesResource() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
        {TWOY_COPY.resourceEyebrow}
      </p>
      <h2 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-[22px] leading-snug text-[#F5F0E4]">
        {TWOY_RESOURCE.title}
      </h2>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-[#F5F0E4]/45">
        {TWOY_RESOURCE.label}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#F5F0E4]/85">{TWOY_RESOURCE.body}</p>

      {expanded ? (
        <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[#F5F0E4]/85">
          {TWOY_RESOURCE.full}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mef-focus-ring mef-press mt-4 inline-flex items-center justify-center rounded-2xl border border-[#F5F0E4]/25 px-5 py-2.5 text-sm font-semibold text-[#F5F0E4] transition hover:bg-[#F5F0E4]/10"
        >
          {TWOY_COPY.resourceReadLabel}
        </button>
      )}
    </section>
  );
}
