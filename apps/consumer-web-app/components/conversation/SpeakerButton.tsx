'use client';

/**
 * Play/pause/resume/stop/replay control for a single Root reply
 * (part 2/3/4). Built entirely on hooks/useTextToSpeech.ts — never touches
 * the underlying speech provider directly. Renders nothing at all when
 * the browser can't play back at all (no speechSynthesis AND no Audio
 * element support — vanishingly rare, but this component chooses hide
 * over a permanently-disabled icon with no path to ever working).
 *
 * The loading spinner and inline retry row are part 4's "make the freeze
 * visible instead of silent": a slow or failed request now shows a clear
 * state and a way out, rather than a button that looks idle while
 * something is stuck (or silently never recovers) behind it.
 */

import { Volume2, Pause, Play, Square, Loader2, RotateCcw } from 'lucide-react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

export function SpeakerButton({ id, text }: { id: string; text: string }) {
  const { status, isSupported, isActive, play, pause, resume, stop, retry, errorMessage } =
    useTextToSpeech(id, text);

  if (!isSupported) return null;

  const loading = isActive && status === 'loading';
  const playing = isActive && status === 'playing';
  const paused = isActive && status === 'paused';
  const errored = isActive && status === 'error';

  function handleClick() {
    if (loading) return;
    if (playing) {
      pause();
    } else if (paused) {
      resume();
    } else {
      play();
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          aria-label={
            loading
              ? 'Loading coach reply audio'
              : playing
                ? 'Pause coach reply'
                : paused
                  ? 'Resume coach reply'
                  : 'Play coach reply aloud'
          }
          aria-pressed={playing}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] disabled:opacity-60 ${
            playing || paused || loading
              ? 'bg-[#1B3A2D] text-white'
              : 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/[0.12]'
          }`}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
          ) : playing ? (
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
        {errored && (
          <button
            type="button"
            onClick={retry}
            className="flex items-center gap-1 rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.12]"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            Try again
          </button>
        )}
        {isActive && (playing || paused || loading) && (
          <span className="text-[11px] font-medium text-[#6B7A72]" aria-live="polite">
            {loading ? 'Loading…' : playing ? 'Playing…' : 'Paused'}
          </span>
        )}
      </div>
      {isActive && errorMessage && (
        <p className="text-[11px] text-[#6B7A72]" role="status">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
