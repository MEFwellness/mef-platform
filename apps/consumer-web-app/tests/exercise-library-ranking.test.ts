import { describe, it, expect } from 'vitest';
import { getExerciseMediaTier, rankByMediaAvailability } from '../lib/exercise-library/ranking';

type Media = { hasVideo: boolean; cues: string[] };

function withMedia(name: string, media: Media): Media & { name: string } {
  return { name, ...media };
}

describe('getExerciseMediaTier', () => {
  it('returns "video" when hasVideo is true, regardless of cues — hasVideo, not videoUrl, since Your Move video is fetched at play time and has no eager URL', () => {
    expect(getExerciseMediaTier({ hasVideo: true, cues: [] })).toBe('video');
    expect(getExerciseMediaTier({ hasVideo: true, cues: ['a'] })).toBe('video');
  });

  it('returns "cues" when only cues are present', () => {
    expect(getExerciseMediaTier({ hasVideo: false, cues: ['Stand tall'] })).toBe('cues');
  });

  it('returns "none" when neither is present', () => {
    expect(getExerciseMediaTier({ hasVideo: false, cues: [] })).toBe('none');
  });
});

describe('rankByMediaAvailability', () => {
  it('groups video > cues > no-media without hiding any exercise', () => {
    const input = [
      withMedia('no-media-1', { hasVideo: false, cues: [] }),
      withMedia('video-1', { hasVideo: true, cues: [] }),
      withMedia('cues-1', { hasVideo: false, cues: ['a'] }),
      withMedia('no-media-2', { hasVideo: false, cues: [] }),
      withMedia('video-2', { hasVideo: true, cues: [] }),
    ];

    const ranked = rankByMediaAvailability(input);

    expect(ranked).toHaveLength(input.length);
    expect(ranked.map((e) => e.name)).toEqual(['video-1', 'video-2', 'cues-1', 'no-media-1', 'no-media-2']);
  });

  it('is a stable sort — preserves original relevance order within each media tier', () => {
    const input = [
      withMedia('video-b', { hasVideo: true, cues: [] }),
      withMedia('video-a', { hasVideo: true, cues: [] }),
      withMedia('none-b', { hasVideo: false, cues: [] }),
      withMedia('none-a', { hasVideo: false, cues: [] }),
    ];

    const ranked = rankByMediaAvailability(input);

    // Relevance order ("-b" before "-a") is untouched within each tier —
    // only the tiers themselves were reordered.
    expect(ranked.map((e) => e.name)).toEqual(['video-b', 'video-a', 'none-b', 'none-a']);
  });

  it('does not mutate the input array', () => {
    const input = [withMedia('a', { hasVideo: false, cues: [] })];
    const ranked = rankByMediaAvailability(input);
    expect(ranked).not.toBe(input);
  });
});
