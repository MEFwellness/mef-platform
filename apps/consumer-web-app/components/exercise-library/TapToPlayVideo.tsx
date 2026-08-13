'use client';

import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { CuesPlaceholder } from './MediaBadge';
import { VideoPosterPlaceholder } from './VideoPosterPlaceholder';

/**
 * The one place in this app allowed to trigger a Your Move video fetch —
 * strictly on tap, never on mount. Shows the extracted poster with a play
 * button until tapped; only then calls /api/exercises/[id]/video-url
 * (which itself only hits Your Move's metered endpoint on a cache miss)
 * and swaps in a real <video> with the fresh, short-lived URL.
 *
 * A fetch failure here (network error, an exercise the current API key
 * does not cover, anything) falls back to rendering this exercise's
 * generated cues in place of the player, never a broken player or a bare
 * error message. Once a full-access key replaces a limited one, fetches
 * for those exercises simply start succeeding, with no code change.
 *
 * This lived inside ExerciseDetailView until Root Movement Level 1 needed
 * the identical behaviour inside a session player. It was extracted here
 * rather than reimplemented, so there is still exactly one component in
 * the product that can spend Your Move quota, and one place where the
 * poster/cues fallback behaviour is defined.
 *
 * `heightClassName` is the only thing the two call sites disagree about:
 * the detail screen renders a fixed 224px media band, a session player
 * gives the video a taller, aspect-driven stage. Everything else, the
 * fetch, the cache behaviour, the fallbacks, is shared verbatim.
 */
export function TapToPlayVideo({
  externalId,
  name,
  primaryMuscle,
  category,
  posterUrl,
  cues,
  heightClassName = 'h-56',
  autoPlayKey,
}: {
  externalId: string;
  name: string;
  primaryMuscle: string | null;
  category: string | null;
  posterUrl: string | null;
  cues: string[];
  /** Tailwind height for the pre-play surface and the cues fallback. */
  heightClassName?: string;
  /**
   * Changing this resets the player back to its idle, not-yet-fetched
   * state. A session player advancing to the next exercise passes the new
   * exercise id here so the previous clip is torn down and, critically,
   * so the next one is NOT fetched until the member taps play again.
   * Quota is spent by taps, never by advancing.
   */
  autoPlayKey?: string;
}) {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; videoUrl: string }
    | { status: 'error' }
  >({ status: 'idle' });
  const [resetKey, setResetKey] = useState(autoPlayKey);

  // Deriving the reset during render rather than in an effect: the player
  // must never briefly show the previous exercise's video under the new
  // exercise's name.
  if (autoPlayKey !== resetKey) {
    setResetKey(autoPlayKey);
    setState({ status: 'idle' });
  }

  async function handlePlay() {
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/api/exercises/${encodeURIComponent(externalId)}/video-url`);
      const json = await response.json();
      if (!response.ok || !json.videoUrl) {
        setState({ status: 'error' });
        return;
      }
      setState({ status: 'ready', videoUrl: json.videoUrl });
    } catch {
      setState({ status: 'error' });
    }
  }

  if (state.status === 'ready') {
    return (
      <video
        key={state.videoUrl}
        src={state.videoUrl}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="max-h-96 w-full bg-black object-contain"
      />
    );
  }

  // Graceful, no-broken-player fallback — the video genuinely isn't
  // available right now, so show the same coaching cues a no-video
  // exercise would show, instead of a dead play button or an error banner.
  if (state.status === 'error') {
    return (
      <div className={heightClassName}>
        <CuesPlaceholder cues={cues} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={state.status === 'loading'}
      aria-label="Play exercise video"
      className={`relative block w-full ${heightClassName}`}
    >
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own extracted-frame poster, stored in the exercise-media Supabase bucket
        <img src={posterUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <VideoPosterPlaceholder exercise={{ name, primaryMuscle, category }} />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20">
        <PlayCircle className="h-14 w-14 text-white drop-shadow" strokeWidth={1.25} />
        {state.status === 'loading' && (
          <p className="text-xs font-medium text-white">Cueing up your video…</p>
        )}
      </div>
    </button>
  );
}
