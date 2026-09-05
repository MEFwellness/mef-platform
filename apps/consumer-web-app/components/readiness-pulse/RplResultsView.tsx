'use client';

import { useState } from 'react';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import {
  buildEvidenceEchoLine,
  buildRplWhatRootLearned,
  RPL_RESOURCE_AUDIO_SRC,
  RPL_RESOURCE_FULL_PIECE,
  RPL_RESOURCE_SUMMARY,
  type EvidenceEchoContext,
} from '@/lib/readiness-pulse/copy';
import { READINESS_PATTERN_LABEL } from '@/lib/readiness-pulse/constants';
import type { RplScoring } from '@/lib/readiness-pulse/types';

/** "Here's what Root learned" — mirrors Life Signal Check's own WhatRootLearnedSection exactly: the pattern statement plus its conditional overlays (the derived-vs-pick divergence, Question 8's comparison, the Q3/Q9 surprise beat, and Evidence Echo when it fires). */
export function WhatRootLearnedSection({ scoring, evidenceEcho }: { scoring: RplScoring; evidenceEcho: EvidenceEchoContext | null }) {
  const learned = buildRplWhatRootLearned(scoring);

  return (
    <div className={`${CVS_CARD} mef-animate-in p-7`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Here&apos;s what Root learned</p>
      <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{learned}</p>

      <div className="mt-6 rounded-2xl bg-[#F5F0E4] p-5">
        <p className={`${CVS_DISPLAY_FONT} text-lg text-[#1B3A2D]`}>{READINESS_PATTERN_LABEL[scoring.finalPattern]}</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Every readiness level, including not yet, is a legitimate answer, and gets a legitimate next step.
        </p>
      </div>

      {evidenceEcho && (
        <p className="mt-5 rounded-2xl border border-[#C4A050]/30 bg-[#FDF9EF] p-5 text-[15px] leading-relaxed text-[#1B3A2D]">
          {buildEvidenceEchoLine(evidenceEcho)}
        </p>
      )}
    </div>
  );
}

export function ResourceSection({ audioAvailable }: { audioAvailable: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);

  return (
    <div className={`${CVS_CARD} mef-animate-in p-7`}>
      <h2 className={`${CVS_DISPLAY_FONT} text-2xl leading-snug text-[#1B3A2D]`}>{RPL_RESOURCE_SUMMARY.title}</h2>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{RPL_RESOURCE_SUMMARY.label}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{RPL_RESOURCE_SUMMARY.body}</p>

      {expanded && (
        <p className="mef-animate-in mt-5 whitespace-pre-line text-[15px] leading-relaxed text-[#1B3A2D]">{RPL_RESOURCE_FULL_PIECE}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mef-focus-ring rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {RPL_RESOURCE_SUMMARY.readButtonLabel}
          </button>
        )}
        {audioAvailable && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="mef-focus-ring rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {playing ? 'Pause' : RPL_RESOURCE_SUMMARY.listenButtonLabel}
          </button>
        )}
      </div>

      {audioAvailable && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio src={RPL_RESOURCE_AUDIO_SRC} className="mt-4 w-full" controls={playing} autoPlay={playing} onEnded={() => setPlaying(false)} />
      )}
    </div>
  );
}
