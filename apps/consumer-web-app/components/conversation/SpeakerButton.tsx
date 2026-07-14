'use client';

/**
 * Play/pause/resume/stop/replay control for a single MEF Coach reply
 * (part 2). Built entirely on hooks/useTextToSpeech.ts — never touches
 * `window.speechSynthesis` directly. Renders nothing at all when the
 * browser doesn't support playback (part 2's "if browser speech playback
 * is unsupported, hide or disable the control gracefully" — this
 * component chooses hide, since a permanently-disabled icon with no path
 * to ever working is just visual noise).
 */

import { Volume2, Pause, Play, Square } from 'lucide-react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

export function SpeakerButton({ id, text }: { id: string; text: string }) {
  const { status, isSupported, isActive, play, pause, resume, stop } = useTextToSpeech(id, text);

  if (!isSupported) return null;

  const playing = isActive && status === 'playing';
  const paused = isActive && status === 'paused';

  function handleClick() {
    if (playing) {
      pause();
    } else if (paused) {
      resume();
    } else {
      play();
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        aria-label={
          playing ? 'Pause coach reply' : paused ? 'Resume coach reply' : 'Play coach reply aloud'
        }
        aria-pressed={playing}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] ${
          playing || paused
            ? 'bg-[#1B3A2D] text-white'
            : 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/[0.12]'
        }`}
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        ) : paused ? (
          <Play className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
      {(playing || paused) && (
        <button
          type="button"
          onClick={stop}
          aria-label="Stop playback"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#1B3A2D]/50 transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
        >
          <Square className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
      {isActive && (playing || paused) && (
        <span className="text-[11px] font-medium text-[#6B7A72]" aria-live="polite">
          {playing ? 'Playing…' : 'Paused'}
        </span>
      )}
    </div>
  );
}
