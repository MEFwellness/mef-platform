import { describe, it, expect } from 'vitest';
import {
  computeFrameQualityStats,
  evaluateFrameQuality,
} from '../lib/body-assessment/frameQuality';

/** Builds a flat RGBA buffer for a width x height sample, one solid gray value everywhere. */
function solidSample(width: number, height: number, gray: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    data[i + 3] = 255;
  }
  return data;
}

/** Builds an RGBA buffer with a sharp checkerboard pattern — strong, varied edge response. */
function checkerboardSample(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = (x + y) % 2 === 0 ? 20 : 235;
      data[idx] = gray;
      data[idx + 1] = gray;
      data[idx + 2] = gray;
      data[idx + 3] = 255;
    }
  }
  return data;
}

describe('computeFrameQualityStats', () => {
  it('reports zero sharpness and the flat luminance for a perfectly uniform sample', () => {
    const stats = computeFrameQualityStats({
      data: solidSample(16, 16, 120),
      width: 16,
      height: 16,
    });
    expect(stats.sharpnessScore).toBe(0);
    expect(stats.meanLuminance).toBeCloseTo(120, 0);
  });

  it('reports high sharpness for a high-frequency checkerboard sample', () => {
    const stats = computeFrameQualityStats({
      data: checkerboardSample(16, 16),
      width: 16,
      height: 16,
    });
    expect(stats.sharpnessScore).toBeGreaterThan(1000);
  });

  it('degrades gracefully on too-small input', () => {
    const stats = computeFrameQualityStats({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
    expect(stats.sharpnessScore).toBe(0);
    expect(stats.meanLuminance).toBe(0);
  });
});

describe('evaluateFrameQuality', () => {
  it('passes a sharp, well-lit sample', () => {
    const result = evaluateFrameQuality({ sharpnessScore: 5000, meanLuminance: 140 });
    expect(result.status).toBe('ready');
    expect(result.ok).toBe(true);
  });

  it('flags a dark frame as poor_lighting', () => {
    const result = evaluateFrameQuality({ sharpnessScore: 5000, meanLuminance: 10 });
    expect(result.status).toBe('poor_lighting');
    expect(result.ok).toBe(false);
  });

  it('flags a blown-out frame as poor_lighting', () => {
    const result = evaluateFrameQuality({ sharpnessScore: 5000, meanLuminance: 253 });
    expect(result.status).toBe('poor_lighting');
  });

  it('flags a low-edge-energy frame as blurry_frame', () => {
    const result = evaluateFrameQuality({ sharpnessScore: 0.5, meanLuminance: 140 });
    expect(result.status).toBe('blurry_frame');
  });

  it('checks lighting before sharpness so a dark AND blurry frame reports lighting first', () => {
    const result = evaluateFrameQuality({ sharpnessScore: 0, meanLuminance: 5 });
    expect(result.status).toBe('poor_lighting');
  });

  it('returns a non-empty speakable message on every failure', () => {
    expect(
      evaluateFrameQuality({ sharpnessScore: 0.5, meanLuminance: 140 }).message.length
    ).toBeGreaterThan(0);
    expect(
      evaluateFrameQuality({ sharpnessScore: 5000, meanLuminance: 10 }).message.length
    ).toBeGreaterThan(0);
  });
});
