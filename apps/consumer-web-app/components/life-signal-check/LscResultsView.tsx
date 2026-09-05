'use client';

import { useState } from 'react';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { LoudnessVisual } from './LoudnessVisual';
import {
  buildLoudnessVisualRows,
  buildLscEchoLine,
  buildLscKeyInsightCopy,
  buildLscQ1ContrastLine,
  buildLscWhatRootLearned,
  LSC_RESOURCE_AUDIO_SRC,
  LSC_RESOURCE_FULL_PIECE,
  LSC_RESOURCE_SUMMARY,
  LSC_SURPRISE_LINE,
} from '@/lib/life-signal-check/copy';
import type { LscScoring } from '@/lib/life-signal-check/types';

/** "Here's what Root learned" + the loudness visual + key insight, plus the two conditional overlays (Body-Value Echo, the surprise beat) — mirrors Core Values Snapshot's own WhatRootLearnedSection exactly. */
export function WhatRootLearnedSection({ scoring }: { scoring: LscScoring }) {
  const learned = buildLscWhatRootLearned(scoring);
  const rows = buildLoudnessVisualRows(scoring);
  const keyInsight = buildLscKeyInsightCopy(scoring);
  const q1Contrast = buildLscQ1ContrastLine(scoring);

  return (
    <div className={`${CVS_CARD} mef-animate-in p-7`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Here&apos;s what Root learned</p>
      <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{learned}</p>

      <LoudnessVisual rows={rows} />

      <div className="mt-6 rounded-2xl bg-[#F5F0E4] p-5">
        <p className={`${CVS_DISPLAY_FONT} text-lg text-[#1B3A2D]`}>{keyInsight.topLine}</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{keyInsight.footer}</p>
      </div>

      {q1Contrast && (
        <p className="mt-5 rounded-2xl border border-[#1B3A2D]/10 bg-[#F3F6F4] p-5 text-[15px] leading-relaxed text-[#1B3A2D]">
          {q1Contrast}
        </p>
      )}

      {scoring.echoFires && (
        <p className="mt-5 rounded-2xl border border-[#C4A050]/30 bg-[#FDF9EF] p-5 text-[15px] leading-relaxed text-[#1B3A2D]">
          {buildLscEchoLine(scoring)}
        </p>
      )}

      {scoring.surpriseFires && (
        <p className="mt-5 rounded-2xl border border-[#C4A050]/30 bg-[#FDF9EF] p-5 text-[15px] leading-relaxed text-[#1B3A2D]">
          {LSC_SURPRISE_LINE}
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
      <h2 className={`${CVS_DISPLAY_FONT} text-2xl leading-snug text-[#1B3A2D]`}>{LSC_RESOURCE_SUMMARY.title}</h2>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{LSC_RESOURCE_SUMMARY.label}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{LSC_RESOURCE_SUMMARY.body}</p>

      {expanded && (
        <p className="mef-animate-in mt-5 whitespace-pre-line text-[15px] leading-relaxed text-[#1B3A2D]">
          {LSC_RESOURCE_FULL_PIECE}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mef-focus-ring rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {LSC_RESOURCE_SUMMARY.readButtonLabel}
          </button>
        )}
        {audioAvailable && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="mef-focus-ring rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {playing ? 'Pause' : LSC_RESOURCE_SUMMARY.listenButtonLabel}
          </button>
        )}
      </div>

      {audioAvailable && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          src={LSC_RESOURCE_AUDIO_SRC}
          className="mt-4 w-full"
          controls={playing}
          autoPlay={playing}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}
