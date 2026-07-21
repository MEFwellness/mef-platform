import { describe, it, expect } from 'vitest';
import { getExerciseMediaTier, rankByMediaAvailability } from '../lib/exercise-library/ranking';

type Media = { videoUrl: string | null; imageUrl: string | null };

function withMedia(name: string, media: Media): Media & { name: string } {
  return { name, ...media };
}

describe('getExerciseMediaTier', () => {
  it('returns "video" when a videoUrl is present, regardless of imageUrl', () => {
    expect(getExerciseMediaTier({ videoUrl: 'https://x/video.mp4', imageUrl: null })).toBe('video');
    expect(
      getExerciseMediaTier({ videoUrl: 'https://x/video.mp4', imageUrl: 'https://x/img.jpg' })
    ).toBe('video');
  });

  it('returns "image" when only imageUrl is present', () => {
    expect(getExerciseMediaTier({ videoUrl: null, imageUrl: 'https://x/img.jpg' })).toBe('image');
  });

  it('returns "none" when neither is present', () => {
    expect(getExerciseMediaTier({ videoUrl: null, imageUrl: null })).toBe('none');
  });
});

describe('rankByMediaAvailability', () => {
  it('groups video > image > no-media without hiding any exercise', () => {
    const input = [
      withMedia('no-media-1', { videoUrl: null, imageUrl: null }),
      withMedia('video-1', { videoUrl: 'v1', imageUrl: null }),
      withMedia('image-1', { videoUrl: null, imageUrl: 'i1' }),
      withMedia('no-media-2', { videoUrl: null, imageUrl: null }),
      withMedia('video-2', { videoUrl: 'v2', imageUrl: null }),
    ];

    const ranked = rankByMediaAvailability(input);

    expect(ranked).toHaveLength(input.length);
    expect(ranked.map((e) => e.name)).toEqual([
      'video-1',
      'video-2',
      'image-1',
      'no-media-1',
      'no-media-2',
    ]);
  });

  it('is a stable sort — preserves original relevance order within each media tier', () => {
    const input = [
      withMedia('video-b', { videoUrl: 'v', imageUrl: null }),
      withMedia('video-a', { videoUrl: 'v', imageUrl: null }),
      withMedia('none-b', { videoUrl: null, imageUrl: null }),
      withMedia('none-a', { videoUrl: null, imageUrl: null }),
    ];

    const ranked = rankByMediaAvailability(input);

    // Relevance order ("-b" before "-a") is untouched within each tier —
    // only the tiers themselves were reordered.
    expect(ranked.map((e) => e.name)).toEqual(['video-b', 'video-a', 'none-b', 'none-a']);
  });

  it('does not mutate the input array', () => {
    const input = [withMedia('a', { videoUrl: null, imageUrl: null })];
    const ranked = rankByMediaAvailability(input);
    expect(ranked).not.toBe(input);
  });
});
